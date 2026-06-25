import { state } from '../state.js';
import { fetchAPI } from '../api.js';
import { 
    populateClientesSelect, 
    ubicacionSelectorHTML, 
    validarCondicionesUbicacion, 
    getUbicacionCode, 
    validarUbicacion,
    initDateInputs
} from '../utils.js';

let devRowCounter = 0;
let activeDevolucion = null;
let devFotosBase64 = [];
let signaturePads = {
    responsable: { drawing: false, lastX: 0, lastY: 0, isDirty: false, canvas: null, ctx: null },
    transportador: { drawing: false, lastX: 0, lastY: 0, isDirty: false, canvas: null, ctx: null },
    cliente: { drawing: false, lastX: 0, lastY: 0, isDirty: false, canvas: null, ctx: null }
};

export function initDevoluciones() {
    // 1. Inicializar selects
    populateClientesSelect('dev-cliente');
    
    // 2. Establecer fecha hoy
    initDateInputs();

    // 3. Limpiar formulario y reiniciar firmas
    limpiarFormDevolucion();

    // 4. Cargar historial
    loadDevolucionesHistorial();
}

// --- GESTIÓN DE PESTAÑAS ---
export function switchDevTab(tabName) {
    document.getElementById('dev-tab-registrar').className = `btn ${tabName === 'registrar' ? 'btn-primary' : 'btn-secondary'}`;
    document.getElementById('dev-tab-historial').className = `btn ${tabName === 'historial' ? 'btn-primary' : 'btn-secondary'}`;
    
    document.getElementById('dev-pane-registrar').style.display = tabName === 'registrar' ? 'block' : 'none';
    document.getElementById('dev-pane-historial').style.display = tabName === 'historial' ? 'block' : 'none';

    if (tabName === 'registrar') {
        // Redimensionar canvases cuando se vuelven visibles
        setTimeout(resizeAllCanvases, 50);
    } else {
        loadDevolucionesHistorial();
    }
}

// --- FIRMAS ELECTRÓNICAS (CANVAS) ---
function setupSignatureCanvases() {
    const ids = ['responsable', 'transportador', 'cliente'];
    ids.forEach(id => {
        const canvas = document.getElementById(`canvas-firma-${id}`);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#0a1120'; // Color primario oscuro
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        signaturePads[id].canvas = canvas;
        signaturePads[id].ctx = ctx;
        signaturePads[id].drawing = false;
        signaturePads[id].isDirty = false;

        // Limpiar para asegurar fondo transparente/blanco
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Eventos Mouse
        canvas.addEventListener('mousedown', (e) => startDrawing(e, id));
        canvas.addEventListener('mousemove', (e) => draw(e, id));
        canvas.addEventListener('mouseup', () => stopDrawing(id));
        canvas.addEventListener('mouseout', () => stopDrawing(id));

        // Eventos Touch (Mobile)
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startDrawing(e, id);
        });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            draw(e, id);
        });
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopDrawing(id);
        });
    });
}

function resizeAllCanvases() {
    Object.keys(signaturePads).forEach(id => {
        const pad = signaturePads[id];
        if (pad.canvas) {
            // Guardar imagen actual si ya dibujaron
            let tempImg = null;
            if (pad.isDirty) {
                tempImg = pad.canvas.toDataURL();
            }

            const container = pad.canvas.parentElement;
            pad.canvas.width = container.clientWidth || 280;
            pad.canvas.height = 150;

            // Restablecer estilos de contexto tras redimensionar
            pad.ctx.strokeStyle = '#0a1120';
            pad.ctx.lineWidth = 1.5;
            pad.ctx.lineCap = 'round';
            pad.ctx.lineJoin = 'round';

            // Dibujar imagen guardada
            if (tempImg) {
                const img = new Image();
                img.onload = function() {
                    pad.ctx.drawImage(img, 0, 0);
                };
                img.src = tempImg;
            }
        }
    });
}

