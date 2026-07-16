const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const db = require('./db.js');
const nodemailer = require('nodemailer');

// Configuración de nodemailer a través de variables de entorno
const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
let transporter = null;

if (smtpConfigured) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true', // true para 465, false para otros puertos
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    console.log("HABITAD WMS: Transportador SMTP de correo electrónico configurado.");
} else {
    console.log("HABITAD WMS: SMTP no configurado. Se usará el modo simulación de correos por consola.");
}

async function sendOTPEmail(email, username, otp) {
    const fromName = process.env.SMTP_FROM_NAME || 'Habitad WMS';
    const fromEmail = process.env.SMTP_FROM || 'no-reply@habitad-wms.com';
    const subject = '🔐 Código de seguridad OTP - Restablecer contraseña';
    
    const htmlBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1a202c;">
            <div style="text-align: center; border-bottom: 2px solid #3182ce; padding-bottom: 20px; margin-bottom: 20px;">
                <h2 style="color: #2b6cb0; margin: 0;">Habitad WMS</h2>
                <span style="font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 1px;">Sistema de Gestión de Almacenes</span>
            </div>
            
            <p style="font-size: 16px; line-height: 1.6;">Estimado <strong>${username}</strong>,</p>
            
            <p style="font-size: 15px; line-height: 1.6; color: #4a5568;">
                Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en el sistema Habitad WMS. 
                Utiliza el siguiente código de verificación temporal de un solo uso (OTP):
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; padding: 15px 30px; background-color: #ebf8ff; border: 1px dashed #3182ce; border-radius: 6px; font-size: 32px; font-weight: bold; color: #2b6cb0; letter-spacing: 5px;">
                    ${otp}
                </div>
            </div>
            
            <p style="font-size: 14px; line-height: 1.5; color: #e53e3e; font-weight: 500;">
                ⚠️ Este código tiene una validez de 10 minutos y expirará automáticamente. 
                Si no has solicitado este restablecimiento, puedes ignorar este correo de forma segura.
            </p>
            
            <div style="margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 20px; font-size: 12px; color: #a0aec0; text-align: center;">
                Este es un mensaje generado automáticamente, por favor no respondas a esta dirección de correo.<br>
                &copy; ${new Date().getFullYear()} Habitad WMS. Todos los derechos reservados.
            </div>
        </div>
    `;

    const textBody = `Habitad WMS - Solicitud de Restablecimiento de Contraseña\n\nEstimado ${username},\n\nHemos recibido una solicitud para restablecer tu contraseña. Tu código OTP temporal es:\n\n${otp}\n\nEste código expira en 10 minutos.\n\nSi no realizaste esta solicitud, por favor ignora este correo.`;

    if (smtpConfigured && transporter) {
        await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: email,
            subject: subject,
            text: textBody,
            html: htmlBody
        });
        return { realSent: true, recipient: email };
    } else {
        // Modo Simulación / Consola destacado
        console.log("\n==================================================");
        console.log("📨 SIMULACIÓN DE ENVÍO DE CORREO (SMTP NO CONFIGURADO) 📨");
        console.log(`De: "${fromName}" <${fromEmail}>`);
        console.log(`Para: ${email}`);
        console.log(`Asunto: ${subject}`);
        console.log("---------------- CONTENIDO HTML ----------------");
        console.log(`Código OTP: ${otp}`);
        console.log(`Expiración: 10 minutos`);
        console.log("==================================================\n");
        return { realSent: false, recipient: email };
    }
}

const activeSessions = new Set();
function isAuthorized(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return false;
    const token = authHeader.split(' ')[1];
    return activeSessions.has(token);
}



// ponytail: use Buffer chunks instead of string concat to handle large payloads (e.g., 10MB+ excel bulk imports)
const MAX_BODY_SIZE = 100 * 1024 * 1024; // 100MB safety limit
async function getRequestBody(req) {
    const chunks = [];
    let totalSize = 0;
    for await (const chunk of req) {
        totalSize += chunk.length;
        if (totalSize > MAX_BODY_SIZE) {
            req.destroy();
            throw new Error('Payload demasiado grande (>100MB). Divida el archivo en partes más pequeñas.');
        }
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) return {};
    const fullBody = Buffer.concat(chunks).toString('utf8');
    return fullBody ? JSON.parse(fullBody) : {};
}

function sendJSON(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// Mapeo estructurado de rutas API (método + endpoint) a controladores asíncronos
const apiRoutes = {
    // AUTENTICACIÓN
    'POST /api/auth/login': async (req, res) => {
        const body = await getRequestBody(req);
        const { username, password } = body;
        if (!username || !password) {
            return sendJSON(res, 400, { error: 'Usuario y contraseña requeridos' });
        }
        const success = await db.authenticateUser(username, password);
        if (success) {
            const token = require('crypto').randomBytes(24).toString('hex');
            activeSessions.add(token);
            return sendJSON(res, 200, { success: true, token });
        } else {
            return sendJSON(res, 401, { error: 'Credenciales inválidas' });
        }
    },

    'POST /api/auth/logout': async (req, res) => {
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            const token = authHeader.split(' ')[1];

            activeSessions.delete(token)
        }
        return sendJSON(res, 200, { success: true, message: 'Cierre de sesion exitoso' });
    },

    'POST /api/auth/otp-request': async (req, res) => {
        const body = await getRequestBody(req);
        const { username } = body;
        if (!username) {
            return sendJSON(res, 400, { error: 'El nombre de usuario es requerido' });
        }
        try {
            const { otp, correo } = await db.generateOTP(username);

            // Enviar correo (real o simulado)
            const sendResult = await sendOTPEmail(correo, username, otp);

            let message = '';
            if (sendResult.realSent) {
                message = `Código OTP enviado exitosamente al correo registrado (${correo}).`;
            } else {
                message = `Código OTP generado (Simulado). Revisa la consola del servidor. Enviado a: ${correo}`;
            }

            return sendJSON(res, 200, { success: true, message });
        } catch (err) {
            return sendJSON(res, 500, { error: err.message });
        }
    },

    'POST /api/auth/otp-verify': async (req, res) => {
        const body = await getRequestBody(req);
        const { username, otp, newPassword } = body;
        if (!username || !otp || !newPassword) {
            return sendJSON(res, 400, { error: 'Todos los campos son requeridos' });
        }
        try {
            await db.verifyOTPAndResetPassword(username, otp, newPassword);
            return sendJSON(res, 200, { success: true, message: 'Contraseña actualizada' });
        } catch (err) {
            return sendJSON(res, 400, { error: err.message });
        }
    },

    'GET /api/auth/check': async (req, res) => {
        const authorized = isAuthorized(req);
        return sendJSON(res, 200, { authenticated: authorized });
    },

    // CLIENTES
    'GET /api/clientes': async (req, res) => {
        const rows = await db.getClientes();
        return sendJSON(res, 200, rows);
    },
    'POST /api/clientes': async (req, res) => {
        const body = await getRequestBody(req);
        const result = await db.createCliente(body.nit, body.nombre, body.telefono, body.direccion, body.correo);
        return sendJSON(res, 200, result);
    },

    // PROVEEDORES
    'GET /api/proveedores': async (req, res) => {
        const rows = await db.getProveedores();
        return sendJSON(res, 200, rows);
    },
    'POST /api/proveedores': async (req, res) => {
        const body = await getRequestBody(req);
        const result = await db.createProveedor(body.nit, body.nombre, body.telefono, body.direccion, body.correo);
        return sendJSON(res, 200, result);
    },

    // PRODUCTOS
    'GET /api/productos': async (req, res) => {
        const rows = await db.getProductos();
        return sendJSON(res, 200, rows);
    },
    'POST /api/productos': async (req, res) => {
        const body = await getRequestBody(req);
        const result = await db.createProducto(
            body.codigo, body.descripcion, body.peso, body.valor_venta,
            body.marca, body.alto, body.largo, body.ancho, body.unidad_compra, body.unidad_consumo
        );
        return sendJSON(res, 200, result);
    },

    // ÓRDENES DE COMPRA
    'GET /api/compras': async (req, res) => {
        const rows = await db.getCompras();
        return sendJSON(res, 200, rows);
    },
    'POST /api/compras': async (req, res) => {
        const body = await getRequestBody(req);
        const result = await db.createCompra(body);
        return sendJSON(res, 200, result);
    },

    // VENTAS (REMISIÓN / FACTURA)
    'GET /api/ventas': async (req, res) => {
        const rows = await db.getVentas();
        return sendJSON(res, 200, rows);
    },
    'POST /api/ventas': async (req, res) => {
        const body = await getRequestBody(req);
        const result = await db.createVenta(body);
        return sendJSON(res, 200, result);
    },
    'POST /api/ventas/bulk': async (req, res) => {
        try {
            const body = await getRequestBody(req);
            if (!body.ventas || !Array.isArray(body.ventas)) {
                return sendJSON(res, 400, { error: 'Datos de importación masiva inválidos.' });
            }
            const result = await db.createVentasBulk(body.ventas);
            return sendJSON(res, 200, result);
        } catch (err) {
            return sendJSON(res, 500, { error: err.message });
        }
    },

    // CONSOLIDADO DIARIO DE VENTAS
    'GET /api/ventas/consolidado': async (req, res, parsedUrl) => {
        const fecha = parsedUrl.searchParams.get('fecha');
        if (!fecha) {
            return sendJSON(res, 400, { error: 'Falta el parámetro de fecha' });
        }
        const result = await db.getConsolidado(fecha);
        return sendJSON(res, 200, result);
    },

    // PRE-ALISTAMIENTO DE PICKING POR FACTURA
    'GET /api/ventas/picking': async (req, res, parsedUrl) => {
        const remision = parsedUrl.searchParams.get('remision');
        if (!remision) {
            return sendJSON(res, 400, { error: 'Falta el parámetro de remision' });
        }
        const result = await db.getPicking(remision);
        return sendJSON(res, 200, result);
    },

    // CONFIRMAR ALISTAMIENTO / PICKING
    'POST /api/ventas/confirmar-picking': async (req, res) => {
        const body = await getRequestBody(req);
        const result = await db.confirmarPicking(body.remision, body.itemsDespachados, body.auxiliar);
        return sendJSON(res, 200, result);
    },

    // MOVIMIENTOS DE INVENTARIO POR REFERENCIA
    'GET /api/inventario/movimientos/referencia': async (req, res, parsedUrl) => {
        const referencia = parsedUrl.searchParams.get('referencia');
        if (!referencia) {
            return sendJSON(res, 400, { error: 'Falta el parámetro de referencia' });
        }
        const rows = await db.getMovimientosReferencia(referencia);
        return sendJSON(res, 200, rows);
    },

    // MOVIMIENTOS DE INVENTARIO (RECIBO - IN)
    'GET /api/inventario/movimientos': async (req, res) => {
        const rows = await db.getMovimientos();
        return sendJSON(res, 200, rows);
    },
    'POST /api/inventario/movimientos': async (req, res) => {
        const body = await getRequestBody(req);
        if (body.tipo === 'OUT' && !isAuthorized(req)) {
            return sendJSON(res, 401, { error: 'No autorizado. Debe iniciar sesión.' });
        }
        const result = await db.createMovimiento(body);
        return sendJSON(res, 200, result);
    },

    // STOCK GLOBAL CONSOLIDADO DE INVENTARIO
    'GET /api/inventario/stock': async (req, res) => {
        const rows = await db.getStockGlobal();
        return sendJSON(res, 200, rows);
    },

    // STOCK DE TODOS LOS PRODUCTOS POR UBICACIÓN
    'GET /api/inventario/stock/ubicaciones': async (req, res) => {
        const rows = await db.getStockUbicaciones();
        return sendJSON(res, 200, rows);
    },

    // STOCK DETALLADO POR UBICACIÓN DE UN PRODUCTO
    'GET /api/inventario/stock/detalle': async (req, res, parsedUrl) => {
        const codigo = parsedUrl.searchParams.get('codigo');
        if (!codigo) {
            return sendJSON(res, 400, { error: 'Falta el código del producto' });
        }
        const rows = await db.getStockDetalle(codigo);
        return sendJSON(res, 200, rows);
    },

    // STOCK EN POSICIONES AUXILIARES (10/14)
    'GET /api/inventario/stock/auxiliar': async (req, res, parsedUrl) => {
        const codigo = parsedUrl.searchParams.get('codigo');
        if (!codigo) {
            return sendJSON(res, 400, { error: 'Falta el código del producto' });
        }
        const stockAux = await db.getStockAuxiliar(codigo);
        return sendJSON(res, 200, { stock_auxiliar: stockAux });
    },

    // CARGA CIEGA DE INVENTARIO GENERAL
    'POST /api/inventario/inventario-general': async (req, res) => {
        if (!isAuthorized(req)) {
            return sendJSON(res, 401, { error: 'No autorizado. Debe iniciar sesión.' });
        }
        const body = await getRequestBody(req);
        if (!body.items || !Array.isArray(body.items)) {
            return sendJSON(res, 400, { error: 'Formato de inventario inválido.' });
        }
        const result = await db.saveInventarioGeneral(body.items);
        return sendJSON(res, 200, result);
    },

    // DESCENSO MONTACARGAS
    'POST /api/inventario/descenso': async (req, res) => {
        const body = await getRequestBody(req);
        if (!body.codigo || isNaN(body.cantidad) || body.cantidad <= 0) {
            return sendJSON(res, 400, { error: 'Código de producto o cantidad inválidos para el descenso.' });
        }
        const result = await db.ejecutarDescenso(body.codigo, body.cantidad);
        return sendJSON(res, 200, result);
    },

    // REGULARIZACIÓN - LISTADO DE CONTEO ZONA PICKING (posición < 20)
    'GET /api/inventario/regularizacion/picking': async (req, res) => {
        const rows = await db.getRegularizacionPicking();
        return sendJSON(res, 200, rows);
    },

    // REGULARIZACIÓN - LISTADO DE CONTEO ZONA MONTACARGUISTA (posición >= 20)
    'GET /api/inventario/regularizacion/montacarguista': async (req, res) => {
        const rows = await db.getRegularizacionMontacarguista();
        return sendJSON(res, 200, rows);
    },

    // REGULARIZACIÓN - APLICAR AJUSTES DE RONDA FINAL (transaccional)
    'POST /api/inventario/regularizacion/aplicar': async (req, res) => {
        if (!isAuthorized(req)) {
            return sendJSON(res, 401, { error: 'No autorizado. Debe iniciar sesión.' });
        }
        const body = await getRequestBody(req);
        if (!body.ajustes || !Array.isArray(body.ajustes)) {
            return sendJSON(res, 400, { error: 'Formato de ajustes inválido.' });
        }
        const result = await db.aplicarAjusteRegularizacion(body.ajustes, body.zona);
        return sendJSON(res, 200, result);
    },

    // DEVOLUCIONES DE MERCANCÍA
    'GET /api/devoluciones': async (req, res) => {
        try {
            const rows = await db.getDevoluciones();
            return sendJSON(res, 200, rows);
        } catch (err) {
            return sendJSON(res, 500, { error: err.message });
        }
    },
    'GET /api/devoluciones/detalle': async (req, res, parsedUrl) => {
        const id = parsedUrl.searchParams.get('id');
        if (!id) {
            return sendJSON(res, 400, { error: 'Falta el parámetro id' });
        }
        try {
            const row = await db.getDevolucionById(id);
            if (!row) {
                return sendJSON(res, 404, { error: 'Devolución no encontrada' });
            }
            return sendJSON(res, 200, row);
        } catch (err) {
            return sendJSON(res, 500, { error: err.message });
        }
    },
    'POST /api/devoluciones': async (req, res) => {
        try {
            const body = await getRequestBody(req);
            if (!body.cliente_nit || !body.factura || !body.items || !Array.isArray(body.items)) {
                return sendJSON(res, 400, { error: 'Datos de devolución incompletos o inválidos.' });
            }
            const result = await db.createDevolucion(body);
            return sendJSON(res, 200, result);
        } catch (err) {
            return sendJSON(res, 500, { error: err.message });
        }
    },
    'POST /api/devoluciones/bulk': async (req, res) => {
        try {
            const body = await getRequestBody(req);
            if (!body.devoluciones || !Array.isArray(body.devoluciones)) {
                return sendJSON(res, 400, { error: 'Datos de importación masiva inválidos.' });
            }
            const result = await db.createDevolucionesBulk(body.devoluciones);
            return sendJSON(res, 200, result);
        } catch (err) {
            return sendJSON(res, 500, { error: err.message });
        }
    },
    // ponytail: simple mark-as-delivered, no inventory movement needed
    'POST /api/devoluciones/marcar-salida': async (req, res) => {
        try {
            const body = await getRequestBody(req);
            if (!body.id || !body.codigo_producto || body.item_index === undefined) {
                return sendJSON(res, 400, { error: 'Datos incompletos para marcar salida.' });
            }
            const result = await db.marcarSalidaDevolucionItem(body.id, body.codigo_producto, body.item_index);
            return sendJSON(res, 200, result);
        } catch (err) {
            return sendJSON(res, 500, { error: err.message });
        }
    }
};

const server = http.createServer(async (req, res) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // --- MANEJO DE ENDPOINTS DE LA API ---
    if (pathname.startsWith('/api/')) {
        const routeKey = `${req.method} ${pathname}`;
        const handler = apiRoutes[routeKey];
        if (handler) {
            try {
                return await handler(req, res, parsedUrl);
            } catch (err) {
                console.error(`Error procesando API (${routeKey}):`, err);
                return sendJSON(res, 500, { error: err.message || 'Error interno en el servidor.' });
            }
        } else {
            return sendJSON(res, 404, { error: `Endpoint de API no encontrado: ${routeKey}` });
        }
    }

    // --- MANEJO DE ARCHIVOS ESTÁTICOS (FRONTEND) ---
    const reqPath = pathname;
    const publicDir = path.join(__dirname, 'client');
    let filePath = path.join(publicDir, reqPath === '/' ? 'index.html' : reqPath);

    // Evitar Traversal Directory
    if (!filePath.startsWith(publicDir)) {
        res.writeHead(403);
        res.end('Acceso denegado');
        return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.ico': 'image/x-icon',
        '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    // ponytail: use await fs.readFile natively inside async server request handler
    try {
        const content = await fs.readFile(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
    } catch (error) {
        console.error('Error sirviendo estático:', error);
        if (error.code === 'ENOENT') {
            res.writeHead(404);
            res.end('Archivo no encontrado');
        } else {
            res.writeHead(500);
            res.end('Error interno de servidor: ' + error.code);
        }
    }
});

const PORT = process.env.PORT || 3000;

// Inicializar la Base de Datos antes de encender el servidor
db.initDB()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`==================================================`);
            console.log(`  HABITAD WMS SERVER CORRIENDO LOCALMENTE`);
            console.log(`  URL de la aplicación: http://localhost:${PORT}`);
            console.log(`==================================================`);
        });
    })
    .catch(err => {
        console.error("CRITICAL: Falló la inicialización de la base de datos:", err);
        process.exit(1);
    });
