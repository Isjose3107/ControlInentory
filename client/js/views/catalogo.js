import { state } from '../state.js';
import { fetchAPI } from '../api.js';
import { formatoMoneda, readExcelOrCSV, parseNumberString } from '../utils.js';

// --- LOGICA DE PRODUCTOS ---
export async function loadProductos() {
    try {
        const data = await fetchAPI('/productos') || [];
        state.productos = data;
        const tbody = document.getElementById('productos-list-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No hay productos registrados</td></tr>';
            return;
        }

        data.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${p.codigo}</strong></td>
                    <td>${p.descripcion}</td>
                    <td>${p.marca || '-'}</td>
                    <td>${p.peso ? p.peso + ' Kg' : '-'}</td>
                    <td>${formatoMoneda(p.valor_venta)}</td>
                    <td>${p.alto || 0}m x ${p.largo || 0}m x ${p.ancho || 0}m</td>
                    <td>${p.unidad_compra || 'Und'}</td>
                    <td>${p.unidad_consumo || 'Und'}</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

export function limpiarFormProducto() {
    document.getElementById('prod-codigo').value = '';
    document.getElementById('prod-codigo').disabled = false;
    document.getElementById('prod-descripcion').value = '';
    document.getElementById('prod-peso').value = '';
    document.getElementById('prod-valor').value = '';
    document.getElementById('prod-marca').value = '';
    document.getElementById('prod-alto').value = '';
    document.getElementById('prod-largo').value = '';
    document.getElementById('prod-ancho').value = '';
    document.getElementById('prod-unidad-compra').value = 'Und';
    document.getElementById('prod-unidad-consumo').value = 'Und';
}

export async function guardarProducto() {
    const codigo = document.getElementById('prod-codigo').value.trim();
    const descripcion = document.getElementById('prod-descripcion').value.trim();
    const peso = Number(document.getElementById('prod-peso').value) || 0;
    const valor_venta = Number(document.getElementById('prod-valor').value) || 0;
    const marca = document.getElementById('prod-marca').value.trim();
    const alto = Number(document.getElementById('prod-alto').value) || 0;
    const largo = Number(document.getElementById('prod-largo').value) || 0;
    const ancho = Number(document.getElementById('prod-ancho').value) || 0;
    const unidad_compra = document.getElementById('prod-unidad-compra').value;
    const unidad_consumo = document.getElementById('prod-unidad-consumo').value;

    if (!codigo || !descripcion) {
        alert('Código y Descripción son obligatorios.');
        return;
    }

    try {
        await fetchAPI('/productos', 'POST', {
            codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra, unidad_consumo
        });
        alert('Producto guardado correctamente.');
        limpiarFormProducto();
        loadProductos();
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
    } catch (err) {
        console.error(err);
    }
}

export function editarProducto(codigo) {
    const p = state.productos.find(x => x.codigo === codigo);
    if (p) {
        document.getElementById('prod-codigo').value = p.codigo;
        document.getElementById('prod-codigo').disabled = true;
        document.getElementById('prod-descripcion').value = p.descripcion;
        document.getElementById('prod-peso').value = p.peso || '';
        document.getElementById('prod-valor').value = p.valor_venta || '';
        document.getElementById('prod-marca').value = p.marca || '';
        document.getElementById('prod-alto').value = p.alto || '';
        document.getElementById('prod-largo').value = p.largo || '';
        document.getElementById('prod-ancho').value = p.ancho || '';
        document.getElementById('prod-unidad-compra').value = p.unidad_compra || 'Und';
        document.getElementById('prod-unidad-consumo').value = p.unidad_consumo || 'Und';
    }
}

export function buscarYEditarProducto() {
    const input = document.getElementById('prod-buscar-rapido');
    if (!input) return;
    const codigo = input.value.trim();
    if (!codigo) {
        alert('Por favor, ingrese un código de producto.');
        return;
    }
    const p = state.productos.find(x => x.codigo.toLowerCase() === codigo.toLowerCase());
    if (p) {
        editarProducto(p.codigo);
        input.value = ''; // Limpiar campo de búsqueda
    } else {
        alert('Producto no encontrado en el catálogo.');
    }
}

// --- PRODUCTOS: CARGA MASIVA ---
let csvParsedProducts = [];
const prodAliasMap = {
    codigo: ['codigo', 'código', 'referencia', 'ref', 'id', 'código producto', 'codigo producto', 'artículo', 'articulo'],
    descripcion: ['descripcion', 'descripción', 'nombre', 'producto', 'nombre producto', 'detalle'],
    peso: ['peso', 'peso_kg', 'peso (kg)', 'peso kg', 'peso neto'],
    valor_venta: ['valor_venta', 'valor venta', 'precio', 'venta', 'valor', 'precio venta', 'precio de venta', 'costo unitario', 'costo'],
    marca: ['marca', 'brand', 'fabricante'],
    alto: ['alto', 'alto_m', 'alto (m)', 'alto m', 'altura'],
    largo: ['largo', 'largo_m', 'largo (m)', 'largo m', 'longitud'],
    ancho: ['ancho', 'ancho_m', 'ancho (m)', 'ancho m', 'anchura'],
    unidad_compra: ['unidad_compra', 'unidad compra', 'um compra', 'uom compra', 'um. comp.', 'u.m. compra', 'unidad de compra'],
    unidad_consumo: ['unidad_consumo', 'unidad consumo', 'um consumo', 'uom consumo', 'um. cons.', 'u.m. consumo', 'unidad de consumo']
};

export function switchProdTab(tab) {
    const btnForm = document.getElementById('prod-tab-formulario');
    const btnMasiva = document.getElementById('prod-tab-masiva');
    const paneForm = document.getElementById('prod-pane-formulario');
    const paneMasiva = document.getElementById('prod-pane-masiva');

    if (tab === 'formulario') {
        btnForm.className = 'btn btn-primary';
        btnMasiva.className = 'btn btn-secondary';
        paneForm.style.display = 'block';
        paneMasiva.style.display = 'none';
    } else {
        btnForm.className = 'btn btn-secondary';
        btnMasiva.className = 'btn btn-primary';
        paneForm.style.display = 'none';
        paneMasiva.style.display = 'block';
    }
}

export function descargarPlantillaCSVProductos() {
    if (window.XLSX) {
        const data = [
            ["Código", "Descripción", "Peso (Kg)", "Valor Venta", "Marca", "Alto (m)", "Largo (m)", "Ancho (m)", "Unidad Compra", "Unidad Consumo"],
            ["00038", "AZUCAR - Riopaila X 2.5 Kilos", 2.5, 12000, "EdexA", 0.08, 0.25, 0.15, "Bol", "kg"],
            ["00032", "AREPAS - Empaque Al Vacio", 0.5, 2500, "EL CHOCLO", 0.02, 0.15, 0.15, "Und", "Und"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Productos");
        XLSX.writeFile(wb, "catalogo_productos.xlsx");
    } else {
        const headers = 'codigo,descripcion,peso_kg,valor_venta,marca,alto_m,largo_m,ancho_m,unidad_compra,unidad_consumo\n';
        const rowEjemplo = '00038,AZUCAR - Riopaila X 2.5 Kilos,2.5,12000,EdexA,0.08,0.25,0.15,Bol,kg\n';
        const blob = new Blob([headers + rowEjemplo], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'plantilla_productos.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export function procesarArchivoCSVProductos() {
    const fileInput = document.getElementById('csv-file-input-prod');
    const file = fileInput.files[0];
    if (!file) return;

    readExcelOrCSV(file, prodAliasMap, function (err, rows, colMapping) {
        if (err) {
            alert(`Error al procesar archivo: ${err.message}`);
            return;
        }
        try {
            csvParsedProducts = parseExcelOrCSVToProducts(rows, colMapping);
            renderProductsCSVPreview();
        } catch (parseErr) {
            alert(`Error al parsear datos: ${parseErr.message}`);
        }
    });
}

function parseExcelOrCSVToProducts(rows, colMapping) {
    const list = [];
    const startIndex = colMapping._headerIndex + 1;

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        let codigo = colMapping.codigo !== -1 ? String(row[colMapping.codigo] || '').trim() : '';
        let descripcion = colMapping.descripcion !== -1 ? String(row[colMapping.descripcion] || '').trim() : '';
        let peso = colMapping.peso !== -1 ? String(row[colMapping.peso] || '').trim() : '';
        let valorVenta = colMapping.valor_venta !== -1 ? String(row[colMapping.valor_venta] || '').trim() : '';
        let marca = colMapping.marca !== -1 ? String(row[colMapping.marca] || '').trim() : '';
        let alto = colMapping.alto !== -1 ? String(row[colMapping.alto] || '').trim() : '';
        let largo = colMapping.largo !== -1 ? String(row[colMapping.largo] || '').trim() : '';
        let ancho = colMapping.ancho !== -1 ? String(row[colMapping.ancho] || '').trim() : '';
        let uCompra = colMapping.unidad_compra !== -1 ? String(row[colMapping.unidad_compra] || '').trim() : '';
        let uConsumo = colMapping.unidad_consumo !== -1 ? String(row[colMapping.unidad_consumo] || '').trim() : '';

        if (!codigo || !descripcion) continue;

        list.push({
            codigo,
            descripcion,
            peso: parseNumberString(peso),
            valor_venta: parseNumberString(valorVenta),
            marca: marca,
            alto: parseNumberString(alto),
            largo: parseNumberString(largo),
            ancho: parseNumberString(ancho),
            unidad_compra: uCompra || 'Und',
            unidad_consumo: uConsumo || 'Und'
        });
    }
    return list;
}

function renderProductsCSVPreview() {
    const previewPanel = document.getElementById('csv-preview-panel-prod');
    const tbody = document.getElementById('csv-preview-body-prod');
    const btnConfirmar = document.getElementById('btnConfirmarImportacionCSVProd');

    tbody.innerHTML = '';

    if (csvParsedProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No se encontraron productos válidos para importar.</td></tr>';
        btnConfirmar.disabled = true;
        previewPanel.style.display = 'block';
        return;
    }

    csvParsedProducts.forEach(p => {
        const yaExiste = state.productos.some(x => x.codigo === p.codigo);
        const statusHTML = yaExiste
            ? '<span class="badge badge-pending">Se actualizará (ya existe)</span>'
            : '<span class="badge badge-completed">Nuevo</span>';

        tbody.innerHTML += `
            <tr>
                <td><strong>${p.codigo}</strong></td>
                <td>${p.descripcion}</td>
                <td>${p.marca || '-'}</td>
                <td>${p.peso} Kg</td>
                <td>${formatoMoneda(p.valor_venta)}</td>
                <td>${p.unidad_compra}</td>
                <td>${p.unidad_consumo}</td>
                <td>${statusHTML}</td>
            </tr>
        `;
    });

    btnConfirmar.disabled = false;
    previewPanel.style.display = 'block';
}

export function cancelarImportacionCSVProductos() {
    document.getElementById('csv-preview-panel-prod').style.display = 'none';
    document.getElementById('csv-file-input-prod').value = '';
    csvParsedProducts = [];
}

export async function confirmarImportacionCSVProductos() {
    if (csvParsedProducts.length === 0) return;

    const confirmacion = confirm(`¿Confirmar la importación masiva de ${csvParsedProducts.length} producto(s)?`);
    if (!confirmacion) return;

    try {
        for (const prod of csvParsedProducts) {
            await fetchAPI('/productos', 'POST', prod);
        }
        alert('Productos importados correctamente.');
        cancelarImportacionCSVProductos();
        switchProdTab('formulario');
        loadProductos();
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
    } catch (err) {
        console.error(err);
        alert(`Ocurrió un error al importar los productos: ${err.message}`);
    }
}

// --- LOGICA DE CLIENTES ---
export async function loadClientes() {
    try {
        const data = await fetchAPI('/clientes') || [];
        state.clientes = data;
        const tbody = document.getElementById('clientes-list-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay clientes registrados</td></tr>';
            return;
        }

        data.forEach(c => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${c.nit}</strong></td>
                    <td>${c.nombre}</td>
                    <td>${c.telefono || '-'}</td>
                    <td>${c.direccion || '-'}</td>
                    <td>${c.correo || '-'}</td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="editarCliente('${c.nit}')">Editar</button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

export function limpiarFormCliente() {
    document.getElementById('cli-nit').value = '';
    document.getElementById('cli-nit').disabled = false;
    document.getElementById('cli-nombre').value = '';
    document.getElementById('cli-telefono').value = '';
    document.getElementById('cli-direccion').value = '';
    document.getElementById('cli-correo').value = '';
}

export async function guardarCliente() {
    const nit = document.getElementById('cli-nit').value.trim();
    const nombre = document.getElementById('cli-nombre').value.trim();
    const telefono = document.getElementById('cli-telefono').value.trim();
    const direccion = document.getElementById('cli-direccion').value.trim();
    const correo = document.getElementById('cli-correo').value.trim();

    if (!nit || !nombre) {
        alert('Cédula/NIT y Nombre son obligatorios.');
        return;
    }

    try {
        await fetchAPI('/clientes', 'POST', { nit, nombre, telefono, direccion, correo });
        alert('Cliente guardado correctamente.');
        limpiarFormCliente();
        loadClientes();
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
    } catch (err) {
        console.error(err);
    }
}

export function editarCliente(nit) {
    const c = state.clientes.find(x => x.nit === nit);
    if (c) {
        document.getElementById('cli-nit').value = c.nit;
        document.getElementById('cli-nit').disabled = true;
        document.getElementById('cli-nombre').value = c.nombre;
        document.getElementById('cli-telefono').value = c.telefono || '';
        document.getElementById('cli-direccion').value = c.direccion || '';
        document.getElementById('cli-correo').value = c.correo || '';
    }
}

// --- LOGICA DE PROVEEDORES ---
export async function loadProveedores() {
    try {
        const data = await fetchAPI('/proveedores') || [];
        state.proveedores = data;
        const tbody = document.getElementById('proveedores-list-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay proveedores registrados</td></tr>';
            return;
        }

        data.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${p.nit}</strong></td>
                    <td>${p.nombre}</td>
                    <td>${p.telefono || '-'}</td>
                    <td>${p.direccion || '-'}</td>
                    <td>${p.correo || '-'}</td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="editarProveedor('${p.nit}')">Editar</button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

export function limpiarFormProveedor() {
    document.getElementById('prov-nit').value = '';
    document.getElementById('prov-nit').disabled = false;
    document.getElementById('prov-nombre').value = '';
    document.getElementById('prov-telefono').value = '';
    document.getElementById('prov-direccion').value = '';
    document.getElementById('prov-correo').value = '';
}

export async function guardarProveedor() {
    const nit = document.getElementById('prov-nit').value.trim();
    const nombre = document.getElementById('prov-nombre').value.trim();
    const telefono = document.getElementById('prov-telefono').value.trim();
    const direccion = document.getElementById('prov-direccion').value.trim();
    const correo = document.getElementById('prov-correo').value.trim();

    if (!nit || !nombre) {
        alert('Cédula/NIT y Nombre son obligatorios.');
        return;
    }

    try {
        await fetchAPI('/proveedores', 'POST', { nit, nombre, telefono, direccion, correo });
        alert('Proveedor guardado correctamente.');
        limpiarFormProveedor();
        loadProveedores();
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
    } catch (err) {
        console.error(err);
    }
}

export function editarProveedor(nit) {
    const p = state.proveedores.find(x => x.nit === nit);
    if (p) {
        document.getElementById('prov-nit').value = p.nit;
        document.getElementById('prov-nit').disabled = true;
        document.getElementById('prov-nombre').value = p.nombre;
        document.getElementById('prov-telefono').value = p.telefono || '';
        document.getElementById('prov-direccion').value = p.direccion || '';
        document.getElementById('prov-correo').value = p.correo || '';
    }
}

// --- PROVEEDORES: CARGA MASIVA ---
let csvParsedSuppliers = [];
const provAliasMap = {
    nit: ['nit', 'documento', 'id', 'nit proveedor', 'identificacion', 'identificación', 'nit o cédula', 'nit o cedula', 'cédula o nit', 'cedula o nit'],
    nombre: ['nombre', 'tercero', 'proveedor', 'razon social', 'razón social', 'nombre / razón social', 'nombre / razon social'],
    telefono: ['telefono', 'teléfono', 'celular', 'tel', 'contacto'],
    direccion: ['direccion', 'dirección', 'dir', 'ubicacion', 'ubicación'],
    correo: ['correo', 'email', 'e-mail', 'mail', 'correo electronico', 'correo electrónico']
};

export function switchProvTab(tab) {
    const btnForm = document.getElementById('prov-tab-formulario');
    const btnMasiva = document.getElementById('prov-tab-masiva');
    const paneForm = document.getElementById('prov-pane-formulario');
    const paneMasiva = document.getElementById('prov-pane-masiva');

    if (tab === 'formulario') {
        btnForm.className = 'btn btn-primary';
        btnMasiva.className = 'btn btn-secondary';
        paneForm.style.display = 'block';
        paneMasiva.style.display = 'none';
    } else {
        btnForm.className = 'btn btn-secondary';
        btnMasiva.className = 'btn btn-primary';
        paneForm.style.display = 'none';
        paneMasiva.style.display = 'block';
    }
}

export function descargarPlantillaCSVProveedores() {
    if (window.XLSX) {
        const data = [
            ["NIT o Cédula", "Nombre / Razón Social", "Teléfono", "Dirección", "Correo"],
            ["900111222", "EL CHOCLO", "3001112233", "Calle 10 # 5-20", "contacto@elchoclo.com"],
            ["900333444", "MM PACKAGING COLOMBIA", "3104445566", "Zona Industrial Lote 4", "ventas@mm-packaging.co"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Proveedores");
        XLSX.writeFile(wb, "listado_proveedores.xlsx");
    } else {
        const headers = 'nit,nombre,telefono,direccion,correo\n';
        const rowEjemplo = '900555666,EdexA,3157778899,Av El Dorado # 68C-20,servicio@edexa.com.co\n';
        const blob = new Blob([headers + rowEjemplo], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'plantilla_proveedores.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export function procesarArchivoCSVProveedores() {
    const fileInput = document.getElementById('csv-file-input-prov');
    const file = fileInput.files[0];
    if (!file) return;

    readExcelOrCSV(file, provAliasMap, function (err, rows, colMapping) {
        if (err) {
            alert(`Error al procesar archivo: ${err.message}`);
            return;
        }
        try {
            csvParsedSuppliers = parseExcelOrCSVToSuppliers(rows, colMapping);
            renderSuppliersCSVPreview();
        } catch (parseErr) {
            alert(`Error al parsear datos: ${parseErr.message}`);
        }
    });
}

function parseExcelOrCSVToSuppliers(rows, colMapping) {
    const list = [];
    const startIndex = colMapping._headerIndex + 1;

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        let nit = colMapping.nit !== -1 ? String(row[colMapping.nit] || '').trim() : '';
        let nombre = colMapping.nombre !== -1 ? String(row[colMapping.nombre] || '').trim() : '';
        let telefono = colMapping.telefono !== -1 ? String(row[colMapping.telefono] || '').trim() : '';
        let direccion = colMapping.direccion !== -1 ? String(row[colMapping.direccion] || '').trim() : '';
        let correo = colMapping.correo !== -1 ? String(row[colMapping.correo] || '').trim() : '';

        if (!nit || !nombre) continue;

        list.push({
            nit,
            nombre,
            telefono: telefono || '',
            direccion: direccion || '',
            correo: correo || ''
        });
    }
    return list;
}

function renderSuppliersCSVPreview() {
    const previewPanel = document.getElementById('csv-preview-panel-prov');
    const tbody = document.getElementById('csv-preview-body-prov');
    const btnConfirmar = document.getElementById('btnConfirmarImportacionCSVProv');

    tbody.innerHTML = '';

    if (csvParsedSuppliers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No se encontraron proveedores válidos para importar.</td></tr>';
        btnConfirmar.disabled = true;
        previewPanel.style.display = 'block';
        return;
    }

    csvParsedSuppliers.forEach(p => {
        const yaExiste = state.proveedores.some(x => x.nit === p.nit);
        const statusHTML = yaExiste
            ? '<span class="badge badge-pending">Se actualizará (ya existe)</span>'
            : '<span class="badge badge-completed">Nuevo</span>';

        tbody.innerHTML += `
            <tr>
                <td><strong>${p.nit}</strong></td>
                <td>${p.nombre}</td>
                <td>${p.telefono || '-'}</td>
                <td>${p.direccion || '-'}</td>
                <td>${p.correo || '-'}</td>
                <td>${statusHTML}</td>
            </tr>
        `;
    });

    btnConfirmar.disabled = false;
    previewPanel.style.display = 'block';
}

export function cancelarImportacionCSVProveedores() {
    document.getElementById('csv-preview-panel-prov').style.display = 'none';
    document.getElementById('csv-file-input-prov').value = '';
    csvParsedSuppliers = [];
}

export async function confirmarImportacionCSVProveedores() {
    if (csvParsedSuppliers.length === 0) return;

    const confirmacion = confirm(`¿Confirmar la importación masiva de ${csvParsedSuppliers.length} proveedor(es)?`);
    if (!confirmacion) return;

    try {
        for (const prov of csvParsedSuppliers) {
            await fetchAPI('/proveedores', 'POST', prov);
        }
        alert('Proveedores importados correctamente.');
        cancelarImportacionCSVProveedores();
        switchProvTab('formulario');
        loadProveedores();
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
    } catch (err) {
        console.error(err);
        alert(`Ocurrió un error al importar los proveedores: ${err.message}`);
    }
}

// Bind to window for global availability
window.loadProductos = loadProductos;
window.limpiarFormProducto = limpiarFormProducto;
window.guardarProducto = guardarProducto;
window.editarProducto = editarProducto;
window.buscarYEditarProducto = buscarYEditarProducto;
window.switchProdTab = switchProdTab;
window.descargarPlantillaCSVProductos = descargarPlantillaCSVProductos;
window.procesarArchivoCSVProductos = procesarArchivoCSVProductos;
window.cancelarImportacionCSVProductos = cancelarImportacionCSVProductos;
window.confirmarImportacionCSVProductos = confirmarImportacionCSVProductos;

window.loadProveedores = loadProveedores;
window.limpiarFormProveedor = limpiarFormProveedor;
window.guardarProveedor = guardarProveedor;
window.editarProveedor = editarProveedor;
window.switchProvTab = switchProvTab;
window.descargarPlantillaCSVProveedores = descargarPlantillaCSVProveedores;
window.procesarArchivoCSVProveedores = procesarArchivoCSVProveedores;
window.cancelarImportacionCSVProveedores = cancelarImportacionCSVProveedores;
window.confirmarImportacionCSVProveedores = confirmarImportacionCSVProveedores;

window.loadClientes = loadClientes;
window.limpiarFormCliente = limpiarFormCliente;
window.guardarCliente = guardarCliente;
window.editarCliente = editarCliente;

// ponytail: customer bulk upload logic
let csvParsedClients = [];
const cliAliasMap = {
    nit: ['nit', 'documento', 'id', 'nit cliente', 'identificacion', 'identificación', 'nit o cédula', 'nit o cedula', 'cédula o nit', 'cedula o nit', 'cédula', 'cedula'],
    nombre: ['nombre', 'tercero', 'cliente', 'razon social', 'razón social', 'nombre / razón social', 'nombre / razon social', 'solicitante'],
    telefono: ['telefono', 'teléfono', 'celular', 'tel', 'contacto'],
    direccion: ['direccion', 'dirección', 'dir', 'ubicacion', 'ubicación'],
    correo: ['correo', 'email', 'e-mail', 'mail', 'correo electronico', 'correo electrónico']
};

export function switchCliTab(tab) {
    const btnForm = document.getElementById('cli-tab-formulario');
    const btnMasiva = document.getElementById('cli-tab-masiva');
    const paneForm = document.getElementById('cli-pane-formulario');
    const paneMasiva = document.getElementById('cli-pane-masiva');

    if (tab === 'formulario') {
        if (btnForm) btnForm.className = 'btn btn-primary';
        if (btnMasiva) btnMasiva.className = 'btn btn-secondary';
        if (paneForm) paneForm.style.display = 'block';
        if (paneMasiva) paneMasiva.style.display = 'none';
    } else {
        if (btnForm) btnForm.className = 'btn btn-secondary';
        if (btnMasiva) btnMasiva.className = 'btn btn-primary';
        if (paneForm) paneForm.style.display = 'none';
        if (paneMasiva) paneMasiva.style.display = 'block';
    }
}

export function descargarPlantillaCSVClientes() {
    if (window.XLSX) {
        const data = [
            ["NIT o Cédula", "Nombre / Razón Social", "Teléfono", "Dirección", "Correo"],
            ["900111222", "CLIENTE DE EJEMPLO S.A.S", "3001112233", "Calle 100 # 15-20", "facturacion@ejemplo.com"],
            ["12345678", "JUAN PEREZ", "3104445566", "Carrera 45 # 12-34", "juan.perez@gmail.com"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Clientes");
        XLSX.writeFile(wb, "listado_clientes.xlsx");
    } else {
        const headers = 'nit,nombre,telefono,direccion,correo\n';
        const rowEjemplo = '900111222,CLIENTE DE EJEMPLO S.A.S,3001112233,Calle 100 # 15-20,facturacion@ejemplo.com\n';
        const blob = new Blob([headers + rowEjemplo], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'plantilla_clientes.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export function procesarArchivoCSVClientes() {
    const fileInput = document.getElementById('csv-file-input-cli');
    if (!fileInput) return;
    const file = fileInput.files[0];
    if (!file) return;

    readExcelOrCSV(file, cliAliasMap, function (err, rows, colMapping) {
        if (err) {
            alert(`Error al procesar archivo: ${err.message}`);
            return;
        }
        try {
            csvParsedClients = parseExcelOrCSVToClients(rows, colMapping);
            renderClientsCSVPreview();
        } catch (parseErr) {
            alert(`Error al parsear datos: ${parseErr.message}`);
        }
    });
}

function parseExcelOrCSVToClients(rows, colMapping) {
    const list = [];
    const startIndex = colMapping._headerIndex + 1;

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        let nit = colMapping.nit !== -1 ? String(row[colMapping.nit] || '').trim() : '';
        let nombre = colMapping.nombre !== -1 ? String(row[colMapping.nombre] || '').trim() : '';
        let telefono = colMapping.telefono !== -1 ? String(row[colMapping.telefono] || '').trim() : '';
        let direccion = colMapping.direccion !== -1 ? String(row[colMapping.direccion] || '').trim() : '';
        let correo = colMapping.correo !== -1 ? String(row[colMapping.correo] || '').trim() : '';

        if (!nit || !nombre) continue;

        list.push({
            nit,
            nombre,
            telefono: telefono || '',
            direccion: direccion || '',
            correo: correo || ''
        });
    }
    return list;
}

function renderClientsCSVPreview() {
    const previewPanel = document.getElementById('csv-preview-panel-cli');
    const tbody = document.getElementById('csv-preview-body-cli');
    const btnConfirmar = document.getElementById('btnConfirmarImportacionCSVCli');

    if (!tbody || !previewPanel || !btnConfirmar) return;
    tbody.innerHTML = '';

    if (csvParsedClients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No se encontraron clientes válidos para importar.</td></tr>';
        btnConfirmar.disabled = true;
        previewPanel.style.display = 'block';
        return;
    }

    csvParsedClients.forEach(c => {
        const yaExiste = state.clientes.some(x => String(x.nit) === String(c.nit));
        const statusHTML = yaExiste
            ? '<span class="badge badge-pending">Se actualizará (ya existe)</span>'
            : '<span class="badge badge-completed">Nuevo</span>';

        tbody.innerHTML += `
            <tr>
                <td><strong>${c.nit}</strong></td>
                <td>${c.nombre}</td>
                <td>${c.telefono || '-'}</td>
                <td>${c.direccion || '-'}</td>
                <td>${c.correo || '-'}</td>
                <td>${statusHTML}</td>
            </tr>
        `;
    });

    btnConfirmar.disabled = false;
    previewPanel.style.display = 'block';
}

export function cancelarImportacionCSVClientes() {
    const previewPanel = document.getElementById('csv-preview-panel-cli');
    if (previewPanel) previewPanel.style.display = 'none';
    const fileInput = document.getElementById('csv-file-input-cli');
    if (fileInput) fileInput.value = '';
    csvParsedClients = [];
}

export async function confirmarImportacionCSVClientes() {
    if (csvParsedClients.length === 0) return;

    const confirmacion = confirm(`¿Confirmar la importación masiva de ${csvParsedClients.length} cliente(s)?`);
    if (!confirmacion) return;

    try {
        for (const cli of csvParsedClients) {
            await fetchAPI('/clientes', 'POST', cli);
        }
        alert('Clientes importados correctamente.');
        cancelarImportacionCSVClientes();
        switchCliTab('formulario');
        loadClientes();
        if (window.loadCatalogos) {
            await window.loadCatalogos();
        }
    } catch (err) {
        console.error(err);
        alert(`Ocurrió un error al importar los clientes: ${err.message}`);
    }
}

window.switchCliTab = switchCliTab;
window.descargarPlantillaCSVClientes = descargarPlantillaCSVClientes;
window.procesarArchivoCSVClientes = procesarArchivoCSVClientes;
window.cancelarImportacionCSVClientes = cancelarImportacionCSVClientes;
window.confirmarImportacionCSVClientes = confirmarImportacionCSVClientes;

