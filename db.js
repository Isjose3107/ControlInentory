const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');


const isPostgres = !!(process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://')));

let pgPool = null;
let sqliteDb = null;

if (isPostgres) {
    const { Pool } = require('pg');
    const isLocalPostgres = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
    const poolConfig = {
        connectionString: process.env.DATABASE_URL,
        max: 5, // Optimización de recursos en tiers gratuitos/económicos
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    };
    if (!isLocalPostgres) {
        poolConfig.ssl = { rejectUnauthorized: false }; // Requerido para Render/Railway
    }
    pgPool = new Pool(poolConfig);
    console.log("HABITAD WMS: Conectado a PostgreSQL (Modo Producción/Cloud)");
} else {
    const dbPath = path.join(__dirname, 'db.sqlite');
    sqliteDb = new DatabaseSync(dbPath);
    console.log("HABITAD WMS: Conectado a SQLite local (Modo Desarrollo/Cero-Configuración)");
}

// Helper genérico para consultas asíncronas con conversión de placeholders para Postgres (? -> $1, $2...)
async function executeQuery(sql, params = []) {
    if (isPostgres) {
        let index = 1;
        const pgSql = sql.replace(/\?/g, () => `$${index++}`);
        const res = await pgPool.query(pgSql, params);
        return res.rows;
    } else {
        const stmt = sqliteDb.prepare(sql);
        const trimmedSql = sql.trim().toUpperCase();
        if (trimmedSql.startsWith('SELECT')) {
            return stmt.all(...params);
        } else {
            const res = stmt.run(...params);
            return { success: true, changes: res.changes, lastInsertRowid: res.lastInsertRowid };
        }
    }
}

// ponytail: single source of truth for schemas, adapted on the fly for SQLite/Postgres
const tableDefinitions = [
    `CREATE TABLE IF NOT EXISTS usuarios (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        correo TEXT,
        otp TEXT,
        otp_expiry BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS clientes (
        nit TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        telefono TEXT,
        direccion TEXT,
        correo TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS proveedores (
        nit TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        telefono TEXT,
        direccion TEXT,
        correo TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS productos (
        codigo TEXT PRIMARY KEY,
        descripcion TEXT NOT NULL,
        peso REAL,
        valor_venta REAL,
        marca TEXT,
        alto REAL,
        largo REAL,
        ancho REAL,
        unidad_compra TEXT DEFAULT 'Und',
        unidad_consumo TEXT DEFAULT 'Und'
    )`,
    `CREATE TABLE IF NOT EXISTS ordenes_compra (
        consecutivo TEXT PRIMARY KEY,
        fecha TEXT NOT NULL,
        proveedor_nit TEXT,
        observaciones TEXT,
        descuento REAL DEFAULT 0,
        iva REAL DEFAULT 0,
        retencion REAL DEFAULT 0,
        condiciones_envio TEXT,
        forma_pago TEXT,
        fecha_envio TEXT,
        items TEXT NOT NULL,
        FOREIGN KEY(proveedor_nit) REFERENCES proveedores(nit)
    )`,
    `CREATE TABLE IF NOT EXISTS ventas (
        remision TEXT PRIMARY KEY,
        fecha TEXT NOT NULL,
        cliente_nit TEXT,
        observaciones TEXT,
        iva REAL DEFAULT 0,
        items TEXT NOT NULL,
        estado TEXT DEFAULT 'Pendiente',
        auxiliar TEXT,
        direccion TEXT,
        ruta TEXT,
        placa TEXT,
        FOREIGN KEY(cliente_nit) REFERENCES clientes(nit)
    )`,
    `CREATE TABLE IF NOT EXISTS inventario_movimientos (
        id SERIAL PRIMARY KEY,
        codigo_producto TEXT NOT NULL,
        tipo TEXT NOT NULL,
        documento_referencia TEXT,
        fecha TEXT NOT NULL,
        cantidad REAL NOT NULL,
        ubicacion TEXT NOT NULL,
        FOREIGN KEY(codigo_producto) REFERENCES productos(codigo)
    )`,
    `CREATE TABLE IF NOT EXISTS devoluciones (
        id SERIAL PRIMARY KEY,
        cliente_nit TEXT,
        factura TEXT,
        ciudad TEXT,
        almacen TEXT,
        fecha TEXT,
        ruta TEXT,
        placa TEXT,
        items TEXT NOT NULL,
        observaciones TEXT,
        estado_producto TEXT,
        firma_responsable TEXT,
        firma_transportador TEXT,
        nombre_transportador TEXT,
        firma_cliente TEXT,
        fecha_registro TEXT,
        fotos TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON inventario_movimientos(codigo_producto)`,
    `CREATE INDEX IF NOT EXISTS idx_movimientos_ubicacion ON inventario_movimientos(ubicacion)`,
    `CREATE INDEX IF NOT EXISTS idx_movimientos_referencia ON inventario_movimientos(documento_referencia)`
];

async function initTables() {
    for (let sql of tableDefinitions) {
        if (!isPostgres) {
            sql = sql
                .replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
                .replace(/BIGINT/g, 'INTEGER');
            sqliteDb.exec(sql);
        } else {
            await executeQuery(sql);
        }
    }

    const alterColumns = [
        { table: 'usuarios', column: 'correo', type: 'TEXT' },
        { table: 'ventas', column: 'auxiliar', type: 'TEXT' },
        { table: 'ventas', column: 'direccion', type: 'TEXT' },
        { table: 'ventas', column: 'ruta', type: 'TEXT' },
        { table: 'ventas', column: 'placa', type: 'TEXT' },
        { table: 'productos', column: 'unidad_compra', type: 'TEXT', def: "DEFAULT 'Und'" },
        { table: 'productos', column: 'unidad_consumo', type: 'TEXT', def: "DEFAULT 'Und'" },
        { table: 'devoluciones', column: 'fotos', type: 'TEXT' }
    ];

    for (const item of alterColumns) {
        try {
            if (isPostgres) {
                await executeQuery(`ALTER TABLE ${item.table} ADD COLUMN IF NOT EXISTS ${item.column} ${item.type} ${item.def || ''};`);
            } else {
                sqliteDb.exec(`ALTER TABLE ${item.table} ADD COLUMN ${item.column} ${item.type} ${item.def || ''};`);
            }
        } catch (e) {
            // Ignorar errores si la columna ya existe
        }
    }
}

// Semilla de base de datos
async function seedDatabase() {
    console.log("Sembrando datos de ejemplo real...");

    const proveedores = [
        { nit: '900111222', nombre: 'EL CHOCLO', telefono: '3001112233', direccion: 'Calle 10 # 5-20', correo: 'contacto@elchoclo.com' },
        { nit: '900333444', nombre: 'MM PACKAGING COLOMBIA', telefono: '3104445566', direccion: 'Zona Industrial Lote 4', correo: 'ventas@mm-packaging.co' },
        { nit: '900555666', nombre: 'EdexA', telefono: '3157778899', direccion: 'Av El Dorado # 68C-20', correo: 'servicio@edexa.com.co' },
        { nit: '900777888', nombre: 'LAMIEMPAQUES', telefono: '3208889900', direccion: 'Cra 45 # 12-30', correo: 'info@lamiempaques.com' },
        { nit: '900999000', nombre: 'GREENPACK', telefono: '3009998877', direccion: 'Parque Industrial Sur', correo: 'comercial@greenpack.co' },
        { nit: '900222333', nombre: 'Distraves', telefono: '3112223344', direccion: 'Via Floridablanca Km 4', correo: 'ventas@distraves.com' },
        { nit: '900444555', nombre: 'Asequin', telefono: '3124445566', direccion: 'Calle 80 # 24-50', correo: 'contacto@asequin.co' }
    ];

    for (const p of proveedores) {
        await executeQuery(
            `INSERT INTO proveedores (nit, nombre, telefono, direccion, correo) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT (nit) DO NOTHING`,
            [p.nit, p.nombre, p.telefono, p.direccion, p.correo]
        );
    }

    const productos = [
        { codigo: '00032', descripcion: 'AREPAS - Empaque Al Vacio', peso: 0.5, valor_venta: 2500, marca: 'EL CHOCLO', alto: 2, largo: 15, ancho: 15, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '10956', descripcion: 'CAJA CLAMSHELL GRANDE - Caja Clamshell Grande Cmpc Nkraft Kit 12 - Calibre 40,6 260gr', peso: 0.08, valor_venta: 1200, marca: 'MM PACKAGING COLOMBIA', alto: 10, largo: 20, ancho: 20, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '00038', descripcion: 'AZUCAR - Riopaila X 2.5 Kilos', peso: 2.5, valor_venta: 12000, marca: 'EdexA', alto: 8, largo: 25, ancho: 15, unidad_compra: 'Bol', unidad_consumo: 'kg' },
        { codigo: '09200', descripcion: 'BANDEJA NEGRA CON DIVISION - Bandeja Fresh Pack 6x3 Con Division', peso: 0.02, valor_venta: 600, marca: 'LAMIEMPAQUES', alto: 5, largo: 18, ancho: 12, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '00317', descripcion: 'BOLSA ANTIGRASA PAPA FRANCESA - *Bolsa Antigrasa Papa Francesa Caja*3000, Paq*200', peso: 0.005, valor_venta: 150, marca: 'GREENPACK', alto: 0.1, largo: 20, ancho: 12, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '00311', descripcion: 'BOLSA DE PAPEL PEQUEÑA 4 LB - Bolsa Pequeña 4 Lb Antigrasa Caja*3000, Paq*100', peso: 0.006, valor_venta: 180, marca: 'GREENPACK', alto: 0.1, largo: 22, ancho: 14, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '00327', descripcion: 'CANASTILLA 1/2 DESECHABLE - Canastilla 1/2 Material Cmpc Natural Kraft Kit 12,0457 285g', peso: 0.1, valor_venta: 1500, marca: 'MM PACKAGING COLOMBIA', alto: 12, largo: 30, ancho: 20, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '00328', descripcion: 'CANASTILLA 1/4 DESECHABLE - Canastilla 1/4 Cmpc Nkraft Kit 12 - Calibre 40,6 (260gr)', peso: 0.06, valor_venta: 900, marca: 'MM PACKAGING COLOMBIA', alto: 8, largo: 22, ancho: 15, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '05205', descripcion: 'CEPILLO DE MANO ROJO - Cepillo De Mano Tipo Plancha Rojo', peso: 0.15, valor_venta: 4500, marca: 'EdexA', alto: 5, largo: 15, ancho: 6, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '05204', descripcion: 'CEPILLO DE MANO VERDE - Cepillo De Mano Tipo Plancha Verde', peso: 0.15, valor_venta: 4500, marca: 'EdexA', alto: 5, largo: 15, ancho: 6, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '05302', descripcion: 'CHULETA ESPECIAL - Distraves', peso: 1.0, valor_venta: 18000, marca: 'Distraves', alto: 4, largo: 25, ancho: 18, unidad_compra: 'Pqt', unidad_consumo: 'Und' },
        { codigo: '03669', descripcion: 'ENCENDEDORES A GAS RECARGABLE - Encendedor Bbq + Repuesto', peso: 0.08, valor_venta: 3500, marca: 'EdexA', alto: 3, largo: 20, ancho: 4, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '03442', descripcion: 'ENDULZANTE NATURAL STEVIA - Stevia Endulzante X 160 Sobres', peso: 0.25, valor_venta: 9500, marca: 'EdexA', alto: 8, largo: 12, ancho: 10, unidad_compra: 'Caj', unidad_consumo: 'Sob' },
        { codigo: '07455', descripcion: 'ENSALADERA - Domo Bowl 32 Oz Tte', peso: 0.05, valor_venta: 1800, marca: 'LAMIEMPAQUES', alto: 8, largo: 16, ancho: 16, unidad_compra: 'Und', unidad_consumo: 'Und' },
        { codigo: '10293', descripcion: 'GUANTE AMARILLO (8-8 1/2) - Guante Amarillo Corrugado T.8', peso: 0.12, valor_venta: 5000, marca: 'Asequin', alto: 2, largo: 28, ancho: 12, unidad_compra: 'Par', unidad_consumo: 'Par' },
        { codigo: '10294', descripcion: 'GUANTE AMARILLO (9-9 1/2) - Guante Amarillo Corrugado T.9', peso: 0.13, valor_venta: 5000, marca: 'Asequin', alto: 2, largo: 29, ancho: 13, unidad_compra: 'Par', unidad_consumo: 'Par' }
    ];

    for (const p of productos) {
        await executeQuery(
            `INSERT INTO productos (codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra, unidad_consumo) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
             ON CONFLICT (codigo) DO NOTHING`,
            [p.codigo, p.descripcion, p.peso, p.valor_venta, p.marca, p.alto, p.largo, p.ancho, p.unidad_compra, p.unidad_consumo]
        );
    }
}

// Inicialización asíncrona principal expuesta al servidor
async function initDB() {
    await initTables();

    // Sembrar el usuario único por defecto
    try {
        const users = await executeQuery("SELECT username FROM usuarios WHERE username = 'admin'");
        if (users.length === 0) {
            const defaultHash = crypto.createHash('sha256').update('admin123').digest('hex');
            await executeQuery("INSERT INTO usuarios (username, password_hash, correo) VALUES ('admin', ?, 'admin@habitad-wms.com')", [defaultHash]);
            console.log("==================================================");
            console.log("🔑 USUARIO DE SEGURIDAD CREADO: admin / admin123");
            console.log("==================================================");
        }
        // Asegurar que el usuario admin existente tenga un correo establecido si está vacío
        await executeQuery("UPDATE usuarios SET correo = 'admin@habitad-wms.com' WHERE username = 'admin' AND (correo IS NULL OR correo = '')");
    } catch (err) {
        console.error("Error inicializando usuario administrador:", err);
    }
    try {
        const prods = await executeQuery('SELECT codigo FROM productos LIMIT 1');
        if (prods.length === 0) {
            await seedDatabase();
        }
    } catch (err) {
        console.error("Error sembrando base de datos:", err);
    }
}

// --- LOGICA DE VOLUMETRÍA ---

async function getVolumeOcupado(ubicacion) {
    const rows = await executeQuery(`
        SELECT m.codigo_producto, p.alto, p.largo, p.ancho,
               SUM(CASE WHEN m.tipo = 'IN' THEN m.cantidad ELSE -m.cantidad END) as stock
        FROM inventario_movimientos m
        JOIN productos p ON m.codigo_producto = p.codigo
        WHERE m.ubicacion = ?
        GROUP BY m.codigo_producto, p.alto, p.largo, p.ancho
    `, [ubicacion]);

    let totalVol = 0;
    for (const r of rows) {
        const stock = Number(r.stock || 0);
        if (stock > 0) {
            const alto = Number(r.alto || 0);
            const largo = Number(r.largo || 0);
            const ancho = Number(r.ancho || 0);
            totalVol += stock * alto * largo * ancho;
        }
    }
    return totalVol;
}

async function validarDimensionesYVolumen(codigo_producto, cantidad, ubicacion) {
    const prods = await executeQuery(`SELECT * FROM productos WHERE codigo = ?`, [codigo_producto]);
    const prod = prods[0];
    if (!prod) {
        throw new Error(`El producto con código "${codigo_producto}" no existe en el catálogo.`);
    }

    const pAlto = Number(prod.alto || 0);
    const pLargo = Number(prod.largo || 0);
    const pAncho = Number(prod.ancho || 0);

    if (pAlto > 200 || pLargo > 240 || pAncho > 120) {
        throw new Error(`El producto "${codigo_producto}" excede las dimensiones máximas permitidas de la estantería (alto: 2.0m, largo: 2.4m, ancho: 1.2m). Dimensiones del producto: alto ${pAlto / 100}m, largo ${pLargo / 100}m, ancho ${pAncho / 100}m.`);
    }

    const newVolume = cantidad * pAlto * pLargo * pAncho;
    const currentOccupied = await getVolumeOcupado(ubicacion);
    const maxVolume = 5760000; // 5.76 m³ en cm³

    if (currentOccupied + newVolume > maxVolume) {
        const currentM3 = (currentOccupied / 1000000).toFixed(2);
        const newM3 = (newVolume / 1000000).toFixed(2);
        const maxM3 = (maxVolume / 1000000).toFixed(2);
        throw new Error(`Capacidad volumétrica excedida en la ubicación ${ubicacion}. Ocupado actualmente: ${currentM3} m³, Nuevo a ingresar: ${newM3} m³, Límite de celda: ${maxM3} m³.`);
    }
}

// --- MÉTODOS DEL MÓDULO DB ---

module.exports = {
    initDB,

    // Clientes
    async getClientes() {
        return executeQuery('SELECT * FROM clientes ORDER BY nombre');
    },
    async createCliente(nit, nombre, telefono, direccion, correo) {
        await executeQuery(
            `INSERT INTO clientes (nit, nombre, telefono, direccion, correo) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT (nit) DO UPDATE SET 
                nombre = excluded.nombre, 
                telefono = excluded.telefono, 
                direccion = excluded.direccion, 
                correo = excluded.correo`,
            [nit, nombre, telefono, direccion, correo]
        );
        return { success: true };
    },

    // Proveedores
    async getProveedores() {
        return executeQuery('SELECT * FROM proveedores ORDER BY nombre');
    },
    async createProveedor(nit, nombre, telefono, direccion, correo) {
        await executeQuery(
            `INSERT INTO proveedores (nit, nombre, telefono, direccion, correo) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT (nit) DO UPDATE SET 
                nombre = excluded.nombre, 
                telefono = excluded.telefono, 
                direccion = excluded.direccion, 
                correo = excluded.correo`,
            [nit, nombre, telefono, direccion, correo]
        );
        return { success: true };
    },

    // Productos
    async getProductos() {
        return executeQuery('SELECT * FROM productos ORDER BY codigo');
    },
    async createProducto(codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra, unidad_consumo) {
        await executeQuery(
            `INSERT INTO productos (codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra, unidad_consumo) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
             ON CONFLICT (codigo) DO UPDATE SET 
                descripcion = excluded.descripcion, 
                peso = excluded.peso, 
                valor_venta = excluded.valor_venta, 
                marca = excluded.marca, 
                alto = excluded.alto, 
                largo = excluded.largo, 
                ancho = excluded.ancho, 
                unidad_compra = excluded.unidad_compra, 
                unidad_consumo = excluded.unidad_consumo`,
            [codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra || 'Und', unidad_consumo || 'Und']
        );
        return { success: true };
    },

    // Órdenes de Compra
    async getCompras() {
        const rows = await executeQuery(`
            SELECT oc.*, p.nombre as proveedor_nombre 
            FROM ordenes_compra oc
            LEFT JOIN proveedores p ON oc.proveedor_nit = p.nit
            ORDER BY oc.fecha DESC
        `);
        rows.forEach(r => {
            if (typeof r.items === 'string') {
                r.items = JSON.parse(r.items);
            }
        });
        return rows;
    },
    async createCompra(body) {
        await executeQuery(`
            INSERT INTO ordenes_compra 
            (consecutivo, fecha, proveedor_nit, observaciones, descuento, iva, retencion, condiciones_envio, forma_pago, fecha_envio, items) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (consecutivo) DO UPDATE SET 
                fecha = excluded.fecha,
                proveedor_nit = excluded.proveedor_nit,
                observaciones = excluded.observaciones,
                descuento = excluded.descuento,
                iva = excluded.iva,
                retencion = excluded.retencion,
                condiciones_envio = excluded.condiciones_envio,
                forma_pago = excluded.forma_pago,
                fecha_envio = excluded.fecha_envio,
                items = excluded.items
        `, [
            body.consecutivo,
            body.fecha,
            body.proveedor_nit,
            body.observaciones,
            body.descuento || 0,
            body.iva || 0,
            body.retencion || 0,
            body.condiciones_envio,
            body.forma_pago,
            body.fecha_envio,
            JSON.stringify(body.items)
        ]);
        return { success: true };
    },

    // Ventas / Remisiones
    async getVentas() {
        const rows = await executeQuery(`
            SELECT v.*, c.nombre as cliente_nombre 
            FROM ventas v
            LEFT JOIN clientes c ON v.cliente_nit = c.nit
            ORDER BY v.fecha DESC
        `);
        rows.forEach(r => {
            if (typeof r.items === 'string') {
                r.items = JSON.parse(r.items);
            }
        });
        return rows;
    },
    async createVenta(body) {
        // 1. Asegurar existencia del cliente en el maestro (si no existe, crearlo)
        if (body.cliente_nit) {
            const clientExists = await executeQuery('SELECT nit FROM clientes WHERE nit = ?', [body.cliente_nit]);
            if (clientExists.length === 0) {
                await executeQuery(`
                    INSERT INTO clientes (nit, nombre, telefono, direccion, correo)
                    VALUES (?, ?, 'N/A', ?, 'noreply@wms.com')
                    ON CONFLICT (nit) DO NOTHING
                `, [body.cliente_nit, body._cliente_nombre || body.cliente_nit, body.direccion || 'N/A']);
            }
        }

        // 2. Asegurar existencia de los productos en el catálogo
        if (body.items) {
            const items = typeof body.items === 'string' ? JSON.parse(body.items) : body.items;
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (item.codigo) {
                        const prodExists = await executeQuery('SELECT codigo FROM productos WHERE codigo = ?', [item.codigo]);
                        if (prodExists.length === 0) {
                            await executeQuery(`
                                INSERT INTO productos (codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra, unidad_consumo) 
                                VALUES (?, ?, 1.0, 100, 'GENERICA', 10.0, 10.0, 10.0, 'Und', 'Und')
                                ON CONFLICT (codigo) DO NOTHING
                            `, [item.codigo, item.descripcion || 'PRODUCTO NUEVO (AUTO-CREADO)']);
                        }
                    }
                }
            }
        }

        const n = v => (v === undefined || v === '') ? null : v;
        await executeQuery(`
            INSERT INTO ventas 
            (remision, fecha, cliente_nit, observaciones, iva, items, estado, direccion, ruta, placa) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (remision) DO UPDATE SET 
                fecha = excluded.fecha,
                cliente_nit = excluded.cliente_nit,
                observaciones = excluded.observaciones,
                iva = excluded.iva,
                items = excluded.items,
                estado = excluded.estado,
                direccion = excluded.direccion,
                ruta = excluded.ruta,
                placa = excluded.placa
        `, [
            body.remision,
            body.fecha,
            body.cliente_nit,
            n(body.observaciones),
            body.iva || 0,
            typeof body.items === 'string' ? body.items : JSON.stringify(body.items),
            body.estado || 'Pendiente',
            n(body.direccion),
            n(body.ruta),
            n(body.placa)
        ]);
        return { success: true };
    },

    // ponytail: highly optimized bulk import using pre-cached Maps to bypass per-row SELECT checks and single TRANSACTION block
    async createVentasBulk(ventasList) {
        // Pre-cargar productos y clientes existentes en Sets de memoria para búsquedas O(1)
        const productsRows = await executeQuery('SELECT codigo FROM productos');
        const existingProducts = new Set(productsRows.map(r => String(r.codigo).trim().toLowerCase()));

        const clientsRows = await executeQuery('SELECT nit FROM clientes');
        const existingClients = new Set(clientsRows.map(r => String(r.nit).trim().toLowerCase()));

        const runBulkQueries = async (queryExecutor) => {
            let count = 0;
            for (const venta of ventasList) {
                // Asegurar existencia del cliente en el maestro (si no existe, crearlo)
                if (venta.cliente_nit) {
                    const normNit = String(venta.cliente_nit).trim().toLowerCase();
                    if (!existingClients.has(normNit)) {
                        await queryExecutor(`
                            INSERT INTO clientes (nit, nombre, telefono, direccion, correo)
                            VALUES (?, ?, 'N/A', ?, 'noreply@wms.com')
                            ON CONFLICT (nit) DO NOTHING
                        `, [venta.cliente_nit, venta._cliente_nombre || venta.cliente_nit, venta._direccion || 'N/A']);
                        existingClients.add(normNit);
                    }
                }

                // Asegurar existencia de los productos en el catálogo
                if (venta.items) {
                    for (const item of venta.items) {
                        if (item.codigo) {
                            const normCode = String(item.codigo).trim().toLowerCase();
                            if (!existingProducts.has(normCode)) {
                                await queryExecutor(`
                                    INSERT INTO productos (codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra, unidad_consumo) 
                                    VALUES (?, ?, 1.0, 100, 'GENERICA', 10.0, 10.0, 10.0, 'Und', 'Und')
                                    ON CONFLICT (codigo) DO NOTHING
                                `, [item.codigo, item.descripcion || 'PRODUCTO NUEVO (AUTO-CREADO)']);
                                existingProducts.add(normCode);
                            }
                        }
                    }
                }

                const n = v => (v === undefined || v === '') ? null : v;
                await queryExecutor(`
                    INSERT INTO ventas 
                    (remision, fecha, cliente_nit, observaciones, iva, items, estado, direccion, ruta, placa) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (remision) DO UPDATE SET 
                        fecha = excluded.fecha,
                        cliente_nit = excluded.cliente_nit,
                        observaciones = excluded.observaciones,
                        iva = excluded.iva,
                        items = excluded.items,
                        estado = excluded.estado,
                        direccion = excluded.direccion,
                        ruta = excluded.ruta,
                        placa = excluded.placa
                `, [
                    venta.remision,
                    venta.fecha,
                    venta.cliente_nit,
                    n(venta.observaciones),
                    venta.iva || 0,
                    JSON.stringify(venta.items),
                    venta.estado || 'Pendiente',
                    n(venta._direccion || venta.direccion),
                    n(venta._ruta || venta.ruta),
                    n(venta._placa || venta.placa)
                ]);
                count++;
            }
            return { success: true, count };
        };

        if (isPostgres) {
            const client = await pgPool.connect();
            try {
                await client.query('BEGIN');
                const executor = async (sql, params = []) => {
                    let index = 1;
                    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
                    const res = await client.query(pgSql, params);
                    return res.rows;
                };
                const result = await runBulkQueries(executor);
                await client.query('COMMIT');
                return result;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } else {
            sqliteDb.exec('BEGIN');
            try {
                const executor = async (sql, params = []) => {
                    const stmt = sqliteDb.prepare(sql);
                    const trimmedSql = sql.trim().toUpperCase();
                    if (trimmedSql.startsWith('SELECT')) {
                        return stmt.all(...params);
                    } else {
                        const res = stmt.run(...params);
                        return { success: true, changes: res.changes, lastInsertRowid: res.lastInsertRowid };
                    }
                };
                const result = await runBulkQueries(executor);
                sqliteDb.exec('COMMIT');
                return result;
            } catch (e) {
                sqliteDb.exec('ROLLBACK');
                throw e;
            }
        }
    },

    // Consolidado Diario
    async getConsolidado(fecha) {
        const rows = await executeQuery(`
            SELECT v.remision, v.fecha, v.estado, c.nombre as cliente_nombre, v.items
            FROM ventas v
            LEFT JOIN clientes c ON v.cliente_nit = c.nit
            WHERE v.fecha = ?
            ORDER BY v.remision ASC
        `, [fecha]);

        return rows.map(row => {
            const items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
            const totalUnidades = items.reduce((sum, item) => sum + Number(item.cantidad), 0);
            return {
                remision: row.remision,
                fecha: row.fecha,
                estado: row.estado,
                cliente_nombre: row.cliente_nombre,
                total_items: items.length,
                total_unidades: totalUnidades
            };
        });
    },

    // Picking / Alistamiento Detalle
    async getPicking(remision) {
        const ventas = await executeQuery(`
            SELECT v.*, c.nombre as cliente_nombre 
            FROM ventas v 
            LEFT JOIN clientes c ON v.cliente_nit = c.nit
            WHERE v.remision = ?
        `, [remision]);

        const venta = ventas[0];
        if (!venta) {
            throw new Error('No se encontró la factura/remisión especificada.');
        }

        const items = typeof venta.items === 'string' ? JSON.parse(venta.items) : venta.items;
        const pickingDetails = [];

        for (const item of items) {
            // Obtener stock actual detallado por ubicación
            const stockUbicaciones = await executeQuery(`
                SELECT ubicacion, SUM(CASE WHEN tipo = 'IN' THEN cantidad ELSE -cantidad END) as stock
                FROM inventario_movimientos
                WHERE codigo_producto = ?
                GROUP BY ubicacion
                HAVING SUM(CASE WHEN tipo = 'IN' THEN cantidad ELSE -cantidad END) > 0
            `, [item.codigo]);

            // Filtrar stock en zonas auxiliares (posición termina en 10 o 14)
            const stockAux = stockUbicaciones
                .filter(u => {
                    const pos = u.ubicacion.substring(5, 7);
                    return pos === '10' || pos === '14';
                })
                .reduce((sum, u) => sum + Number(u.stock), 0);

            // Filtrar stock en zona alta (posiciones >= 20)
            const stockAlta = stockUbicaciones
                .filter(u => {
                    const pos = parseInt(u.ubicacion.substring(5, 7), 10);
                    return pos >= 20;
                })
                .reduce((sum, u) => sum + Number(u.stock), 0);

            const totalDisponible = stockUbicaciones.reduce((sum, u) => sum + Number(u.stock), 0);

            pickingDetails.push({
                codigo: item.codigo,
                descripcion: item.descripcion,
                cantidad_solicitada: item.cantidad,
                total_disponible: totalDisponible,
                stock_auxiliar: stockAux,
                stock_alta: stockAlta,
                ubicaciones: stockUbicaciones.map(u => ({
                    ubicacion: u.ubicacion,
                    stock: Number(u.stock)
                }))
            });
        }

        return {
            remision: venta.remision,
            fecha: venta.fecha,
            cliente_nombre: venta.cliente_nombre,
            estado: venta.estado,
            auxiliar: venta.auxiliar || '',
            items: pickingDetails
        };
    },

    // Confirmar picking
    async confirmarPicking(remision, itemsDespachados, auxiliar) {
        const fechaActual = new Date().toISOString().split('T')[0];

        for (const item of itemsDespachados) {
            if (item.cantidad > 0) {
                // Registrar movimiento OUT
                await executeQuery(`
                    INSERT INTO inventario_movimientos (codigo_producto, tipo, documento_referencia, fecha, cantidad, ubicacion)
                    VALUES (?, 'OUT', ?, ?, ?, ?)
                `, [
                    item.codigo,
                    remision,
                    fechaActual,
                    item.cantidad,
                    item.ubicacion
                ]);
            }
        }

        await executeQuery(`UPDATE ventas SET estado = 'Completado', auxiliar = ? WHERE remision = ?`, [auxiliar || '', remision]);

        return { success: true };
    },

    // Historial Movimientos Referencia
    async getMovimientosReferencia(referencia) {
        return executeQuery("SELECT * FROM inventario_movimientos WHERE documento_referencia LIKE ?", [referencia + '%']);
    },

    // Movimientos de inventario generales
    async getMovimientos() {
        return executeQuery('SELECT * FROM inventario_movimientos ORDER BY id DESC LIMIT 500');
    },
    async createMovimiento(body) {
        if (body.tipo === 'IN') {
            await validarDimensionesYVolumen(body.codigo_producto, body.cantidad, body.ubicacion);
        }

        await executeQuery(`
            INSERT INTO inventario_movimientos 
            (codigo_producto, tipo, documento_referencia, fecha, cantidad, ubicacion) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            body.codigo_producto,
            body.tipo,
            body.documento_referencia,
            body.fecha,
            body.cantidad,
            body.ubicacion
        ]);
        return { success: true };
    },

    // Stock consolidado
    async getStockGlobal() {
        const rows = await executeQuery(`
            SELECT p.codigo, p.descripcion, p.marca, p.peso,
                   SUM(CASE WHEN m.tipo = 'IN' THEN m.cantidad ELSE -m.cantidad END) as stock_total
            FROM productos p
            LEFT JOIN inventario_movimientos m ON p.codigo = m.codigo_producto
            GROUP BY p.codigo, p.descripcion, p.marca, p.peso
        `);
        rows.forEach(row => {
            row.stock_total = Number(row.stock_total || 0);
        });
        return rows;
    },

    async getStockUbicaciones() {
        return executeQuery(`
            SELECT codigo_producto, ubicacion, SUM(CASE WHEN tipo = 'IN' THEN cantidad ELSE -cantidad END) as stock
            FROM inventario_movimientos
            GROUP BY codigo_producto, ubicacion
            HAVING SUM(CASE WHEN tipo = 'IN' THEN cantidad ELSE -cantidad END) > 0
        `);
    },

    async getStockDetalle(codigo) {
        return executeQuery(`
            SELECT ubicacion, SUM(CASE WHEN tipo = 'IN' THEN cantidad ELSE -cantidad END) as stock
            FROM inventario_movimientos
            WHERE codigo_producto = ?
            GROUP BY ubicacion
            HAVING SUM(CASE WHEN tipo = 'IN' THEN cantidad ELSE -cantidad END) > 0
            ORDER BY ubicacion ASC
        `, [codigo]);
    },

    // Obtener stock en auxiliar (10/14) de un producto
    async getStockAuxiliar(codigo) {
        const rows = await executeQuery(`
            SELECT SUM(CASE WHEN tipo = 'IN' THEN cantidad ELSE -cantidad END) as stock_auxiliar
            FROM inventario_movimientos
            WHERE codigo_producto = ? AND (ubicacion LIKE '%10' OR ubicacion LIKE '%14')
        `, [codigo]);
        return Number(rows[0]?.stock_auxiliar || 0);
    },

    // Carga Masiva Inventario General (Ciego)
    async saveInventarioGeneral(items) {
        const fechaActual = new Date().toISOString().split('T')[0];

        // 1. Limpiar todos los movimientos de inventario actuales
        await executeQuery('DELETE FROM inventario_movimientos');

        // 2. Insertar cada item
        for (const item of items) {
            const { codigo, ubicacion, cantidad } = item;
            if (!codigo || !ubicacion || isNaN(cantidad) || cantidad <= 0) {
                continue;
            }

            // Validar si el producto existe, sino crearlo (Carga Ciega)
            const prodExists = await executeQuery('SELECT codigo FROM productos WHERE codigo = ?', [codigo]);
            if (prodExists.length === 0) {
                await executeQuery(`
                    INSERT INTO productos (codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra, unidad_consumo) 
                    VALUES (?, 'PRODUCTO NUEVO (CARGA CIEGA)', 1.0, 100, 'GENERICA', 10.0, 10.0, 10.0, 'Und', 'Und')
                `, [codigo]);
            }

            // Validar volumen de la posición
            await validarDimensionesYVolumen(codigo, cantidad, ubicacion);

            // Registrar movimiento IN
            await executeQuery(`
                INSERT INTO inventario_movimientos (codigo_producto, tipo, documento_referencia, fecha, cantidad, ubicacion)
                VALUES (?, 'IN', 'INVENTARIO GENERAL', ?, ?, ?)
            `, [codigo, fechaActual, cantidad, ubicacion]);
        }

        return { success: true };
    },

    // Descenso Montacargas (Priorizado por rack alto DESC y nivel DESC)
    async ejecutarDescenso(codigo, cantidad) {
        const fechaActual = new Date().toISOString().split('T')[0];

        // 1. Buscar todas las ubicaciones con stock de este producto
        const stockUbicaciones = await executeQuery(`
            SELECT ubicacion, SUM(CASE WHEN tipo = 'IN' THEN cantidad ELSE -cantidad END) as stock
            FROM inventario_movimientos
            WHERE codigo_producto = ?
            GROUP BY ubicacion
            HAVING SUM(CASE WHEN tipo = 'IN' THEN cantidad ELSE -cantidad END) > 0
        `, [codigo]);

        // 2. Filtrar rack alto (pos >= 20)
        const ubicacionesAltas = stockUbicaciones.filter(u => {
            const pos = parseInt(u.ubicacion.substring(5, 7), 10);
            return pos >= 20;
        });

        if (ubicacionesAltas.length === 0) {
            throw new Error(`No hay stock disponible en estantería alta (posición >= 20) para el producto "${codigo}".`);
        }

        // 3. Ordenar por nivel descendente (altura de rack de 40 a 01) y pos descendente (prioridad física)
        ubicacionesAltas.sort((a, b) => {
            const lvlA = parseInt(a.ubicacion.substring(3, 5), 10);
            const lvlB = parseInt(b.ubicacion.substring(3, 5), 10);
            if (lvlB !== lvlA) return lvlB - lvlA;

            const posA = parseInt(a.ubicacion.substring(5, 7), 10);
            const posB = parseInt(b.ubicacion.substring(5, 7), 10);
            return posB - posA;
        });

        // 4. Consumir el stock requerido
        let restante = cantidad;
        const movimientosARegistrar = [];

        for (const u of ubicacionesAltas) {
            if (restante <= 0) break;

            const disponible = Number(u.stock);
            const aTomar = Math.min(restante, disponible);

            // Obtener el vano de origen
            const vano = u.ubicacion.substring(1, 3);
            const targetLowUbi = `V${vano}0110`; // Vano actual, nivel 01, posición picking 10

            // Preparar movimiento OUT de la ubicación alta
            movimientosARegistrar.push({
                codigo_producto: codigo,
                tipo: 'OUT',
                documento_referencia: 'DESCENSO MONTACARGAS',
                fecha: fechaActual,
                cantidad: aTomar,
                ubicacion: u.ubicacion
            });

            // Preparar movimiento IN a la ubicación baja
            movimientosARegistrar.push({
                codigo_producto: codigo,
                tipo: 'IN',
                documento_referencia: 'DESCENSO MONTACARGAS',
                fecha: fechaActual,
                cantidad: aTomar,
                ubicacion: targetLowUbi
            });

            restante -= aTomar;
        }

        if (restante > 0) {
            throw new Error(`Stock insuficiente en estantería alta. Falta bajar ${restante} unidades.`);
        }

        // 5. Validar volumetría en el destino antes de guardar nada (transaccionalidad manual)
        const consolidadoDestino = {};
        for (const mov of movimientosARegistrar) {
            if (mov.tipo === 'IN') {
                consolidadoDestino[mov.ubicacion] = (consolidadoDestino[mov.ubicacion] || 0) + mov.cantidad;
            }
        }

        for (const [ubicacion, qty] of Object.entries(consolidadoDestino)) {
            await validarDimensionesYVolumen(codigo, qty, ubicacion);
        }

        // 6. Insertar movimientos en la base de datos
        for (const mov of movimientosARegistrar) {
            await executeQuery(`
                INSERT INTO inventario_movimientos (codigo_producto, tipo, documento_referencia, fecha, cantidad, ubicacion)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                mov.codigo_producto,
                mov.tipo,
                mov.documento_referencia,
                mov.fecha,
                mov.cantidad,
                mov.ubicacion
            ]);
        }

        return { success: true, movimientos: movimientosARegistrar };
    },

    // --- REGULARIZACIÓN DE INVENTARIO ---

    // Listado de conteo para zona Picking (posición < 20, stock neto > 0)
    async getRegularizacionPicking() {
        const rows = await executeQuery(`
            SELECT m.codigo_producto AS codigo,
                   p.descripcion AS descripcion,
                   m.ubicacion AS ubicacion,
                   SUM(CASE WHEN m.tipo = 'IN' THEN m.cantidad ELSE -m.cantidad END) AS cantidad_sistema
            FROM inventario_movimientos m
            JOIN productos p ON m.codigo_producto = p.codigo
            WHERE CAST(SUBSTR(m.ubicacion, 6, 2) AS INTEGER) < 20
            GROUP BY m.codigo_producto, p.descripcion, m.ubicacion
            HAVING SUM(CASE WHEN m.tipo = 'IN' THEN m.cantidad ELSE -m.cantidad END) > 0
            ORDER BY m.ubicacion ASC, m.codigo_producto ASC
        `);
        rows.forEach(row => {
            row.cantidad_sistema = Number(row.cantidad_sistema || 0);
        });
        return rows;
    },

    // Listado de conteo para zona Montacarguista (posición >= 20, stock neto > 0)
    async getRegularizacionMontacarguista() {
        const rows = await executeQuery(`
            SELECT m.codigo_producto AS codigo,
                   p.descripcion AS descripcion,
                   m.ubicacion AS ubicacion,
                   SUM(CASE WHEN m.tipo = 'IN' THEN m.cantidad ELSE -m.cantidad END) AS cantidad_sistema
            FROM inventario_movimientos m
            JOIN productos p ON m.codigo_producto = p.codigo
            WHERE CAST(SUBSTR(m.ubicacion, 6, 2) AS INTEGER) >= 20
            GROUP BY m.codigo_producto, p.descripcion, m.ubicacion
            HAVING SUM(CASE WHEN m.tipo = 'IN' THEN m.cantidad ELSE -m.cantidad END) > 0
            ORDER BY m.ubicacion ASC
        `);
        rows.forEach(row => {
            row.cantidad_sistema = Number(row.cantidad_sistema || 0);
        });
        return rows;
    },

    // Aplicar ajustes de regularización (ronda final) de forma transaccional.
    // Inserta un movimiento de ajuste por cada ítem con diferencia distinta de cero:
    //   - tipo 'IN' si la diferencia es positiva (faltaba stock en el sistema)
    //   - tipo 'OUT' si la diferencia es negativa (sobraba stock en el sistema)
    //   - documento_referencia con formato REG-YYYY-MM-DD-{ZONA}
    // Si cualquier inserción falla, se revierten todas (atomicidad).
    async aplicarAjusteRegularizacion(ajustes, zona) {
        // Permitir recibir el payload completo { zona, ajustes }
        if (ajustes && !Array.isArray(ajustes) && Array.isArray(ajustes.ajustes)) {
            zona = zona != null ? zona : ajustes.zona;
            ajustes = ajustes.ajustes;
        }

        const listaAjustes = Array.isArray(ajustes) ? ajustes : [];
        const fechaActual = new Date().toISOString().split('T')[0];
        const zonaRef = String(zona || '').trim().toUpperCase() || 'GENERAL';
        const documentoReferencia = `REG-${fechaActual}-${zonaRef}`;

        // Construir la lista de movimientos a registrar (solo diferencias != 0)
        const movimientos = [];
        const resumen = [];
        for (const aj of listaAjustes) {
            const codigo = aj.codigo_producto != null ? aj.codigo_producto : aj.codigo;
            const cantidadSistema = Number(aj.cantidad_sistema || 0);
            const cantidadContada = Number(aj.cantidad_contada || 0);
            const diferencia = aj.diferencia != null ? Number(aj.diferencia) : (cantidadContada - cantidadSistema);

            if (!codigo || !aj.ubicacion || isNaN(diferencia) || diferencia === 0) {
                continue;
            }

            movimientos.push({
                codigo_producto: codigo,
                tipo: diferencia > 0 ? 'IN' : 'OUT',
                cantidad: Math.abs(diferencia),
                ubicacion: aj.ubicacion
            });
            resumen.push({
                codigo_producto: codigo,
                ubicacion: aj.ubicacion,
                cantidad_anterior: cantidadSistema,
                cantidad_nueva: cantidadContada,
                diferencia
            });
        }

        if (movimientos.length === 0) {
            return { success: true, ajustes_aplicados: 0, documento_referencia: documentoReferencia, resumen: [] };
        }

        const insertSql = `
            INSERT INTO inventario_movimientos (codigo_producto, tipo, documento_referencia, fecha, cantidad, ubicacion)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        if (isPostgres) {
            // Transacción explícita sobre un único cliente del pool
            const client = await pgPool.connect();
            try {
                await client.query('BEGIN');
                for (const mov of movimientos) {
                    let index = 1;
                    const pgSql = insertSql.replace(/\?/g, () => `$${index++}`);
                    await client.query(pgSql, [
                        mov.codigo_producto,
                        mov.tipo,
                        documentoReferencia,
                        fechaActual,
                        mov.cantidad,
                        mov.ubicacion
                    ]);
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } else {
            // Transacción explícita en SQLite sobre la misma conexión
            sqliteDb.exec('BEGIN');
            try {
                for (const mov of movimientos) {
                    const stmt = sqliteDb.prepare(insertSql);
                    stmt.run(
                        mov.codigo_producto,
                        mov.tipo,
                        documentoReferencia,
                        fechaActual,
                        mov.cantidad,
                        mov.ubicacion
                    );
                }
                sqliteDb.exec('COMMIT');
            } catch (e) {
                sqliteDb.exec('ROLLBACK');
                throw e;
            }
        }

        return {
            success: true,
            ajustes_aplicados: movimientos.length,
            documento_referencia: documentoReferencia,
            resumen
        };
    },
    // Métodos de Seguridad y Autenticación
    async authenticateUser(username, password) {
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        const rows = await executeQuery("SELECT username FROM usuarios WHERE username = ? AND password_hash = ?", [username, hash]);
        return rows.length > 0;
    },

    async generateOTP(username) {
        const rows = await executeQuery("SELECT correo FROM usuarios WHERE username = ?", [username]);
        if (rows.length === 0) {
            throw new Error("Usuario no encontrado.");
        }
        const correo = rows[0].correo;
        if (!correo) {
            throw new Error("El usuario no tiene un correo electrónico configurado.");
        }
        // Generar un número aleatorio de 6 dígitos
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = Date.now() + 10 * 60 * 1000; // 10 minutos de expiración
        await executeQuery("UPDATE usuarios SET otp = ?, otp_expiry = ? WHERE username = ?", [otp, expiry, username]);
        return { otp, correo };
    },

    async verifyOTPAndResetPassword(username, otp, newPassword) {
        const rows = await executeQuery("SELECT otp, otp_expiry FROM usuarios WHERE username = ?", [username]);
        if (rows.length === 0) {
            throw new Error("Usuario no encontrado.");
        }
        const user = rows[0];
        if (!user.otp || user.otp !== otp) {
            throw new Error("El código OTP proporcionado es incorrecto.");
        }
        if (Date.now() > Number(user.otp_expiry)) {
            throw new Error("El código OTP ha expirado.");
        }
        const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
        await executeQuery("UPDATE usuarios SET password_hash = ?, otp = NULL, otp_expiry = NULL WHERE username = ?", [newHash, username]);
        return true;
    },

    // --- DEVOLUCIONES DE MERCANCÍA ---
    async getDevoluciones() {
        const rows = await executeQuery(`
            SELECT d.*, c.nombre as cliente_nombre 
            FROM devoluciones d
            LEFT JOIN clientes c ON d.cliente_nit = c.nit
            ORDER BY d.id DESC
        `);
        rows.forEach(r => {
            if (typeof r.items === 'string') {
                r.items = JSON.parse(r.items);
            }
            if (typeof r.fotos === 'string') {
                r.fotos = JSON.parse(r.fotos);
            }
        });
        return rows;
    },

    async getDevolucionById(id) {
        const rows = await executeQuery(`
            SELECT d.*, c.nombre as cliente_nombre 
            FROM devoluciones d
            LEFT JOIN clientes c ON d.cliente_nit = c.nit
            WHERE d.id = ?
        `, [id]);
        const row = rows[0];
        if (row) {
            if (typeof row.items === 'string') {
                row.items = JSON.parse(row.items);
            }
            if (typeof row.fotos === 'string') {
                row.fotos = JSON.parse(row.fotos);
            }
        }
        return row;
    },

    async createDevolucion(body) {
        const fechaActual = new Date().toISOString().split('T')[0];
        const params = [
            body.cliente_nit,
            body.factura,
            body.ciudad,
            body.almacen,
            body.fecha,
            body.ruta,
            body.placa,
            JSON.stringify(body.items),
            body.observaciones,
            body.estado_producto,
            body.firma_responsable,
            body.firma_transportador,
            body.nombre_transportador,
            body.firma_cliente,
            fechaActual,
            JSON.stringify(body.fotos || [])
        ];

        let insertId = null;
        if (isPostgres) {
            const res = await executeQuery(`
                INSERT INTO devoluciones (
                    cliente_nit, factura, ciudad, almacen, fecha, ruta, placa, 
                    items, observaciones, estado_producto, 
                    firma_responsable, firma_transportador, nombre_transportador, firma_cliente, 
                    fecha_registro, fotos
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            `, params);
            insertId = res[0]?.id;
        } else {
            const res = await executeQuery(`
                INSERT INTO devoluciones (
                    cliente_nit, factura, ciudad, almacen, fecha, ruta, placa, 
                    items, observaciones, estado_producto, 
                    firma_responsable, firma_transportador, nombre_transportador, firma_cliente, 
                    fecha_registro, fotos
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, params);
            insertId = res.lastInsertRowid;
        }

        // Procesar movimientos de inventario si el destino es Reintegro
        for (const item of body.items) {
            if (item.destino === 'Reintegro') {
                const unitsPerBox = Number(item.unidades_por_caja || 1);
                const totalUnits = Number(item.unidades || 0) + (Number(item.cajas || 0) * unitsPerBox);
                
                if (totalUnits > 0) {
                    // Si el producto no existe en el catálogo, crearlo como temporal/nuevo para prevenir errores
                    const prodExists = await executeQuery('SELECT codigo FROM productos WHERE codigo = ?', [item.codigo]);
                    if (prodExists.length === 0) {
                        await executeQuery(`
                            INSERT INTO productos (codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra, unidad_consumo) 
                            VALUES (?, ?, 1.0, 100, 'GENERICA', 10.0, 10.0, 10.0, 'Und', 'Und')
                        `, [item.codigo, item.descripcion || 'PRODUCTO DEVOLUCION (NUEVO)']);
                    }

                    // Validar volumen en la posición destino antes del movimiento
                    await validarDimensionesYVolumen(item.codigo, totalUnits, item.ubicacion || 'V010110');

                    // Registrar movimiento IN
                    await executeQuery(`
                        INSERT INTO inventario_movimientos (codigo_producto, tipo, documento_referencia, fecha, cantidad, ubicacion)
                        VALUES (?, 'IN', ?, ?, ?, ?)
                    `, [
                        item.codigo,
                        `DEV-${insertId || 'TEMP'}`,
                        body.fecha || fechaActual,
                        totalUnits,
                        item.ubicacion || 'V010110'
                    ]);
                }
            }
        }

        return { success: true, id: insertId };
    },

    // ponytail: mark item as delivered to client, no inventory movement
    async marcarSalidaDevolucionItem(id, codigo_producto, itemIndex) {
        const dev = await this.getDevolucionById(id);
        if (!dev) throw new Error(`Devolución ${id} no encontrada`);

        const items = Array.isArray(dev.items) ? dev.items : JSON.parse(dev.items);
        const idx = Number(itemIndex);
        if (idx < 0 || idx >= items.length) throw new Error('Índice de ítem fuera de rango');

        const item = items[idx];
        if (item.codigo !== codigo_producto) throw new Error('Código de producto no coincide');
        if (item.destino !== 'Devolución a Cliente') throw new Error('Destino incorrecto');

        item.salida_registrada = true;
        item.fecha_salida = new Date().toISOString().split('T')[0];

        await executeQuery('UPDATE devoluciones SET items = ? WHERE id = ?', [JSON.stringify(items), id]);
        return { success: true };
    },

    // ponytail: highly optimized bulk import using pre-cached Maps to bypass per-row SELECT checks and single TRANSACTION block
    async createDevolucionesBulk(devolucionesList) {
        const fechaActual = new Date().toISOString().split('T')[0];

        // 1. Pre-cargar productos y clientes existentes en Sets de memoria para búsquedas O(1)
        const productsRows = await executeQuery('SELECT codigo FROM productos');
        const existingProducts = new Set(productsRows.map(r => String(r.codigo).trim().toLowerCase()));

        const clientsRows = await executeQuery('SELECT nit FROM clientes');
        const existingClients = new Set(clientsRows.map(r => String(r.nit).trim().toLowerCase()));

        const runBulkQueries = async (queryExecutor) => {
            let count = 0;
            for (const dev of devolucionesList) {
                // Asegurar existencia del cliente en el maestro (si no existe, crearlo)
                if (dev.cliente_nit) {
                    const normNit = String(dev.cliente_nit).trim().toLowerCase();
                    if (!existingClients.has(normNit)) {
                        await queryExecutor(`
                            INSERT INTO clientes (nit, nombre, telefono, direccion, correo)
                            VALUES (?, ?, 'N/A', ?, 'noreply@habitad-wms.com')
                            ON CONFLICT (nit) DO NOTHING
                        `, [dev.cliente_nit, dev.cliente_nombre || dev.cliente_nit, dev.observaciones || 'Importación Masiva']);
                        existingClients.add(normNit);
                    }
                }

                // Insertar devolución principal — normalizar undefined → null para SQLite
                const n = v => (v === undefined || v === '') ? null : v;
                const devParams = [
                    n(dev.cliente_nit),
                    n(dev.factura),
                    n(dev.ciudad),
                    n(dev.almacen),
                    n(dev.fecha),
                    n(dev.ruta),
                    n(dev.placa),
                    JSON.stringify(dev.items),
                    n(dev.observaciones),
                    n(dev.estado_producto),
                    n(dev.firma_responsable),
                    n(dev.firma_transportador),
                    n(dev.nombre_transportador),
                    n(dev.firma_cliente),
                    fechaActual,
                    JSON.stringify(dev.fotos || [])
                ];

                let devId = null;
                const insertSql = `
                    INSERT INTO devoluciones (
                        cliente_nit, factura, ciudad, almacen, fecha, ruta, placa, 
                        items, observaciones, estado_producto, 
                        firma_responsable, firma_transportador, nombre_transportador, firma_cliente, 
                        fecha_registro, fotos
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                if (isPostgres) {
                    const res = await queryExecutor(insertSql + ' RETURNING id', devParams);
                    devId = res[0]?.id;
                } else {
                    const res = await queryExecutor(insertSql, devParams);
                    devId = res.lastInsertRowid;
                }

                // Procesar ítems para reintegro de stock
                for (const item of dev.items) {
                    if (item.destino === 'Reintegro') {
                        const unitsPerBox = Number(item.unidades_por_caja || 1);
                        const totalUnits = Number(item.unidades || 0) + (Number(item.cajas || 0) * unitsPerBox);

                        if (totalUnits > 0) {
                            const normCode = String(item.codigo).trim().toLowerCase();
                            // Asegurar existencia del producto en el catálogo
                            if (!existingProducts.has(normCode)) {
                                await queryExecutor(`
                                    INSERT INTO productos (codigo, descripcion, peso, valor_venta, marca, alto, largo, ancho, unidad_compra, unidad_consumo) 
                                    VALUES (?, ?, 1.0, 100, 'GENERICA', 10.0, 10.0, 10.0, 'Und', 'Und')
                                    ON CONFLICT (codigo) DO NOTHING
                                `, [item.codigo, item.descripcion || 'PRODUCTO DEVOLUCION (NUEVO)']);
                                existingProducts.add(normCode);
                            }

                            // Nota: Bypasseamos 'validarDimensionesYVolumen' en la carga masiva para evitar reventar la base de datos/memoria.
                            // Esto se ajusta al requerimiento de "no filtre nada".

                            // Registrar movimiento IN
                            await queryExecutor(`
                                INSERT INTO inventario_movimientos (codigo_producto, tipo, documento_referencia, fecha, cantidad, ubicacion)
                                VALUES (?, 'IN', ?, ?, ?, ?)
                            `, [
                                item.codigo,
                                `DEV-${devId || 'TEMP'}`,
                                dev.fecha || fechaActual,
                                totalUnits,
                                item.ubicacion || 'V010110'
                            ]);
                        }
                    }
                }
                count++;
            }
            return { success: true, count };
        };

        if (isPostgres) {
            const client = await pgPool.connect();
            try {
                await client.query('BEGIN');
                const executor = async (sql, params = []) => {
                    let index = 1;
                    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
                    const res = await client.query(pgSql, params);
                    return res.rows;
                };
                const result = await runBulkQueries(executor);
                await client.query('COMMIT');
                return result;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } else {
            sqliteDb.exec('BEGIN');
            try {
                const executor = async (sql, params = []) => {
                    const stmt = sqliteDb.prepare(sql);
                    const trimmedSql = sql.trim().toUpperCase();
                    if (trimmedSql.startsWith('SELECT')) {
                        return stmt.all(...params);
                    } else {
                        const res = stmt.run(...params);
                        return { success: true, changes: res.changes, lastInsertRowid: res.lastInsertRowid };
                    }
                };
                const result = await runBulkQueries(executor);
                sqliteDb.exec('COMMIT');
                return result;
            } catch (e) {
                sqliteDb.exec('ROLLBACK');
                throw e;
            }
        }
    }

};

