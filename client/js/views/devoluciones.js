import { state } from '../state.js';
import { fetchAPI } from '../api.js';
import { 
    populateClientesSelect, 
    ubicacionSelectorHTML, 
    validarCondicionesUbicacion, 
    getUbicacionCode, 
    validarUbicacion,
    initDateInputs,
    readExcelOrCSV,
    parseNumberString,
    formatExcelDate
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
    document.getElementById('dev-tab-masiva').className = `btn ${tabName === 'masiva' ? 'btn-primary' : 'btn-secondary'}`;
    
    document.getElementById('dev-pane-registrar').style.display = tabName === 'registrar' ? 'block' : 'none';
    document.getElementById('dev-pane-historial').style.display = tabName === 'historial' ? 'block' : 'none';
    document.getElementById('dev-pane-masiva').style.display = tabName === 'masiva' ? 'block' : 'none';

    if (tabName === 'registrar') {
        // Redimensionar canvases cuando se vuelven visibles
        setTimeout(resizeAllCanvases, 50);
    } else if (tabName === 'historial') {
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

// Carga el número de factura directamente en el formulario sin depender de registros de ventas previas.
// El usuario puede complementar los datos (cliente, ciudad, almacén) manualmente.
export async function cargarFacturaParaDevolucion() {
    const facturaInput = document.getElementById('dev-factura');
    if (!facturaInput) return;
    const numFactura = facturaInput.value.trim();
    if (!numFactura) {
        alert('Por favor ingrese un número de factura.');
        return;
    }

    // Intentar buscar la factura en ventas registradas (opcional, no bloquea si no existe)
    try {
        const ventas = await fetchAPI('/ventas') || [];
        const venta = ventas.find(v =>
            String(v.remision || '').toLowerCase() === numFactura.toLowerCase() ||
            String(v.factura || '').toLowerCase() === numFactura.toLowerCase()
        );

        if (venta) {
            // Si existe la venta, auto-poblar datos del cliente y productos
            const clientSelect = document.getElementById('dev-cliente');
            if (clientSelect) {
                const saleNit = (venta.cliente_nit || '').trim();
                const client = state.clientes.find(c =>
                    String(c.nit).trim().toLowerCase() === saleNit.toLowerCase() ||
                    c.nombre.toLowerCase() === (venta.cliente_nombre || '').toLowerCase()
                );
                if (client) {
                    clientSelect.value = client.nit;
                } else if (venta.cliente_nit) {
                    const tempOpt = document.createElement('option');
                    tempOpt.value = venta.cliente_nit;
                    tempOpt.textContent = venta.cliente_nombre || venta.cliente_nit;
                    tempOpt.selected = true;
                    clientSelect.appendChild(tempOpt);
                    clientSelect.value = venta.cliente_nit;
                }
            }

            // Auto-poblar Ciudad, Almacén, Ruta
            const observaciones = venta.observaciones || '';
            let ciudad = '';
            let almacen = '';
            let ruta = '';

            const cavaMatch = observaciones.match(/Cava:\s*([^\s|]+)/i);
            const bodegaMatch = observaciones.match(/Bodega:\s*([^\s|]+)/i);
            if (cavaMatch) almacen = `Cava ${cavaMatch[1]}`;
            if (bodegaMatch) almacen = almacen ? `${almacen} / Bodega ${bodegaMatch[1]}` : `Bodega ${bodegaMatch[1]}`;

            const clientObj = state.clientes.find(c => c.nit === venta.cliente_nit);
            if (clientObj) {
                const textToSearch = (observaciones + ' ' + (clientObj.direccion || '') + ' ' + (clientObj.nombre || '')).toUpperCase();
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
                if (!almacen && clientObj.direccion) {
                    const prefixMatch = clientObj.direccion.match(/^([^\-]+)/);
                    if (prefixMatch) almacen = prefixMatch[1].trim();
                }
            }

            const rutaMatch = observaciones.match(/Ruta:\s*([^\s|]+)/i);
            if (rutaMatch) {
                ruta = rutaMatch[1];
            } else {
                const possibleRuta = observaciones.match(/\b\d{2,4}\b/);
                if (possibleRuta) ruta = possibleRuta[0];
            }

            const ciudadInput = document.getElementById('dev-ciudad');
            if (ciudadInput) ciudadInput.value = ciudad;

            const almacenInput = document.getElementById('dev-almacen');
            if (almacenInput) almacenInput.value = almacen;

            const rutaInput = document.getElementById('dev-ruta');
            if (rutaInput) rutaInput.value = ruta;

            const fechaInput = document.getElementById('dev-fecha');
            if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];

            // Cargar productos de la venta
            const tbody = document.getElementById('dev-items-table-body');
            if (tbody) tbody.innerHTML = '';
            devRowCounter = 0;

            const items = Array.isArray(venta.items) ? venta.items : JSON.parse(venta.items || '[]');
            for (const item of items) {
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

            alert(`Factura ${numFactura} encontrada en el sistema y cargada con ${items.length} producto(s).`);
        } else {
            // La factura no existe en ventas: dejar el número ingresado y permitir registro manual
            // No bloquear al usuario — solo confirmar que el formulario está listo
            const fechaInput = document.getElementById('dev-fecha');
            if (fechaInput && !fechaInput.value) {
                fechaInput.value = new Date().toISOString().split('T')[0];
            }
            // Asegurar que haya al menos una fila vacía para agregar productos
            const tbody = document.getElementById('dev-items-table-body');
            if (tbody && tbody.children.length === 0) {
                agregarFilaItemDevolucion();
            }
            alert(`Factura N° ${numFactura} lista para registrar devolución. Complete los datos del cliente y productos.`);
        }
    } catch (err) {
        console.error(err);
        // Incluso si falla la consulta, no bloquear al usuario
        const fechaInput = document.getElementById('dev-fecha');
        if (fechaInput && !fechaInput.value) {
            fechaInput.value = new Date().toISOString().split('T')[0];
        }
        alert(`Factura N° ${numFactura} lista. Complete los datos manualmente.`);
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

// --- LOGICA DE CARGUE MASIVO DE DEVOLUCIONES ---
let csvParsedDevoluciones = [];

const devAliasMap = {
    fecha: ['fecha', 'fec', 'date'],
    almacen: ['almacen', 'almacén', 'bodega', 'wh', 'warehouse', 'propio'],
    factura: ['factura', 'fact', 'fac', 'remision', 'remisión', 'invoice'],
    cliente_nit: ['cod cliente', 'nit', 'nit cliente', 'cliente nit', 'cedula', 'cédula', 'doc', 'documento'],
    cliente_nombre: ['cliente', 'nombre', 'nombre cliente', 'razon social', 'razón social'],
    artislog: ['artislog', 'art.islog', 'islog'],
    art_cliente: ['art cliente', 'articulo cliente', 'artículo cliente', 'art.cliente'],
    codigo_producto: ['código', 'codigo', 'item', 'art', 'sku'],
    descripcion_producto: ['articulo', 'artículo', 'descripcion', 'descripción', 'producto'],
    cantidad: ['cantid', 'cantidad', 'cant', 'unidades', 'uds', 'qty'],
    lote: ['lote', 'batch'],
    fecha_caducidad: ['fecha caduc', 'fecha caducidad', 'vencimiento', 'fecha vencimiento', 'fecha vcto', 'caducidad', 'fec caduc'],
    ciudad: ['ciudad', 'city', 'municipio'],
    direccion: ['direccion', 'dirección'],
    ubicacion: ['ubicacion', 'ubicación', 'posicion', 'posición', 'rack', 'loc', 'location'],
    ruta: ['ruta'],
    placa: ['placa']
};

export function procesarArchivoCSVDevoluciones() {
    const fileInput = document.getElementById('csv-file-input-dev');
    if (!fileInput) return;
    const file = fileInput.files[0];
    if (!file) return;

    // ponytail: show loading status indicator before blocking main thread
    const statusEl = document.getElementById('csv-import-status-dev');
    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = '⏳ Procesando y leyendo archivo Excel, por favor espere...';
    }

    setTimeout(() => {
        readExcelOrCSV(file, devAliasMap, function (err, rows, colMapping) {
            if (err) {
                if (statusEl) statusEl.style.display = 'none';
                alert(`Error al procesar archivo: ${err.message}`);
                return;
            }
            try {
                csvParsedDevoluciones = parseExcelOrCSVToDevoluciones(rows, colMapping);
                const totalItems = csvParsedDevoluciones.reduce((sum, d) => sum + d.items.length, 0);
                renderCSVPreviewDevoluciones();
                if (statusEl) {
                    const importType = document.querySelector('input[name="import-type-dev"]:checked')?.value || 'factura';
                    if (importType === 'factura') {
                        statusEl.textContent = `✅ Archivo leído con éxito. Se procesaron ${rows.length - (colMapping._headerIndex + 1)} filas del archivo y se prepararon ${csvParsedDevoluciones.length} facturas de venta (que contienen el total de ${totalItems} productos/filas).`;
                    } else {
                        statusEl.textContent = `✅ Archivo leído con éxito. Se procesaron ${rows.length - (colMapping._headerIndex + 1)} filas del archivo y se prepararon ${csvParsedDevoluciones.length} devoluciones.`;
                    }
                }
            } catch (parseErr) {
                if (statusEl) statusEl.style.display = 'none';
                alert(`Error al parsear datos: ${parseErr.message}`);
            }
        });
    }, 50);
}

function buscarClienteNitDev(nitText, nombreText) {
    if (!nitText && !nombreText) return '';
    
    // Buscar por NIT
    if (nitText) {
        const normNit = String(nitText).trim().toLowerCase();
        let match = state.clientes.find(c => String(c.nit).trim().toLowerCase() === normNit);
        if (match) return match.nit;
    }
    
    // Buscar por Nombre
    if (nombreText) {
        const normName = String(nombreText).trim().toLowerCase();
        let match = state.clientes.find(c => c.nombre.trim().toLowerCase() === normName);
        if (match) return match.nit;
        
        // Coincidencia parcial por nombre
        match = state.clientes.find(c => 
            c.nombre.toLowerCase().includes(normName) || 
            normName.includes(c.nombre.toLowerCase())
        );
        if (match) return match.nit;
    }

    return String(nitText || nombreText).trim();
}

function buscarProductoPorCodigo(code) {
    if (!code) return null;
    const norm = String(code).trim().toLowerCase();
    const cleanNum = norm.replace(/^0+/, ''); // strip leading zeros
    return state.productos.find(p => {
        const pCode = String(p.codigo).trim().toLowerCase();
        const pClean = pCode.replace(/^0+/, '');
        return pCode === norm || (cleanNum && pClean === cleanNum);
    });
}

function parseExcelOrCSVToDevoluciones(rows, colMapping) {
    const devolucionesMap = new Map();

    // ponytail: build high-speed Maps to avoid slow linear state array searches inside the 200k loop
    const clientMap = new Map();
    state.clientes.forEach(c => {
        const nit = String(c.nit).trim().toLowerCase();
        clientMap.set(nit, c.nit);
        clientMap.set(c.nombre.trim().toLowerCase(), c.nit);
    });

    const productMap = new Map();
    state.productos.forEach(p => {
        const code = String(p.codigo).trim().toLowerCase();
        productMap.set(code, p);
        const clean = code.replace(/^0+/, '');
        if (clean) productMap.set(clean, p);
    });

    const fastBuscarClienteNit = (nitText, nombreText) => {
        if (!nitText && !nombreText) return '';
        if (nitText) {
            const val = clientMap.get(String(nitText).trim().toLowerCase());
            if (val) return val;
        }
        if (nombreText) {
            const val = clientMap.get(String(nombreText).trim().toLowerCase());
            if (val) return val;
        }
        return String(nitText || nombreText).trim();
    };

    const vanos = ['01', '02', '03'];
    const niveles = Array.from({ length: 40 }, (_, i) => String(i + 1).padStart(2, '0'));
    const posiciones = ['10', '14', '20', '24', '30', '34', '40', '44', '50', '54', '60', '64'];

    const getUbicacionDeterminista = (codigo) => {
        let hash = 0;
        const str = String(codigo || '');
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        hash = Math.abs(hash);
        const vano = vanos[hash % vanos.length];
        const nivel = niveles[Math.floor(hash / vanos.length) % niveles.length];
        const pos = posiciones[Math.floor(hash / (vanos.length * niveles.length)) % posiciones.length];
        return `V${vano}${nivel}${pos}`;
    };

    let lastFactura = '';
    let lastFecha = '';
    let lastClienteNit = '';
    let lastClienteNombre = '';
    let lastAlmacen = '';
    let lastCiudad = '';
    let lastRuta = '';
    let lastPlaca = '';

    const startIndex = colMapping._headerIndex + 1;

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        let facturaRaw = colMapping.factura !== -1 ? String(row[colMapping.factura] || '').trim() : '';
        let fechaRaw = colMapping.fecha !== -1 ? String(row[colMapping.fecha] || '').trim() : '';
        let clienteNitRaw = colMapping.cliente_nit !== -1 ? String(row[colMapping.cliente_nit] || '').trim() : '';
        let clienteNombreRaw = colMapping.cliente_nombre !== -1 ? String(row[colMapping.cliente_nombre] || '').trim() : '';
        let almacenRaw = colMapping.almacen !== -1 ? String(row[colMapping.almacen] || '').trim() : '';
        let ciudadRaw = colMapping.ciudad !== -1 ? String(row[colMapping.ciudad] || '').trim() : '';
        let ubicacionRaw = colMapping.ubicacion !== -1 ? String(row[colMapping.ubicacion] || '').trim() : '';

        // Códigos de producto
        let artislogRaw = colMapping.artislog !== -1 ? String(row[colMapping.artislog] || '').trim() : '';
        let artClienteRaw = colMapping.art_cliente !== -1 ? String(row[colMapping.art_cliente] || '').trim() : '';
        let codigoRaw = colMapping.codigo_producto !== -1 ? String(row[colMapping.codigo_producto] || '').trim() : '';
        
        let descripcionRaw = colMapping.descripcion_producto !== -1 ? String(row[colMapping.descripcion_producto] || '').trim() : '';
        let cantidadRaw = colMapping.cantidad !== -1 ? String(row[colMapping.cantidad] || '').trim() : '';
        let loteRaw = colMapping.lote !== -1 ? String(row[colMapping.lote] || '').trim() : '';
        let fechaCaducRaw = colMapping.fecha_caducidad !== -1 ? String(row[colMapping.fecha_caducidad] || '').trim() : '';
        let direccionRaw = colMapping.direccion !== -1 ? String(row[colMapping.direccion] || '').trim() : '';
        let rutaRaw = colMapping.ruta !== -1 ? String(row[colMapping.ruta] || '').trim() : '';
        let placaRaw = colMapping.placa !== -1 ? String(row[colMapping.placa] || '').trim() : '';

        // Si la fila está completamente vacía, saltar
        if (!facturaRaw && !codigoRaw && !clienteNitRaw && !artislogRaw && !artClienteRaw) continue;

        // Auto-llenado de filas combinadas o agrupadas
        if (facturaRaw) lastFactura = facturaRaw;
        else facturaRaw = lastFactura;

        if (fechaRaw) lastFecha = fechaRaw;
        else fechaRaw = lastFecha;

        if (clienteNitRaw) lastClienteNit = clienteNitRaw;
        else clienteNitRaw = lastClienteNit;

        if (clienteNombreRaw) lastClienteNombre = clienteNombreRaw;
        else clienteNombreRaw = lastClienteNombre;

        if (almacenRaw) lastAlmacen = almacenRaw;
        else almacenRaw = lastAlmacen;

        if (ciudadRaw) lastCiudad = ciudadRaw;
        else ciudadRaw = lastCiudad;

        if (rutaRaw) lastRuta = rutaRaw;
        else rutaRaw = lastRuta;

        if (placaRaw) lastPlaca = placaRaw;
        else placaRaw = lastPlaca;

        if (!facturaRaw) continue;

        // Determinar código de producto — si falta, usar SIN-CODIGO
        let productCode = artislogRaw || artClienteRaw || codigoRaw || 'SIN-CODIGO';

        // Resolver NIT del cliente
        let resolvedNit = fastBuscarClienteNit(clienteNitRaw, clienteNombreRaw) || 'GENERICO';

        // Formatear Fecha
        let parsedFecha = formatExcelDate(fechaRaw);
        if (!parsedFecha) parsedFecha = new Date().toISOString().split('T')[0];

        // Inicializar objeto de devolución si es nuevo
        if (!devolucionesMap.has(facturaRaw)) {
            devolucionesMap.set(facturaRaw, {
                cliente_nit: resolvedNit,
                cliente_nombre: clienteNombreRaw || resolvedNit,
                factura: facturaRaw,
                ciudad: ciudadRaw || 'Barranquilla',
                almacen: almacenRaw || 'BGA',
                fecha: parsedFecha,
                ruta: rutaRaw || '',
                placa: placaRaw || '',
                items: [],
                observaciones: `Cargue Masivo Excel - Ref: ${direccionRaw || ''}`.trim(),
                estado_producto: 'Bueno',
                nombre_transportador: 'SISTEMA',
                firma_responsable: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='150'%3E%3Crect width='100%25' height='100%25' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' font-weight='bold' fill='%2364748b'%3ECARGA MASIVA%3C/text%3E%3C/svg%3E",
                firma_transportador: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='150'%3E%3Crect width='100%25' height='100%25' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' font-weight='bold' fill='%2364748b'%3ECARGA MASIVA%3C/text%3E%3C/svg%3E",
                firma_cliente: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='150'%3E%3Crect width='100%25' height='100%25' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' font-weight='bold' fill='%2364748b'%3ECARGA MASIVA%3C/text%3E%3C/svg%3E",
                fotos: []
            });
        }

        const devObj = devolucionesMap.get(facturaRaw);
        const qty = parseNumberString(cantidadRaw);

        if (qty >= 0) {
            // Incluir todos los ítems con código de producto, incluyendo cantidad 0.
            // Solo se rechazan cantidades negativas (inválidas).
            // Determine target location: use Excel value if formatted, or distribute deterministically to prevent single ubi bottleneck
            const targetUbicacion = (ubicacionRaw && /^V\d{6}$/i.test(ubicacionRaw)) ? ubicacionRaw.toUpperCase() : getUbicacionDeterminista(productCode);

            devObj.items.push({
                codigo: productCode,
                descripcion: descripcionRaw || `Producto ${productCode}`,
                cajas: 0,
                unidades: qty,
                unidades_por_caja: 1,
                causal: 'Errores de Entrega',
                destino: 'Reintegro',
                ubicacion: targetUbicacion,
                lote: loteRaw || '',
                fecha_caducidad: formatExcelDate(fechaCaducRaw) || ''
            });
        }
    }

    return Array.from(devolucionesMap.values()).filter(d => d.items.length > 0);
}

export function renderCSVPreviewDevoluciones() {
    const previewPanel = document.getElementById('csv-preview-panel-dev');
    const tbody = document.getElementById('csv-preview-body-dev');
    const btnConfirmar = document.getElementById('btnConfirmarImportacionCSVDev');

    if (!tbody || !previewPanel || !btnConfirmar) return;
    tbody.innerHTML = '';

    const importType = document.querySelector('input[name="import-type-dev"]:checked')?.value || 'factura';
    
    // Cambiar dinámicamente títulos y botones para reflejar "Facturas de Venta" en lugar de "Devoluciones"
    const titleEl = previewPanel.querySelector('h3');
    if (titleEl) {
        if (importType === 'factura') {
            titleEl.textContent = 'Vista Previa de Facturas de Venta a Importar';
        } else {
            titleEl.textContent = 'Vista Previa de Devoluciones a Importar';
        }
    }
    if (btnConfirmar) {
        if (importType === 'factura') {
            btnConfirmar.textContent = 'Confirmar Importación de Facturas de Venta';
        } else {
            btnConfirmar.textContent = 'Confirmar Importación de Devoluciones';
        }
    }

    if (csvParsedDevoluciones.length === 0) {
        tbody.innerHTML = importType === 'factura' 
            ? '<tr><td colspan="8" class="text-center text-muted">No se encontraron facturas válidas para importar.</td></tr>'
            : '<tr><td colspan="8" class="text-center text-muted">No se encontraron devoluciones válidas para importar.</td></tr>';
        btnConfirmar.disabled = true;
        previewPanel.style.display = 'block';
        return;
    }

    // ponytail: build high-speed validation Maps to avoid linear search freezes
    const clientMap = new Map();
    state.clientes.forEach(c => {
        clientMap.set(String(c.nit).trim().toLowerCase(), c.nombre);
    });

    const productMap = new Map();
    state.productos.forEach(p => {
        productMap.set(String(p.codigo).trim().toLowerCase(), p.descripcion);
        const clean = String(p.codigo).trim().toLowerCase().replace(/^0+/, '');
        if (clean) productMap.set(clean, p.descripcion);
    });

    // ponytail: limit preview to 100 items to avoid DOM rendering freeze on 200k records
    const limit = 100;
    const itemsToRender = csvParsedDevoluciones.slice(0, limit);
    const htmlRows = [];

    itemsToRender.forEach(dev => {
        const cliNombreReg = clientMap.get(String(dev.cliente_nit).trim().toLowerCase());
        const cliExists = !!cliNombreReg;
        let cliNombre = cliNombreReg || dev.cliente_nombre;
        let warnings = [];

        if (!cliExists) {
            warnings.push(`Cliente no registrado (se creará automáticamente: NIT ${dev.cliente_nit})`);
        }

        dev.items.forEach(item => {
            const prodDesc = productMap.get(String(item.codigo).trim().toLowerCase()) || 
                             productMap.get(String(item.codigo).trim().toLowerCase().replace(/^0+/, ''));
            if (!prodDesc) {
                warnings.push(`Producto ${item.codigo} no existe (se creará en backend)`);
            } else {
                item.descripcion = prodDesc;
            }
        });

        let statusHTML = '';
        if (warnings.length > 0) {
            statusHTML = `<span class="badge badge-pending" title="${warnings.join(', ')}">Validada con advertencias</span>`;
        } else {
            statusHTML = '<span class="badge badge-completed">Válida</span>';
        }

        let totalUnits = dev.items.reduce((sum, item) => sum + item.unidades, 0);

        // ponytail: no errors block imports! Always allow loading.
        let actionHTML = `<button class="btn btn-success btn-sm" onclick="importarUnaDevolucion('${dev.factura}')" style="padding: 2px 6px; font-size: 0.8rem; border-radius: var(--radius-sm);">Importar</button>`;

        htmlRows.push(`
            <tr>
                <td><strong>${dev.factura}</strong></td>
                <td>${cliNombre} <span style="font-size:0.8rem; color:var(--text-muted);">(${dev.cliente_nit})</span></td>
                <td>${dev.fecha}</td>
                <td>${dev.ciudad} / ${dev.almacen}</td>
                <td class="text-center">${dev.items.length}</td>
                <td class="text-center">${totalUnits}</td>
                <td>${statusHTML}</td>
                <td class="text-center">${actionHTML}</td>
            </tr>
        `);
    });

    if (csvParsedDevoluciones.length > limit) {
        const totalItems = csvParsedDevoluciones.reduce((sum, d) => sum + d.items.length, 0);
        const noun = importType === 'factura' ? 'facturas' : 'devoluciones';
        htmlRows.push(`
            <tr>
                <td colspan="8" class="text-center" style="font-weight: 600; color: var(--color-primary); background-color: rgba(59, 130, 246, 0.05);">
                    💡 Mostrando las primeras ${limit} de ${csvParsedDevoluciones.length} ${noun} preparadas (que agrupan el total de ${totalItems} productos/filas). ¡Todos los registros se procesarán al confirmar!
                </td>
            </tr>
        `);
    }

    tbody.innerHTML = htmlRows.join('');
    btnConfirmar.disabled = false; // Always allow confirm
    previewPanel.style.display = 'block';
}

export async function importarUnaDevolucion(factura) {
    const devIndex = csvParsedDevoluciones.findIndex(d => d.factura === factura);
    if (devIndex === -1) return;

    const dev = csvParsedDevoluciones[devIndex];
    const importType = document.querySelector('input[name="import-type-dev"]:checked')?.value || 'factura';

    try {
        if (importType === 'factura') {
            const items = dev.items.map(item => ({
                item: item.item || '1',
                codigo: item.codigo,
                descripcion: item.descripcion,
                cantidad: item.unidades || 1,
                v_unitario: 0,
                unidad_medida: item.unidad_medida || 'Und'
            }));
            const venta = {
                remision: dev.factura,
                fecha: dev.fecha,
                cliente_nit: dev.cliente_nit,
                observaciones: dev.observaciones,
                iva: 0,
                estado: 'Pendiente',
                items: items,
                direccion: dev.observaciones.replace('Cargue Masivo Excel - Ref: ', '') || '',
                ruta: dev.ruta || '',
                placa: dev.placa || '',
                _cliente_nombre: dev.cliente_nombre,
                _direccion: dev.observaciones.replace('Cargue Masivo Excel - Ref: ', '') || '',
                _ruta: dev.ruta || '',
                _placa: dev.placa || ''
            };

            await fetchAPI('/ventas', 'POST', venta);
            alert(`Factura/Remisión ${factura} importada con éxito.`);
        } else {
            // 1. Si el cliente no existe, crearlo
            const cliExists = state.clientes.some(c => String(c.nit) === String(dev.cliente_nit));
            if (!cliExists) {
                await fetchAPI('/clientes', 'POST', {
                    nit: dev.cliente_nit,
                    nombre: dev.cliente_nombre,
                    telefono: 'N/A',
                    direccion: dev.observaciones.replace('Cargue Masivo Excel - Ref: ', '') || 'N/A',
                    correo: 'noreply@habitad-wms.com'
                });
                // Recargar clientes localmente
                state.clientes = await fetchAPI('/clientes') || [];
                populateClientesSelect('dev-cliente');
            }

            // 2. Importar la devolución
            const res = await fetchAPI('/devoluciones', 'POST', dev);
            alert(`Devolución Factura ${factura} importada con éxito. Consecutivo: ${res.id}`);
        }

        // Eliminar de la lista de vista previa
        csvParsedDevoluciones.splice(devIndex, 1);
        renderCSVPreviewDevoluciones();

        // Si ya no quedan, ocultar panel
        if (csvParsedDevoluciones.length === 0) {
            cancelarImportacionCSVDevoluciones();
        }

        // Recargar stocks e historial
        state.stockPorUbicacion = await fetchAPI('/inventario/stock/ubicaciones') || [];
        state.productos = await fetchAPI('/productos') || [];
        loadDevolucionesHistorial();
    } catch (err) {
        console.error(err);
        alert(`Error al importar: ${err.message}`);
    }
}

export function cancelarImportacionCSVDevoluciones() {
    const previewPanel = document.getElementById('csv-preview-panel-dev');
    if (previewPanel) previewPanel.style.display = 'none';
    const fileInput = document.getElementById('csv-file-input-dev');
    if (fileInput) fileInput.value = '';
    csvParsedDevoluciones = [];
}

export async function confirmarImportacionCSVDevoluciones() {
    if (csvParsedDevoluciones.length === 0) return;

    const importType = document.querySelector('input[name="import-type-dev"]:checked')?.value || 'factura';

    const btnConfirmar = document.getElementById('btnConfirmarImportacionCSVDev');
    const originalText = btnConfirmar ? btnConfirmar.textContent : '';
    const statusEl = document.getElementById('csv-import-status-dev');

    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Procesando importación masiva...';
    }

    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = '⏳ Subiendo y registrando en el servidor. Esto puede tomar unos segundos...';
    }

    try {
        if (importType === 'factura') {
            // Map devoluciones to ventas
            const ventasList = csvParsedDevoluciones.map(d => {
                const items = d.items.map(item => ({
                    item: item.item || '1',
                    codigo: item.codigo,
                    descripcion: item.descripcion,
                    cantidad: item.unidades || 1,
                    v_unitario: 0,
                    unidad_medida: item.unidad_medida || 'Und'
                }));
                
                return {
                    remision: d.factura,
                    fecha: d.fecha,
                    cliente_nit: d.cliente_nit,
                    observaciones: d.observaciones,
                    iva: 0,
                    estado: 'Pendiente',
                    items: items,
                    direccion: d.observaciones.replace('Cargue Masivo Excel - Ref: ', '') || '',
                    ruta: d.ruta || '',
                    placa: d.placa || '',
                    _cliente_nombre: d.cliente_nombre,
                    _direccion: d.observaciones.replace('Cargue Masivo Excel - Ref: ', '') || '',
                    _ruta: d.ruta || '',
                    _placa: d.placa || ''
                };
            });

            const res = await fetchAPI('/ventas/bulk', 'POST', { ventas: ventasList });
            alert(`Se han importado exitosamente ${res.count || ventasList.length} facturas de venta.`);
            
            // Recargar datos maestros
            state.clientes = await fetchAPI('/clientes') || [];
            if (window.populateClientesSelect) window.populateClientesSelect('venta-cliente');
            state.stockPorUbicacion = await fetchAPI('/inventario/stock/ubicaciones') || [];
            state.productos = await fetchAPI('/productos') || [];

            // Limpiar y cambiar de pestaña
            cancelarImportacionCSVDevoluciones();
            if (window.showView) window.showView('ventas');
            if (window.initDevoluciones) window.initDevoluciones();
        } else {
            // Original logic for returns (devoluciones)
            const res = await fetchAPI('/devoluciones/bulk', 'POST', { devoluciones: csvParsedDevoluciones });
            alert(`Se han importado exitosamente ${res.count || csvParsedDevoluciones.length} devoluciones.`);
            
            state.clientes = await fetchAPI('/clientes') || [];
            populateClientesSelect('dev-cliente');
            state.stockPorUbicacion = await fetchAPI('/inventario/stock/ubicaciones') || [];
            state.productos = await fetchAPI('/productos') || [];

            cancelarImportacionCSVDevoluciones();
            switchDevTab('historial');
        }
    } catch (err) {
        console.error(err);
        alert(`Error durante la importación masiva: ${err.message}`);
    } finally {
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.textContent = originalText;
        }
        if (statusEl) {
            statusEl.style.display = 'none';
        }
    }
}

