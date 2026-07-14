import { state } from '../state.js';
import { fetchAPI } from '../api.js';

// ponytail: alias map covers all common "despacho diario" column names for factura/remision
const despachAliasMap = {
    remision: ['remisión', 'remision', 'factura', 'no. factura', 'nro factura', 'no factura',
               'venta', 'documento', 'remision #', 'factura #', 'req. #', 'req.#', 'req #',
               'req', 'requisicion', 'requisición', 'no. req', 'nro req', 'nro. req',
               'order', 'pedido', 'despacho', 'no. despacho', 'nro despacho'],
    descripcion: ['descripción', 'descripcion', 'detalle', 'item_desc', 'nombre producto'],
    cantidad:    ['cantidad', 'unidades', 'cant', 'cant.', 'qty', 'unds', 'und'],
};

export function switchMontaTab(tab) {
    const consulta = document.getElementById('monta-pane-consulta');
    const importar = document.getElementById('monta-pane-importar');
    const btnConsulta = document.getElementById('monta-tab-consulta');
    const btnImportar = document.getElementById('monta-tab-importar');

    if (consulta) consulta.style.display = tab === 'consulta' ? '' : 'none';
    if (importar) importar.style.display = tab === 'importar' ? '' : 'none';
    if (btnConsulta) btnConsulta.className = 'btn ' + (tab === 'consulta' ? 'btn-primary' : 'btn-secondary');
    if (btnImportar) btnImportar.className = 'btn ' + (tab === 'importar' ? 'btn-primary' : 'btn-secondary');
}

export function procesarArchivoDespacho() {
    const fileInput = document.getElementById('monta-file-input');
    if (!fileInput || !fileInput.files[0]) return;
    const file = fileInput.files[0];
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            let rows = [];
            if (isExcel) {
                const data = new Uint8Array(e.target.result);
                // ponytail: XLSX is loaded globally via CDN script tag
                const wb = XLSX.read(data, { type: 'array' });
                // Find the sheet with the most recognizable headers
                let bestRows = null, bestScore = -1;
                for (const name of wb.SheetNames) {
                    const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
                    const score = _scoreRows(sheetRows);
                    if (score > bestScore) { bestScore = score; bestRows = sheetRows; }
                }
                rows = bestRows || XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            } else {
                const text = e.target.result;
                // Detect delimiter: semicolon or comma
                const firstLine = text.split('\n')[0] || '';
                const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
                rows = text.split('\n').map(line =>
                    line.split(delim).map(c => c.replace(/^"|"$/g, '').trim())
                );
            }
            _procesarRows(rows);
        } catch (err) {
            alert('Error al leer el archivo: ' + err.message);
        }
    };

    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'UTF-8');
}

// Score how many alias-map headers a sheet contains (to pick best sheet)
function _scoreRows(rows) {
    const allAliases = Object.values(despachAliasMap).flat();
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const row = rows[i];
        if (!row) continue;
        let matches = 0;
        row.forEach(cell => {
            const c = String(cell || '').toLowerCase().trim().replace(/\s+/g, ' ');
            if (allAliases.some(a => c === a || c.replace(/[.\-_\s\/]/g,'') === a.replace(/[.\-_\s\/]/g,''))) matches++;
        });
        if (matches >= 1) return matches;
    }
    return 0;
}

function _procesarRows(rows) {
    // Try to find header row and factura column
    let facturaColIdx = -1;
    let headerRowIdx = -1;
    const remisionAliases = despachAliasMap.remision;

    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
            const cell = String(row[c] || '').toLowerCase().trim().replace(/\s+/g, ' ');
            const stripped = cell.replace(/[.\-_\s\/]/g, '');
            const match = remisionAliases.some(a => cell === a || stripped === a.replace(/[.\-_\s\/]/g,''));
            if (match) { facturaColIdx = c; headerRowIdx = i; break; }
        }
        if (facturaColIdx !== -1) break;
    }

    const mapaFacturas = new Map();
    const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

    if (facturaColIdx !== -1) {
        // Structured extraction from identified column
        let lastRemision = '';
        for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row)) continue;
            let val = String(row[facturaColIdx] || '').trim();
            if (!val) val = lastRemision; // carry-forward for merged cells
            else lastRemision = val;
            if (!val) continue;
            mapaFacturas.set(val, (mapaFacturas.get(val) || 0) + 1);
        }
    } else {
        // Fallback: scan first few columns for anything resembling an invoice number
        const skip = Math.min(5, rows.length);
        for (let i = skip; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row)) continue;
            for (let c = 0; c < Math.min(row.length, 6); c++) {
                const val = String(row[c] || '').trim();
                if (val && val.length > 2 && val.length < 30 && /\d/.test(val) && !/[a-zA-Z]{4,}/.test(val)) {
                    mapaFacturas.set(val, (mapaFacturas.get(val) || 0) + 1);
                    break;
                }
            }
        }
    }

    _renderTablaFacturas(mapaFacturas);
}

