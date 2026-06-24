import { state } from './state.js';
import { formatoMoneda, esZonaMontacarguista } from './utils.js';

export function imprimirDocumento(tipoDoc) {
    const printContainer = document.getElementById('printContainer');
    if (!printContainer) return;
    printContainer.innerHTML = ''; // Limpiar previo

    let htmlContent = '';

    if (tipoDoc === 'OC') {
        const consecutivo = document.getElementById('oc-consecutivo').value.trim();
        const fecha = document.getElementById('oc-fecha').value;
        const provNit = document.getElementById('oc-proveedor').value;
        const provObj = state.proveedores.find(p => p.nit === provNit);
        const cond = document.getElementById('oc-condiciones').value;
        const pago = document.getElementById('oc-forma-pago').value;
        const envio = document.getElementById('oc-fecha-envio').value;
        const obs = document.getElementById('oc-observaciones').value;

        const rows = document.querySelectorAll('#oc-items-table-body tr');
        let subtotal = 0;
        let tableRowsHTML = '';

        rows.forEach(row => {
            const num = row.querySelector('.oc-row-item-num').textContent;
            const code = row.querySelector('.oc-item-select').value;
            const desc = row.querySelector('.oc-item-desc').value;
            const qty = Number(row.querySelector('.oc-item-qty').value) || 0;
            const unit = Number(row.querySelector('.oc-item-unit').value) || 0;
            const total = qty * unit;
            subtotal += total;

            if (code) {
                const ucomp = row.querySelector('.oc-item-ucomp').value || 'Und';
                tableRowsHTML += `
                    <tr>
                        <td style="text-align:center;">${num}</td>
                        <td>${code}</td>
                        <td>${desc}</td>
                        <td style="text-align:center;">${qty} ${ucomp}</td>
                        <td style="text-align:right;">${formatoMoneda(unit)}</td>
                        <td style="text-align:right;">${formatoMoneda(total)}</td>
                    </tr>
                `;
            }
        });

        const descVal = Number(document.getElementById('oc-descuento').value) || 0;
        const ivaPct = Number(document.getElementById('oc-iva').value) || 0;
        const retPct = Number(document.getElementById('oc-retencion').value) || 0;
        const baseIVA = Math.max(0, subtotal - descVal);
        const ivaVal = baseIVA * (ivaPct / 100);
        const retVal = baseIVA * (retPct / 100);
        const totalGen = baseIVA + ivaVal - retVal;

        htmlContent = `
            <div class="print-invoice">
                <div class="print-header">
                    <div class="print-logo-section">
                        <h1>HABITAD WMS</h1>
                        <p style="font-size: 8pt; margin: 2px 0;">Nit: 123.456.789-0</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Dirección: Zona Industrial Bodega 10</p>
                    </div>
                    <div class="print-doc-info">
                        <h2>ORDEN DE COMPRA</h2>
                        <p style="font-size: 11pt; font-weight: bold; margin: 5px 0;">Nº Consecutivo: ${consecutivo || 'TEMP-OC'}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Fecha Emisión: ${fecha}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Fecha Envío: ${envio || '-'}</p>
                    </div>
                </div>
                
                <div class="print-details-grid">
                    <div class="print-details-block">
                        <h3>Detalle Proveedor</h3>
                        <p><strong>Razón Social:</strong> ${provObj ? provObj.nombre : 'No especificado'}</p>
                        <p><strong>NIT:</strong> ${provNit}</p>
                        <p><strong>Teléfono:</strong> ${provObj ? (provObj.telefono || '-') : '-'}</p>
                        <p><strong>Dirección:</strong> ${provObj ? (provObj.direccion || '-') : '-'}</p>
                    </div>
                    <div class="print-details-block">
                        <h3>Condiciones Comerciales</h3>
                        <p><strong>Condiciones de Envío:</strong> ${cond || 'N/A'}</p>
                        <p><strong>Forma de Pago:</strong> ${pago || 'N/A'}</p>
                    </div>
                </div>
                
                <table class="print-table">
                    <thead>
                        <tr>
                            <th style="width:5%; text-align:center;">Item</th>
                            <th style="width:20%;">Código</th>
                            <th style="width:40%;">Descripción</th>
                            <th style="width:10%; text-align:center;">Cantidad</th>
                            <th style="width:12%; text-align:right;">V. Unitario</th>
                            <th style="width:13%; text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHTML || '<tr><td colspan="6" style="text-align:center;">No hay ítems registrados</td></tr>'}
                    </tbody>
                </table>
                
                <div class="print-summary-section">
                    <div class="print-observaciones">
                        <strong>Observaciones:</strong><br>
                        <p>${obs || 'Sin observaciones adicionales.'}</p>
                    </div>
                    <div class="print-totales">
                        <table>
                            <tr>
                                <td>Subtotal:</td>
                                <td>${formatoMoneda(subtotal)}</td>
                            </tr>
                            <tr>
                                <td>Descuento:</td>
                                <td>-${formatoMoneda(descVal)}</td>
                            </tr>
                            <tr>
                                <td>IVA (${ivaPct}%):</td>
                                <td>${formatoMoneda(ivaVal)}</td>
                            </tr>
                            <tr>
                                <td>Retención (${retPct}%):</td>
                                <td>-${formatoMoneda(retVal)}</td>
                            </tr>
                            <tr class="grand-total">
                                <td>Total General:</td>
                                <td>${formatoMoneda(totalGen)}</td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <div class="print-signatures">
                    <div class="print-signature-line">Elaborado por</div>
                    <div class="print-signature-line">Aprobado Proveedor</div>
                </div>
            </div>
        `;
    }
    else if (tipoDoc === 'VENTA') {
        const remision = document.getElementById('venta-remision').value.trim();
        const fecha = document.getElementById('venta-fecha').value;
        const cliNit = document.getElementById('venta-cliente').value;
        const cliObj = state.clientes.find(c => c.nit === cliNit);
        const obs = document.getElementById('venta-observaciones').value;

        const rows = document.querySelectorAll('#venta-items-table-body tr');
        let subtotal = 0;
        let tableRowsHTML = '';

        rows.forEach(row => {
            const num = row.querySelector('.venta-row-item-num').textContent;
            const code = row.querySelector('.venta-item-select').value;
            const desc = row.querySelector('.venta-item-desc').value;
            const qty = Number(row.querySelector('.venta-item-qty').value) || 0;
            const unit = Number(row.querySelector('.venta-item-unit').value) || 0;
            const total = qty * unit;
            subtotal += total;

            if (code) {
                tableRowsHTML += `
                    <tr>
                        <td style="text-align:center;">${num}</td>
                        <td>${code}</td>
                        <td>${desc}</td>
                        <td style="text-align:center;">${qty}</td>
                        <td style="text-align:right;">${formatoMoneda(unit)}</td>
                        <td style="text-align:right;">${formatoMoneda(total)}</td>
                    </tr>
                `;
            }
        });

        const ivaPct = Number(document.getElementById('venta-iva').value) || 0;
        const ivaVal = subtotal * (ivaPct / 100);
        const totalGen = subtotal + ivaVal;

        htmlContent = `
            <div class="print-invoice">
                <div class="print-header">
                    <div class="print-logo-section">
                        <h1>HABITAD WMS</h1>
                        <p style="font-size: 8pt; margin: 2px 0;">Nit: 123.456.789-0</p>
                    </div>
                    <div class="print-doc-info">
                        <h2>REMISIÓN DE VENTA</h2>
                        <p style="font-size: 11pt; font-weight: bold; margin: 5px 0;">Nº Remisión: ${remision || 'TEMP-REM'}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Fecha: ${fecha}</p>
                    </div>
                </div>
                
                <div class="print-details-grid">
                    <div class="print-details-block" style="grid-column: span 2;">
                        <h3>Detalle Cliente</h3>
                        <p><strong>Nombre / Razón Social:</strong> ${cliObj ? cliObj.nombre : 'No especificado'}</p>
                        <p><strong>Cédula / NIT:</strong> ${cliNit}</p>
                        <p><strong>Teléfono:</strong> ${cliObj ? (cliObj.telefono || '-') : '-'}</p>
                        <p><strong>Dirección:</strong> ${cliObj ? (cliObj.direccion || '-') : '-'}</p>
                        <p><strong>Correo Electrónico:</strong> ${cliObj ? (cliObj.correo || '-') : '-'}</p>
                    </div>
                </div>
                
                <table class="print-table">
                    <thead>
                        <tr>
                            <th style="width:5%; text-align:center;">Item</th>
                            <th style="width:20%;">Código</th>
                            <th style="width:40%;">Descripción Producto</th>
                            <th style="width:10%; text-align:center;">Cantidad</th>
                            <th style="width:12%; text-align:right;">V. Unitario</th>
                            <th style="width:13%; text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHTML || '<tr><td colspan="6" style="text-align:center;">No hay ítems registrados</td></tr>'}
                    </tbody>
                </table>
                
                <div class="print-summary-section">
                    <div class="print-observaciones">
                        <strong>Condiciones / Observaciones:</strong><br>
                        <p>${obs || 'Esta remisión sirve como constancia de despacho físico de mercancía en bodega.'}</p>
                    </div>
                    <div class="print-totales">
                        <table>
                            <tr>
                                <td>Subtotal:</td>
                                <td>${formatoMoneda(subtotal)}</td>
                            </tr>
                            <tr>
                                <td>IVA (${ivaPct}%):</td>
                                <td>${formatoMoneda(ivaVal)}</td>
                            </tr>
                            <tr class="grand-total">
                                <td>Total General:</td>
                                <td>${formatoMoneda(totalGen)}</td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <div class="print-signatures">
                    <div class="print-signature-line">Despachado por (Bodega)</div>
                    <div class="print-signature-line">Recibido Conforme (Cliente)</div>
                </div>
            </div>
        `;
    }
    else if (tipoDoc === 'PICKING') {
        if (!state.currentPickingData) {
            alert('No hay datos de alistamiento para imprimir.');
            return;
        }

        const auxInputVal = document.getElementById('pick-auxiliar-input') ? document.getElementById('pick-auxiliar-input').value.trim() : '';
        const auxName = auxInputVal || state.currentPickingData.auxiliar || 'No asignado';

        const auxItems = state.currentPickingData._itemsAux ||
            state.currentPickingData.items
                .map((item, idx) => ({ item, originalIdx: idx }))
                .filter(({ item }) => {
                    const bestUbi = item.ubicaciones[0];
                    return !bestUbi || !esZonaMontacarguista(bestUbi.ubicacion);
                });

        let tableRowsHTML = '';
        auxItems.forEach(({ item, originalIdx }, displayIdx) => {
            const selectUbi = document.querySelector(`.pick-select-ubicacion[data-index="${originalIdx}"]`);
            const inputQty = document.querySelector(`.pick-input-cantidad[data-index="${originalIdx}"]`);

            const ubiAsignada = selectUbi ? selectUbi.value
                : (item.ubicaciones[0] ? item.ubicaciones[0].ubicacion : 'SIN STOCK');
            const cantAsignada = inputQty ? inputQty.value
                : Math.min(item.cantidad_solicitada, item.total_disponible);

            tableRowsHTML += `
                <tr>
                    <td style="text-align:center;">${displayIdx + 1}</td>
                    <td><strong>${item.codigo}</strong></td>
                    <td>${item.descripcion}</td>
                    <td style="text-align:center; font-weight:bold;">${item.cantidad_solicitada}</td>
                    <td style="text-align:center; font-weight:bold; font-size:1.1rem; background-color:#f0f4ff;">${ubiAsignada}</td>
                    <td style="text-align:center;">${cantAsignada}</td>
                    <td style="text-align:center; width:40px;">[ ]</td>
                </tr>
            `;
        });

        if (!tableRowsHTML) {
            tableRowsHTML = '<tr><td colspan="7" style="text-align:center; color:#888;">No hay ítems en zona auxiliar para esta remisión.</td></tr>';
        }

        htmlContent = `
            <div class="print-invoice">
                <div class="print-header">
                    <div class="print-logo-section">
                        <h1>HABITAD WMS</h1>
                        <p style="font-size: 8pt; margin: 2px 0;">Nit: 123.456.789-0</p>
                    </div>
                    <div class="print-doc-info">
                        <h2>HOJA DE PICKING — ZONA AUXILIAR</h2>
                        <p style="font-size: 11pt; font-weight: bold; margin: 5px 0;">Remisión Nº: ${state.currentPickingData.remision}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Fecha Impresión: ${new Date().toISOString().split('T')[0]}</p>
                    </div>
                </div>

                <div class="print-details-grid" style="grid-template-columns: 1fr;">
                    <div class="print-details-block">
                        <h3>Detalle de Despacho</h3>
                        <p><strong>Cliente:</strong> ${state.currentPickingData.cliente_nombre || 'No asignado'}</p>
                        <p><strong>Fecha Venta:</strong> ${state.currentPickingData.fecha}</p>
                        <p><strong>Estado:</strong> ${state.currentPickingData.estado}</p>
                        <p><strong>Auxiliar Asignado:</strong> ${auxName}</p>
                        <p style="color:#1e40af; font-weight:600;">&#128338; Solo incluye productos en posición 10–19 (rack bajo, accesible sin montacargas).</p>
                    </div>
                </div>

                <table class="print-table">
                    <thead>
                        <tr>
                            <th style="width:5%; text-align:center;">Item</th>
                            <th style="width:18%;">Código</th>
                            <th style="width:32%;">Descripción</th>
                            <th style="width:10%; text-align:center;">Cant. Solicitada</th>
                            <th style="width:20%; text-align:center;">Ubicación (pos 10–19)</th>
                            <th style="width:10%; text-align:center;">Cant. Alistada</th>
                            <th style="width:5%; text-align:center;">✓</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHTML}
                    </tbody>
                </table>

                <div class="print-summary-section">
                    <div class="print-observaciones" style="width:100%;">
                        <strong>Instrucciones para el Auxiliar:</strong>
                        <p>Diríjase a la ubicación indicada, retire la cantidad solicitada y marque la casilla (✓) al completar cada ítem. Firme al pie una vez complete todo el recorrido.</p>
                    </div>
                </div>

                <div class="print-signatures">
                    <div class="print-signature-line">Auxiliar de Bodega: ${auxName} (Firma)</div>
                    <div class="print-signature-line">Supervisor de Picking (Verifica)</div>
                </div>
            </div>
        `;
    }
    else if (tipoDoc === 'PICKING_MONTA') {
        if (!state.currentPickingData) {
            alert('No hay datos de alistamiento. Cargue una remisión primero.');
            return;
        }

        const montaItems = state.currentPickingData._itemsMonta ||
            state.currentPickingData.items
                .map((item, idx) => ({
                    item,
                    originalIdx: idx,
                    bestUbi: item.ubicaciones[0] ? item.ubicaciones[0].ubicacion : 'SIN UBI',
                    bestStock: item.ubicaciones[0] ? item.ubicaciones[0].stock : 0
                }))
                .filter(({ item }) => {
                    const bestUbi = item.ubicaciones[0];
                    return bestUbi && esZonaMontacarguista(bestUbi.ubicacion);
                });

        if (montaItems.length === 0) {
            alert('No hay productos en rack alto (posición ≥ 20) para esta remisión.');
            return;
        }

        const auxInputVal = document.getElementById('pick-auxiliar-input') ? document.getElementById('pick-auxiliar-input').value.trim() : '';
        const auxName = auxInputVal || state.currentPickingData.auxiliar || 'No asignado';

        let tableRowsHTML = '';
        montaItems.forEach(({ item, bestUbi, bestStock }, displayIdx) => {
            const nivel = bestUbi && bestUbi.length >= 5 ? bestUbi.substring(3, 5) : '-';
            const vano = bestUbi && bestUbi.length >= 3 ? bestUbi.substring(1, 3) : '-';
            const pos = bestUbi && bestUbi.length >= 7 ? bestUbi.substring(5, 7) : '-';

            tableRowsHTML += `
                <tr>
                    <td style="text-align:center;">${displayIdx + 1}</td>
                    <td><strong>${item.codigo}</strong></td>
                    <td>${item.descripcion}</td>
                    <td style="text-align:center; font-weight:bold;">${item.cantidad_solicitada}</td>
                    <td style="text-align:center; font-weight:bold; font-size:1.1rem; background-color:#fff7ed;">${bestUbi}</td>
                    <td style="text-align:center;">V${vano} / Nivel ${nivel} / Pos ${pos}</td>
                    <td style="text-align:center;">${bestStock}</td>
                    <td style="text-align:center; width:40px;">[ ]</td>
                </tr>
            `;
        });

        htmlContent = `
            <div class="print-invoice" style="border: 2px solid #f59e0b;">
                <div class="print-header" style="border-bottom: 2px solid #f59e0b; background: #fffbeb;">
                    <div class="print-logo-section">
                        <h1 style="color:#92400e;">HABITAD WMS</h1>
                        <p style="font-size: 8pt; margin: 2px 0;">Nit: 123.456.789-0</p>
                    </div>
                    <div class="print-doc-info">
                        <h2 style="color:#92400e;">&#127959;&#65039; DESCENSO A PICKING — MONTACARGUISTA</h2>
                        <p style="font-size: 11pt; font-weight: bold; margin: 5px 0;">Remisión Nº: ${state.currentPickingData.remision}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Fecha Impresión: ${new Date().toISOString().split('T')[0]}</p>
                    </div>
                </div>

                <div class="print-details-grid" style="grid-template-columns: 1fr;">
                    <div class="print-details-block" style="border-color:#f59e0b;">
                        <h3 style="color:#92400e; border-bottom-color:#f59e0b;">Instrucción de Trabajo</h3>
                        <p><strong>Cliente:</strong> ${state.currentPickingData.cliente_nombre || 'No asignado'}</p>
                        <p><strong>Auxiliar de Picking:</strong> ${auxName}</p>
                        <p><strong>Fecha:</strong> ${state.currentPickingData.fecha}</p>
                        <p style="color:#92400e; font-weight:600;">&#9888;&#65039; Los productos listados están en rack ALTO (posición ≥ 20). Descender al área de picking <u>antes</u> de entregar la hoja al auxiliar.</p>
                    </div>
                </div>

                <table class="print-table" style="border: 1px solid #f59e0b;">
                    <thead style="background:#fef3c7;">
                        <tr>
                            <th style="width:5%; text-align:center;">Item</th>
                            <th style="width:15%;">Código</th>
                            <th style="width:28%;">Descripción</th>
                            <th style="width:8%; text-align:center;">Cant. a Bajar</th>
                            <th style="width:15%; text-align:center;">Ubicación Alta</th>
                            <th style="width:18%; text-align:center;">Vano / Nivel / Pos</th>
                            <th style="width:7%; text-align:center;">Stock Disp.</th>
                            <th style="width:4%; text-align:center;">✓</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHTML}
                    </tbody>
                </table>

                <div class="print-summary-section">
                    <div class="print-observaciones" style="width:100%; border-color:#f59e0b;">
                        <strong>Instrucciones para el Montacarguista:</strong>
                        <p>1. Diríjase a cada ubicación indicada.<br>
                           2. Baje la cantidad señalada al área de staging / zona de picking.<br>
                           3. Marque (✓) cada ítem una vez depositado en la zona.<br>
                           4. Notifique al supervisor cuando todos los productos estén listos.<br>
                           5. Entregue esta hoja firmada al coordinador de bodega.</p>
                    </div>
                </div>

                <div class="print-signatures">
                    <div class="print-signature-line">Montacarguista (Firma y Cédula)</div>
                    <div class="print-signature-line">Supervisor / Coordinador de Bodega (Recibe)</div>
                </div>
            </div>
        `;
    }
    else if (tipoDoc === 'MONTA') {
        const date = document.getElementById('monta-fecha').value;
        const rows = document.querySelectorAll('#monta-consolidado-body tr');
        let tableRowsHTML = '';

        let idx = 1;
        rows.forEach(row => {
            if (row.querySelector('td[colspan]')) {
                tableRowsHTML = `<tr><td colspan="7" style="text-align:center;">No hay remisiones para esta fecha.</td></tr>`;
                return;
            }
            const rem = row.children[0].textContent;
            const cli = row.children[1].textContent;
            const items = row.children[2].textContent;
            const units = row.children[3].textContent;
            const status = row.children[4].textContent;

            tableRowsHTML += `
                <tr>
                    <td style="text-align:center;">${idx++}</td>
                    <td><strong>${rem}</strong></td>
                    <td>${cli}</td>
                    <td style="text-align:center;">${items}</td>
                    <td style="text-align:center;">${units}</td>
                    <td style="text-align:center;">${status}</td>
                    <td style="width:15%; text-align:center;">[  ]</td>
                </tr>
            `;
        });

        htmlContent = `
            <div class="print-invoice">
                <div class="print-header">
                    <div class="print-logo-section">
                        <h1>HABITAD WMS</h1>
                        <p style="font-size: 8pt; margin: 2px 0;">Nit: 123.456.789-0</p>
                    </div>
                    <div class="print-doc-info">
                        <h2>CONSOLIDADO DIARIO - MONTACARGUISTA</h2>
                        <p style="font-size: 11pt; font-weight: bold; margin: 5px 0;">Fecha: ${date}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Fecha Impresión: ${new Date().toISOString().split('T')[0]}</p>
                    </div>
                </div>
                
                <table class="print-table">
                    <thead>
                        <tr>
                            <th style="width:5%; text-align:center;">Item</th>
                            <th style="width:15%;">No. Remisión / Factura</th>
                            <th style="width:35%;">Cliente</th>
                            <th style="width:10%; text-align:center;">Total Items</th>
                            <th style="width:10%; text-align:center;">Total Unidades</th>
                            <th style="width:15%; text-align:center;">Estado Alistamiento</th>
                            <th style="width:10%; text-align:center;">Cargado (M.C.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHTML || '<tr><td colspan="7" style="text-align:center;">No hay remisiones registradas para esta fecha</td></tr>'}
                    </tbody>
                </table>
                
                <div class="print-summary-section">
                    <div class="print-observaciones" style="width:100%;">
                        <strong>Instrucciones para el Montacarguista:</strong>
                        <p>Verifique el estado de las remisiones del día. Organice la carga y el despacho de acuerdo a la secuencia. Firme al pie una vez complete la entrega en zona de despacho.</p>
                    </div>
                </div>
                
                <div class="print-signatures">
                    <div class="print-signature-line">Montacarguista (Firma)</div>
                    <div class="print-signature-line">Despachador / Coordinador (Firma)</div>
                </div>
            </div>
        `;
    }
    else if (tipoDoc === 'RECIBO_REPORTE') {
        if (!state.activeDiscrepancyReport) {
            alert('No hay reporte de novedades activo para imprimir.');
            return;
        }
        let tableRowsHTML = '';
        state.activeDiscrepancyReport.items.forEach((item, index) => {
            let diffText = item.diferencia;
            let estadoText = 'Listo';
            if (item.diferencia < 0) {
                diffText = `${item.diferencia} (Faltante)`;
                estadoText = 'FALTANTE';
            } else if (item.diferencia > 0) {
                diffText = `+${item.diferencia} (Sobrante)`;
                estadoText = 'SOBRANTE';
            }

            tableRowsHTML += `
                <tr>
                    <td style="text-align:center;">${index + 1}</td>
                    <td><strong>${item.codigo}</strong></td>
                    <td>${item.descripcion}</td>
                    <td style="text-align:center;">${item.solicitado}</td>
                    <td style="text-align:center; font-weight:bold;">${item.recibido}</td>
                    <td style="text-align:center; font-weight:bold; color:${item.diferencia < 0 ? 'orange' : (item.diferencia > 0 ? 'red' : 'black')}">${diffText}</td>
                    <td style="text-align:center; font-weight:bold;">${estadoText}</td>
                </tr>
            `;
        });

        htmlContent = `
            <div class="print-invoice" style="border: 2px dashed red;">
                <div class="print-header" style="border-bottom: 2px solid red;">
                    <div class="print-logo-section">
                        <h1 style="color:red;">HABITAD WMS - NOVEDADES</h1>
                        <p style="font-size: 8pt; margin: 2px 0;">Nit: 123.456.789-0</p>
                    </div>
                    <div class="print-doc-info">
                        <h2>REPORTE DE PRODUCTOS FALTANTES / SOBRANTES</h2>
                        <p style="font-size: 11pt; font-weight: bold; margin: 5px 0;">OC Ref: ${state.activeDiscrepancyReport.oc}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Fecha Recibo: ${state.activeDiscrepancyReport.fecha}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Factura Proveedor: ${state.activeDiscrepancyReport.factura}</p>
                    </div>
                </div>
                
                <div class="print-details-grid" style="grid-template-columns: 1fr;">
                    <div class="print-details-block" style="border-color:red;">
                        <h3 style="color:red; border-bottom-color:red;">Aviso de Novedad de Inventario</h3>
                        <p>Este documento es constancia física de las discrepancias encontradas en la recepción de mercancía contra la Orden de Compra.</p>
                    </div>
                </div>
                
                <table class="print-table">
                    <thead>
                        <tr>
                            <th style="width:5%; text-align:center; background-color:#ffebee!important; color:black!important;">Item</th>
                            <th style="width:20%; background-color:#ffebee!important; color:black!important;">Código</th>
                            <th style="width:35%; background-color:#ffebee!important; color:black!important;">Descripción</th>
                            <th style="width:10%; text-align:center; background-color:#ffebee!important; color:black!important;">Cant. Solicitada</th>
                            <th style="width:10%; text-align:center; background-color:#ffebee!important; color:black!important;">Cant. Recibida</th>
                            <th style="width:10%; text-align:center; background-color:#ffebee!important; color:black!important;">Diferencia</th>
                            <th style="width:10%; text-align:center; background-color:#ffebee!important; color:black!important;">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHTML}
                    </tbody>
                </table>
                
                <div class="print-summary-section">
                    <div class="print-observaciones" style="width:100%; border-color:red;">
                        <strong>Novedades encontradas / Observaciones del Operario:</strong>
                        <p style="height: 50px; border-bottom: 1px solid #ccc;"></p>
                    </div>
                </div>
                
                <div class="print-signatures" style="margin-top:40px;">
                    <div class="print-signature-line">Firma Operario de Recibo</div>
                    <div class="print-signature-line">Firma Conforme Transportista / Proveedor</div>
                </div>
            </div>
        `;
    }
    else if (tipoDoc === 'RECIBO') {
        if (!state.activeReceiptOC) {
            alert('No hay una orden de compra activa para imprimir recibo.');
            return;
        }

        const ocId = state.activeReceiptOC.consecutivo;
        const fecha = document.getElementById('in-fecha') ? document.getElementById('in-fecha').value : new Date().toISOString().split('T')[0];
        const factura = document.getElementById('in-factura') ? document.getElementById('in-factura').value.trim() : 'N/A';
        const provNit = state.activeReceiptOC.proveedor_nit;
        const provName = state.activeReceiptOC.proveedor_nombre || provNit || 'No especificado';

        let tableRowsHTML = '';
        state.activeReceiptOC.items.forEach((item, index) => {
            const container = document.getElementById(`in-loc-container-${index}`);
            if (!container) return;

            const rows = container.querySelectorAll('.multi-loc-row');
            let itemUbiQtyRows = '';

            rows.forEach((rowDiv) => {
                const qtyInput = rowDiv.querySelector('.in-qty-multi');
                const rowId = qtyInput.getAttribute('data-row-id');
                const cantidad = Number(qtyInput.value) || 0;
                
                const ubiEl = document.getElementById(`ubi-code-in-${index}-${rowId}`);
                const ubicacion = ubiEl ? ubiEl.textContent.trim() : '';

                if (cantidad > 0) {
                    itemUbiQtyRows += `
                        <div class="print-ubi-row" style="margin-bottom: 4px; display: flex; justify-content: space-between; border-bottom: 1px dotted #ccc; padding-bottom: 2px;">
                            <span>📍 Ubicación: <strong>${ubicacion}</strong></span>
                            <span>Cantidad: <strong>${cantidad} ${item.unidad_consumo || 'Und'}</strong></span>
                        </div>
                    `;
                }
            });

            if (!itemUbiQtyRows) {
                itemUbiQtyRows = `<span style="color:#d97706; font-style:italic;">Sin distribución / No recibido</span>`;
            }

            tableRowsHTML += `
                <tr>
                    <td style="text-align:center;">${index + 1}</td>
                    <td><strong>${item.codigo}</strong></td>
                    <td>
                        <strong>${item.descripcion}</strong><br>
                        <span style="font-size:8pt; color:#444;">Um. Compra: ${item.unidad_compra || 'Und'} | Um. Consumo: ${item.unidad_consumo || 'Und'}</span>
                    </td>
                    <td style="text-align:center; font-weight:bold;">${item.cantidad}</td>
                    <td>
                        <div style="padding: 4px 0;">
                            ${itemUbiQtyRows}
                        </div>
                    </td>
                    <td style="text-align:center; width:45px; font-size:12pt;">[  ]</td>
                </tr>
            `;
        });

        htmlContent = `
            <div class="print-invoice">
                <div class="print-header">
                    <div class="print-logo-section">
                        <h1>HABITAD WMS</h1>
                        <p style="font-size: 8pt; margin: 2px 0;">Nit: 123.456.789-0</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Dirección: Zona Industrial Bodega 10</p>
                    </div>
                    <div class="print-doc-info">
                        <h2>HOJA DE RUTA DE RECIBO (IN)</h2>
                        <p style="font-size: 11pt; font-weight: bold; margin: 5px 0;">OC Asociada: ${ocId}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Fecha Recibo: ${fecha}</p>
                        <p style="font-size: 8pt; margin: 2px 0;">Ref. Factura: ${factura}</p>
                    </div>
                </div>
                
                <div class="print-details-grid">
                    <div class="print-details-block" style="grid-column: span 2;">
                        <h3>Detalles de Recepción</h3>
                        <p><strong>Proveedor:</strong> ${provName} (NIT: ${provNit})</p>
                        <p><strong>Operario / Auxiliar de Bodega:</strong> _____________________________________</p>
                        <p style="color:#2563eb; font-weight:600; font-size:8.5pt; margin-top:5px;">
                            👉 Instrucción: Ubique los productos físicamente en las posiciones indicadas a continuación y marque la casilla [✓] al terminar.
                        </p>
                    </div>
                </div>
                
                <table class="print-table">
                    <thead>
                        <tr>
                            <th style="width:5%; text-align:center;">Item</th>
                            <th style="width:15%;">Código</th>
                            <th style="width:35%;">Descripción del Producto</th>
                            <th style="width:10%; text-align:center;">Cant. OC</th>
                            <th style="width:30%;">Ubicaciones de Almacenamiento (IN)</th>
                            <th style="width:5%; text-align:center;">Acom.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHTML}
                    </tbody>
                </table>
                
                <div class="print-summary-section">
                    <div class="print-observaciones" style="width:100%;">
                        <strong>Notas Adicionales del Auxiliar:</strong>
                        <p style="margin-top: 10px; border-bottom: 1px solid #aaa; height: 35px;"></p>
                    </div>
                </div>
                
                <div class="print-signatures">
                    <div class="print-signature-line">Firma Auxiliar de Recibo</div>
                    <div class="print-signature-line">Firma Supervisor Bodega</div>
                </div>
            </div>
        `;
    }
    else if (tipoDoc === 'DEVOLUCION') {
        const dev = state.currentDevolucionPrintData;
        if (!dev) {
            alert('No hay datos de devolución para imprimir.');
            return;
        }

        const clientName = dev.cliente_nombre || dev.cliente_nit || 'No especificado';
        
        let tableRowsHTML = '';
        dev.items.forEach((item, idx) => {
            const unitsPerBox = Number(item.unidades_por_caja || 1);
            const totalUnits = Number(item.unidades || 0) + (Number(item.cajas || 0) * unitsPerBox);
            tableRowsHTML += `
                <tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td><strong>${item.codigo}</strong></td>
                    <td>${item.descripcion || '-'}</td>
                    <td style="text-align:center;">${item.cajas || 0}</td>
                    <td style="text-align:center;">${item.unidades || 0}</td>
                    <td style="text-align:center; font-weight:bold;">${totalUnits}</td>
                    <td>${item.causal || '-'}</td>
                    <td>
                        <strong>${item.destino}</strong>
                        ${item.ubicacion ? `<br><span style="font-size:8.5pt; color:#444;">📍 ${item.ubicacion}</span>` : ''}
                    </td>
                </tr>
            `;
        });

        const buildCopyHTML = (copyTitle) => `
            <div class="print-devolucion-container">
                <!-- Encabezado estilo RANSA -->
                <div class="print-ransa-header">
                    <div class="print-ransa-logo-section">
                        <span class="print-ransa-logo-text">R RANSA</span>
                    </div>
                    <div class="print-ransa-title-section">
                        <h2>DEVOLUCIÓN DE MERCANCIA</h2>
                        <span style="font-size: 8pt; color: #555;">Código: FR-ALM-023</span>
                        <div style="font-size: 8pt; font-weight: bold; margin-top: 2px; text-transform: uppercase; color: #111;">${copyTitle}</div>
                    </div>
                    <div class="print-ransa-meta-section">
                        <span>VERSIÓN # 4</span>
                        <span>PÁGINA 1 DE 1</span>
                    </div>
                    <div class="print-ransa-consecutivo-section">
                        <div class="print-ransa-consecutivo-box">
                            <span class="print-ransa-consecutivo-label">Nº CONSECUTIVO</span>
                            <span class="print-ransa-consecutivo-value">${dev.id}</span>
                        </div>
                    </div>
                </div>

                <!-- Detalles de la Devolución -->
                <div class="print-details-grid">
                    <div class="print-details-block" style="grid-column: span 2;">
                        <table class="print-info-table">
                            <tr>
                                <td style="width:15%;"><strong>CLIENTE:</strong></td>
                                <td style="width:45%; border-bottom:1px solid #000;">${clientName}</td>
                                <td style="width:15%;"><strong>No. FACTURA:</strong></td>
                                <td style="width:25%; border-bottom:1px solid #000;">${dev.factura || '-'}</td>
                            </tr>
                            <tr>
                                <td><strong>CIUDAD:</strong></td>
                                <td style="border-bottom:1px solid #000;">${dev.ciudad || '-'}</td>
                                <td><strong>ALMACÉN:</strong></td>
                                <td style="border-bottom:1px solid #000;">${dev.almacen || '-'}</td>
                            </tr>
                            <tr>
                                <td><strong>FECHA RECIBO:</strong></td>
                                <td style="border-bottom:1px solid #000;">${dev.fecha || '-'}</td>
                                <td><strong>RUTA:</strong></td>
                                <td style="border-bottom:1px solid #000;">${dev.ruta || '-'}</td>
                            </tr>
                            <tr>
                                <td><strong>PLACA:</strong></td>
                                <td style="border-bottom:1px solid #000;" colspan="3">${dev.placa || '-'}</td>
                            </tr>
                        </table>
                    </div>
                </div>

                <!-- Tabla de Productos -->
                <table class="print-table print-dev-table" style="margin-top:15px;">
                    <thead>
                        <tr>
                            <th style="width:5%; text-align:center;">Item</th>
                            <th style="width:15%;">Código</th>
                            <th style="width:30%;">Descripción Producto</th>
                            <th style="width:10%; text-align:center;">Cajas</th>
                            <th style="width:10%; text-align:center;">Unidades</th>
                            <th style="width:10%; text-align:center;">Cant. Total (Uds)</th>
                            <th style="width:10%;">Causal</th>
                            <th style="width:10%;">Destino</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHTML}
                    </tbody>
                </table>

                <!-- Observaciones y Estado -->
                <div class="print-dev-bottom-grid">
                    <div class="print-observaciones-block">
                        <strong>OBSERVACIONES:</strong>
                        <p style="margin-top: 5px; font-size: 9pt; min-height: 50px; background: #f8fafc; padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                            ${dev.observaciones || 'Sin observaciones.'}
                        </p>
                    </div>
                    <div class="print-estado-block">
                        <strong>ESTADO DEL PRODUCTO:</strong>
                        <div style="margin-top:5px; font-size:9pt; line-height: 1.4;">
                            <div style="font-weight: ${dev.estado_producto === 'Bueno' ? 'bold' : 'normal'}">${dev.estado_producto === 'Bueno' ? '☑' : '☐'} 1-Bueno: En buen estado</div>
                            <div style="font-weight: ${dev.estado_producto === 'Averiado' ? 'bold' : 'normal'}">${dev.estado_producto === 'Averiado' ? '☑' : '☐'} 2-Averiado: Avería almacén/transporte</div>
                            <div style="font-weight: ${dev.estado_producto === 'No Conforme' ? 'bold' : 'normal'}">${dev.estado_producto === 'No Conforme' ? '☑' : '☐'} 3-No Conforme: Deterioro en punto venta</div>
                        </div>
                    </div>
                </div>

                <!-- Firmas Electrónicas -->
                <div class="print-signatures-dev">
                    <div class="print-sig-col">
                        <div class="print-sig-box">
                            ${dev.firma_responsable ? `<img src="${dev.firma_responsable}" class="print-sig-img">` : ''}
                        </div>
                        <div class="print-sig-line">RESPONSABLE DEL RECIBO</div>
                    </div>
                    <div class="print-sig-col">
                        <div class="print-sig-box">
                            ${dev.firma_transportador ? `<img src="${dev.firma_transportador}" class="print-sig-img">` : ''}
                        </div>
                        <div style="font-size:8pt; text-align:center; font-weight:bold; margin-bottom: 2px;">Nombre: ${dev.nombre_transportador || '-'}</div>
                        <div class="print-sig-line">NOMBRE DEL TRANSPORTADOR</div>
                    </div>
                    <div class="print-sig-col">
                        <div class="print-sig-box">
                            ${dev.firma_cliente ? `<img src="${dev.firma_cliente}" class="print-sig-img">` : ''}
                        </div>
                        <div class="print-sig-line">RECIBIDO DEL CLIENTE</div>
                    </div>
                </div>
            </div>
        `;

        htmlContent = `
            <div class="print-devolucion-wrapper-double">
                ${buildCopyHTML('ORIGINAL - CONTROL RANSA')}
                <div class="print-copy-divider">
                    <span>✂ ---------------------------------------------------- CORTE AQUÍ ---------------------------------------------------- ✂</span>
                </div>
                ${buildCopyHTML('COPIA - REGISTRO CLIENTE')}
            </div>
        `;
    }

    printContainer.innerHTML = htmlContent;

    // Disparar la impresión nativa del navegador
    setTimeout(() => {
        window.print();
    }, 150);
}

