import { state } from '../state.js';
import { fetchAPI } from '../api.js';
import { 
    formatoMoneda, 
    ubicacionSelectorHTML, 
    validarCondicionesUbicacion, 
    getUbicacionCode, 
    validarUbicacion,
    initDateInputs
} from '../utils.js';

let inRowCounter = 0;

export async function cargarOCParaRecibo() {
    const ocIdInput = document.getElementById('in-oc-input');
    const ocId = ocIdInput ? ocIdInput.value.trim() : '';
    if (!ocId) {
        alert('Por favor ingrese el número de Orden de Compra.');
        return;
    }

    try {
        const ocs = await fetchAPI('/compras') || [];
        const oc = ocs.find(o => o.consecutivo === ocId);

        if (!oc) {
            alert(`No se encontró la Orden de Compra #${ocId}`);
            return;
        }

        state.stockPorUbicacion = await fetchAPI('/inventario/stock/ubicaciones') || [];
        state.activeReceiptOC = oc;
        
        const inOcIdEl = document.getElementById('in-oc-id');
        if (inOcIdEl) inOcIdEl.textContent = oc.consecutivo;

        const tbody = document.getElementById('in-items-body');
        if (tbody) {
            tbody.innerHTML = '';

            oc.items.forEach((item, index) => {
                tbody.innerHTML += `
                    <tr id="in-item-row-${index}">
                        <td class="text-center">${item.item}</td>
                        <td><strong>${item.codigo}</strong></td>
                        <td>
                            <span style="font-size:0.9rem;">${item.descripcion}</span>
                            <div class="text-muted" style="font-size:0.75rem; margin-top:2px;">
                                <strong>Unidad de Consumo:</strong> ${item.unidad_consumo || 'Und'}
                            </div>
                        </td>
                        <td class="text-center font-bold" style="font-size:1.1rem;">${item.cantidad} ${item.unidad_compra || 'Und'}</td>
                        <td>
                            <div class="multi-loc-container" id="in-loc-container-${index}"></div>
                            <button class="btn btn-secondary btn-sm mt-1" style="padding: 2px 8px; font-size: 0.8rem;" onclick="agregarFilaUbicacionRecibo(${index})">Agregar Posición</button>
                        </td>
                        <td class="text-center">
                            <span class="badge badge-pending" id="in-status-badge-${index}">Faltante</span>
                            <div id="in-diff-val-${index}" class="text-warning font-bold mt-1" style="font-size:0.85rem;">Faltan ${item.cantidad} ${item.unidad_compra || 'Und'}</div>
                        </td>
                    </tr>
                `;

                // Agregar una primera fila con la cantidad completa sugerida y ubicación por defecto (V010110)
                agregarFilaUbicacionRecibo(index, 'V010110', item.cantidad);
            });
        }

        const reciboPanel = document.getElementById('in-recibo-panel');
        if (reciboPanel) reciboPanel.style.display = 'block';
    } catch (err) {
        console.error(err);
        alert(`Error al cargar la Orden de Compra: ${err.message || err}`);
    }
}

export function agregarFilaUbicacionRecibo(itemIndex, initialVal = 'V010110', initialQty = 0) {
    inRowCounter++;
    const container = document.getElementById(`in-loc-container-${itemIndex}`);
    if (!container) return;
    const rowId = inRowCounter;

    const rowDiv = document.createElement('div');
    rowDiv.className = 'multi-loc-row flex-row gap-1 align-items-center mb-1';
    rowDiv.id = `in-loc-row-${itemIndex}-${rowId}`;

    rowDiv.innerHTML = `
        ${ubicacionSelectorHTML(`in-${itemIndex}-${rowId}`, initialVal)}
        <input type="number" class="form-control form-control-sm in-qty-multi" 
               data-item-index="${itemIndex}" data-row-id="${rowId}" 
               value="${initialQty}" style="width:90px; padding:4px 8px; font-size:0.85rem;" 
               min="0" step="any" oninput="recalcularDistribucion(${itemIndex})">
        <button class="btn btn-danger btn-sm" style="padding: 2px 6px;" onclick="eliminarFilaUbicacionRecibo(${itemIndex}, ${rowId})">✕</button>
    `;
    container.appendChild(rowDiv);

    // Trigger initial calculation
    recalcularDistribucion(itemIndex);

    // Trigger initial validation
    const code = getUbicacionCode(`in-${itemIndex}-${rowId}`);
    validarCondicionesUbicacion(`in-${itemIndex}-${rowId}`, code);
}

