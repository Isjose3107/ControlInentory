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
    remision: ['remisión', 'remision', 'factura', 'no. factura', 'nro factura', 'venta', 'no. venta', 'documento', 'remision #', 'factura #'],
    fecha: ['fecha', 'fecha factura', 'fecha remision', 'date', 'fecha_emision', 'emision'],
    cliente_nit: ['tercero', 'cliente', 'nit cliente', 'cliente_nit', 'nit', 'nombre cliente', 'nombre_cliente', 'razon social', 'razón social'],
    codigo_producto: ['código', 'codigo', 'codigo producto', 'código producto', 'referencia', 'ref', 'item_code', 'codigo_articulo', 'articulo', 'producto'],
    descripcion: ['descripción', 'descripcion', 'descripción producto', 'nombre producto', 'detalle', 'item_desc'],
    cantidad: ['cantidad', 'cant', 'cant.', 'unidades', 'cant_vendida', 'qty'],
    valor_unitario: ['valor_unitario', 'valor unitario', 'precio', 'v_unitario', 'v. unitario', 'precio_unitario', 'precio unitario']
};

function buscarClienteNit(terceroText) {
    if (!terceroText) return '';
    const norm = String(terceroText).trim().toLowerCase();
    
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
            remision, fecha, cliente_nit, observaciones, iva, items, estado: 'Pendiente'
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
            ["Remisión", "Fecha", "Cliente", "Producto", "Descripción", "Cantidad", "Valor Unitario"],
            ["REM-001", "2026-06-04", "EL CHOCLO", "00032", "AREPAS - Empaque Al Vacio", 50, 2500],
            ["REM-001", "2026-06-04", "EL CHOCLO", "10956", "CAJA CLAMSHELL GRANDE", 100, 1200],
            ["REM-002", "2026-06-04", "Distraves", "05302", "CHULETA ESPECIAL - Distraves", 20, 18000]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "FacturasVenta");
        XLSX.writeFile(wb, "plantilla_facturas_venta.xlsx");
    } else {
        const headers = 'remision,fecha,cliente_nit,codigo_producto,descripcion,cantidad,valor_unitario\n';
        const sample = 'REM-001,2026-06-04,900111222,00032,AREPAS - Empaque Al Vacio,50,2500\nREM-001,2026-06-04,900111222,10956,CAJA CLAMSHELL GRANDE,100,1200\n';

        const blob = new Blob([headers + sample], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "plantilla_facturas_venta.csv");
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

    const startIndex = colMapping._headerIndex + 1;

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        let remisionRaw = colMapping.remision !== -1 ? String(row[colMapping.remision] || '').trim() : '';
        let fechaRaw = colMapping.fecha !== -1 ? String(row[colMapping.fecha] || '').trim() : '';
        let clienteRaw = colMapping.cliente_nit !== -1 ? String(row[colMapping.cliente_nit] || '').trim() : '';
        let codigoRaw = colMapping.codigo_producto !== -1 ? String(row[colMapping.codigo_producto] || '').trim() : '';
        let descripcionRaw = colMapping.descripcion !== -1 ? String(row[colMapping.descripcion] || '').trim() : '';
        let cantidadRaw = colMapping.cantidad !== -1 ? String(row[colMapping.cantidad] || '').trim() : '';
        let valUnitRaw = colMapping.valor_unitario !== -1 ? String(row[colMapping.valor_unitario] || '').trim() : '';

        if (!remisionRaw && !codigoRaw && !clienteRaw) continue;

        if (remisionRaw) lastRemision = remisionRaw;
        else remisionRaw = lastRemision;

        if (fechaRaw) lastFecha = fechaRaw;
        else fechaRaw = lastFecha;

        if (clienteRaw) lastClienteNit = clienteRaw;
        else clienteRaw = lastClienteNit;

        if (!remisionRaw) continue;
        if (!codigoRaw) continue;

        const resolvedNit = buscarClienteNit(clienteRaw);
        let parsedFecha = formatExcelDate(fechaRaw);
        if (!parsedFecha) parsedFecha = new Date().toISOString().split('T')[0];

        if (!ventasMap.has(remisionRaw)) {
            ventasMap.set(remisionRaw, {
                remision: remisionRaw,
                fecha: parsedFecha,
                cliente_nit: resolvedNit,
                observaciones: 'Importado de Excel/CSV',
                iva: 19,
                estado: 'Pendiente',
                items: []
            });
        }

        const venta = ventasMap.get(remisionRaw);
        const prod = buscarProductoPorCodigo(codigoRaw);

        const quantity = parseNumberString(cantidadRaw);
        let price = parseNumberString(valUnitRaw);
        if (price === 0 && prod) {
            price = prod.valor_venta || 0;
        }

        venta.items.push({
            item: String(venta.items.length + 1),
            codigo: prod ? prod.codigo : codigoRaw,
            descripcion: descripcionRaw || (prod ? prod.descripcion : ''),
            cantidad: quantity,
            v_unitario: price
        });
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
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No se encontraron facturas válidas para importar.</td></tr>';
        btnConfirmar.disabled = true;
        previewPanel.style.display = 'block';
        return;
    }

    let allValid = true;

    csvParsedVentas.forEach(venta => {
        const cliExists = state.clientes.some(c => c.nit === venta.cliente_nit);
        let cliNombre = venta.cliente_nit;
        let errors = [];

        if (!cliExists) {
            errors.push(`Cliente NIT/Nombre ${venta.cliente_nit} no registrado`);
        } else {
            const c = state.clientes.find(x => x.nit === venta.cliente_nit);
            cliNombre = c.nombre;
        }

        venta.items.forEach(item => {
            const prod = buscarProductoPorCodigo(item.codigo);
            if (!prod) {
                errors.push(`Producto ${item.codigo} no existe`);
            } else {
                item.descripcion = prod.descripcion;
            }
        });

        let statusHTML = '';
        if (errors.length === 0) {
            statusHTML = '<span class="badge badge-completed">Válida</span>';
        } else {
            statusHTML = `<span class="badge badge-danger" title="${errors.join(', ')}">Error (${errors.length} novedades)</span>`;
            allValid = false;
        }

        let total = venta.items.reduce((sum, item) => sum + (item.cantidad * item.v_unitario), 0);
        let ivaVal = total * (venta.iva / 100);
        let totalGeneral = total + ivaVal;

        tbody.innerHTML += `
            <tr>
                <td><strong>${venta.remision}</strong></td>
                <td>${cliNombre}</td>
                <td>${venta.fecha}</td>
                <td class="text-center">${venta.items.length}</td>
                <td class="text-right font-bold">${formatoMoneda(totalGeneral)}</td>
                <td>${statusHTML}</td>
            </tr>
        `;
    });

    btnConfirmar.disabled = !allValid;
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

    try {
        for (const venta of csvParsedVentas) {
            await fetchAPI('/ventas', 'POST', venta);
        }
        alert('Facturas de venta importadas correctamente.');
        cancelarImportacionCSVVentas();
        switchVentaTab('crear');
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
    } catch (err) {
        console.error(err);
        alert(`Error al importar facturas: ${err.message}`);
    }
}

// Bind to window for global availability
window.switchVentaTab = switchVentaTab;
window.descargarPlantillaCSVVentas = descargarPlantillaCSVVentas;
window.procesarArchivoCSVVentas = procesarArchivoCSVVentas;
window.cancelarImportacionCSVVentas = cancelarImportacionCSVVentas;
window.confirmarImportacionCSVVentas = confirmarImportacionCSVVentas;
