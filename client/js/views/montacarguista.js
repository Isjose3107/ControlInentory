import { state } from '../state.js';
import { fetchAPI } from '../api.js';

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