export function descargarPlantillaCSVDevoluciones() {
    if (window.XLSX) {
        const data = [
            ["Fecha", "Propio", "Almacen", "Pedidolog", "Factura", "Cod Cliente", "Art Cliente", "Cliente", "Direccion", "Ciudad", "Dpto", "Artislog", "Articulo", "Fecha Caduc", "Lote", "Cantid"],
            ["10-07-2026", "44901", "BGA", "4683099", "81684151", "1", "2500000203", "GENERICO", "PREDIO SAN JOSE KM 3 VIA GALAPA BARRANQU", "GALAPA", "ATLANTICO", "0000248", "SIX PACK MALT 12 OZ CAFE LIOFILIZADO", "01/08/27", "", "8"],
            ["10-07-2026", "44901", "BGA", "4683099", "81684151", "1", "2500000254", "GENERICO", "PREDIO SAN JOSE KM 3 VIA GALAPA BARRANQU", "GALAPA", "ATLANTICO", "0000249", "SIX PACK MALT 18 OZ CAFE LIOFILIZADO", "01/08/27", "", "8"],
            ["11-07-2026", "29601", "BGA", "4683152", "5217211", "1000412353", "11H7300", "PLATAFORMA CEDI CARIBE BARRANQUILLA", "", "BARRANQUILLA", "ATLANTICO", "0000040", "PALIYUCA PQ X500GR", "10/03/27", "1005599389", "42"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Devoluciones");
        XLSX.writeFile(wb, "plantilla_devoluciones_mercancia.xlsx");
    } else {
        const headers = 'Fecha,Propio,Almacen,Pedidolog,Factura,Cod Cliente,Art Cliente,Cliente,Direccion,Ciudad,Dpto,Artislog,Articulo,Fecha Caduc,Lote,Cantid\n';
        const sample = '10-07-2026,44901,BGA,4683099,81684151,1,2500000203,GENERICO,PREDIO SAN JOSE KM 3 VIA GALAPA BARRANQU,GALAPA,ATLANTICO,0000248,SIX PACK MALT 12 OZ CAFE LIOFILIZADO,01/08/27,,8\n';

        const blob = new Blob([headers + sample], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "plantilla_devoluciones_mercancia.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
window.procesarArchivoCSVDevoluciones = procesarArchivoCSVDevoluciones;
window.cancelarImportacionCSVDevoluciones = cancelarImportacionCSVDevoluciones;
window.confirmarImportacionCSVDevoluciones = confirmarImportacionCSVDevoluciones;
window.descargarPlantillaCSVDevoluciones = descargarPlantillaCSVDevoluciones;
window.importarUnaDevolucion = importarUnaDevolucion;
window.alCambiarTipoImportacionDev = alCambiarTipoImportacionDev;

export function alCambiarTipoImportacionDev() {
    if (csvParsedDevoluciones.length > 0) {
        const statusEl = document.getElementById('csv-import-status-dev');
        const importType = document.querySelector('input[name="import-type-dev"]:checked')?.value || 'factura';
        const totalItems = csvParsedDevoluciones.reduce((sum, d) => sum + d.items.length, 0);
        if (statusEl) {
            if (importType === 'factura') {
                statusEl.textContent = `✅ Archivo leído con éxito. Se prepararon ${csvParsedDevoluciones.length} facturas de venta (que contienen el total de ${totalItems} productos/filas).`;
            } else {
                statusEl.textContent = `✅ Archivo leído con éxito. Se prepararon ${csvParsedDevoluciones.length} devoluciones.`;
            }
        }
        renderCSVPreviewDevoluciones();
    }
}

