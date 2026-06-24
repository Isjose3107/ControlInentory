import { state, UBICACION } from './state.js';

/**
 * Formatea un número como moneda colombiana (COP)
 * @param {number} valor - Valor numérico a formatear
 * @returns {string} Valor formateado como moneda
 */
export function formatoMoneda(valor) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);
}

/**
 * Formatea un número con separadores de miles
 * @param {number} valor - Valor numérico a formatear
 * @returns {string} Valor formateado con separadores
 */
export function formatoNumero(valor) {
    return new Intl.NumberFormat('es-CO').format(valor || 0);
}

/**
 * Calcula el total de una línea de detalle (cantidad × precio unitario)
 * @param {number} cantidad - Cantidad de unidades
 * @param {number} precioUnitario - Precio por unidad
 * @returns {number} Total calculado
 */
export function calcularTotalLinea(cantidad, precioUnitario) {
    return (cantidad || 0) * (precioUnitario || 0);
}

/**
 * Calcula el subtotal de un array de items
 * @param {Array} items - Array de objetos con propiedades cantidad y precio
 * @returns {number} Subtotal calculado
 */
export function calcularSubtotal(items) {
    return items.reduce((sum, item) => {
        return sum + calcularTotalLinea(item.cantidad, item.precio || item.valor_venta);
    }, 0);
}

/**
 * Calcula el IVA sobre un monto base
 * @param {number} base - Monto base
 * @param {number} porcentaje - Porcentaje de IVA (ej: 19)
 * @returns {number} Valor del IVA
 */
export function calcularIVA(base, porcentaje) {
    return (base || 0) * ((porcentaje || 0) / 100);
}

export function parseNumberString(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;

    let str = String(value).trim();
    if (!str) return 0;

    str = str.replace(/[$\s]/g, '');

    const hasComma = str.includes(',');
    const hasDot = str.includes('.');

    if (hasComma && hasDot) {
        if (str.indexOf(',') > str.indexOf('.')) {
            str = str.replace(/\./g, '').replace(/,/g, '.');
        } else {
            str = str.replace(/,/g, '');
        }
    } else if (hasComma) {
        const parts = str.split(',');
        if (parts[1].length === 3 && parts[0].length <= 3) {
            str = str.replace(/,/g, '');
        } else {
            str = str.replace(/,/g, '.');
        }
    } else if (hasDot) {
        const parts = str.split('.');
        if (parts.length === 2 && parts[1].length === 3) {
            str = str.replace(/\./g, '');
        }
    }

    const num = Number(str);
    return isNaN(num) ? 0 : num;
}

export function formatExcelDate(value) {
    if (!value) return '';

    const num = Number(value);
    if (!isNaN(num) && num > 30000 && num < 60000) {
        const date = new Date((num - 25569) * 86400 * 1000);
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
        const d = dmy[1].padStart(2, '0');
        const m = dmy[2].padStart(2, '0');
        const y = dmy[3];
        return `${y}-${m}-${d}`;
    }

    const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (ymd) {
        const y = ymd[1];
        const m = ymd[2].padStart(2, '0');
        const d = ymd[3].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch (e) { }

    return '';
}

/**
 * Normaliza un texto de encabezado: limpia saltos de línea, tabs, espacios múltiples
 * y convierte a minúsculas para comparación flexible.
 */
function normalizeHeader(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/[\r\n\t]+/g, ' ')  // Saltos de línea y tabs → espacio
        .replace(/\s+/g, ' ')         // Múltiples espacios → uno solo
        .trim()
        .toLowerCase();
}

/**
 * Compara un texto de celda contra la lista de aliases de forma flexible.
 * Primero intenta coincidencia exacta normalizada, luego intenta sin puntos/espacios.
 */
function matchesAlias(cellStr, aliases) {
    // 1. Coincidencia exacta normalizada
    if (aliases.includes(cellStr)) return true;
    
    // 2. Coincidencia sin puntos, espacios extras, guiones, barras diagonales
    const stripped = cellStr.replace(/[.\-_\s\/]/g, '');
    for (const alias of aliases) {
        const aliasStripped = alias.replace(/[.\-_\s\/]/g, '');
        if (stripped === aliasStripped) return true;
    }
    
    return false;
}

export function findHeaderRow(rows, aliasMap) {
    let bestRowIndex = -1;
    let maxMatches = -1;

    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row)) continue;

        let matches = 0;
        row.forEach(cell => {
            const cellStr = normalizeHeader(cell);
            if (!cellStr) return;

            for (const key in aliasMap) {
                if (matchesAlias(cellStr, aliasMap[key])) {
                    matches++;
                    break;
                }
            }
        });

        if (matches > maxMatches && matches >= 2) {
            maxMatches = matches;
            bestRowIndex = i;
        }
    }
    return { headerIndex: bestRowIndex, matchesCount: maxMatches };
}