async function _renderTablaFacturas(mapaFacturas) {
    const tbody = document.getElementById('monta-archivo-body');
    const totalBadge = document.getElementById('monta-archivo-total');
    const resultado = document.getElementById('monta-archivo-resultado');

    if (!tbody) return;

    if (mapaFacturas.size === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No se encontraron números de factura/remisión en el archivo.</td></tr>';
        if (resultado) resultado.style.display = 'block';
        if (totalBadge) totalBadge.textContent = '0 facturas';
        return;
    }

    // Cargar ventas para consultar estado en WMS
    let ventasWMS = [];
    try {
        ventasWMS = await fetchAPI('/ventas') || [];
    } catch (_) { /* si falla, mostramos sin estado */ }

    tbody.innerHTML = '';
    let count = 0;
    for (const [remision, itemCount] of mapaFacturas) {
        count++;
        const ventaWMS = ventasWMS.find(v => v.remision === remision);
        let estadoBadge = '<span class="badge badge-danger" style="font-size:0.78rem;">No registrada en WMS</span>';
        if (ventaWMS) {
            const badgeClass = ventaWMS.estado === 'Completado' ? 'badge-completed'
                             : ventaWMS.estado === 'Pre-alistado' ? 'badge-pre-alistado'
                             : 'badge-pending';
            estadoBadge = `<span class="badge ${badgeClass}" style="font-size:0.78rem;">${ventaWMS.estado}</span>`;
        }

        const btnPicking = ventaWMS
            ? `<button class="btn btn-primary btn-sm" onclick="irAPickingDesdeMonta('${remision}')">Alistar Picking</button>`
            : `<span class="text-muted" style="font-size:0.85rem;">Sin datos en WMS</span>`;

        tbody.innerHTML += `
            <tr>
                <td><strong>${remision}</strong></td>
                <td class="text-center">${itemCount}</td>
                <td class="text-center">${estadoBadge}</td>
                <td class="text-center">${btnPicking}</td>
            </tr>`;
    }

    if (totalBadge) totalBadge.textContent = `${count} factura${count !== 1 ? 's' : ''}`;
    if (resultado) resultado.style.display = 'block';
}

export function irAPickingDesdeMonta(remision) {
    const input = document.getElementById('pick-remision-input');
    if (input) input.value = remision;
    if (window.showView) window.showView('picking');
    if (window.consultarPickingFactura) window.consultarPickingFactura();
}