function getCoords(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function startDrawing(e, id) {
    const pad = signaturePads[id];
    if (!pad.canvas) return;
    const coords = getCoords(e, pad.canvas);
    pad.drawing = true;
    pad.lastX = coords.x;
    pad.lastY = coords.y;
    pad.isDirty = true;
    
    pad.ctx.beginPath();
    pad.ctx.moveTo(pad.lastX, pad.lastY);
}

function draw(e, id) {
    const pad = signaturePads[id];
    if (!pad.drawing || !pad.canvas) return;
    const coords = getCoords(e, pad.canvas);

    pad.ctx.lineTo(coords.x, coords.y);
    pad.ctx.stroke();

    pad.lastX = coords.x;
    pad.lastY = coords.y;
}

function stopDrawing(id) {
    signaturePads[id].drawing = false;
}

export function limpiarCanvasFirma(id) {
    const pad = signaturePads[id];
    if (pad.canvas && pad.ctx) {
        pad.ctx.clearRect(0, 0, pad.canvas.width, pad.canvas.height);
        pad.isDirty = false;
    }
}

// --- GESTIÓN DE FILAS DEL DETALLE ---
export function agregarFilaItemDevolucion(initialVal = {}) {
    devRowCounter++;
    const tbody = document.getElementById('dev-items-table-body');
    if (!tbody) return;

    const rowId = devRowCounter;
    const tr = document.createElement('tr');
    tr.id = `dev-row-${rowId}`;

    // Generar opciones de productos
    const productOptions = state.productos.map(p => 
        `<option value="${p.codigo}">${p.codigo} - ${p.descripcion}</option>`
    ).join('');

    tr.innerHTML = `
        <td>
            <select class="form-control dev-item-select" onchange="seleccionarProductoDev(${rowId})">
                <option value="">Seleccione producto...</option>
                ${productOptions}
            </select>
            <div class="text-muted dev-item-desc-preview" id="dev-desc-${rowId}" style="font-size:0.8rem; margin-top:4px; font-weight:500;"></div>
        </td>
        <td>
            <input type="number" class="form-control text-center dev-item-cajas" min="0" value="${initialVal.cajas || 0}" oninput="calcularTotalFilaDev(${rowId})">
        </td>
        <td>
            <input type="number" class="form-control text-center dev-item-unidades" min="0" value="${initialVal.unidades || 0}" oninput="calcularTotalFilaDev(${rowId})">
        </td>
        <td>
            <input type="number" class="form-control text-center dev-item-conversion" min="1" value="${initialVal.unidades_por_caja || 1}" oninput="calcularTotalFilaDev(${rowId})">
        </td>
        <td>
            <select class="form-control dev-item-causal">
                <option value="">Seleccione causal...</option>
                <optgroup label="CAUSAS IMPUTABLES RANSA">
                    <option value="Averías" ${initialVal.causal === 'Averías' ? 'selected' : ''}>Averías</option>
                    <option value="Errores de Entrega" ${initialVal.causal === 'Errores de Entrega' ? 'selected' : ''}>Errores de Entrega</option>
                    <option value="Fecha de vencimiento" ${initialVal.causal === 'Fecha de vencimiento' ? 'selected' : ''}>Fecha de vencimiento</option>
                    <option value="Fuera de Horario" ${initialVal.causal === 'Fuera de Horario' ? 'selected' : ''}>Fuera de Horario</option>
                    <option value="Problema de Etiqueta" ${initialVal.causal === 'Problema de Etiqueta' ? 'selected' : ''}>Problema de Etiqueta</option>
                    <option value="Faltante de inventario" ${initialVal.causal === 'Faltante de inventario' ? 'selected' : ''}>Faltante de inventario</option>
                    <option value="Temperatura" ${initialVal.causal === 'Temperatura' ? 'selected' : ''}>Temperatura</option>
                    <option value="Cargue Conductor" ${initialVal.causal === 'Cargue Conductor' ? 'selected' : ''}>Cargue Conductor</option>
                    <option value="Error de Alistamiento" ${initialVal.causal === 'Error de Alistamiento' ? 'selected' : ''}>Error de Alistamiento</option>
                </optgroup>
                <optgroup label="CAUSAS IMPUTABLES CLIENTE">
                    <option value="Código de Barras" ${initialVal.causal === 'Código de Barras' ? 'selected' : ''}>Código de Barras</option>
                    <option value="Faltante en Inventario" ${initialVal.causal === 'Faltante en Inventario' ? 'selected' : ''}>Faltante en Inventario</option>
                    <option value="Fecha de Vencimiento" ${initialVal.causal === 'Fecha de Vencimiento' ? 'selected' : ''}>Fecha de Vencimiento</option>
                    <option value="Problemas Orden de Compra" ${initialVal.causal === 'Problemas Orden de Compra' ? 'selected' : ''}>Problemas Orden de Compra</option>
                    <option value="Sobre Stock" ${initialVal.causal === 'Sobre Stock' ? 'selected' : ''}>Sobre Stock</option>
                    <option value="Mercancía no solicitada" ${initialVal.causal === 'Mercancía no solicitada' ? 'selected' : ''}>Mercancía no solicitada</option>
                    <option value="Averías Cliente" ${initialVal.causal === 'Averías Cliente' ? 'selected' : ''}>Averías Cliente</option>
                    <option value="Error de alistamiento" ${initialVal.causal === 'Error de alistamiento' ? 'selected' : ''}>Error de alistamiento</option>
                    <option value="Mercadeo" ${initialVal.causal === 'Mercadeo' ? 'selected' : ''}>Mercadeo</option>
                    <option value="Problema de etiqueta" ${initialVal.causal === 'Problema de etiqueta' ? 'selected' : ''}>Problema de etiqueta</option>
                    <option value="Novedades en punto de entrega" ${initialVal.causal === 'Novedades en punto de entrega' ? 'selected' : ''}>Novedades en punto de entrega</option>
                    <option value="Novedades de factura" ${initialVal.causal === 'Novedades de factura' ? 'selected' : ''}>Novedades de factura</option>
                </optgroup>
            </select>
        </td>
        <td>
            <select class="form-control dev-item-destino" onchange="cambiarDestinoFilaDev(${rowId})">
                <option value="Redespacho" ${initialVal.destino === 'Redespacho' ? 'selected' : ''}>Redespacho</option>
                <option value="Reintegro" ${initialVal.destino === 'Reintegro' ? 'selected' : ''}>Reintegro (Stock)</option>
                <option value="Devolución a Cliente" ${initialVal.destino === 'Devolución a Cliente' ? 'selected' : ''}>Devolución a Cliente</option>
            </select>
            <div class="dev-item-ubi-container mt-2" id="dev-ubi-container-${rowId}" style="display:none;">
                <label style="font-size:0.75rem; font-weight:600; color:var(--text-secondary);">Ubicación Destino:</label>
                ${ubicacionSelectorHTML(`dev-${rowId}`, initialVal.ubicacion || 'V010110')}
            </div>
        </td>
        <td class="text-center">
            <button class="btn btn-danger btn-sm" onclick="eliminarFilaItemDevolucion(${rowId})">✕</button>
        </td>
    `;

    tbody.appendChild(tr);

    // Si había un valor de destino previo cargado
    if (initialVal.destino === 'Reintegro') {
        cambiarDestinoFilaDev(rowId);
    }
}

export function eliminarFilaItemDevolucion(rowId) {
    const row = document.getElementById(`dev-row-${rowId}`);
    if (row) {
        row.remove();
    }
}

export function seleccionarProductoDev(rowId) {
    const row = document.getElementById(`dev-row-${rowId}`);
    if (!row) return;

    const selectEl = row.querySelector('.dev-item-select');
    const descEl = document.getElementById(`dev-desc-${rowId}`);
    const code = selectEl.value;

    if (descEl) {
        if (code) {
            const prod = state.productos.find(p => p.codigo === code);
            descEl.textContent = prod ? prod.descripcion : '';
        } else {
            descEl.textContent = '';
        }
    }

    calcularTotalFilaDev(rowId);
}

export function cambiarDestinoFilaDev(rowId) {
    const row = document.getElementById(`dev-row-${rowId}`);
    if (!row) return;

    const destino = row.querySelector('.dev-item-destino').value;
    const ubiContainer = document.getElementById(`dev-ubi-container-${rowId}`);

    if (ubiContainer) {
        if (destino === 'Reintegro') {
            ubiContainer.style.display = 'block';
            calcularTotalFilaDev(rowId);
        } else {
            ubiContainer.style.display = 'none';
        }
    }
}

export function calcularTotalFilaDev(rowId) {
    // Forzar validación volumétrica de ubicación si está visible
    const ubiContainer = document.getElementById(`dev-ubi-container-${rowId}`);
    if (ubiContainer && ubiContainer.style.display !== 'none') {
        const ubiCode = getUbicacionCode(`dev-${rowId}`);
        validarCondicionesUbicacion(`dev-${rowId}`, ubiCode);
    }
}

// --- PERSISTENCIA (GUARDAR DEVOLUCIÓN) ---
export async function guardarDevolucion() {
    try {
        const clientSelect = document.getElementById('dev-cliente');
        const nit = clientSelect ? clientSelect.value : '';
        const factura = document.getElementById('dev-factura') ? document.getElementById('dev-factura').value.trim() : '';
        const ciudad = document.getElementById('dev-ciudad') ? document.getElementById('dev-ciudad').value.trim() : '';
        const almacen = document.getElementById('dev-almacen') ? document.getElementById('dev-almacen').value.trim() : '';
        const fecha = document.getElementById('dev-fecha') ? document.getElementById('dev-fecha').value : '';
        const ruta = document.getElementById('dev-ruta') ? document.getElementById('dev-ruta').value.trim() : '';
        const placa = document.getElementById('dev-placa') ? document.getElementById('dev-placa').value.trim() : '';
        const observaciones = document.getElementById('dev-observaciones') ? document.getElementById('dev-observaciones').value.trim() : '';
        
        // Estado de producto
        const estadoEl = document.querySelector('input[name="dev-estado-producto"]:checked');
        const estado_producto = estadoEl ? estadoEl.value : 'Bueno';

        // Nombre Transportador
        const nombre_transportador = document.getElementById('dev-nombre-transportador') ? document.getElementById('dev-nombre-transportador').value.trim() : '';

        if (!nit) {
            alert('Por favor seleccione el cliente.');
            return;
        }
        if (!factura) {
            alert('Por favor ingrese el número de factura/remisión de referencia.');
            return;
        }
        if (!fecha) {
            alert('Por favor ingrese la fecha de recibo.');
            return;
        }

        // Leer Items
        const rows = document.querySelectorAll('#dev-items-table-body tr');
        if (rows.length === 0) {
            alert('Debe agregar al menos un producto a la devolución.');
            return;
        }

        const items = [];
        let isValid = true;

        for (const row of rows) {
            const rowId = row.id.split('-')[2];
            const prodSelect = row.querySelector('.dev-item-select');
            const code = prodSelect ? prodSelect.value : '';
            const descPreview = document.getElementById(`dev-desc-${rowId}`);
            const desc = descPreview ? descPreview.textContent : '';

            const cajas = Number(row.querySelector('.dev-item-cajas').value) || 0;
            const unidades = Number(row.querySelector('.dev-item-unidades').value) || 0;
            const conv = Number(row.querySelector('.dev-item-conversion').value) || 1;
            
            const causalEl = row.querySelector('.dev-item-causal');
            const causal = causalEl ? causalEl.value.trim() : '';
            
            const destinoEl = row.querySelector('.dev-item-destino');
            const destino = destinoEl ? destinoEl.value : 'Redespacho';

            if (!code) {
                alert('Por favor seleccione el producto en todas las filas.');
                isValid = false;
                break;
            }

            if (cajas === 0 && unidades === 0) {
                // Ignorar filas con cantidad 0, ya que al jalar todos los productos de la remisión
                // es normal que no todos se devuelvan.
                continue;
            }

            let ubicacion = '';
            if (destino === 'Reintegro') {
                ubicacion = getUbicacionCode(`dev-${rowId}`);
                if (!validarUbicacion(ubicacion)) {
                    alert(`Seleccione una ubicación válida para el reintegro del producto ${code}.`);
                    isValid = false;
                    break;
                }
            }

            items.push({
                codigo: code,
                descripcion: desc,
                cajas,
                unidades,
                unidades_por_caja: conv,
                causal,
                destino,
                ubicacion
            });
        }

        if (!isValid) return;

        if (items.length === 0) {
            alert('Debe ingresar una cantidad a devolver (cajas o unidades) para al menos un producto.');
            return;
        }

        // Firmas electrónicas
        if (!signaturePads.responsable.isDirty) {
            alert('Se requiere la firma del Responsable del Recibo.');
            return;
        }
        if (!signaturePads.transportador.isDirty) {
            alert('Se requiere la firma del Transportador.');
            return;
        }
        if (!nombre_transportador) {
            alert('Por favor ingrese el nombre del transportador.');
            return;
        }
        if (!signaturePads.cliente.isDirty) {
            alert('Se requiere la firma de Recibido del Cliente.');
            return;
        }

        const firma_responsable = signaturePads.responsable.canvas.toDataURL();
        const firma_transportador = signaturePads.transportador.canvas.toDataURL();
        const firma_cliente = signaturePads.cliente.canvas.toDataURL();

        const payload = {
            cliente_nit: nit,
            factura,
            ciudad,
            almacen,
            fecha,
            ruta,
            placa,
            items,
            observaciones,
            estado_producto,
            nombre_transportador,
            firma_responsable,
            firma_transportador,
            firma_cliente,
            fotos: devFotosBase64
        };

        const res = await fetchAPI('/devoluciones', 'POST', payload);
        alert(`Devolución guardada con éxito. Consecutivo Nº: ${res.id || 'N/A'}`);
        
        // Limpiar
        limpiarFormDevolucion();

        // Recargar stocks en cliente
        state.stockPorUbicacion = await fetchAPI('/inventario/stock/ubicaciones') || [];
        state.productos = await fetchAPI('/productos') || [];

        // Cambiar a pestaña historial
        switchDevTab('historial');
    } catch (err) {
        console.error('Error al guardar devolución:', err);
        alert(`Error al procesar la devolución: ${err.message}`);
    }
}

export function limpiarFormDevolucion() {
    // ponytail: reset optional returns photos
    devFotosBase64 = [];
    const fotosContainer = document.getElementById('dev-fotos-preview-container');
    if (fotosContainer) {
        fotosContainer.innerHTML = '';
        fotosContainer.style.display = 'none';
    }

    // Resetear textos
    const fields = ['dev-factura', 'dev-ciudad', 'dev-almacen', 'dev-ruta', 'dev-placa', 'dev-observaciones', 'dev-nombre-transportador'];
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = '';
    });

    // Desbloquear campos de cabecera
    const lockedFields = ['dev-ciudad', 'dev-almacen', 'dev-ruta', 'dev-fecha'];
    lockedFields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.readOnly = false;
    });

    const clientSelect = document.getElementById('dev-cliente');
    if (clientSelect) {
        clientSelect.selectedIndex = 0;
        clientSelect.disabled = false;
    }

    const consecEl = document.getElementById('dev-consecutivo-preview');
    if (consecEl) consecEl.textContent = 'PENDIENTE';

    // Limpiar tabla
    const tbody = document.getElementById('dev-items-table-body');
    if (tbody) tbody.innerHTML = '';
    devRowCounter = 0;

    // Agregar una fila vacía por defecto
    agregarFilaItemDevolucion();

    // Resetear radios
    const defaultRadio = document.querySelector('input[name="dev-estado-producto"][value="Bueno"]');
    if (defaultRadio) defaultRadio.checked = true;

    // Limpiar firmas
    limpiarCanvasFirma('responsable');
    limpiarCanvasFirma('transportador');
    limpiarCanvasFirma('cliente');

    // Inicializar listeners del canvas
    setupSignatureCanvases();
}

