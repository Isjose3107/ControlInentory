import { state } from './js/state.js';
import { fetchAPI } from './js/api.js';
import { imprimirDocumento } from './js/print.js';
import { 
    formatoMoneda, 
    initDateInputs,
    esZonaMontacarguista,
    populateProductosSelect,
    populateClientesSelect,
    populateProveedoresSelect
} from './js/utils.js';

// Import views to run and register their window functions
import './js/views/montacarguista.js';
import './js/views/picking.js';
import './js/views/compras.js';
import './js/views/ventas.js';
import './js/views/catalogo.js';
import './js/views/recibo.js';
import './js/views/despacho.js';
import './js/views/dashboard.js';
import './js/views/inventario.js';
import './js/views/devoluciones.js';
import './js/views/devoluciones_cliente.js';

window.pendingViewChange = null;
window.pendingTabChange = null;

console.log('HABITAD WMS: app.js loaded');

function init() {
    console.log('HABITAD WMS: init() started');
    initNavigation();
    initDateInputs();
    loadCatalogos();
    if (window.loadDashboardStats) {
        console.log('HABITAD WMS: loading dashboard stats');
        window.loadDashboardStats();
    }
    configFormObservers();
    console.log('HABITAD WMS: init() complete');
}

console.log('HABITAD WMS: readyState =', document.readyState);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('HABITAD WMS: DOMContentLoaded fired');
        init();
    });
} else {
    init();
}

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    console.log('HABITAD WMS: Found nav items count =', navItems.length);
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewName = item.getAttribute('data-view');
            console.log('HABITAD WMS: Nav item clicked for view =', viewName);
            showView(viewName);

            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

export function showView(viewName) {
    // Interceptar la vista salidas si el usuario no ha iniciado sesión
    if (viewName === 'salidas') {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            window.pendingViewChange = 'salidas';
            window.pendingTabChange = null;
            window.showSecurityOverlay();
            return; // Detener la navegación
        }
    }

    state.currentView = viewName;

    document.querySelectorAll('.view-pane').forEach(pane => {
        pane.classList.remove('active');
    });

    const activePane = document.getElementById(`view-${viewName}`);
    if (activePane) {
        activePane.classList.add('active');
    }

    const viewTitles = {
        dashboard: 'Dashboard',
        montacarguista: 'Consolidado Diario - Montacarguista',
        picking: 'Alistamiento de Picking - Auxiliar',
        inventario: 'Inventario (Ubicaciones y Stock)',
        entradas: 'Recibo de Mercancía (IN)',
        salidas: 'Despacho de Mercancía (OUT)',
        compras: 'Órdenes de Compra (OC)',
        ventas: 'Ventas y Remisiones',
        productos: 'Catálogo de Productos',
        clientes: 'Gestión de Clientes',
        proveedores: 'Gestión de Proveedores',
        devoluciones: 'Devolución de Mercancía',
        devoluciones_cliente: 'Salida Devolución Cliente'
    };

    const titleEl = document.getElementById('viewTitle');
    if (titleEl) {
        titleEl.textContent = viewTitles[viewName] || 'HABITAD WMS';
    }

    if (viewName === 'dashboard' && window.loadDashboardStats) {
        window.loadDashboardStats();
    } else if (viewName === 'inventario' && window.switchInvTab) {
        window.switchInvTab('consulta');
    } else if (viewName === 'productos' && window.loadProductos) {
        window.loadProductos();
    } else if (viewName === 'clientes' && window.loadClientes) {
        window.loadClientes();
    } else if (viewName === 'proveedores' && window.loadProveedores) {
        window.loadProveedores();
    } else if (viewName === 'salidas') {
        if (window.loadMovimientosRecientes) window.loadMovimientosRecientes();
        populateProductosSelect('out-producto');
    } else if (viewName === 'entradas' && window.limpiarFormRecibo) {
        window.limpiarFormRecibo();
    } else if (viewName === 'compras') {
        if (window.limpiarFormOC) window.limpiarFormOC();
        populateProveedoresSelect('oc-proveedor');
    } else if (viewName === 'ventas') {
        if (window.limpiarFormVenta) window.limpiarFormVenta();
        populateClientesSelect('venta-cliente');
    } else if (viewName === 'montacarguista') {
        const inputFecha = document.getElementById('monta-fecha');
        if (inputFecha && !inputFecha.value) {
            inputFecha.value = new Date().toISOString().split('T')[0];
        }
        if (window.loadMontacarguistaConsolidado) window.loadMontacarguistaConsolidado();
    } else if (viewName === 'devoluciones') {
        if (window.initDevoluciones) window.initDevoluciones();
    } else if (viewName === 'devoluciones_cliente') {
        if (window.initDevolucionesCliente) window.initDevolucionesCliente();
    }
}