export function mapColumns(headerRow, aliasMap) {
    const colMapping = {};
    for (const key in aliasMap) {
        colMapping[key] = -1;
    }

    headerRow.forEach((cell, index) => {
        const cellStr = normalizeHeader(cell);
        if (!cellStr) return;

        for (const key in aliasMap) {
            if (matchesAlias(cellStr, aliasMap[key]) && colMapping[key] === -1) {
                colMapping[key] = index;
                break;
            }
        }
    });
    return colMapping;
}

export function readExcelOrCSV(file, aliasMap, callback) {
    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = function (e) {
        try {
            let rows = [];
            if (isExcel) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                let bestSheetName = '';
                let bestRows = [];
                let bestHeaderIndex = -1;
                let bestMatchesCount = -1;
                
                for (const sheetName of workbook.SheetNames) {
                    const worksheet = workbook.Sheets[sheetName];
                    const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    const { headerIndex, matchesCount } = findHeaderRow(sheetRows, aliasMap);
                    if (headerIndex !== -1 && matchesCount > bestMatchesCount) {
                        bestMatchesCount = matchesCount;
                        bestHeaderIndex = headerIndex;
                        bestRows = sheetRows;
                        bestSheetName = sheetName;
                    }
                }
                
                if (bestHeaderIndex === -1) {
                    // Fallback to the first sheet if none matched
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                } else {
                    rows = bestRows;
                }
            } else {
                const text = e.target.result;
                rows = text.split('\n').map(line => {
                    const result = [];
                    let current = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') {
                            inQuotes = !inQuotes;
                        } else if (char === ',' && !inQuotes) {
                            result.push(current.trim());
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    result.push(current.trim());
                    return result;
                });
            }

            const { headerIndex, matchesCount } = findHeaderRow(rows, aliasMap);
            if (headerIndex === -1) {
                throw new Error("No se pudieron mapear las columnas requeridas. Verifique que los encabezados del archivo coincidan con los nombres esperados.");
            }

            const colMapping = mapColumns(rows[headerIndex], aliasMap);
            colMapping._headerIndex = headerIndex;

            callback(null, rows, colMapping);
        } catch (err) {
            callback(err);
        }
    };

    if (isExcel) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file, 'UTF-8');
    }
}

export function getLocPos(ubicacion) {
    if (!ubicacion || ubicacion.length < 7) return 0;
    return parseInt(ubicacion.substring(5, 7), 10);
}

export function esZonaMontacarguista(ubicacion) {
    return getLocPos(ubicacion) >= 20;
}

export function esZonaAuxiliar(ubicacion) {
    const p = getLocPos(ubicacion);
    return p >= 10 && p < 20;
}