// --- HISTORIAL ---
export async function loadDevolucionesHistorial() {
    const tbody = document.getElementById('dev-historial-body');
    if (!tbody) return;

    try {
        const data = await fetchAPI('/devoluciones') || [];
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay devoluciones registradas</td></tr>';
            return;
        }

        data.forEach(dev => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${dev.id}</strong></td>
                    <td>${dev.fecha_registro || '-'}</td>
                    <td>${dev.cliente_nombre || dev.cliente_nit || 'No especificado'}</td>
                    <td>${dev.factura || '-'}</td>
                    <td>${dev.ciudad || '-'} / ${dev.almacen || '-'}</td>
                    <td>
                        <span class="badge ${dev.estado_producto === 'Bueno' ? 'badge-completed' : (dev.estado_producto === 'Averiado' ? 'badge-pending' : 'badge-danger')}">
                            ${dev.estado_producto}
                        </span>
                    </td>
                    <td class="text-center">
                        <button class="btn btn-secondary btn-sm mr-2" onclick="verDetalleDevolucion(${dev.id})">🔍 Ver Detalle</button>
                        <button class="btn btn-primary btn-sm" onclick="imprimirDevolucionDirecto(${dev.id})">🖨️ Imprimir</button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error al cargar historial</td></tr>';
    }
}