export function eliminarFilaUbicacionRecibo(itemIndex, rowId) {
    const row = document.getElementById(`in-loc-row-${itemIndex}-${rowId}`);
    if (row) {
        row.remove();
        recalcularDistribucion(itemIndex);
    }
}

export function recalcularDistribucion(itemIndex) {
    if (!state.activeReceiptOC) return;
    const item = state.activeReceiptOC.items[itemIndex];
    if (!item) return;
    const ordered = Number(item.cantidad);
    const container = document.getElementById(`in-loc-container-${itemIndex}`);
    if (!container) return;
    const qtyInputs = container.querySelectorAll('.in-qty-multi');

    let totalReceived = 0;
    qtyInputs.forEach(input => {
        totalReceived += Number(input.value) || 0;
    });

    const diff = ordered - totalReceived;
    const badge = document.getElementById(`in-status-badge-${itemIndex}`);
    const diffSpan = document.getElementById(`in-diff-val-${itemIndex}`);

    if (badge && diffSpan) {
        if (diff === 0) {
            badge.textContent = 'Completo';
            badge.className = 'badge badge-completed';
            diffSpan.textContent = 'Listo';
            diffSpan.className = 'text-success font-bold mt-1';
        } else if (diff > 0) {
            badge.textContent = 'Faltante';
            badge.className = 'badge badge-pending';
            diffSpan.textContent = `Faltan ${diff} ${item.unidad_compra || 'Und'}`;
            diffSpan.className = 'text-warning font-bold mt-1';
        } else {
            badge.textContent = 'Sobrante';
            badge.className = 'badge badge-danger';
            diffSpan.textContent = `Sobran ${Math.abs(diff)} ${item.unidad_compra || 'Und'}`;
            diffSpan.className = 'text-danger font-bold mt-1';
        }
    }
}

export function limpiarFormRecibo() {
    const panel = document.getElementById('in-recibo-panel');
    if (panel) panel.style.display = 'none';
    const ocInput = document.getElementById('in-oc-input');
    if (ocInput) ocInput.value = '';
    const factInput = document.getElementById('in-factura');
    if (factInput) factInput.value = '';
    
    state.activeReceiptOC = null;
    state.activeDiscrepancyReport = null;
}