// ponytail: generic select populator helper
function populateSelect(selectId, data, valueKey, textFn, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>` +
        data.map(item => `<option value="${item[valueKey]}">${textFn(item)}</option>`).join('');
}

export const populateProductosSelect = (id) =>
    populateSelect(id, state.productos, 'codigo', p => `${p.codigo} - ${p.descripcion}`, 'Seleccione producto...');

export const populateClientesSelect = (id) =>
    populateSelect(id, state.clientes, 'nit', c => c.nombre, 'Seleccione cliente...');

export const populateProveedoresSelect = (id) =>
    populateSelect(id, state.proveedores, 'nit', p => p.nombre, 'Seleccione proveedor...');

export function ubiSelectorHTML(prefix, currentVal = '') {
    let selVano = '01', selNivel = '01', selPos = '10';
    if (currentVal && currentVal.length === 7 && currentVal.startsWith('V')) {
        selVano = currentVal.substring(1, 3);
        selNivel = currentVal.substring(3, 5);
        selPos = currentVal.substring(5, 7);
    }

    const vanoOpts = UBICACION.vanos.map(v => `<option value="${v}" ${v === selVano ? 'selected' : ''}>V${v}</option>`).join('');
    const nivelOpts = UBICACION.niveles.map(n => `<option value="${n}" ${n === selNivel ? 'selected' : ''}>${n}</option>`).join('');
    const posOpts = UBICACION.posiciones.map(p => `<option value="${p}" ${p === selPos ? 'selected' : ''}>${p}</option>`).join('');

    return `
        <div class="ubicacion-selector-wrapper" style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
            <div class="ubicacion-selector" id="ubi-wrap-${prefix}">
                <select class="ubi-vano" data-ubi-prefix="${prefix}" onchange="actualizarCodigoUbicacion('${prefix}')">${vanoOpts}</select>
                <select class="ubi-nivel" data-ubi-prefix="${prefix}" onchange="actualizarCodigoUbicacion('${prefix}')">${nivelOpts}</select>
                <select class="ubi-pos"  data-ubi-prefix="${prefix}" onchange="actualizarCodigoUbicacion('${prefix}')">${posOpts}</select>
                <span class="ubi-code-preview" id="ubi-code-${prefix}">V${selVano}${selNivel}${selPos}</span>
            </div>
            <div class="ubi-warning-msg" id="ubi-warn-${prefix}" style="color:#f59e0b; font-size:0.75rem; margin-top:2px; font-weight:500; display:none;"></div>
        </div>
    `;
}

export function ubicacionSelectorHTML(prefix, currentVal = '') {
    return ubiSelectorHTML(prefix, currentVal);
}

export function actualizarCodigoUbicacion(prefix) {
    const wrap = document.getElementById(`ubi-wrap-${prefix}`);
    if (!wrap) return;
    const vano = wrap.querySelector('.ubi-vano').value;
    const nivel = wrap.querySelector('.ubi-nivel').value;
    const pos = wrap.querySelector('.ubi-pos').value;
    const code = `V${vano}${nivel}${pos}`;
    const codePreview = document.getElementById(`ubi-code-${prefix}`);
    if (codePreview) codePreview.textContent = code;
    validarCondicionesUbicacion(prefix, code);
}

export function calcularVolumenOcupadoCliente(ubicacion) {
    let totalVol = 0;
    if (!state.stockPorUbicacion) return 0;
    state.stockPorUbicacion.forEach(item => {
        if (item.ubicacion === ubicacion && item.stock > 0) {
            const prod = state.productos.find(p => p.codigo === item.codigo_producto);
            if (prod) {
                const alto = prod.alto || 0;
                const largo = prod.largo || 0;
                const ancho = prod.ancho || 0;
                totalVol += item.stock * alto * largo * ancho;
            }
        }
    });
    return totalVol;
}

export function validarCondicionesUbicacion(prefix, code) {
    const warnEl = document.getElementById(`ubi-warn-${prefix}`);
    if (!warnEl) return;

    warnEl.textContent = '';
    warnEl.style.display = 'none';

    let productCode = '';
    let newQty = 0;

    if (prefix.startsWith('in-')) {
        const match = prefix.match(/^in-(\d+)-(\d+)/);
        if (match && state.activeReceiptOC) {
            const itemIdx = Number(match[1]);
            const rowId = Number(match[2]);
            const item = state.activeReceiptOC.items[itemIdx];
            if (item) {
                productCode = item.codigo;
                const qtyInput = document.querySelector(`input.in-qty-multi[data-item-index="${itemIdx}"][data-row-id="${rowId}"]`);
                if (qtyInput) newQty = Number(qtyInput.value) || 0;
            }
        }
    } else if (prefix === 'out') {
        const prodEl = document.getElementById('out-producto');
        if (prodEl) productCode = prodEl.value;
        const qtyInput = document.getElementById('out-cantidad');
        if (qtyInput) newQty = Number(qtyInput.value) || 0;
    } else if (prefix.startsWith('dev-')) {
        const rowId = prefix.split('-')[1];
        const row = document.getElementById(`dev-row-${rowId}`);
        if (row) {
            const prodEl = row.querySelector('.dev-item-select');
            if (prodEl) productCode = prodEl.value;
            const cajasEl = row.querySelector('.dev-item-cajas');
            const unidadesEl = row.querySelector('.dev-item-unidades');
            const convEl = row.querySelector('.dev-item-conversion');
            const cajas = Number(cajasEl ? cajasEl.value : 0);
            const unidades = Number(unidadesEl ? unidadesEl.value : 0);
            const conv = Number(convEl ? convEl.value : 1);
            newQty = unidades + (cajas * conv);
        }
    }

    if (!productCode) return;

    const product = state.productos.find(p => p.codigo === productCode);
    const warnings = [];

    if (product) {
        const alto = product.alto || 0;
        const largo = product.largo || 0;
        const ancho = product.ancho || 0;

        if (alto > 200 || largo > 240 || ancho > 120) {
            warnings.push(`<strong style="color:var(--color-danger);">❌ Excede límites del Rack (Alto: 2.0m, Largo: 2.4m, Ancho: 1.2m)</strong>`);
        }
    }

    if (product && product.peso > 20) {
        const nivel = code.substring(3, 5);
        if (Number(nivel) > 5) {
            warnings.push(`⚠️ Producto pesado (${product.peso}kg). Se sugieren niveles bajos (01-05).`);
        }
    }

    if (state.stockPorUbicacion && state.stockPorUbicacion.length > 0) {
        const occupiers = state.stockPorUbicacion.filter(s => s.ubicacion === code && s.codigo_producto !== productCode && s.stock > 0);
        if (occupiers.length > 0) {
            const occupierText = occupiers.map(o => `${o.codigo_producto} (${o.stock} und)`).join(', ');
            warnings.push(`⚠️ Ubicación mezclada. Ocupada por: ${occupierText}.`);
        }
    }

    if (product) {
        const occupied = calcularVolumenOcupadoCliente(code);
        const addedVol = newQty * (product.alto || 0) * (product.largo || 0) * (product.ancho || 0);
        const totalVol = occupied + addedVol;
        const maxVol = 5760000;
        const pct = Math.min(100, (totalVol / maxVol) * 100);

        let volColor = '#10b981';
        if (pct > 90) {
            volColor = '#ef4444';
            warnings.push(`<strong style="color:var(--color-danger);">❌ Capacidad volumétrica excedida (${pct.toFixed(1)}%)</strong>`);
        } else if (pct > 75) {
            volColor = '#f59e0b';
        }

        const barHTML = `
            <div style="margin-top: 6px; width: 100%;">
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:600; color:var(--text-secondary);">
                    <span>Capacidad Volumétrica 3D:</span>
                    <span style="color:${volColor}">${(totalVol / 1000000).toFixed(3)} m³ / 5.760 m³ (${pct.toFixed(1)}%)</span>
                </div>
                <div style="width:100%; height:6px; background:var(--bg-base); border-radius:3px; margin-top:3px; overflow:hidden; border: 1px solid var(--border-color);">
                    <div style="width:${pct}%; height:100%; background:${volColor}; border-radius:3px; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;

        warnEl.innerHTML = (warnings.length > 0 ? warnings.join('<br>') + '<hr style="border:0; border-top:1px solid rgba(255,255,255,0.08); margin:6px 0;">' : '') + barHTML;
        warnEl.style.display = 'block';
        warnEl.style.backgroundColor = 'var(--bg-surface-elevated)';
        warnEl.style.padding = '8px';
        warnEl.style.borderRadius = 'var(--radius-md)';
        warnEl.style.border = '1px solid var(--border-color)';
    }
}