export function filtrarHistorialDevoluciones() {
    const query = document.getElementById('dev-search-input').value.toLowerCase();
    const rows = document.querySelectorAll('#dev-historial-body tr');
    
    rows.forEach(row => {
        if (row.querySelector('td[colspan]')) return;
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
    });
}

// --- MODAL DETALLE ---
export async function verDetalleDevolucion(id) {
    try {
        const dev = await fetchAPI(`/devoluciones/detalle?id=${id}`);
        if (!dev) return;

        activeDevolucion = dev;

        document.getElementById('modal-dev-consecutivo').textContent = dev.id;
        document.getElementById('modal-dev-cliente').textContent = `${dev.cliente_nit} - ${dev.cliente_nombre || ''}`;
        document.getElementById('modal-dev-factura').textContent = dev.factura || 'N/A';
        document.getElementById('modal-dev-fecha').textContent = dev.fecha || '-';
        document.getElementById('modal-dev-ciudad-almacen').textContent = `${dev.ciudad || ''} / ${dev.almacen || ''}`;
        document.getElementById('modal-dev-ruta-placa').textContent = `Ruta: ${dev.ruta || 'N/A'} | Placa: ${dev.placa || 'N/A'}`;
        document.getElementById('modal-dev-estado').innerHTML = `<span class="badge ${dev.estado_producto === 'Bueno' ? 'badge-completed' : (dev.estado_producto === 'Averiado' ? 'badge-pending' : 'badge-danger')}">${dev.estado_producto}</span>`;
        document.getElementById('modal-dev-observaciones').textContent = dev.observaciones || 'Sin observaciones.';
        document.getElementById('modal-dev-transportador-nombre').textContent = dev.nombre_transportador || 'N/A';

        // Llenar tabla del modal
        const tbody = document.getElementById('modal-dev-items-body');
        if (tbody) {
            tbody.innerHTML = '';
            dev.items.forEach(item => {
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${item.codigo}</strong></td>
                        <td>${item.descripcion || '-'}</td>
                        <td class="text-center">${item.cajas || 0}</td>
                        <td class="text-center">${item.unidades || 0}</td>
                        <td class="text-center">${item.unidades_por_caja || 1}</td>
                        <td>${item.causal || '-'}</td>
                        <td>${item.destino || '-'}</td>
                        <td>${item.ubicacion || '-'}</td>
                    </tr>
                `;
            });
        }

        // Cargar firmas en imágenes
        document.getElementById('img-firma-responsable').src = dev.firma_responsable || '';
        document.getElementById('img-firma-transportador').src = dev.firma_transportador || '';
        document.getElementById('img-firma-cliente').src = dev.firma_cliente || '';

        // Cargar fotos si existen
        const fotosSection = document.getElementById('modal-dev-fotos-section');
        const fotosContainer = document.getElementById('modal-dev-fotos-container');
        if (fotosSection && fotosContainer) {
            fotosContainer.innerHTML = '';
            if (dev.fotos && Array.isArray(dev.fotos) && dev.fotos.length > 0) {
                dev.fotos.forEach(foto => {
                    fotosContainer.innerHTML += `
                        <div class="foto-detail-card" style="width: 150px; height: 150px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-color); cursor: pointer;" onclick="window.open('${foto}', '_blank')">
                            <img src="${foto}" style="width: 100%; height: 100%; object-fit: cover;" title="Haga clic para ampliar">
                        </div>
                    `;
                });
                fotosSection.style.display = 'block';
            } else {
                fotosSection.style.display = 'none';
            }
        }

        // Mostrar modal
        document.getElementById('dev-detail-modal').style.display = 'flex';
    } catch (err) {
        console.error(err);
    }
}

export function cerrarDetalleDevolucion() {
    document.getElementById('dev-detail-modal').style.display = 'none';
    activeDevolucion = null;
}

export function imprimirDevolucionActual() {
    if (activeDevolucion && window.imprimirDocumento) {
        // Almacenar temporalmente en state o un wrapper para que print.js pueda leerlo
        state.currentDevolucionPrintData = activeDevolucion;
        window.imprimirDocumento('DEVOLUCION');
    }
}

export async function imprimirDevolucionDirecto(id) {
    try {
        const dev = await fetchAPI(`/devoluciones/detalle?id=${id}`);
        if (dev) {
            state.currentDevolucionPrintData = dev;
            if (window.imprimirDocumento) {
                window.imprimirDocumento('DEVOLUCION');
            }
        }
    } catch (err) {
        console.error(err);
    }
}

// ponytail: load invoice/sales details by invoice number and auto-populate returns form
export async function cargarFacturaParaDevolucion() {
    const facturaInput = document.getElementById('dev-factura');
    if (!facturaInput) return;
    const numFactura = facturaInput.value.trim();
    if (!numFactura) {
        alert('Por favor ingrese un número de factura o remisión.');
        return;
    }

    try {
        const ventas = await fetchAPI('/ventas') || [];
        const venta = ventas.find(v => v.remision.toLowerCase() === numFactura.toLowerCase());
        if (!venta) {
            alert(`No se encontró ninguna venta/remisión con el número: ${numFactura}`);
            return;
        }

        // ponytail: robustly find and match client by NIT code or name
        const clientSelect = document.getElementById('dev-cliente');
        if (clientSelect) {
            const saleNit = (venta.cliente_nit || '').trim();
            const client = state.clientes.find(c => 
                String(c.nit).trim().toLowerCase() === saleNit.toLowerCase() ||
                c.nombre.toLowerCase() === (venta.cliente_nombre || '').toLowerCase()
            );

            if (client) {
                clientSelect.value = client.nit;
            } else {
                // If not found in the loaded list, append a temporary option so that the client name matches and is displayed
                const tempOpt = document.createElement('option');
                tempOpt.value = venta.cliente_nit;
                tempOpt.textContent = venta.cliente_nombre || venta.cliente_nit;
                tempOpt.selected = true;
                clientSelect.appendChild(tempOpt);
                clientSelect.value = venta.cliente_nit;
            }
            clientSelect.disabled = true; // Bloquear
        }

        // Auto-poblar Ciudad, Almacén, Ruta, Fecha
        let ciudad = '';
        let almacen = '';
        let ruta = '';
        const observaciones = venta.observaciones || '';

        // Intentar parsear Cava y Bodega de las observaciones
        const cavaMatch = observaciones.match(/Cava:\s*([^\s|]+)/i);
        const bodegaMatch = observaciones.match(/Bodega:\s*([^\s|]+)/i);

        if (cavaMatch) almacen = `Cava ${cavaMatch[1]}`;
        if (bodegaMatch) almacen = almacen ? `${almacen} / Bodega ${bodegaMatch[1]}` : `Bodega ${bodegaMatch[1]}`;

        // Intentar encontrar la ciudad desde las observaciones, nombre del cliente o dirección del cliente
        const client = state.clientes.find(c => c.nit === venta.cliente_nit);
        if (client) {
            const textToSearch = (observaciones + ' ' + (client.direccion || '') + ' ' + (client.nombre || '')).toUpperCase();
            const ciudadesConocidas = [
                'SINCELEJO', 'MONTERIA', 'VALLEDUPAR', 'RIOHACHA', 'MAGANGUE', 'GALAPA',
                'BARRANQUILLA', 'CARTAGENA', 'SANTA MARTA', 'BOGOTA', 'MEDELLIN', 'CALI',
                'BUCARAMANGA', 'PEREIRA', 'MANIZALES', 'ARMENIA', 'IBAGUE', 'NEIVA',
                'VILLAVICENCIO', 'CUCUTA', 'PASTO', 'POPAYAN', 'TUNJA', 'SABANALARGA', 'SOLEDAD'
            ];
            for (const city of ciudadesConocidas) {
                if (textToSearch.includes(city)) {
                    ciudad = city.charAt(0) + city.slice(1).toLowerCase();
                    break;
                }
            }

            // Si almacen sigue vacío, intentar extraerlo de la dirección del cliente
            if (!almacen && client.direccion) {
                const prefixMatch = client.direccion.match(/^([^\-]+)/);
                if (prefixMatch) {
                    almacen = prefixMatch[1].trim();
                }
            }
        }

        // Intentar buscar Ruta en observaciones (patrón "Ruta: XXX" o número independiente)
        const rutaMatch = observaciones.match(/Ruta:\s*([^\s|]+)/i);
        if (rutaMatch) {
            ruta = rutaMatch[1];
        } else {
            // Intentar buscar un número aislado de 2 a 4 dígitos en observaciones
            const possibleRuta = observaciones.match(/\b\d{2,4}\b/);
            if (possibleRuta) {
                ruta = possibleRuta[0];
            }
        }

        // Poblado de campos en HTML y bloqueo
        const ciudadInput = document.getElementById('dev-ciudad');
        if (ciudadInput) {
            ciudadInput.value = ciudad;
            ciudadInput.readOnly = true;
        }

        const almacenInput = document.getElementById('dev-almacen');
        if (almacenInput) {
            almacenInput.value = almacen;
            almacenInput.readOnly = true;
        }

        const rutaInput = document.getElementById('dev-ruta');
        if (rutaInput) {
            rutaInput.value = ruta;
            rutaInput.readOnly = true;
        }

        const fechaInput = document.getElementById('dev-fecha');
        if (fechaInput) {
            fechaInput.value = new Date().toISOString().split('T')[0]; // Fecha actual de recibo
            fechaInput.readOnly = true;
        }

        const tbody = document.getElementById('dev-items-table-body');
        if (tbody) tbody.innerHTML = '';
        devRowCounter = 0;

        const items = Array.isArray(venta.items) ? venta.items : JSON.parse(venta.items || '[]');
        for (const item of items) {
            // Jalar cantidades originales de venta en la columna de unidades
            agregarFilaItemDevolucion({
                codigo: item.codigo,
                descripcion: item.descripcion,
                cajas: 0,
                unidades: item.cantidad || 0,
                unidades_por_caja: 1,
                causal: '',
                destino: 'Redespacho'
            });

            const selectEl = tbody.querySelector(`#dev-row-${devRowCounter} .dev-item-select`);
            if (selectEl) selectEl.value = item.codigo;
            const descPreview = document.getElementById(`dev-desc-${devRowCounter}`);
            if (descPreview) descPreview.textContent = item.descripcion || '';
        }

        alert(`Factura ${numFactura} cargada con éxito. Se agregaron ${items.length} productos.`);
    } catch (err) {
        console.error(err);
        alert(`Error al cargar la factura: ${err.message}`);
    }
}

// --- FOTOGRAFÍAS DE DEVOLUCIONES (OPCIONAL) ---
export function procesarFotosDevolucion() {
    const input = document.getElementById('dev-input-fotos');
    const container = document.getElementById('dev-fotos-preview-container');
    if (!input || !container) return;

    const files = Array.from(input.files);
    if (files.length === 0) return;

    container.style.display = 'flex';

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            if (devFotosBase64.includes(base64)) return;
            devFotosBase64.push(base64);

            const div = document.createElement('div');
            div.className = 'foto-preview-card';
            div.style.position = 'relative';
            div.style.width = '100px';
            div.style.height = '100px';
            div.style.borderRadius = '6px';
            div.style.overflow = 'hidden';
            div.style.border = '1px solid var(--border-color)';

            div.innerHTML = `
                <img src="${base64}" style="width: 100%; height: 100%; object-fit: cover;">
                <button type="button" style="position: absolute; top: 4px; right: 4px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="window.eliminarFotoDevolucion(this, '${base64.replace(/'/g, "\\'")}')">✕</button>
            `;
            container.appendChild(div);
        };
        reader.readAsDataURL(file);
    });

    input.value = '';
}