export async function loadMontacarguistaConsolidado() {
    const fecha = document.getElementById('monta-fecha').value;
    if (!fecha) {
        alert('Por favor ingrese una fecha válida.');
        return;
    }

    try {
        const datos = await fetchAPI(`/ventas/consolidado?fecha=${fecha}`);
        const tbody = document.getElementById('monta-consolidado-body');
        document.getElementById('monta-fecha-title').textContent = `Consolidado de Facturas (${fecha})`;
        document.getElementById('monta-total-facturas').textContent = `${datos.length} Remisión(es)`;

        tbody.innerHTML = '';
        if (datos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay facturas/remisiones registradas para este día.</td></tr>';
            return;
        }

        datos.forEach(row => {
            let badgeClass = 'badge-pending';
            if (row.estado === 'Completado') badgeClass = 'badge-completed';
            else if (row.estado === 'Pre-alistado') badgeClass = 'badge-pre-alistado';

            const btnPicking = row.estado !== 'Completado'
                ? `<div class="flex-row gap-1">
                     <button class="btn btn-primary btn-sm" onclick="iniciarPickingDesdeMonta('${row.remision}')">Alistar Picking</button>
                     <button class="btn btn-secondary btn-sm" onclick="mostrarDesgloseFacturaMonta('${row.remision}')">Desglosar Factura</button>
                   </div>`
                : `<span class="badge badge-completed">Completado</span>`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${row.remision}</strong></td>
                    <td>${row.cliente_nombre || 'Cliente Genérico'}</td>
                    <td class="text-center">${row.total_items}</td>
                    <td class="text-center">${row.total_unidades}</td>
                    <td><span class="badge ${badgeClass}">${row.estado}</span></td>
                    <td>${btnPicking}</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

export async function mostrarDesgloseFacturaMonta(remision) {
    try {
        const picking = await fetchAPI(`/ventas/picking?remision=${remision}`);
        document.getElementById('monta-desg-rem-id').textContent = remision;
        const tbody = document.getElementById('monta-desglose-body');
        tbody.innerHTML = '';

        if (picking.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay productos en esta factura.</td></tr>';
            document.getElementById('monta-desglose-modal').style.display = 'flex';
            return;
        }

        picking.items.forEach(item => {
            const stockAux = item.stock_auxiliar || 0;
            const cantSoli = item.cantidad_solicitada;
            const stockAlta = item.stock_alta || 0;

            let statusHTML = '';
            let actionHTML = '';

            if (stockAux >= cantSoli) {
                statusHTML = '<span class="badge badge-completed">Suficiente en Picking</span>';
                actionHTML = '<span class="text-muted" style="font-size:0.85rem;">No requiere descenso</span>';
            } else {
                const deficit = cantSoli - stockAux;
                statusHTML = `<span class="badge badge-pending">Falta Bajar (${deficit})</span>`;
                
                if (stockAlta > 0) {
                    actionHTML = `
                        <button class="btn btn-warning btn-sm" style="padding: 4px 10px; font-size: 0.85rem;"
                                onclick="ejecutarDescensoMontacarguista('${item.codigo}', ${deficit}, '${remision}')">
                            🏗️ Bajar a Picking
                        </button>
                    `;
                } else {
                    actionHTML = '<span class="text-danger" style="font-size:0.85rem; font-weight:500;">Sin stock en rack alto</span>';
                }
            }

            // Filtrar ubicaciones altas (>= 20)
            const ubiAltas = item.ubicaciones.filter(u => {
                const pos = parseInt(u.ubicacion.substring(5, 7), 10);
                return pos >= 20;
            });

            let ubiAltasHTML = '';
            if (ubiAltas.length === 0) {
                ubiAltasHTML = '<span class="text-muted" style="font-size:0.85rem;">Ninguna posición alta</span>';
            } else {
                ubiAltas.forEach(u => {
                    ubiAltasHTML += `<span class="location-badge-item" style="background-color: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3);">${u.ubicacion} (disp: ${u.stock})</span>`;
                });
            }

            tbody.innerHTML += `
                <tr>
                    <td>
                        <strong>${item.codigo}</strong><br>
                        <span class="text-muted" style="font-size:0.8rem;">${item.descripcion}</span>
                    </td>
                    <td class="text-center font-bold" style="font-size:1.05rem;">${cantSoli}</td>
                    <td class="text-center font-semibold">${stockAux}</td>
                    <td class="text-center">${statusHTML}</td>
                    <td>${ubiAltasHTML}</td>
                    <td class="text-center">${actionHTML}</td>
                </tr>
            `;
        });

        document.getElementById('monta-desglose-modal').style.display = 'flex';
    } catch (err) {
        console.error(err);
        alert('Error al desglosar la factura: ' + err.message);
    }
}

export function cerrarDesgloseFacturaMonta() {
    document.getElementById('monta-desglose-modal').style.display = 'none';
}

export async function ejecutarDescensoMontacarguista(codigo, cantidad, remision) {
    const confirmacion = confirm(`¿Confirmar el descenso físico de ${cantidad} unidades del producto ${codigo} a la zona de picking baja (nivel 01, pos 10)?`);
    if (!confirmacion) return;

    try {
        const res = await fetchAPI('/inventario/descenso', 'POST', { codigo, cantidad });
        alert(`¡Descenso ejecutado correctamente!\nLas unidades han sido transferidas al picking bajo (nivel 01, pos 10) del vano correspondiente.`);
        
        // Recargar el catálogo y el stock en memoria del cliente
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
        
        // Recargar el modal de desglose para reflejar el cambio
        mostrarDesgloseFacturaMonta(remision);
        
        // Recargar el consolidado en background
        loadMontacarguistaConsolidado();
    } catch (err) {
        console.error(err);
        alert(`Error al ejecutar el descenso: ${err.message}`);
    }
}

export function iniciarPickingDesdeMonta(remision) {
    document.getElementById('pick-remision-input').value = remision;
    if (window.showView) {
        window.showView('picking');
    }
    if (window.consultarPickingFactura) {
        window.consultarPickingFactura();
    }
}

export function imprimirConsolidadoMontacarguista() {
    if (window.imprimirDocumento) {
        window.imprimirDocumento('MONTA');
    }
}

// Bind to window for global availability
window.loadMontacarguistaConsolidado = loadMontacarguistaConsolidado;
window.mostrarDesgloseFacturaMonta = mostrarDesgloseFacturaMonta;
window.cerrarDesgloseFacturaMonta = cerrarDesgloseFacturaMonta;
window.ejecutarDescensoMontacarguista = ejecutarDescensoMontacarguista;
window.iniciarPickingDesdeMonta = iniciarPickingDesdeMonta;
window.imprimirConsolidadoMontacarguista = imprimirConsolidadoMontacarguista;
window.switchMontaTab = switchMontaTab;
window.procesarArchivoDespacho = procesarArchivoDespacho;
window.irAPickingDesdeMonta = irAPickingDesdeMonta;


