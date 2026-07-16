import { state } from '../state.js';
import { fetchAPI } from '../api.js';
import { 
    formatoMoneda, 
    calcularTotalLinea, 
    calcularIVA,
    readExcelOrCSV,
    parseNumberString,
    formatExcelDate,
    buscarProductoPorCodigo
} from '../utils.js';

let ventaItemCount = 0;
let csvParsedVentas = [];

const ventaAliasMap = {
    remision: ['remisión', 'remision', 'factura', 'no. factura', 'nro factura', 'venta', 'no. venta', 'documento', 'remision #', 'factura #', 'req. #', 'req.#', 'req #', 'req', 'requisicion', 'requisición', 'no. req', 'nro req', 'pedidolog'],
    fecha: ['fecha', 'fecha factura', 'fecha remision', 'date', 'fecha_emision', 'emision', 'fecha elab', 'fecha elab.', 'fechaelab', 'fech elab', 'fech elab.', 'fech requ', 'fech requ.', 'fecha requ'],
    cliente_nit: ['tercero', 'cliente', 'nit cliente', 'cliente_nit', 'nit', 'nombre cliente', 'nombre_cliente', 'razon social', 'razón social', 'solicitante', 'c.c. destino', 'c.c destino', 'cc destino', 'destino', 'cod cliente', 'nit_cliente'],
    cliente_nombre: ['cliente', 'nombre cliente', 'nombre_cliente', 'razon social', 'razón social'],
    codigo_producto: ['código', 'codigo', 'codigo producto', 'código producto', 'referencia', 'ref', 'item_code', 'codigo_articulo', 'articulo', 'producto', 'elemento', 'cod', 'cod.', 'artislog', 'art cliente', 'art_cliente'],
    descripcion: ['descripción', 'descripcion', 'descripción producto', 'nombre producto', 'detalle', 'item_desc', 'articulo'],
    cantidad: ['unidades', 'cant_vendida', 'qty', 'unds', 'und', 'cantid', 'cantidad'],
    valor_unitario: ['valor_unitario', 'valor unitario', 'precio', 'v_unitario', 'v. unitario', 'precio_unitario', 'precio unitario', 'cantidad', 'cant', 'cant.'],
    observaciones: ['observaciones', 'observación', 'observacion', 'notas', 'nota', 'comentarios'],
    item_num: ['item', 'ítem', 'linea', 'línea', 'no. item', 'nro item'],
    unidad_medida: ['u.m.', 'u.m', 'um', 'um.', 'unidad medida', 'unidad_medida', 'uom'],
    bodega: ['bode surt', 'bode surt.', 'bodega', 'bode'],
    cava_almacen: ['cava', 'almacen', 'almacén', 'almacenam', 'cava almacen', 'cava almacen m', 'cava almacena m', 'cava almacenam', 'almacenamiento', 'cava/almacen', 'almacenam.', 'cava/almacen/almacenam', 'cava/almacen/almacenamiento'],
    direccion: ['direccion', 'dirección'],
    ruta: ['ruta'],
    placa: ['placa']
};

function buscarClienteNit(terceroText) {
    if (!terceroText) return '';
    const norm = String(terceroText).trim().toLowerCase();
    
    // Si contiene un patrón de punto de venta (ej: Q70, 0Q70, Q15, etc.) o palabras clave de tiendas Frisby
    if (/(?:^|\b)0?q\d+/i.test(norm) || norm.includes('frisby') || norm.includes('restaurante')) {
        const frisby = state.clientes.find(c => c.nombre.toLowerCase().includes('frisby'));
        if (frisby) return frisby.nit;
    }
    
    // Coincidencia exacta por nombre
    let match = state.clientes.find(c => c.nombre.trim().toLowerCase() === norm);
    if (match) return match.nit;
    
    // Coincidencia exacta por NIT
    match = state.clientes.find(c => String(c.nit) === String(terceroText).trim());
    if (match) return match.nit;
    
    // Coincidencia parcial por nombre
    match = state.clientes.find(c => 
        c.nombre.toLowerCase().includes(norm) || 
        norm.includes(c.nombre.toLowerCase())
    );
    if (match) return match.nit;
    
    return String(terceroText).trim();
}