export function eliminarFotoDevolucion(btn, base64) {
    devFotosBase64 = devFotosBase64.filter(f => f !== base64);
    btn.parentElement.remove();
    const container = document.getElementById('dev-fotos-preview-container');
    if (devFotosBase64.length === 0 && container) {
        container.style.display = 'none';
    }
}

// --- BINDING AL ENTORNO GLOBAL ---
window.initDevoluciones = initDevoluciones;
window.switchDevTab = switchDevTab;
window.agregarFilaItemDevolucion = agregarFilaItemDevolucion;
window.eliminarFilaItemDevolucion = eliminarFilaItemDevolucion;
window.seleccionarProductoDev = seleccionarProductoDev;
window.cambiarDestinoFilaDev = cambiarDestinoFilaDev;
window.calcularTotalFilaDev = calcularTotalFilaDev;
window.limpiarCanvasFirma = limpiarCanvasFirma;
window.guardarDevolucion = guardarDevolucion;
window.limpiarFormDevolucion = limpiarFormDevolucion;
window.loadDevolucionesHistorial = loadDevolucionesHistorial;
window.filtrarHistorialDevoluciones = filtrarHistorialDevoluciones;
window.verDetalleDevolucion = verDetalleDevolucion;
window.cerrarDetalleDevolucion = cerrarDetalleDevolucion;
window.imprimirDevolucionActual = imprimirDevolucionActual;
window.imprimirDevolucionDirecto = imprimirDevolucionDirecto;
window.cargarFacturaParaDevolucion = cargarFacturaParaDevolucion;
window.procesarFotosDevolucion = procesarFotosDevolucion;
window.eliminarFotoDevolucion = eliminarFotoDevolucion;