export function getUbicacionCode(prefix) {
    const el = document.getElementById(`ubi-code-${prefix}`);
    return el ? el.textContent.trim() : '';
}

export function validarUbicacion(code) {
    if (!/^V\d{6}$/.test(code)) return false;
    const vano = code.substring(1, 3);
    const nivel = code.substring(3, 5);
    const pos = code.substring(5, 7);
    return UBICACION.vanos.includes(vano) &&
        UBICACION.niveles.includes(nivel) &&
        UBICACION.posiciones.includes(pos);
}

export function initDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = ['oc-fecha', 'oc-fecha-envio', 'os-fecha', 'os-fecha-envio', 'venta-fecha', 'in-fecha', 'out-fecha', 'monta-fecha', 'dev-fecha'];
    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = today;
    });
}

/**
 * Busca un proveedor por NIT o nombre (con coincidencia flexible)
 * @param {string} terceroText - Texto a buscar (NIT o nombre)
 * @returns {string} NIT del proveedor encontrado o texto original
 */
export function buscarProveedorNit(terceroText) {
    if (!terceroText) return '';
    const norm = terceroText.trim().toLowerCase();
    
    // Coincidencia exacta por nombre
    let match = state.proveedores.find(p => p.nombre.trim().toLowerCase() === norm);
    if (match) return match.nit;
    
    // Coincidencia exacta por NIT
    match = state.proveedores.find(p => p.nit === terceroText.trim());
    if (match) return match.nit;
    
    // Coincidencia parcial por nombre
    match = state.proveedores.find(p => 
        p.nombre.toLowerCase().includes(norm) || 
        norm.includes(p.nombre.toLowerCase())
    );
    if (match) return match.nit;
    
    return terceroText.trim();
}

/**
 * Busca un producto por código (con padding automático para códigos numéricos)
 * @param {string} codeText - Código del producto a buscar
 * @returns {Object|null} Producto encontrado o null
 */
export function buscarProductoPorCodigo(codeText) {
    if (!codeText) return null;
    const cleanCode = String(codeText).trim();
    
    // Coincidencia exacta
    let prod = state.productos.find(p => p.codigo === cleanCode);
    if (prod) return prod;
    
    // Si es numérico, intentar con padding de 5 dígitos
    if (/^\d+$/.test(cleanCode)) {
        const padded5 = cleanCode.padStart(5, '0');
        prod = state.productos.find(p => p.codigo === padded5);
        if (prod) return prod;
    }
    
    return null;
}

// Bind to window for global availability
window.actualizarCodigoUbicacion = actualizarCodigoUbicacion;
window.initDateInputs = initDateInputs;
window.formatoMoneda = formatoMoneda;