export function agregarFilaItemVenta(item = null) {
    ventaItemCount++;
    const tbody = document.getElementById('venta-items-table-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.id = `venta-row-${ventaItemCount}`;

    tr.innerHTML = `
        <td class="text-center venta-row-item-num">${tbody.children.length + 1}</td>
        <td>
            <select class="form-control venta-item-select" onchange="seleccionarProductoFilaVenta(${ventaItemCount})" style="padding:4px 8px;">
                <option value="">Seleccione...</option>
                ${state.productos.map(p => `<option value="${p.codigo}" ${item && item.codigo === p.codigo ? 'selected' : ''}>${p.codigo}</option>`).join('')}
            </select>
        </td>
        <td>
            <input type="text" class="form-control venta-item-desc" value="${item ? item.descripcion : ''}" style="padding:4px 8px;">
        </td>
        <td>
            <input type="number" class="form-control venta-item-qty text-center" value="${item ? item.cantidad : '1'}" oninput="calcularTotalesVenta()" style="padding:4px 8px;" min="1" step="any">
        </td>
        <td>
            <input type="number" class="form-control venta-item-unit text-right" value="${item ? item.v_unitario : '0'}" oninput="calcularTotalesVenta()" style="padding:4px 8px;" min="0" step="any">
        </td>
        <td class="text-right font-bold venta-item-total">$0.00</td>
        <td class="text-center">
            <button class="btn btn-danger btn-sm" onclick="eliminarFilaItemVenta(${ventaItemCount})" style="padding:4px 8px;">✕</button>
        </td>
    `;
    tbody.appendChild(tr);
    calcularTotalesVenta();
}

export function eliminarFilaItemVenta(rowId) {
    const row = document.getElementById(`venta-row-${rowId}`);
    if (row) {
        row.remove();
        const rows = document.querySelectorAll('.venta-row-item-num');
        rows.forEach((td, index) => {
            td.textContent = index + 1;
        });
        calcularTotalesVenta();
    }
}

export function seleccionarProductoFilaVenta(rowId) {
    const row = document.getElementById(`venta-row-${rowId}`);
    if (!row) return;
    const code = row.querySelector('.venta-item-select').value;
    const prod = state.productos.find(p => p.codigo === code);

    if (prod) {
        row.querySelector('.venta-item-desc').value = prod.descripcion;
        row.querySelector('.venta-item-unit').value = prod.valor_venta || 0;
    } else {
        row.querySelector('.venta-item-desc').value = '';
        row.querySelector('.venta-item-unit').value = 0;
    }
    calcularTotalesVenta();
}

export function cargarDatosClienteVenta() {
    const nit = document.getElementById('venta-cliente').value;
    const c = state.clientes.find(x => x.nit === nit);
    const detailDiv = document.getElementById('venta-cliente-detalles');

    if (c) {
        detailDiv.innerHTML = `
            <div class="flex-1"><strong>Nombre:</strong> ${c.nombre}</div>
            <div class="flex-1"><strong>Teléfono:</strong> ${c.telefono || 'N/A'}</div>
            <div class="flex-1"><strong>Dirección:</strong> ${c.direccion || 'N/A'}</div>
            <div class="flex-1"><strong>Correo:</strong> ${c.correo || 'N/A'}</div>
        `;
    } else {
        detailDiv.innerHTML = '';
    }
}

export function calcularTotalesVenta() {
    const rows = document.querySelectorAll('#venta-items-table-body tr');
    let subtotal = 0;

    rows.forEach(row => {
        const qty = Number(row.querySelector('.venta-item-qty').value) || 0;
        const unit = Number(row.querySelector('.venta-item-unit').value) || 0;
        const total = calcularTotalLinea(qty, unit);
        subtotal += total;

        row.querySelector('.venta-item-total').textContent = formatoMoneda(total);
    });

    const ivaPct = Number(document.getElementById('venta-iva').value) || 0;
    const valorIVA = calcularIVA(subtotal, ivaPct);
    const totalGeneral = subtotal + valorIVA;

    document.getElementById('venta-total-general').textContent = formatoMoneda(totalGeneral);
}

export function limpiarFormVenta() {
    document.getElementById('venta-remision').value = '';
    document.getElementById('venta-direccion').value = '';
    document.getElementById('venta-ruta').value = '';
    document.getElementById('venta-placa').value = '';
    document.getElementById('venta-observaciones').value = '';
    document.getElementById('venta-iva').value = '19';
    document.getElementById('venta-total-general').textContent = '$0.00';
    document.getElementById('venta-items-table-body').innerHTML = '';
    document.getElementById('venta-cliente-detalles').innerHTML = '';
    if (window.initDateInputs) {
        window.initDateInputs();
    }

    agregarFilaItemVenta();
}

export async function guardarVenta() {
    const remision = document.getElementById('venta-remision').value.trim();
    const fecha = document.getElementById('venta-fecha').value;
    const cliente_nit = document.getElementById('venta-cliente').value;
    const direccion = document.getElementById('venta-direccion').value.trim();
    const ruta = document.getElementById('venta-ruta').value.trim();
    const placa = document.getElementById('venta-placa').value.trim();
    const observaciones = document.getElementById('venta-observaciones').value;
    const iva = Number(document.getElementById('venta-iva').value);

    if (!remision || !fecha || !cliente_nit) {
        alert('Por favor complete No. Remisión, Fecha y Cliente.');
        return;
    }

    const rows = document.querySelectorAll('#venta-items-table-body tr');
    const items = [];

    rows.forEach(row => {
        const num = row.querySelector('.venta-row-item-num').textContent;
        const codigo = row.querySelector('.venta-item-select').value;
        const descripcion = row.querySelector('.venta-item-desc').value;
        const cantidad = Number(row.querySelector('.venta-item-qty').value);
        const v_unitario = Number(row.querySelector('.venta-item-unit').value);

        if (codigo) {
            items.push({ item: num, codigo, descripcion, cantidad, v_unitario });
        }
    });

    if (items.length === 0) {
        alert('Debe agregar al menos un producto válido.');
        return;
    }

    try {
        await fetchAPI('/ventas', 'POST', {
            remision, fecha, cliente_nit, observaciones, iva, items, estado: 'Pendiente', direccion, ruta, placa
        });
        alert('Remisión / Factura de Venta guardada con éxito.');
        limpiarFormVenta();
    } catch (err) {
        console.error(err);
    }
}

// Bind to window for global availability
window.agregarFilaItemVenta = agregarFilaItemVenta;
window.eliminarFilaItemVenta = eliminarFilaItemVenta;
window.seleccionarProductoFilaVenta = seleccionarProductoFilaVenta;
window.cargarDatosClienteVenta = cargarDatosClienteVenta;
window.calcularTotalesVenta = calcularTotalesVenta;
window.limpiarFormVenta = limpiarFormVenta;
window.guardarVenta = guardarVenta;
window.consultarVentaForm = consultarVentaForm;

export async function consultarVentaForm() {
    const docId = document.getElementById('consultar-venta-id').value.trim();
    if (!docId) {
        alert('Ingrese el número de la remisión a buscar.');
        return;
    }

    try {
        const ventas = await fetchAPI('/ventas') || [];
        const v = ventas.find(x => x.remision === docId);

        if (!v) {
            alert(`No se encontró la Remisión #${docId}`);
            return;
        }

        document.getElementById('venta-remision').value = v.remision;
        document.getElementById('venta-fecha').value = v.fecha;
        document.getElementById('venta-cliente').value = v.cliente_nit;
        cargarDatosClienteVenta();

        document.getElementById('venta-direccion').value = v.direccion || '';
        document.getElementById('venta-ruta').value = v.ruta || '';
        document.getElementById('venta-placa').value = v.placa || '';
        document.getElementById('venta-observaciones').value = v.observaciones || '';
        document.getElementById('venta-iva').value = v.iva;

        const tbody = document.getElementById('venta-items-table-body');
        tbody.innerHTML = '';
        v.items.forEach(item => {
            agregarFilaItemVenta(item);
        });

        alert('Remisión / Factura de Venta cargada.');
    } catch (err) {
        console.error(err);
    }
}

// --- ACCIONES DE CARGA MASIVA DE VENTAS ---

export function switchVentaTab(tab) {
    document.getElementById('venta-pane-crear').style.display = tab === 'crear' ? 'block' : 'none';
    document.getElementById('venta-pane-masiva').style.display = tab === 'masiva' ? 'block' : 'none';

    const btnCrear = document.getElementById('venta-tab-crear');
    const btnMasiv = document.getElementById('venta-tab-masiva');

    if (btnCrear) btnCrear.className = 'btn ' + (tab === 'crear' ? 'btn-primary' : 'btn-secondary');
    if (btnMasiv) btnMasiv.className = 'btn ' + (tab === 'masiva' ? 'btn-primary' : 'btn-secondary');
}

export function descargarPlantillaCSVVentas() {
    if (window.XLSX) {
        const data = [
            ["FECHA ELAB", "REQ. #", "ITEM", "ESTADO", "ELEMENTO", "DESCRIPCION", "CANTIDAD", "U.M.", "FECH REQU", "BODE SURT", "C.C. DESTINO", "SOLICITANTE", "OBSERVACIONES", "cava almacen", "unidades"],
            ["30/03/2026", "2942195", "45", "BOO", "00176", "MIEL DE ABEJAS COJIN", "$ 4.536,00", "Und", "02/04/2026", "055", "Q70 - GUACARI P.H. SINCELEJO", "0Q70 - Administrador de restaurante", "SINCELEJO,MONTERIA,RIOHACHA,VALLEDUPAR,MAGANGUE Jueves 02 Sugerido", "Q70", ""],
            ["30/03/2026", "2942195", "46", "BOO", "08110", "PAÑOS DE MICROFIBRA AZUL", "$ 3,00", "Und", "02/04/2026", "055", "Q70 - GUACARI P.H. SINCELEJO", "0Q70 - Administrador de restaurante", "", "Q70", ""],
            ["30/03/2026", "2942195", "47", "BOO", "08111", "PAÑOS DE MICROFIBRA VERDE", "$ 4,00", "Und", "02/04/2026", "055", "Q70 - GUACARI P.H. SINCELEJO", "0Q70 - Administrador de restaurante", "", "Q70", ""]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "FacturasVenta");
        XLSX.writeFile(wb, "plantilla_facturas_venta_diaria.xlsx");
    } else {
        const headers = 'FECHA ELAB,REQ. #,ITEM,ESTADO,ELEMENTO,DESCRIPCION,CANTIDAD,U.M.,FECH REQU,BODE SURT,C.C. DESTINO,SOLICITANTE,OBSERVACIONES,cava almacen,unidades\n';
        const sample = '30/03/2026,2942195,45,BOO,00176,MIEL DE ABEJAS COJIN,"$ 4.536,00",Und,02/04/2026,055,Q70,0Q70 - Administrador,Sugerido,Q70,\n';

        const blob = new Blob([headers + sample], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "plantilla_facturas_venta_diaria.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export function procesarArchivoCSVVentas() {
    const fileInput = document.getElementById('csv-file-input-ventas');
    if (!fileInput) return;
    const file = fileInput.files[0];
    if (!file) return;

    readExcelOrCSV(file, ventaAliasMap, function (err, rows, colMapping) {
        if (err) {
            alert(`Error al procesar archivo: ${err.message}`);
            return;
        }
        try {
            csvParsedVentas = parseExcelOrCSVToVentas(rows, colMapping);
            renderCSVPreviewVentas();
        } catch (parseErr) {
            alert(`Error al parsear datos: ${parseErr.message}`);
        }
    });
}

function parseExcelOrCSVToVentas(rows, colMapping) {
    const ventasMap = new Map();

    let lastRemision = '';
    let lastFecha = '';
    let lastClienteNit = '';
    let lastClienteNombre = '';
    let lastObservaciones = '';
    let lastDireccion = '';
    let lastRuta = '';
    let lastPlaca = '';

    const startIndex = colMapping._headerIndex + 1;

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        let remisionRaw = colMapping.remision !== -1 ? String(row[colMapping.remision] || '').trim() : '';
        let fechaRaw = colMapping.fecha !== -1 ? String(row[colMapping.fecha] || '').trim() : '';
        let clienteRaw = colMapping.cliente_nit !== -1 ? String(row[colMapping.cliente_nit] || '').trim() : '';
        let clienteNombreRaw = colMapping.cliente_nombre !== -1 ? String(row[colMapping.cliente_nombre] || '').trim() : '';
        let codigoRaw = colMapping.codigo_producto !== -1 ? String(row[colMapping.codigo_producto] || '').trim() : '';
        let descripcionRaw = colMapping.descripcion !== -1 ? String(row[colMapping.descripcion] || '').trim() : '';
        let cantidadRaw = colMapping.cantidad !== -1 ? String(row[colMapping.cantidad] || '').trim() : '';
        let valUnitRaw = colMapping.valor_unitario !== -1 ? String(row[colMapping.valor_unitario] || '').trim() : '';
        let observacionesRaw = colMapping.observaciones !== -1 ? String(row[colMapping.observaciones] || '').trim() : '';
        let itemNumRaw = colMapping.item_num !== -1 ? String(row[colMapping.item_num] || '').trim() : '';
        let umRaw = colMapping.unidad_medida !== -1 ? String(row[colMapping.unidad_medida] || '').trim() : '';
        let bodegaRaw = colMapping.bodega !== -1 ? String(row[colMapping.bodega] || '').trim() : '';
        let cavaRaw = colMapping.cava_almacen !== -1 ? String(row[colMapping.cava_almacen] || '').trim() : '';
        let direccionRaw = colMapping.direccion !== -1 ? String(row[colMapping.direccion] || '').trim() : '';
        let ciudadRaw = colMapping.ciudad !== -1 ? String(row[colMapping.ciudad] || '').trim() : '';
        let rutaRaw = colMapping.ruta !== -1 ? String(row[colMapping.ruta] || '').trim() : '';
        let placaRaw = colMapping.placa !== -1 ? String(row[colMapping.placa] || '').trim() : '';

        if (!remisionRaw && !codigoRaw && !clienteRaw) continue;

        if (remisionRaw) lastRemision = remisionRaw;
        else remisionRaw = lastRemision;

        if (fechaRaw) lastFecha = fechaRaw;
        else fechaRaw = lastFecha;

        if (clienteRaw) lastClienteNit = clienteRaw;
        else clienteRaw = lastClienteNit;

        if (clienteNombreRaw) lastClienteNombre = clienteNombreRaw;
        else clienteNombreRaw = lastClienteNombre;

        if (observacionesRaw) lastObservaciones = observacionesRaw;
        else observacionesRaw = lastObservaciones;

        if (direccionRaw) lastDireccion = direccionRaw;
        else direccionRaw = lastDireccion;

        if (rutaRaw) lastRuta = rutaRaw;
        else rutaRaw = lastRuta;

        if (placaRaw) lastPlaca = placaRaw;
        else placaRaw = lastPlaca;

        if (!remisionRaw) continue;
        // NOTE: filas sin codigo se incluyen igual con placeholder — TODO se sube como FACTURA

        const resolvedNit = buscarClienteNit(clienteRaw);
        let parsedFecha = formatExcelDate(fechaRaw);
        if (!parsedFecha) parsedFecha = new Date().toISOString().split('T')[0];

        if (!ventasMap.has(remisionRaw)) {
            const obsParts = [];
            if (observacionesRaw) obsParts.push(observacionesRaw);
            if (direccionRaw) obsParts.push(`Dirección: ${direccionRaw}`);
            if (ciudadRaw) obsParts.push(`Ciudad: ${ciudadRaw}`);
            if (rutaRaw) obsParts.push(`Ruta: ${rutaRaw}`);
            if (placaRaw) obsParts.push(`Placa: ${placaRaw}`);
            if (cavaRaw) obsParts.push(`Cava: ${cavaRaw}`);
            if (bodegaRaw) obsParts.push(`Bodega: ${bodegaRaw}`);
            const obsText = obsParts.join(' | ') || 'Importado de Excel/CSV';

            ventasMap.set(remisionRaw, {
                remision: remisionRaw,
                fecha: parsedFecha,
                cliente_nit: resolvedNit,
                observaciones: obsText,
                iva: 0,
                estado: 'Pendiente',
                items: [],
                direccion: direccionRaw || '',
                ruta: rutaRaw || '',
                placa: placaRaw || '',
                _cliente_nombre: clienteNombreRaw || resolvedNit,
                _direccion: direccionRaw || '',
                _ruta: rutaRaw || '',
                _placa: placaRaw || '',
                _bodega: bodegaRaw,
                _cava_almacen: cavaRaw
            });
        }

        const venta = ventasMap.get(remisionRaw);
        const prod = buscarProductoPorCodigo(codigoRaw);

        // La cantidad real viene de la columna "unidades" (cantidad en el aliasMap)
        // El valor unitario puede venir de la columna "CANTIDAD" del Excel (que es realmente precio)
        const quantity = parseNumberString(cantidadRaw);
        let price = parseNumberString(valUnitRaw);

        // Si la cantidad es 0 pero hay precio, y el precio parece ser una cantidad (no tiene $ ni decimales largos)
        // usar el precio como cantidad y buscar el valor del catálogo
        let finalQty = quantity;
        let finalPrice = price;

        if (finalQty === 0 && finalPrice > 0) {
            // Si no hay columna de unidades mapeada, usar el precio como cantidad
            finalQty = finalPrice;
            finalPrice = prod ? (prod.valor_venta || 0) : 0;
        }

        if (finalPrice === 0 && prod) {
            finalPrice = prod.valor_venta || 0;
        }

        // Solo agregar ítem si hay código o descripción; filas completamente vacías de producto se omiten
        if (codigoRaw || descripcionRaw) {
            venta.items.push({
                item: itemNumRaw || String(venta.items.length + 1),
                codigo: prod ? prod.codigo : (codigoRaw || 'SIN-CODIGO'),
                descripcion: descripcionRaw || (prod ? prod.descripcion : 'PRODUCTO POR DEFINIR'),
                cantidad: finalQty || 1,
                v_unitario: finalPrice,
                unidad_medida: umRaw || (prod ? prod.unidad_compra || 'Und' : 'Und'),
                _requiere_revision: !prod
            });
        }
    }

    return Array.from(ventasMap.values());
}

export function renderCSVPreviewVentas() {
    const previewPanel = document.getElementById('csv-preview-panel-ventas');
    const tbody = document.getElementById('csv-preview-body-ventas');
    const btnConfirmar = document.getElementById('btnConfirmarImportacionCSVVentas');

    if (!tbody || !previewPanel || !btnConfirmar) return;
    tbody.innerHTML = '';

    if (csvParsedVentas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No se encontraron facturas válidas para importar.</td></tr>';
        btnConfirmar.disabled = true;
        previewPanel.style.display = 'block';
        return;
    }

    // TODOS se importan — datos faltantes se marcan con advertencia pero NO bloquean
    csvParsedVentas.forEach((venta, idx) => {
        const cliExists = state.clientes.some(c => c.nit === venta.cliente_nit);
        let cliNombre = venta.cliente_nit || '(SIN CLIENTE)';
        let warnings = [];

        if (!venta.cliente_nit || !cliExists) {
            warnings.push('Cliente no registrado');
        } else {
            const c = state.clientes.find(x => x.nit === venta.cliente_nit);
            cliNombre = c.nombre;
        }

        venta.items.forEach(item => {
            const prod = buscarProductoPorCodigo(item.codigo);
            if (prod) {
                item.descripcion = prod.descripcion;
            } else if (item.codigo !== 'SIN-CODIGO') {
                warnings.push(`Producto '${item.codigo}' no en catálogo`);
            }
        });

        if (venta.items.length === 0) warnings.push('Sin ítems — agregar productos al editar');

        let statusHTML = '';
        if (warnings.length === 0) {
            statusHTML = '<span class="badge badge-completed">Válida</span>';
        } else {
            statusHTML = `<span class="badge" style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;" title="${warnings.join(' | ')}">⚠️ ${warnings.length} advertencia(s)</span>`;
        }

        let totalUnidades = venta.items.reduce((sum, item) => sum + (item.cantidad || 0), 0);
        let total = venta.items.reduce((sum, item) => sum + ((item.cantidad || 0) * (item.v_unitario || 0)), 0);
        let ivaVal = total * ((venta.iva || 0) / 100);
        let totalGeneral = total + ivaVal;

        // Siempre habilitado — TODA fila se puede importar y editar luego
        const actionHTML = `
            <button class="btn btn-success btn-sm" onclick="importarUnaVenta('${venta.remision}')" style="padding: 2px 6px; font-size: 0.8rem; border-radius: var(--radius-sm);">Importar</button>
        `;

        tbody.innerHTML += `
            <tr style="${warnings.length > 0 ? 'background: rgba(245,158,11,0.05);' : ''}">
                <td><strong>${venta.remision}</strong></td>
                <td>${cliNombre}</td>
                <td>${venta.fecha}</td>
                <td class="text-center">${venta.items.length}</td>
                <td class="text-center">${totalUnidades}</td>
                <td class="text-right font-bold">${formatoMoneda(totalGeneral)}</td>
                <td class="text-center">${venta._cava_almacen || '-'}</td>
                <td>${statusHTML}</td>
                <td class="text-center">${actionHTML}</td>
            </tr>
        `;
    });

    // Siempre habilitar el botón de confirmación — TODO se sube como FACTURA
    btnConfirmar.disabled = false;
    previewPanel.style.display = 'block';
}

export function cancelarImportacionCSVVentas() {
    const previewPanel = document.getElementById('csv-preview-panel-ventas');
    if (previewPanel) previewPanel.style.display = 'none';
    const fileInput = document.getElementById('csv-file-input-ventas');
    if (fileInput) fileInput.value = '';
    csvParsedVentas = [];
}

export async function confirmarImportacionCSVVentas() {
    if (csvParsedVentas.length === 0) return;

    const confirmacion = confirm(`¿Confirmar importación masiva de ${csvParsedVentas.length} factura(s)/remisión(es)?`);
    if (!confirmacion) return;

    const btnConfirmar = document.getElementById('btnConfirmarImportacionCSVVentas');
    const originalText = btnConfirmar ? btnConfirmar.textContent : '';

    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Procesando importación masiva...';
    }

    try {
        const res = await fetchAPI('/ventas/bulk', 'POST', { ventas: csvParsedVentas });
        alert(`Se han importado exitosamente ${res.count || csvParsedVentas.length} factura(s)/remisión(es).`);
        cancelarImportacionCSVVentas();
        switchVentaTab('crear');
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
    } catch (err) {
        console.error(err);
        alert(`Error al importar facturas: ${err.message}`);
    } finally {
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.textContent = originalText;
        }
    }
}

export async function importarUnaVenta(remision) {
    const venta = csvParsedVentas.find(v => v.remision === remision);
    if (!venta) return;

    try {
        await fetchAPI('/ventas', 'POST', venta);
        alert(`Factura/Remisión ${remision} importada correctamente.`);
        
        // Remover de la lista temporal
        csvParsedVentas = csvParsedVentas.filter(v => v.remision !== remision);
        renderCSVPreviewVentas();
        
        // Si no quedan más ventas
        if (csvParsedVentas.length === 0) {
            cancelarImportacionCSVVentas();
            switchVentaTab('crear');
        }
        
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
    } catch (err) {
        console.error(err);
        alert(`Error al importar la factura ${remision}: ${err.message}`);
    }
}

// Bind to window for global availability
window.switchVentaTab = switchVentaTab;
window.descargarPlantillaCSVVentas = descargarPlantillaCSVVentas;
window.procesarArchivoCSVVentas = procesarArchivoCSVVentas;
window.cancelarImportacionCSVVentas = cancelarImportacionCSVVentas;
window.confirmarImportacionCSVVentas = confirmarImportacionCSVVentas;
window.importarUnaVenta = importarUnaVenta;