// Genera la hoja de conteo imprimible para el proceso de Regularización
// (Requisitos 4.1, 4.2, 4.3, 4.4, 4.5, 4.6).
// - zona: 'picking' | 'montacarguista'
// - ronda: número entero >= 1 (ronda actual de conteo)
// - items: array de { codigo, descripcion, ubicacion, cantidad_sistema }
// Reutiliza el contenedor #printContainer y el patrón window.print() existente.
export function imprimirHojaRegularizacion(zona, ronda, items) {
    const lista = Array.isArray(items) ? items.slice() : [];

    // Requisito 4.5: si no hay ítems, alertar y no abrir/generar el documento.
    if (lista.length === 0) {
        alert('No hay ítems disponibles para generar la hoja de conteo.');
        return;
    }

    const printContainer = document.getElementById('printContainer');
    if (!printContainer) return;
    printContainer.innerHTML = '';

    // Asegurar el orden por ubicación ASC (Requisito 4.1).
    lista.sort((a, b) => {
        const ua = String(a.ubicacion || '');
        const ub = String(b.ubicacion || '');
        if (ua < ub) return -1;
        if (ua > ub) return 1;
        return 0;
    });

    // Etiqueta legible de zona (Requisito 4.3).
    const zonaLabel = zona === 'montacarguista' ? 'Montacarguista' : 'Picking';

    // Fecha en formato DD/MM/AAAA (Requisito 4.3).
    const hoy = new Date();
    const dd = String(hoy.getDate()).padStart(2, '0');
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const yyyy = hoy.getFullYear();
    const fechaStr = `${dd}/${mm}/${yyyy}`;

    const rondaNum = Number.isInteger(ronda) && ronda >= 1 ? ronda : 1;

    // Filas de la tabla con número de ítem secuencial y casilla en blanco
    // (Requisitos 4.1, 4.2). El ancho mínimo de la casilla de conteo es 25mm
    // (>= 20mm) para permitir la escritura manual.
    let tableRowsHTML = '';
    lista.forEach((it, idx) => {
        tableRowsHTML += `
            <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td><strong>${it.codigo}</strong></td>
                <td>${it.descripcion || ''}</td>
                <td style="text-align:center; font-weight:bold;">${it.ubicacion}</td>
                <td style="text-align:center; font-weight:bold;">${it.cantidad_sistema}</td>
                <td style="min-width:25mm; width:25mm; height:9mm;">&nbsp;</td>
            </tr>
        `;
    });

    const htmlContent = `
        <div class="print-invoice">
            <div class="print-header">
                <div class="print-logo-section">
                    <h1>HABITAD WMS</h1>
                    <p style="font-size: 8pt; margin: 2px 0;">Nit: 123.456.789-0</p>
                    <p style="font-size: 8pt; margin: 2px 0;">Dirección: Zona Industrial Bodega 10</p>
                </div>
                <div class="print-doc-info">
                    <h2>HOJA DE CONTEO - REGULARIZACIÓN</h2>
                    <p style="font-size: 11pt; font-weight: bold; margin: 5px 0;">Zona: ${zonaLabel}</p>
                    <p style="font-size: 11pt; font-weight: bold; margin: 5px 0;">Ronda Nº: ${rondaNum}</p>
                    <p style="font-size: 8pt; margin: 2px 0;">Fecha de Generación: ${fechaStr}</p>
                </div>
            </div>

            <div class="print-details-grid" style="grid-template-columns: 1fr;">
                <div class="print-details-block">
                    <h3>Instrucciones de Conteo</h3>
                    <p>Recorra las ubicaciones en el orden indicado (ascendente) y registre la cantidad física contada en la casilla &quot;Conteo Físico&quot; de cada ítem.</p>
                    <p style="color:#1e40af; font-weight:600; font-size:8.5pt;">Total de ítems a contar: ${lista.length}</p>
                </div>
            </div>

            <table class="print-table">
                <thead>
                    <tr>
                        <th style="width:6%; text-align:center;">Nº</th>
                        <th style="width:18%;">Código</th>
                        <th style="width:36%;">Descripción</th>
                        <th style="width:14%; text-align:center;">Ubicación</th>
                        <th style="width:11%; text-align:center;">Cant. Sistema</th>
                        <th style="width:15%; text-align:center;">Conteo Físico</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHTML}
                </tbody>
            </table>

            <div class="print-summary-section">
                <div class="print-observaciones" style="width:100%;">
                    <strong>Observaciones del Operador:</strong>
                    <p style="margin-top: 10px; border-bottom: 1px solid #aaa; height: 35px;"></p>
                </div>
            </div>

            <div class="print-signatures" style="margin-top: 30px;">
                <div class="print-signature-line">Operador de Conteo (Firma)</div>
                <div class="print-signature-line">Fecha de Ejecución del Conteo: ____ / ____ / ________</div>
            </div>
        </div>
    `;

    printContainer.innerHTML = htmlContent;

    // Disparar la impresión nativa del navegador (mismo patrón que imprimirDocumento)
    setTimeout(() => {
        window.print();
    }, 150);
}

// Bind to window for global availability (HTML inline onclick / app.js orchestrator pattern)
window.imprimirHojaRegularizacion = imprimirHojaRegularizacion;