export async function guardarReciboIN() {
    if (!state.activeReceiptOC) return;

    const fechaEl = document.getElementById('in-fecha');
    const fecha = fechaEl ? fechaEl.value : '';
    const facturaEl = document.getElementById('in-factura');
    const factura = facturaEl ? facturaEl.value.trim() : '';

    if (!fecha) {
        alert('Por favor seleccione la fecha del recibo.');
        return;
    }

    const movimientos = [];
    let valid = true;
    const itemsReport = [];

    state.activeReceiptOC.items.forEach((item, index) => {
        const container = document.getElementById(`in-loc-container-${index}`);
        if (!container) return;
        const rows = container.querySelectorAll('.multi-loc-row');
        let totalRecibidoItem = 0;

        rows.forEach(rowDiv => {
            const qtyInput = rowDiv.querySelector('.in-qty-multi');
            const rowId = qtyInput.getAttribute('data-row-id');
            const cantidad = Number(qtyInput.value) || 0;
            const ubicacion = getUbicacionCode(`in-${index}-${rowId}`);

            if (cantidad > 0) {
                if (!validarUbicacion(ubicacion)) {
                    alert(`Ubicación inválida (${ubicacion}) para el producto ${item.codigo}.`);
                    valid = false;
                    return;
                }

                totalRecibidoItem += cantidad;
                movimientos.push({
                    codigo_producto: item.codigo,
                    tipo: 'IN',
                    documento_referencia: state.activeReceiptOC.consecutivo + (factura ? ` / FAC: ${factura}` : ''),
                    fecha: fecha,
                    cantidad: cantidad,
                    ubicacion: ubicacion
                });
            }
        });

        const diferencia = totalRecibidoItem - Number(item.cantidad);
        itemsReport.push({
            codigo: item.codigo,
            descripcion: item.descripcion,
            solicitado: Number(item.cantidad),
            recibido: totalRecibidoItem,
            diferencia: diferencia
        });
    });

    if (!valid) return;
    if (movimientos.length === 0) {
        alert('Debe registrar al menos un movimiento de ingreso con cantidad mayor a 0.');
        return;
    }

    try {
        // Enviar cada movimiento secuencialmente
        for (const mov of movimientos) {
            await fetchAPI('/inventario/movimientos', 'POST', mov);
        }

        // Recargar catálogos y stock consolidado por ubicación
        state.stockPorUbicacion = await fetchAPI('/inventario/stock/ubicaciones') || [];
        state.productos = await fetchAPI('/productos') || [];

        // Verificar si hay alguna diferencia
        const tieneDiscrepancias = itemsReport.some(item => item.diferencia !== 0);

        if (tieneDiscrepancias) {
            state.activeDiscrepancyReport = {
                oc: state.activeReceiptOC.consecutivo,
                fecha: fecha,
                factura: factura || 'N/A',
                items: itemsReport
            };

            // Llenar tabla del reporte de novedades
            document.getElementById('rep-oc-id').textContent = state.activeDiscrepancyReport.oc;
            document.getElementById('rep-fecha').textContent = state.activeDiscrepancyReport.fecha;
            document.getElementById('rep-factura').textContent = state.activeDiscrepancyReport.factura;

            const repBody = document.getElementById('receipt-report-body');
            if (repBody) {
                repBody.innerHTML = '';

                state.activeDiscrepancyReport.items.forEach(item => {
                    let diffText = item.diferencia;
                    let statusText = '';
                    let statusClass = '';

                    if (item.diferencia === 0) {
                        diffText = '0';
                        statusText = 'Listo';
                        statusClass = 'badge-completed';
                    } else if (item.diferencia < 0) {
                        diffText = `<span class="text-warning font-bold">${item.diferencia}</span>`;
                        statusText = 'Faltante';
                        statusClass = 'badge-pending';
                    } else {
                        diffText = `<span class="text-danger font-bold">+${item.diferencia}</span>`;
                        statusText = 'Sobrante';
                        statusClass = 'badge-danger';
                    }

                    repBody.innerHTML += `
                        <tr>
                            <td><strong>${item.codigo}</strong></td>
                            <td>${item.descripcion}</td>
                            <td class="text-center">${item.solicitado}</td>
                            <td class="text-center font-bold">${item.recibido}</td>
                            <td class="text-center">${diffText}</td>
                            <td class="text-center"><span class="badge ${statusClass}">${statusText}</span></td>
                        </tr>
                    `;
                });
            }

            // Mostrar modal
            const repPanel = document.getElementById('receipt-report-panel');
            if (repPanel) repPanel.style.display = 'flex';
        } else {
            alert('Ingreso a inventario guardado correctamente sin novedades.');
        }

        limpiarFormRecibo();
        if (window.showView) {
            window.showView('inventario');
        }
    } catch (err) {
        console.error(err);
    }
}

export function cerrarReporteRecibo() {
    const repPanel = document.getElementById('receipt-report-panel');
    if (repPanel) repPanel.style.display = 'none';
    state.activeDiscrepancyReport = null;
}

export function imprimirReporteRecibo() {
    if (window.imprimirDocumento) {
        window.imprimirDocumento('RECIBO_REPORTE');
    }
}

export function imprimirReciboTrabajo() {
    if (window.imprimirDocumento) {
        window.imprimirDocumento('RECIBO');
    }
}

// Bind methods to window to support inline onclicks
window.cargarOCParaRecibo = cargarOCParaRecibo;
window.agregarFilaUbicacionRecibo = agregarFilaUbicacionRecibo;
window.eliminarFilaUbicacionRecibo = eliminarFilaUbicacionRecibo;
window.recalcularDistribucion = recalcularDistribucion;
window.limpiarFormRecibo = limpiarFormRecibo;
window.guardarReciboIN = guardarReciboIN;
window.cerrarReporteRecibo = cerrarReporteRecibo;
window.imprimirReporteRecibo = imprimirReporteRecibo;
window.imprimirReciboTrabajo = imprimirReciboTrabajo;
