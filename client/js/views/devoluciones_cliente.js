// ponytail: stripped location-selection and inventory-movement logic — this screen only marks items as delivered
import { fetchAPI } from '../api.js';

export function initDevolucionesCliente() {
    switchDevcTab('pendientes');
    loadDevolucionesCliente();
}

export function switchDevcTab(tabName) {
    document.getElementById('devc-tab-pendientes').className = `btn ${tabName === 'pendientes' ? 'btn-primary' : 'btn-secondary'}`;
    document.getElementById('devc-tab-historial').className = `btn ${tabName === 'historial' ? 'btn-primary' : 'btn-secondary'}`;
    document.getElementById('devc-pane-pendientes').style.display = tabName === 'pendientes' ? 'block' : 'none';
    document.getElementById('devc-pane-historial').style.display = tabName === 'historial' ? 'block' : 'none';
}

function calcTotal(item) {
    return Number(item.unidades || 0) + (Number(item.cajas || 0) * Number(item.unidades_por_caja || 1));
}

export async function loadDevolucionesCliente() {
    const tbP = document.getElementById('devc-pendientes-body');
    const tbH = document.getElementById('devc-historial-body');
    if (!tbP || !tbH) return;

    tbP.innerHTML = '<tr><td colspan="8" class="text-center">Cargando...</td></tr>';
    tbH.innerHTML = '<tr><td colspan="7" class="text-center">Cargando...</td></tr>';

    try {
        const data = await fetchAPI('/devoluciones') || [];
        let pHTML = '', hHTML = '', pC = 0, hC = 0;

        for (const dev of data) {
            const items = typeof dev.items === 'string' ? JSON.parse(dev.items) : dev.items;
            if (!Array.isArray(items)) continue;
            const cliente = dev.cliente_nombre || dev.cliente_nit || '-';

            items.forEach((item, idx) => {
                if (item.destino !== 'Devolución a Cliente') return;
                const total = calcTotal(item);

                if (item.salida_registrada) {
                    hC++;
                    hHTML += `<tr>
                        <td><strong>${dev.id}</strong></td>
                        <td>${item.fecha_salida || dev.fecha_registro || '-'}</td>
                        <td>${cliente}</td>
                        <td><strong>${item.codigo}</strong></td>
                        <td>${item.descripcion || '-'}</td>
                        <td class="text-center font-bold">${total}</td>
                        <td><span class="badge badge-completed">Entregado</span></td>
                    </tr>`;
                } else {
                    pC++;
                    pHTML += `<tr>
                        <td><strong>${dev.id}</strong></td>
                        <td>${dev.fecha || '-'}</td>
                        <td>${cliente}</td>
                        <td><strong>${item.codigo}</strong></td>
                        <td>${item.descripcion || '-'}</td>
                        <td class="text-center font-bold">${total}</td>
                        <td>${item.causal || '-'}</td>
                        <td class="text-center">
                            <button class="btn btn-success btn-sm btn-confirm-exit" 
                                    data-dev-id="${dev.id}" 
                                    data-codigo="${item.codigo}" 
                                    data-idx="${idx}" 
                                    data-total="${total}">
                                Confirmar Salida
                            </button>
                        </td>
                    </tr>`;
                }
            });
        }

        tbP.innerHTML = pC ? pHTML : '<tr><td colspan="8" class="text-center text-muted">No hay productos pendientes</td></tr>';
        tbH.innerHTML = hC ? hHTML : '<tr><td colspan="7" class="text-center text-muted">Sin registros</td></tr>';
        
        // Setup listener after inserting items
        setupExitButtonListener();
    } catch (err) {
        console.error(err);
        tbP.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error al cargar</td></tr>';
        tbH.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error al cargar</td></tr>';
    }
}

export async function darSalidaDevolucionItem(devId, codigo, itemIndex, totalUnits) {
    if (!confirm(`¿Confirmar entrega de ${totalUnits} uds de ${codigo} al cliente?`)) return;
    try {
        await fetchAPI('/devoluciones/marcar-salida', 'POST', { id: devId, codigo_producto: codigo, item_index: itemIndex });
        alert('Salida registrada.');
        loadDevolucionesCliente();
    } catch (err) {
        console.error(err);
        alert(`Error: ${err.message || err}`);
    }
}

function setupExitButtonListener() {
    const tbP = document.getElementById('devc-pendientes-body');
    if (tbP && !tbP.dataset.listenerAttached) {
        tbP.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-confirm-exit');
            if (btn) {
                const devId = Number(btn.getAttribute('data-dev-id'));
                const codigo = btn.getAttribute('data-codigo');
                const idx = Number(btn.getAttribute('data-idx'));
                const total = Number(btn.getAttribute('data-total'));
                await darSalidaDevolucionItem(devId, codigo, idx, total);
            }
        });
        tbP.dataset.listenerAttached = 'true';
    }
}

function filtrar(inputId, tbodyId) {
    const q = document.getElementById(inputId).value.toLowerCase();
    document.querySelectorAll(`#${tbodyId} tr`).forEach(r => {
        if (r.querySelector('td[colspan]')) return;
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

// ponytail: single filter fn reused
export const filtrarDevcPending = () => filtrar('devc-search-pending', 'devc-pendientes-body');
export const filtrarDevcHistory = () => filtrar('devc-search-history', 'devc-historial-body');

window.initDevolucionesCliente = initDevolucionesCliente;
window.switchDevcTab = switchDevcTab;
window.loadDevolucionesCliente = loadDevolucionesCliente;
window.darSalidaDevolucionItem = darSalidaDevolucionItem;
window.filtrarDevcPending = filtrarDevcPending;
window.filtrarDevcHistory = filtrarDevcHistory;