function configFormObservers() {
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('inv-details-panel');
        if (e.target === modal && window.closeInvDetails) {
            window.closeInvDetails();
        }
    });
}

async function loadCatalogos() {
    try {
        state.clientes = await fetchAPI('/clientes') || [];
        state.proveedores = await fetchAPI('/proveedores') || [];
        state.productos = await fetchAPI('/productos') || [];
        state.stockPorUbicacion = await fetchAPI('/inventario/stock/ubicaciones') || [];
    } catch (err) {
        console.warn('No se pudieron cargar algunos catálogos iniciales.');
    }
}

// Bind main orchestrator methods to window for HTML accessibility
window.showView = showView;
window.imprimirDocumento = imprimirDocumento;
window.fetchAPI = fetchAPI;
window.loadCatalogos = loadCatalogos;

// Funciones globales del Flujo de Seguridad en Pantalla
window.showSecurityOverlay = function() {
    const overlay = document.getElementById('security-lock-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        window.switchSecPane('login');
    }
};

window.hideSecurityOverlay = function() {
    const overlay = document.getElementById('security-lock-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
};

window.switchSecPane = function(pane) {
    document.querySelectorAll('.sec-pane').forEach(p => p.style.display = 'none');
    const target = document.getElementById(`sec-pane-${pane}`);
    if (target) {
        target.style.display = 'block';
    }
};

window.cancelSecurityLogin = function() {
    window.hideSecurityOverlay();
    window.pendingViewChange = null;
    window.pendingTabChange = null;
    
    // Regresar al Dashboard como vista segura por defecto
    const dashboardNavItem = document.querySelector('.nav-item[data-view="dashboard"]');
    if (dashboardNavItem) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        dashboardNavItem.classList.add('active');
    }
    showView('dashboard');
};

window.executeSecurityLogin = async function() {
    const userEl = document.getElementById('sec-username');
    const passEl = document.getElementById('sec-password');
    const username = userEl ? userEl.value.trim() : '';
    const password = passEl ? passEl.value : '';

    if (!username || !password) {
        alert('Por favor complete todos los campos.');
        return;
    }

    try {
        const res = await window.login(username, password);
        if (res.success) {
            window.hideSecurityOverlay();
            
            // Limpiar inputs
            if (userEl) userEl.value = '';
            if (passEl) passEl.value = '';
            
            // Reanudar la navegación interrumpida
            if (window.pendingViewChange) {
                showView(window.pendingViewChange);
                const navItem = document.querySelector(`.nav-item[data-view="${window.pendingViewChange}"]`);
                if (navItem) {
                    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                    navItem.classList.add('active');
                }
                window.pendingViewChange = null;
            }
            if (window.pendingTabChange && window.switchInvTab) {
                window.switchInvTab(window.pendingTabChange);
                window.pendingTabChange = null;
            }
        }
    } catch (err) {
        alert('Credenciales de acceso incorrectas.');
    }
};

window.executeRequestOTP = async function() {
    const userEl = document.getElementById('sec-otp-username');
    const username = userEl ? userEl.value.trim() : '';

    if (!username) {
        alert('Por favor digite su usuario.');
        return;
    }

    try {
        const res = await window.requestOTP(username);
        alert(res.message || 'Se ha enviado la solicitud de OTP. Por favor revise su correo.');
        window.switchSecPane('otp-reset');
    } catch (err) {
        alert('No se pudo generar el OTP: ' + err.message);
    }
};

window.executeResetPassword = async function() {
    const userEl = document.getElementById('sec-otp-username');
    const otpEl = document.getElementById('sec-reset-otp');
    const newPassEl = document.getElementById('sec-reset-pass');
    const newPassConfirmEl = document.getElementById('sec-reset-pass-confirm');

    const username = userEl ? userEl.value.trim() : 'admin';
    const otp = otpEl ? otpEl.value.trim() : '';
    const newPass = newPassEl ? newPassEl.value : '';
    const confirm = newPassConfirmEl ? newPassConfirmEl.value : '';

    if (!otp || !newPass || !confirm) {
        alert('Por favor complete todos los campos.');
        return;
    }

    if (newPass !== confirm) {
        alert('Las contraseñas no coinciden.');
        return;
    }

    try {
        await window.verifyOTPAndReset(username, otp, newPass);
        alert('Contraseña actualizada con éxito. Por favor inicie sesión con su nueva clave.');
        
        // Limpiar inputs y volver al panel de login
        if (otpEl) otpEl.value = '';
        if (newPassEl) newPassEl.value = '';
        if (newPassConfirmEl) newPassConfirmEl.value = '';
        window.switchSecPane('login');
    } catch (err) {
        alert('Error al restablecer contraseña: ' + err.message);
    }
};
