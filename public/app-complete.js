// API Base URL
const API_URL = '/api';
const DEBUG_MODE = true;

function debugLog(msg, data) {
  if (DEBUG_MODE) console.log(`[DEBUG] ${msg}`, data || '');
}

// Loading state helpers
function showLoadingState(id) {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    el.style.opacity = '0.7';
  }
}

function hideLoadingState(id, val) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = val;
    el.style.opacity = '1';
  }
}

function showErrorState(id, msg = 'Error') {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> ${msg}</span>`;
  }
}

function updateStatElement(id, val, fallback = '0') {
  const el = document.getElementById(id);
  if (el) el.textContent = val != null ? val : fallback;
}

// Section metadata
const sectionMetadata = {
  dashboard: { label: 'Map Dashboard', icon: 'fa-map-marked-alt' },
  cabang: { label: 'Cabang', icon: 'fa-building' },
  equipment: { label: 'Equipment', icon: 'fa-tools' },
  airports: { label: 'Airports', icon: 'fa-plane' },
  'snmp-templates': { label: 'SNMP Templates', icon: 'fa-network-wired' },
  'equipment-logs': { label: 'Equipment Logs', icon: 'fa-history' },
  users: { label: 'User Management', icon: 'fa-users' }
};

function updateHeaderBreadcrumb(section) {
  const hb = document.getElementById('headerBreadcrumb');
  if (!hb) return;
  const m = sectionMetadata[section];
  if (m) {
    hb.innerHTML = `<span class="breadcrumb-icon"><i class="fas ${m.icon}"></i></span><span class="breadcrumb-text">${m.label}</span>`;
  }
}

// User search & filter
let userSearchTimer = null;
let usersSort = { column: 'id', direction: 'asc' };
let usersData = [];

function initUserSearch() {
  const searchInput = document.getElementById('searchUsers');
  const roleFilter = document.getElementById('filterRole');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.trim();
      const role = roleFilter ? roleFilter.value : '';
      if (userSearchTimer) clearTimeout(userSearchTimer);
      userSearchTimer = setTimeout(() => loadUsers(term, role), 300);
    });
  }
  
  if (roleFilter) {
    roleFilter.addEventListener('change', (e) => {
      const term = searchInput ? searchInput.value.trim() : '';
      const role = e.target.value;
      if (userSearchTimer) clearTimeout(userSearchTimer);
      userSearchTimer = setTimeout(() => loadUsers(term, role), 300);
    });
  }
}

// Auth
let authToken = null;
function initAuth() {
  const t = localStorage.getItem('authToken');
  if (t) authToken = t;
}

function getAuthHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (authToken) h['Authorization'] = `Bearer ${authToken}`;
  return h;
}

// DOM Elements
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const publicDashboard = document.getElementById('publicDashboard');
const logoutModal = document.getElementById('logoutModal');
const equipmentModal = document.getElementById('equipmentModal');
const userModal = document.getElementById('userModal');
const airportModal = document.getElementById('airportModal');
const themeToggle = document.getElementById('themeToggle');
const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
const sidebarUserName = document.getElementById('sidebarUserName');
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const navItems = document.querySelectorAll('.nav-item');
const contentSections = document.querySelectorAll('.content-section');
const usersNavItem = document.getElementById('usersNavItem');
const addEquipmentBtn = document.getElementById('addEquipmentBtn');
const addUserBtn = document.getElementById('addUserBtn');
const addAirportBtn = document.getElementById('addAirportBtn');
const loginBtn = document.getElementById('loginBtn');
const equipmentForm = document.getElementById('equipmentForm');
const equipmentTableBody = document.getElementById('equipmentTableBody');
const searchEquipment = document.getElementById('searchEquipment');
const filterCategory = document.getElementById('filterCategory');
const filterAirport = document.getElementById('filterAirport');
const formTitle = document.getElementById('modalFormTitle');
const equipmentAirportSelect = document.getElementById('equipmentAirport');
const connectionMethodSelect = document.getElementById('connectionMethod');
const connectionFields = {
  snmp: document.getElementById('snmpFields'),
  json: document.getElementById('jsonFields'),
  serial: document.getElementById('serialFields'),
  tcp_serial: document.getElementById('tcpSerialFields'),
  tcp: document.getElementById('tcpFields'),
  mqtt: document.getElementById('mqttFields'),
  modbus: document.getElementById('modbusFields')
};
const userForm = document.getElementById('userForm');
const userTableBody = document.getElementById('userTableBody');
const userModalFormTitle = document.getElementById('userModalFormTitle');
const airportForm = document.getElementById('airportForm');
const airportTableBody = document.getElementById('airportTableBody');
const airportModalFormTitle = document.getElementById('airportModalFormTitle');
const airportParentSelect = document.getElementById('airportParent');
const snmpTemplateModal = document.getElementById('snmpTemplateModal');
const snmpTemplateForm = document.getElementById('snmpTemplateForm');
const snmpTemplateTableBody = document.getElementById('snmpTemplateTableBody');
const snmpTemplateModalFormTitle = document.getElementById('snmpTemplateModalFormTitle');
const addSnmpTemplateBtn = document.getElementById('addSnmpTemplateBtn');
const oidMappingsContainer = document.getElementById('oidMappingsContainer');
const addOidMappingBtn = document.getElementById('addOidMappingBtn');
const equipmentLogsNavItem = document.getElementById('equipmentLogsNavItem');
const filterLogEquipment = document.getElementById('filterLogEquipment');
const filterLogSource = document.getElementById('filterLogSource');
const refreshLogsBtn = document.getElementById('refreshLogsBtn');
const equipmentLogsTableBody = document.getElementById('equipmentLogsTableBody');

let snmpTemplatesData = [];
let equipmentLogsData = [];
let currentUser = null;
let publicMap = null;
let map = null;
let airportsData = [];

// Logs pagination
var logsPagination = { currentPage: 1, pageSize: 100, total: 0, totalPages: 0 };
var logsSort = { column: 'Waktu Update', direction: 'desc' };

// Floating hover card state
let activeAirport = null, currentMarkerElement = null, closeTimeout = null, isCardHovered = false, isMarkerHovered = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initTheme();
  
  const savedToken = localStorage.getItem('authToken');
  const savedUser = localStorage.getItem('currentUser');
  
  if (savedToken && savedUser) {
    authToken = savedToken;
    try {
      currentUser = JSON.parse(savedUser);
      showApp();
    } catch (e) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      localStorage.removeItem('currentSection');
      authToken = null;
      currentUser = null;
      showPublicDashboard();
      initPublicDashboard();
    }
  } else {
    showPublicDashboard();
    initPublicDashboard();
  }
  
  initNavigation();
  initEventListeners();
  initModals();
  initLoginButton();
  initSnmpTemplateModal();
  initEquipmentLogs();
  initUserSearch();
  
  if (authToken && currentUser) loadSnmpTemplates();
});

// Public Dashboard - Fixed to work without authentication
async function initPublicDashboard() {
  debugLog('Initializing public dashboard...');
  
  // Show loading state for all stats
  const statIds = ['publicTotalEquipment', 'publicNormalEquipment', 'publicWarningEquipment', 'publicAlertEquipment', 'publicDisconnectEquipment', 'publicCommCount', 'publicNavCount', 'publicSurvCount', 'publicDataCount', 'publicSupportCount'];
  statIds.forEach(id => showLoadingState(id));
  
  try {
    // Fetch both airports and equipment stats in parallel (both public endpoints, no auth required)
    const [airportsRes, statsRes] = await Promise.all([
      fetch(`${API_URL}/airports`),
      fetch(`${API_URL}/equipment/stats`)
    ]);
    
    if (!airportsRes.ok) throw new Error(`Airports API error: ${airportsRes.status}`);
    if (!statsRes.ok) throw new Error(`Equipment stats API error: ${statsRes.status}`);
    
    const airports = await airportsRes.json();
    const stats = await statsRes.json();
    
    if (!Array.isArray(airports)) throw new Error('Airports data is not an array');
    
    // Update stats from the dedicated stats endpoint (accurate counts from database)
    hideLoadingState('publicTotalEquipment', stats.total || 0);
    hideLoadingState('publicNormalEquipment', stats.normal || 0);
    hideLoadingState('publicWarningEquipment', stats.warning || 0);
    hideLoadingState('publicAlertEquipment', stats.alert || 0);
    hideLoadingState('publicDisconnectEquipment', stats.disconnect || 0);
    
    // Update category counts from stats endpoint
    const cats = stats.categories || { Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0 };
    updateStatElement('publicCommCount', cats.Communication);
    updateStatElement('publicNavCount', cats.Navigation);
    updateStatElement('publicSurvCount', cats.Surveillance);
    updateStatElement('publicDataCount', cats['Data Processing']);
    updateStatElement('publicSupportCount', cats.Support);
    
    // Process airports for map display
    airports.forEach(airport => {
      const eq = airport.equipmentCount || { Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0 };
      airport.totalEquipment = airport.totalEquipment || 0;
      airport.equipmentCount = eq;
    });
    
    initPublicMap(airports);
    debugLog('Public dashboard initialized successfully');
  } catch (error) {
    console.error('Error loading public data:', error);
    statIds.forEach(id => showErrorState(id, 'Error'));
    const mapContainer = document.getElementById('publicMapContainer');
    if (mapContainer) {
      mapContainer.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;color:#ef4444;"><i class="fas fa-exclamation-triangle" style="font-size:3rem;margin-bottom:15px;"></i><p>Failed to load dashboard data. Please refresh the page.</p><p style="font-size:0.85rem;color:#6b7280;">${error.message}</p></div>`;
    }
  }
}

// Public Map
function initPublicMap(airportsData) {
  debugLog('Initializing public map...');
  const mapContainer = document.getElementById('publicMapContainer');
  if (!mapContainer) { debugLog('Map container not found'); return; }
  
  mapContainer.style.minHeight = '400px';
  mapContainer.style.height = '450px';
  
  if (publicMap) { publicMap.remove(); }
  if (!Array.isArray(airportsData) || airportsData.length === 0) {
    mapContainer.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;color:#6b7280;"><i class="fas fa-map-marked-alt" style="font-size:3rem;margin-bottom:15px;"></i><p>No airport data available</p></div>`;
    return;
  }
  
  try {
    publicMap = L.map('publicMapContainer', { center: [-2.5, 118], zoom: 5, zoomControl: false, preferCanvas: true, bubblingMouseEvents: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18, minZoom: 4 }).addTo(publicMap);
    L.control.zoom({ position: 'bottomleft' }).addTo(publicMap);
    
    createFloatingHoverCard();
    
    airportsData.forEach(airport => {
      if (!airport.lat || !airport.lng || isNaN(airport.lat) || isNaN(airport.lng)) return;
      
      const isBranch = (airport.parentId || airport.parent_id) ? true : false;
      const markerColor = isBranch ? '#10b981' : '#2563eb';
      const markerGlow = isBranch ? 'rgba(16,185,129,' : 'rgba(37,99,235,';
      
      const markerIcon = L.divIcon({
        className: 'custom-marker-airport',
        html: `<div style="background:${markerColor};width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 12px ${markerGlow}0.6),0 2px 6px rgba(0,0,0,0.4);cursor:pointer;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      
      const marker = L.marker([airport.lat, airport.lng], { icon: markerIcon, zIndexOffset: isBranch ? 500 : 1000 }).addTo(publicMap);
      
      marker.on('mouseover', function (e) {
        if (e && e.originalEvent) e.originalEvent.stopPropagation();
        const el = this.getElement();
        if (el) { el.style.zIndex = '99999'; el.style.position = 'relative'; }
        this.setZIndexOffset(10000);
        isMarkerHovered = true;
        clearCloseTimeout();
        showFloatingHoverCard(airport, marker, this);
      });
      
      marker.on('mouseout', function (e) {
        if (e && e.originalEvent) e.originalEvent.stopPropagation();
        const el = this.getElement();
        if (el) { el.style.zIndex = ''; el.style.position = ''; }
        this.setZIndexOffset(this.options.zIndexOffset || (airport.parentId ? 500 : 1000));
        isMarkerHovered = false;
        if (!isCardHovered) startCloseTimeout();
      });
      
      marker.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        const el = this.getElement();
        if (el) el.style.zIndex = '99999';
        this.setZIndexOffset(10000);
        showFloatingHoverCard(airport, marker, this);
      });
    });
    
    debugLog('Public map initialization complete');
  } catch (error) {
    console.error('Error initializing map:', error);
    mapContainer.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;color:#ef4444;"><i class="fas fa-exclamation-triangle" style="font-size:3rem;margin-bottom:15px;"></i><p>Failed to initialize map</p><p style="font-size:0.85rem;color:#6b7280;">${error.message}</p></div>`;
  }
}

// Floating hover card
function createFloatingHoverCard() {
  const existing = document.querySelector('.floating-hover-card');
  if (existing) existing.remove();
  
  const card = document.createElement('div');
  card.className = 'floating-hover-card';
  card.innerHTML = `<div class="floating-hover-card-inner"><div class="floating-card-pointer"></div><div class="floating-hover-card-content"><div class="floating-card-header"><h3 class="floating-card-title">Location</h3><p class="floating-card-city">City</p></div><div class="floating-card-divider"></div><div class="floating-card-section-title">Equipment Breakdown</div><ul class="floating-card-equipment-list"></ul><div class="floating-card-footer"><span class="floating-card-total-label">Total</span><span class="floating-card-total-value">0</span></div></div></div>`;
  document.body.appendChild(card);
  
  card.addEventListener('mouseenter', () => { isCardHovered = true; if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; } });
  card.addEventListener('mouseleave', () => { isCardHovered = false; if (!isMarkerHovered) startCloseTimeout(); });
  document.addEventListener('click', (e) => {
    if (!card.contains(e.target)) {
      const isMarker = e.target.closest('.custom-marker-main') || e.target.closest('.custom-marker-branch') || e.target.closest('.custom-marker-airport');
      if (!isMarker) hideFloatingHoverCard();
    }
  });
}

function startCloseTimeout() {
  if (closeTimeout) clearTimeout(closeTimeout);
  closeTimeout = setTimeout(() => { if (!isCardHovered && !isMarkerHovered) hideFloatingHoverCard(); }, 400);
}

function clearCloseTimeout() {
  if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
}

function showFloatingHoverCard(airport, marker, markerElement) {
  clearCloseTimeout();
  let card = document.querySelector('.floating-hover-card');
  if (!card) { createFloatingHoverCard(); card = document.querySelector('.floating-hover-card'); }
  
  const eqCount = airport.equipmentCount || {};
  const total = airport.totalEquipment || 0;
  
  card.querySelector('.floating-card-title').textContent = airport.name;
  card.querySelector('.floating-card-city').textContent = airport.city;
  card.querySelector('.floating-card-total-value').textContent = total;
  
  const list = card.querySelector('.floating-card-equipment-list');
  list.innerHTML = ['Communication', 'Navigation', 'Surveillance', 'Data Processing', 'Support'].map(cat => {
    const count = eqCount[cat] || 0;
    const bulletClass = cat.toLowerCase().replace(' ', '-');
    return `<li class="category-row" data-category="${cat}" data-airport-id="${airport.id}"><div class="floating-card-equipment-left"><span class="category-bullet ${bulletClass}"></span><span class="category-label">${cat}</span></div><span class="category-count">${count}</span></li>`;
  }).join('');
  
  list.querySelectorAll('.category-row').forEach(row => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const cat = row.getAttribute('data-category');
      const aid = row.getAttribute('data-airport-id');
      navigateToEquipment(cat, aid, airport.name);
    });
  });
  
  activeAirport = airport;
  currentMarkerElement = markerElement;
  
  const markerIcon = markerElement ? markerElement.getElement() : null;
  if (markerIcon) {
    const rect = markerIcon.getBoundingClientRect();
    card.style.left = `${rect.left + rect.width / 2}px`;
    card.style.top = `${rect.top + rect.height / 2}px`;
    card.style.transform = 'translate(-50%,-100%) translateY(-8px)';
  }
  
  card.classList.add('visible');
}

function hideFloatingHoverCard() {
  const card = document.querySelector('.floating-hover-card');
  if (card) {
    card.classList.add('closing');
    setTimeout(() => { card.classList.remove('visible', 'closing'); activeAirport = null; currentMarkerElement = null; isCardHovered = false; }, 150);
  }
}

function navigateToEquipment(category, airportId, airportName) {
  hideFloatingHoverCard();
  if (currentUser) {
    localStorage.setItem('equipmentFilter', JSON.stringify({ category: category, airportId: airportId, airportName: airportName }));
    const navItem = document.querySelector('.nav-item[data-section="equipment"]');
    if (navItem) {
      navItem.click();
      setTimeout(() => {
        const catSel = document.getElementById('filterCategory');
        const apSel = document.getElementById('filterAirport');
        if (catSel) { catSel.value = category; catSel.dispatchEvent(new Event('change', { bubbles: true })); }
        if (apSel) { apSel.value = airportId; apSel.dispatchEvent(new Event('change', { bubbles: true })); }
        handleEquipmentFilter();
      }, 300);
    }
  } else {
    localStorage.setItem('pendingEquipmentFilter', JSON.stringify({ category: category, airportId: airportId, airportName: airportName }));
    publicDashboard.classList.add('hidden');
    publicDashboard.style.display = 'none';
    loginModal.classList.remove('hidden');
    loginModal.style.display = 'flex';
    loadCaptcha();
  }
}

function showPublicDashboard() {
  publicDashboard.classList.remove('hidden');
  publicDashboard.style.display = 'block';
  loginModal.classList.add('hidden');
  const appContainer = document.querySelector('.app-container');
  if (appContainer) { appContainer.classList.add('hidden'); appContainer.style.display = 'none'; }
}

function initLoginButton() {
  if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      publicDashboard.classList.add('hidden');
      publicDashboard.style.display = 'none';
      loginModal.classList.remove('hidden');
      loginModal.style.display = 'flex';
      loadCaptcha();
    });
  }
}

async function loadCaptcha() {
  try {
    const res = await fetch(`${API_URL}/auth/captcha`);
    const data = await res.json();
    document.getElementById('captchaId').value = data.id;
    document.getElementById('captchaQuestion').textContent = data.question;
  } catch (err) { console.error('Error loading captcha:', err); }
}

function initMap() {
  const mapContainer = document.getElementById('mapContainer');
  if (!mapContainer) return;
  map = L.map('mapContainer', { center: [-2.5, 118], zoom: 5, zoomControl: false, preferCanvas: true, bubblingMouseEvents: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18, minZoom: 4 }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  updateMapMarkers();
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const captchaId = document.getElementById('captchaId').value;
  const captchaAnswer = document.getElementById('captchaAnswer').value;
  
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password, captchaId: captchaId, captchaAnswer: captchaAnswer })
    });
    
    if (res.ok) {
      const data = await res.json();
      authToken = data.token;
      localStorage.setItem('authToken', data.token);
      currentUser = { id: data.id, username: data.username, name: data.name, role: data.role, branchId: data.branchId };
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      document.getElementById('captchaAnswer').value = '';
      
      try { await showApp(); } catch (err) {
        console.error('Error showing app:', err);
        authToken = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        currentUser = null;
        alert('Error loading application. Please try again.');
        showLoginModal();
      }
    } else {
      const data = await res.json();
      alert(data.message || 'Login failed. Please check your credentials.');
      loadCaptcha();
    }
  } catch (err) {
    console.error('Login error:', err);
    alert('Login failed. Please check your connection and try again.');
    loadCaptcha();
  }
}

function showLoginModal() {
  publicDashboard.classList.add('hidden');
  publicDashboard.style.display = 'none';
  loginModal.classList.remove('hidden');
  loginModal.style.display = 'flex';
  const appContainer = document.querySelector('.app-container');
  if (appContainer) { appContainer.classList.add('hidden'); appContainer.style.display = 'none'; }
}

async function showApp() {
  if (!currentUser) throw new Error('No current user data');
  
  publicDashboard.classList.add('hidden');
  publicDashboard.style.display = 'none';
  loginModal.classList.add('hidden');
  loginModal.style.display = 'none';
  
  const appContainer = document.querySelector('.app-container');
  if (!appContainer) throw new Error('App container not found');
  appContainer.classList.remove('hidden');
  appContainer.style.display = 'flex';
  
  if (sidebarUserName && currentUser.name) sidebarUserName.textContent = currentUser.name;
  
  if (usersNavItem && equipmentLogsNavItem) {
    if (currentUser.role === 'admin' || currentUser.role === 'user_pusat') {
      usersNavItem.style.display = 'flex';
      equipmentLogsNavItem.style.display = 'flex';
    } else {
      usersNavItem.style.display = 'none';
      equipmentLogsNavItem.style.display = 'none';
    }
  }
  
  try { await loadAirports(); } catch (e) { console.error('Error loading airports:', e); }
  try { initMap(); } catch (e) { console.error('Error initializing map:', e); }
  try { loadEquipment(); } catch (e) { console.error('Error loading equipment:', e); }
  try { loadUsers(); } catch (e) { console.error('Error loading users:', e); }
  
  applyRoleAccess();
  const savedSection = localStorage.getItem('currentSection') || 'dashboard';
  restoreNavigation(savedSection);
}

function applyRoleAccess() {
  const ae = document.getElementById('addEquipmentBtn');
  const aa = document.getElementById('addAirportBtn');
  const au = document.getElementById('addUserBtn');
  
  if (currentUser.role === 'user_cabang') {
    if (ae) ae.style.display = 'none';
    if (aa) aa.style.display = 'none';
    if (au) au.style.display = 'none';
    document.querySelectorAll('.action-buttons').forEach(b => b.style.display = 'none');
  } else if (currentUser.role === 'teknisi_cabang') {
    if (ae) ae.style.display = 'flex';
    if (aa) aa.style.display = 'none';
    if (au) au.style.display = 'none';
  } else {
    if (ae) ae.style.display = 'flex';
    if (aa) aa.style.display = 'flex';
    if (au) au.style.display = 'flex';
  }
}

function initModals() {
  document.getElementById('cancelLogout').addEventListener('click', () => logoutModal.classList.add('hidden'));
  
  // FIXED: Logout redirect - properly redirect to login page
  document.getElementById('confirmLogout').addEventListener('click', () => {
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentSection');
    currentUser = null;
    logoutModal.classList.add('hidden');
    
    const appContainer = document.querySelector('.app-container');
    if (appContainer) { appContainer.classList.add('hidden'); appContainer.style.display = 'none'; }
    
    showPublicDashboard();
    
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('captchaAnswer').value = '';
  });
  
  logoutModal.addEventListener('click', e => { if (e.target === logoutModal) logoutModal.classList.add('hidden'); });
  
  if (addEquipmentBtn) addEquipmentBtn.addEventListener('click', () => { resetEquipmentForm(); equipmentModal.classList.remove('hidden'); });
  document.getElementById('closeEquipmentModal').addEventListener('click', () => equipmentModal.classList.add('hidden'));
  document.getElementById('cancelEquipmentEdit').addEventListener('click', () => { equipmentModal.classList.add('hidden'); resetEquipmentForm(); });
  equipmentModal.addEventListener('click', e => { if (e.target === equipmentModal) { equipmentModal.classList.add('hidden'); resetEquipmentForm(); } });
  
  const sdm = document.getElementById('snmpDataModal');
  if (sdm) {
    sdm.addEventListener('click', e => { if (e.target === sdm) sdm.classList.add('hidden'); });
    document.getElementById('closeSnmpDataModal').addEventListener('click', () => sdm.classList.add('hidden'));
  }
  
  if (connectionMethodSelect) {
    connectionMethodSelect.addEventListener('change', () => {
      const m = connectionMethodSelect.value;
      Object.keys(connectionFields).forEach(k => { if (connectionFields[k]) connectionFields[k].style.display = 'none'; });
      if (connectionFields[m]) connectionFields[m].style.display = 'block';
    });
  }
  
  const ja = document.getElementById('jsonAuth');
  const jaf = document.getElementById('jsonAuthField');
  if (ja && jaf) ja.addEventListener('change', () => { jaf.style.display = ja.value !== 'none' ? 'block' : 'none'; });
  
  if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', () => logoutModal.classList.remove('hidden'));
  
  const sup = document.getElementById('sidebarUserPanel');
  if (sup) sup.addEventListener('click', () => { currentUser && viewUserProfile(currentUser.id); });
  
  const udm = document.getElementById('userDetailModal');
  if (udm) {
    udm.addEventListener('click', e => { if (e.target === udm) udm.classList.add('hidden'); });
    document.getElementById('closeUserDetailModal').addEventListener('click', () => udm.classList.add('hidden'));
  }
  
  if (addUserBtn) addUserBtn.addEventListener('click', () => { resetUserForm(); userModal.classList.remove('hidden'); });
  document.getElementById('closeUserModal').addEventListener('click', () => userModal.classList.add('hidden'));
  document.getElementById('cancelUserEdit').addEventListener('click', () => { userModal.classList.add('hidden'); resetUserForm(); });
  userModal.addEventListener('click', e => { if (e.target === userModal) { userModal.classList.add('hidden'); resetUserForm(); } });
  
  if (addAirportBtn) addAirportBtn.addEventListener('click', () => { resetAirportForm(); airportModal.classList.remove('hidden'); });
  document.getElementById('closeAirportModal').addEventListener('click', () => airportModal.classList.add('hidden'));
  document.getElementById('cancelAirportEdit').addEventListener('click', () => { airportModal.classList.add('hidden'); resetAirportForm(); });
  airportModal.addEventListener('click', e => { if (e.target === airportModal) { airportModal.classList.add('hidden'); resetAirportForm(); } });
}

function initTheme() {
  const t = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  updateThemeButton(t);
}

function toggleTheme() {
  const c = document.documentElement.getAttribute('data-theme');
  const n = 'dark' === c ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', n);
  localStorage.setItem('theme', n);
  updateThemeButton(n);
}

function updateThemeButton(t) {
  if (!themeToggle) return;
  const i = themeToggle.querySelector('i');
  const s = themeToggle.querySelector('span');
  if (i) i.className = 'dark' === t ? 'fas fa-sun' : 'fas fa-moon';
  if (s) s.textContent = 'dark' === t ? 'Light Mode' : 'Dark Mode';
}

function initNavigation() {
  if (!navItems || 0 === navItems.length) return;
  const sv = localStorage.getItem('currentSection') || 'dashboard';
  
  navItems.forEach(i => {
    i.addEventListener('click', e => {
      e.preventDefault();
      const s = i.dataset.section;
      localStorage.setItem('currentSection', s);
      updateHeaderBreadcrumb(s);
      navItems.forEach(n => n.classList.remove('active'));
      i.classList.add('active');
      contentSections.forEach(c => c.classList.add('hidden'));
      
      if ('cabang' === s) {
        document.getElementById('cabangSection')?.classList.remove('hidden');
        document.getElementById('monitoringSection')?.classList.add('hidden');
        window.cabangModule && window.cabangModule.loadAirports();
      } else if ('equipment-logs' === s) {
        if (authToken && currentUser) { loadEquipment(); loadEquipmentLogs(); }
        document.getElementById('equipmentLogsSection')?.classList.remove('hidden');
      } else {
        document.getElementById(`${s}Section`)?.classList.remove('hidden');
      }
      
      if (window.innerWidth <= 768) sidebar.classList.remove('active');
      if ('dashboard' === s && map) setTimeout(() => map.invalidateSize(), 100);
    });
  });
  
  if (authToken && currentUser) restoreNavigation(sv);
}

function restoreNavigation(s) {
  if (!navItems || 0 === navItems.length) return;
  if (('equipment-logs' === s || 'users' === s) && currentUser && 'admin' !== currentUser.role && 'user_pusat' !== currentUser.role) s = 'dashboard';
  
  updateHeaderBreadcrumb(s);
  const t = document.querySelector(`.nav-item[data-section="${s}"]`);
  if (t) {
    navItems.forEach(n => n.classList.remove('active'));
    t.classList.add('active');
    contentSections.forEach(c => c.classList.add('hidden'));
    
    if ('cabang' === s) {
      document.getElementById('cabangSection')?.classList.remove('hidden');
      document.getElementById('monitoringSection')?.classList.add('hidden');
      window.cabangModule && window.cabangModule.loadAirports();
    } else if ('equipment-logs' === s) {
      if (authToken && currentUser) { loadEquipment(); loadEquipmentLogs(); }
      document.getElementById('equipmentLogsSection')?.classList.remove('hidden');
    } else {
      document.getElementById(`${s}Section`)?.classList.remove('hidden');
    }
    
    if ('dashboard' === s && map) setTimeout(() => map.invalidateSize(), 100);
  }
}

if (menuToggle) menuToggle.addEventListener('click', () => sidebar.classList.toggle('active'));
if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

function initEventListeners() {
  loginForm.addEventListener('submit', handleLogin);
  equipmentForm.addEventListener('submit', handleEquipmentSubmit);
  userForm.addEventListener('submit', handleUserSubmit);
  airportForm.addEventListener('submit', handleAirportSubmit);
  
  searchEquipment.addEventListener('input', handleEquipmentSearch);
  filterCategory.addEventListener('change', handleEquipmentFilter);
  filterAirport.addEventListener('change', handleEquipmentFilter);
  
  sidebarToggle.addEventListener('click', toggleSidebar);
}

function toggleSidebar() {
  sidebar.classList.toggle('minimized');
  sidebarToggle.classList.toggle('minimized');
  
  const mainContent = document.querySelector('.main-content');
  if (sidebar.classList.contains('minimized')) {
    mainContent.style.marginLeft = '80px';
  } else {
    mainContent.style.marginLeft = 'var(--sidebar-width)';
  }
}

// Load Airports
async function loadAirports() {
  try {
    const response = await fetch(`${API_URL}/airports`);
    airportsData = await response.json();
    
    updateAirportStats();
    populateAirportSelects();
    renderAirportTable();
    
    if (map) {
      updateMapMarkers();
    }
  } catch (error) {
    console.error('Error loading airports:', error);
  }
}

function updateAirportStats() {
  document.getElementById('totalAirports').textContent = airportsData.length;
  document.getElementById('normalAirports').textContent = airportsData.filter(a => a.status === 'Normal').length;
  document.getElementById('warningAirports').textContent = airportsData.filter(a => a.status === 'Warning').length;
  document.getElementById('alertAirports').textContent = airportsData.filter(a => a.status === 'Alert').length;
  document.getElementById('disconnectAirports').textContent = airportsData.filter(a => a.status === 'Disconnect').length;
  
  let categories = { Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0 };
  airportsData.forEach(airport => {
    Object.keys(categories).forEach(cat => {
      categories[cat] += airport.equipmentCount[cat] || 0;
    });
  });
  
  document.getElementById('commCount').textContent = categories.Communication;
  document.getElementById('navCount').textContent = categories.Navigation;
  document.getElementById('survCount').textContent = categories.Surveillance;
  document.getElementById('dataCount').textContent = categories['Data Processing'];
  document.getElementById('supportCount').textContent = categories.Support;
}

function populateAirportSelects() {
  const parentAirports = airportsData.filter(a => !a.parentId);
  const parentOptions = parentAirports.map(a => `<option value="${a.id}">${a.city}</option>`).join('');
  const defaultParentOption = '<option value="">None (Main Airport)</option>';
  
  if (airportParentSelect) {
    airportParentSelect.innerHTML = defaultParentOption + parentOptions;
  }
  
  const options = airportsData.map(a => {
    const indent = a.parentId ? '└─ ' : '';
    return `<option value="${a.id}">${indent}${a.name} - ${a.city}</option>`;
  }).join('');
  
  const defaultOption = '<option value="">Select Airport</option>';
  const allOption = '<option value="">All Airports</option>';
  
  equipmentAirportSelect.innerHTML = defaultOption + options;
  filterAirport.innerHTML = allOption + options;
}

function renderAirportTable() {
  airportTableBody.innerHTML = airportsData.map(airport => {
    const indent = airport.parentId ? '└─ ' : '';
    const hierarchyClass = airport.parentId ? 'child-airport' : 'parent-airport';
    return `
      <tr class="${hierarchyClass}">
        <td>${airport.id}</td>
        <td>${indent}${airport.name}</td>
        <td>${airport.city}</td>
        <td>${airport.lat}</td>
        <td>${airport.lng}</td>
        <td>${airport.parentName ? `<span class="parent-badge">${airport.parentName}</span>` : '<span class="main-airport-badge">Main</span>'}</td>
        <td>
          <div class="action-buttons">
            <button class="btn-edit" onclick="editAirport(${airport.id})" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-delete" onclick="deleteAirport(${airport.id})" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateMapMarkers() {
  if (!map) return;
  
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });
  
  const icons = {
    Normal: L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: #10b981; width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(16, 185, 129, 0.3); box-shadow: 0 0 10px rgba(16, 185, 129, 0.5), 0 2px 6px rgba(0,0,0,0.3); cursor: pointer;"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    }),
    Warning: L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: #f59e0b; width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(245, 158, 11, 0.3); box-shadow: 0 0 10px rgba(245, 158, 11, 0.5), 0 2px 6px rgba(0,0,0,0.3); cursor: pointer;"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    }),
    Alert: L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: #ef4444; width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(239, 68, 68, 0.3); box-shadow: 0 0 10px rgba(239, 68, 68, 0.5), 0 2px 6px rgba(0,0,0,0.3); cursor: pointer; animation: pulse 1.5s infinite;"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    }),
    Disconnect: L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: #6b7280; width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(107, 114, 128, 0.3); box-shadow: 0 0 10px rgba(107, 114, 128, 0.5), 0 2px 6px rgba(0,0,0,0.3); cursor: pointer;"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    })
  };
  
  airportsData.forEach(airport => {
    const normalizedStatus = normalizeStatus(airport.status);
    
    const marker = L.marker([airport.lat, airport.lng], {
      icon: icons[normalizedStatus] || icons['Normal']
    }).addTo(map);
    
    const popupContent = `
      <div class="popup-airport" style="min-width: 280px;">
        <h3 style="color: #1a1a2e; font-size: 1.1rem; margin-bottom: 8px;">${airport.name}</h3>
        <p style="color: #6b7280; font-size: 0.9rem; margin-bottom: 10px;">${airport.city}</p>
        <span class="popup-status ${normalizedStatus.toLowerCase()}" style="padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; background: ${normalizedStatus === 'Normal' ? 'rgba(16, 185, 129, 0.15)' : normalizedStatus === 'Warning' ? 'rgba(245, 158, 11, 0.15)' : normalizedStatus === 'Alert' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(107, 114, 128, 0.15)'}; color: ${normalizedStatus === 'Normal' ? '#10b981' : normalizedStatus === 'Warning' ? '#f59e0b' : normalizedStatus === 'Alert' ? '#ef4444' : '#6b7280'};">
          ${normalizedStatus}
        </span>
        <div style="margin-top: 10px; font-size: 0.8rem; color: #6b7280;">
          <p>Total Equipment: ${airport.totalEquipment || 0}</p>
        </div>
        ${normalizedStatus !== 'Normal' ? `
        <button onclick="viewAirportEquipment(${airport.id})" style="margin-top: 12px; width: 100%; padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">
          View Details
        </button>
        ` : ''}
      </div>
    `;
    
    let popupOpen = false;
    
    marker.on('mouseover', function(e) {
      this.openPopup();
      popupOpen = true;
    });
    
    marker.on('mouseout', function(e) {
      setTimeout(() => {
        if (!popupOpen) {
          this.closePopup();
        }
      }, 200);
    });
    
    marker.bindPopup(popupContent, {
      closeButton: false,
      keepInView: true
    });
    
    marker.on('popupopen', function() {
      const popup = this.getPopup();
      const popupElement = popup.getElement();
      if (popupElement) {
        popupElement.addEventListener('mouseenter', () => { popupOpen = true; });
        popupElement.addEventListener('mouseleave', () => { popupOpen = false; this.closePopup(); });
      }
    });
  });
}

window.viewAirportEquipment = function(airportId) {
  navItems.forEach(nav => nav.classList.remove('active'));
  document.querySelector('[data-section="equipment"]').classList.add('active');
  contentSections.forEach(sec => sec.classList.add('hidden'));
  document.getElementById('equipmentSection').classList.remove('hidden');
  
  filterAirport.value = airportId;
  filterCategory.value = '';
  searchEquipment.value = '';
  filterEquipment();
  
  if (map) map.closePopup();
};

// Load Equipment
let equipmentData = [];

async function loadEquipment() {
  try {
    const response = await fetch(`${API_URL}/equipment`, {
      headers: getAuthHeaders()
    });
    
    if (response.status === 401 || response.status === 403) {
      // Token expired or invalid
      authToken = null;
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      currentUser = null;
      showPublicDashboard();
      return;
    }
    
    equipmentData = await response.json();
    renderEquipmentTable(equipmentData);
  } catch (error) {
    console.error('Error loading equipment:', error);
  }
}

function renderEquipmentTable(data) {
  if (data.length === 0) {
    equipmentTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">No equipment data available</td>
      </tr>
    `;
    return;
  }
  
  equipmentTableBody.innerHTML = data.map(item => `
    <tr>
      <td><strong>${item.code}</strong></td>
      <td>${item.name}</td>
      <td><span class="category-badge ${item.category.toLowerCase().replace(' ', '-')}">${getCategoryIcon(item.category)} ${item.category}</span></td>
      <td>${item.airportName}</td>
      <td><span class="status-badge ${item.status}">${item.status}</span></td>
      <td>${item.hasSnmp ? '<span class="snmp-badge"><i class="fas fa-network-wired"></i> Active</span>' : '<span class="snmp-badge inactive"><i class="fas fa-network-wired"></i> -</span>'}</td>
      <td>
        <div class="action-buttons">
          ${item.hasSnmp ? `
          <button class="btn-snmp" onclick="viewSnmpData(${item.id})" title="View SNMP Data" style="background: #8b5cf6; color: white; padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;">
            <i class="fas fa-satellite-dish"></i>
          </button>
          ` : ''}
          ${currentUser.role === 'admin' || currentUser.role === 'user_pusat' || currentUser.role === 'teknisi_cabang' ? `
          <button class="btn-edit" onclick="editEquipment(${item.id})" title="Edit"><i class="fas fa-edit"></i></button>
          ` : ''}
          ${currentUser.role === 'admin' || currentUser.role === 'user_pusat' ? `
          <button class="btn-delete" onclick="deleteEquipment(${item.id})" title="Delete"><i class="fas fa-trash"></i></button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function getCategoryIcon(category) {
  const icons = { 'Communication': '<i class="fas fa-tower-broadcast"></i>', 'Navigation': '<i class="fas fa-compass"></i>', 'Surveillance': '<i class="fas fa-satellite-dish"></i>', 'Data Processing': '<i class="fas fa-server"></i>', 'Support': '<i class="fas fa-plug"></i>' };
  return icons[category] || '<i class="fas fa-cog"></i>';
}

async function handleEquipmentSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('equipmentId').value;
  const name = document.getElementById('equipmentName').value;
  const code = document.getElementById('equipmentCode').value;
  const category = document.getElementById('equipmentCategory').value;
  const status = document.getElementById('equipmentStatus').value;
  const airportId = parseInt(document.getElementById('equipmentAirport').value);
  const description = document.getElementById('equipmentDescription').value;
  
  const connectionMethod = connectionMethodSelect.value;
  const connectionTemplate = connectionTemplateSelect.value;
  
  let connectionConfig = { enabled: false };
  
  if (connectionMethod === 'snmp') {
    const snmpIP = document.getElementById('snmpIP').value;
    const snmpPort = parseInt(document.getElementById('snmpPort').value) || 161;
    const snmpCommunity = document.getElementById('snmpCommunity').value || 'public';
    connectionConfig = {
      enabled: snmpIP.trim() !== '',
      method: 'snmp',
      ip: snmpIP,
      port: snmpPort,
      community: snmpCommunity,
      templateId: connectionTemplate
    };
  } else if (connectionMethod === 'json') {
    const jsonURL = document.getElementById('jsonURL').value;
    const jsonInterval = parseInt(document.getElementById('jsonInterval').value) || 30;
    const jsonAuth = document.getElementById('jsonAuth').value;
    const jsonAuthValue = document.getElementById('jsonAuthValue').value;
    connectionConfig = {
      enabled: jsonURL.trim() !== '',
      method: 'json',
      url: jsonURL,
      interval: jsonInterval,
      auth: jsonAuth,
      authValue: jsonAuthValue,
      templateId: connectionTemplate
    };
  } else if (connectionMethod === 'serial') {
    const serialPort = document.getElementById('serialPort').value;
    const serialBaud = parseInt(document.getElementById('serialBaud').value) || 9600;
    const serialDataBits = parseInt(document.getElementById('serialDataBits').value) || 8;
    const serialStopBits = parseInt(document.getElementById('serialStopBits').value) || 1;
    connectionConfig = {
      enabled: serialPort.trim() !== '',
      method: 'serial',
      port: serialPort,
      baudRate: serialBaud,
      dataBits: serialDataBits,
      stopBits: serialStopBits,
      templateId: connectionTemplate
    };
  } else if (connectionMethod === 'tcp_serial') {
    const tcpSerialBridgeIP = document.getElementById('tcpSerialBridgeIP').value;
    const tcpSerialBridgePort = parseInt(document.getElementById('tcpSerialBridgePort').value) || 9000;
    const tcpSerialRemotePort = document.getElementById('tcpSerialRemotePort').value;
    const tcpSerialBaud = parseInt(document.getElementById('tcpSerialBaud').value) || 9600;
    const tcpSerialDataBits = parseInt(document.getElementById('tcpSerialDataBits').value) || 8;
    const tcpSerialStopBits = parseInt(document.getElementById('tcpSerialStopBits').value) || 1;
    connectionConfig = {
      enabled: tcpSerialBridgeIP.trim() !== '',
      method: 'tcp_serial',
      bridgeIP: tcpSerialBridgeIP,
      bridgePort: tcpSerialBridgePort,
      remotePort: tcpSerialRemotePort,
      baudRate: tcpSerialBaud,
      dataBits: tcpSerialDataBits,
      stopBits: tcpSerialStopBits,
      templateId: connectionTemplate
    };
  } else if (connectionMethod === 'tcp') {
    const tcpIP = document.getElementById('tcpIP').value;
    const tcpPort = parseInt(document.getElementById('tcpPort').value) || 5000;
    const tcpProtocol = document.getElementById('tcpProtocol').value;
    connectionConfig = {
      enabled: tcpIP.trim() !== '',
      method: 'tcp',
      ip: tcpIP,
      port: tcpPort,
      protocol: tcpProtocol,
      templateId: connectionTemplate
    };
  } else if (connectionMethod === 'mqtt') {
    const mqttBroker = document.getElementById('mqttBroker').value;
    const mqttTopic = document.getElementById('mqttTopic').value;
    const mqttClientId = document.getElementById('mqttClientId').value;
    const mqttQos = parseInt(document.getElementById('mqttQos').value) || 0;
    connectionConfig = {
      enabled: mqttBroker.trim() !== '',
      method: 'mqtt',
      broker: mqttBroker,
      topic: mqttTopic,
      clientId: mqttClientId,
      qos: mqttQos,
      templateId: connectionTemplate
    };
  } else if (connectionMethod === 'modbus') {
    const modbusType = document.getElementById('modbusType').value;
    const modbusIP = document.getElementById('modbusIP').value;
    const modbusUnitId = parseInt(document.getElementById('modbusUnitId').value) || 1;
    const modbusRegister = document.getElementById('modbusRegister').value;
    connectionConfig = {
      enabled: modbusIP.trim() !== '',
      method: 'modbus',
      type: modbusType,
      ip: modbusIP,
      unitId: modbusUnitId,
      registerMap: modbusRegister,
      templateId: connectionTemplate
    };
  }
  
  const equipment = { 
    name, code, category, status, airportId, description,
    snmpConfig: connectionConfig
  };
  
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/equipment/${id}` : `${API_URL}/equipment`;
    
    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(equipment)
    });
    
    if (response.ok) {
      equipmentModal.classList.add('hidden');
      resetEquipmentForm();
      loadEquipment();
      loadAirports();
      if (map) updateMapMarkers();
    } else {
      const data = await response.json();
      alert(data.message || 'Error saving equipment');
    }
  } catch (error) {
    console.error('Error saving equipment:', error);
  }
}

window.editEquipment = function(id) {
  const equipment = equipmentData.find(e => e.id === id);
  if (!equipment) return;
  
  document.getElementById('equipmentId').value = equipment.id;
  document.getElementById('equipmentName').value = equipment.name;
  document.getElementById('equipmentCode').value = equipment.code;
  document.getElementById('equipmentCategory').value = equipment.category;
  document.getElementById('equipmentStatus').value = equipment.status;
  document.getElementById('equipmentAirport').value = equipment.airportId;
  document.getElementById('equipmentDescription').value = equipment.description || '';
  
  const snmpConfig = equipment.snmp_config || {};
  const connectionMethod = snmpConfig.method || 'snmp';
  
  if (snmpConfig && snmpConfig.enabled) {
    connectionMethodSelect.value = connectionMethod;
    connectionTemplateSelect.value = snmpConfig.templateId || '';
    
    connectionMethodSelect.dispatchEvent(new Event('change'));
    
    setTimeout(() => {
      if (connectionMethod === 'snmp') {
        document.getElementById('snmpIP').value = snmpConfig.ip || '';
        document.getElementById('snmpPort').value = snmpConfig.port || 161;
        document.getElementById('snmpCommunity').value = snmpConfig.community || 'public';
      } else if (connectionMethod === 'json') {
        document.getElementById('jsonURL').value = snmpConfig.url || '';
        document.getElementById('jsonInterval').value = snmpConfig.interval || 30;
        document.getElementById('jsonAuth').value = snmpConfig.auth || 'none';
        document.getElementById('jsonAuthValue').value = snmpConfig.authValue || '';
      } else if (snmpConfig.method === 'serial') {
        document.getElementById('serialPort').value = snmpConfig.port || '';
        document.getElementById('serialBaud').value = snmpConfig.baudRate || 9600;
        document.getElementById('serialDataBits').value = snmpConfig.dataBits || 8;
        document.getElementById('serialStopBits').value = snmpConfig.stopBits || 1;
      } else if (snmpConfig.method === 'tcp_serial') {
        document.getElementById('tcpSerialBridgeIP').value = snmpConfig.bridgeIP || '';
        document.getElementById('tcpSerialBridgePort').value = snmpConfig.bridgePort || 9000;
        document.getElementById('tcpSerialRemotePort').value = snmpConfig.remotePort || '';
        document.getElementById('tcpSerialBaud').value = snmpConfig.baudRate || 9600;
        document.getElementById('tcpSerialDataBits').value = snmpConfig.dataBits || 8;
        document.getElementById('tcpSerialStopBits').value = snmpConfig.stopBits || 1;
      } else if (snmpConfig.method === 'tcp') {
        document.getElementById('tcpIP').value = snmpConfig.ip || '';
        document.getElementById('tcpPort').value = snmpConfig.port || 5000;
        document.getElementById('tcpProtocol').value = snmpConfig.protocol || 'raw';
      } else if (snmpConfig.method === 'mqtt') {
        document.getElementById('mqttBroker').value = snmpConfig.broker || '';
        document.getElementById('mqttTopic').value = snmpConfig.topic || '';
        document.getElementById('mqttClientId').value = snmpConfig.clientId || '';
        document.getElementById('mqttQos').value = snmpConfig.qos || 0;
      } else if (snmpConfig.method === 'modbus') {
        document.getElementById('modbusType').value = snmpConfig.type || 'tcp';
        document.getElementById('modbusIP').value = snmpConfig.ip || '';
        document.getElementById('modbusUnitId').value = snmpConfig.unitId || 1;
        document.getElementById('modbusRegister').value = snmpConfig.registerMap || '';
      }
    }, 100);
  } else {
    connectionMethodSelect.value = 'snmp';
    connectionTemplateSelect.value = '';
    connectionMethodSelect.dispatchEvent(new Event('change'));
  }
  
  formTitle.textContent = 'Edit Equipment';
  equipmentModal.classList.remove('hidden');
};

async function deleteEquipment(id) {
  if (!confirm('Are you sure you want to delete this equipment?')) return;
  
  try {
    const response = await fetch(`${API_URL}/equipment/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (response.ok) {
      loadEquipment();
      loadAirports();
      if (map) updateMapMarkers();
    }
  } catch (error) {
    console.error('Error deleting equipment:', error);
  }
}

function resetEquipmentForm() {
  equipmentForm.reset();
  document.getElementById('equipmentId').value = '';
  formTitle.textContent = 'Add New Equipment';
  
  if (connectionMethodSelect) {
    connectionMethodSelect.value = 'snmp';
    connectionMethodSelect.dispatchEvent(new Event('change'));
  }
  if (connectionTemplateSelect) {
    connectionTemplateSelect.value = '';
  }
}

function handleEquipmentSearch(e) { filterEquipment(); }
function handleEquipmentFilter() { filterEquipment(); }

function filterEquipment() {
  const searchTerm = searchEquipment.value.toLowerCase();
  const category = filterCategory.value;
  const airport = filterAirport.value;
  
  let filtered = equipmentData.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(searchTerm) || item.code.toLowerCase().includes(searchTerm) || item.category.toLowerCase().includes(searchTerm);
    const matchCategory = !category || item.category === category;
    const matchAirport = !airport || item.airportId === parseInt(airport);
    return matchSearch && matchCategory && matchAirport;
  });
  
  renderEquipmentTable(filtered);
}

// User Management
async function loadUsers() {
  if (currentUser.role !== 'admin' && currentUser.role !== 'user_pusat') return;
  
  try {
    const response = await fetch(`${API_URL}/users`, {
      headers: getAuthHeaders()
    });
    
    if (response.status === 401 || response.status === 403) {
      authToken = null;
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      currentUser = null;
      showPublicDashboard();
      return;
    }
    
    const users = await response.json();
    renderUserTable(users);
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function renderUserTable(users) {
  userTableBody.innerHTML = users.map(user => `
    <tr>
      <td>${user.id}</td>
      <td>${user.name}</td>
      <td>${user.username}</td>
      <td><span class="role-badge ${user.role}">${getRoleLabel(user.role)}</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn-view" onclick="viewUserDetail(${user.id})" title="View Details" style="background: #10b981; color: white; padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn-edit" onclick="editUser(${user.id})" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteUser(${user.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function getRoleLabel(role) {
  const labels = {
    'admin': 'Admin',
    'user_pusat': 'User Pusat',
    'teknisi_cabang': 'Teknisi',
    'user_cabang': 'User'
  };
  return labels[role] || role;
}

async function handleUserSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('userId').value;
  const name = document.getElementById('userName').value;
  const username = document.getElementById('userUsername').value;
  const password = document.getElementById('userPassword').value;
  const role = document.getElementById('userRole').value;
  
  const userData = { name, username, role };
  if (password) userData.password = password;
  
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/users/${id}` : `${API_URL}/users`;
    
    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(userData)
    });
    
    if (response.ok) {
      userModal.classList.add('hidden');
      resetUserForm();
      loadUsers();
    } else {
      const data = await response.json();
      alert(data.message || 'Error saving user');
    }
  } catch (error) {
    console.error('Error saving user:', error);
  }
}

window.editUser = async function(id) {
  try {
    const response = await fetch(`${API_URL}/users`, {
      headers: getAuthHeaders()
    });
    const users = await response.json();
    const user = users.find(u => u.id === id);
    
    if (!user) return;
    
    document.getElementById('userId').value = user.id;
    document.getElementById('userName').value = user.name;
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = user.role;
    
    userModalFormTitle.textContent = 'Edit User';
    userModal.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading user:', error);
  }
};

async function deleteUser(id) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  
  try {
    await fetch(`${API_URL}/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    loadUsers();
  } catch (error) {
    console.error('Error deleting user:', error);
  }
}

function resetUserForm() {
  userForm.reset();
  document.getElementById('userId').value = '';
  document.getElementById('userModalFormTitle').textContent = 'Add New User';
  document.getElementById('userUsername').readOnly = false;
}

window.viewUserDetail = async function(userId) {
  try {
    const response = await fetch(`${API_URL}/users`, {
      headers: getAuthHeaders()
    });
    const users = await response.json();
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      alert('User not found');
      return;
    }
    
    const userDetailContent = document.getElementById('userDetailContent');
    userDetailContent.innerHTML = `
      <div class="user-detail-grid">
        <div class="user-detail-item">
          <label>ID</label>
          <span>${user.id}</span>
        </div>
        <div class="user-detail-item">
          <label>Name</label>
          <span>${user.name}</span>
        </div>
        <div class="user-detail-item">
          <label>Username</label>
          <span>${user.username}</span>
        </div>
        <div class="user-detail-item">
          <label>Role</label>
          <span class="role-badge ${user.role}">${getRoleLabel(user.role)}</span>
        </div>
        <div class="user-detail-item">
          <label>Branch</label>
          <span>${user.branchName || 'Pusat (All)'}</span>
        </div>
      </div>
      <div class="user-detail-actions">
        <button class="btn btn-primary" onclick="editUser(${user.id}); document.getElementById('userDetailModal').classList.add('hidden');">
          <i class="fas fa-edit"></i> Edit User
        </button>
        <button class="btn btn-secondary" onclick="document.getElementById('userDetailModal').classList.add('hidden');">
          <i class="fas fa-times"></i> Close
        </button>
      </div>
    `;
    
    document.getElementById('userDetailModal').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading user detail:', error);
    alert('Error loading user detail');
  }
};

// Airport Management
async function handleAirportSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('airportId').value;
  const name = document.getElementById('airportName').value;
  const city = document.getElementById('airportCity').value;
  const lat = parseFloat(document.getElementById('airportLat').value);
  const lng = parseFloat(document.getElementById('airportLng').value);
  const parentId = document.getElementById('airportParent').value ? parseInt(document.getElementById('airportParent').value) : null;
  
  const airportData = { name, city, lat, lng, parentId };
  
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/airports/${id}` : `${API_URL}/airports`;
    
    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(airportData)
    });
    
    if (response.ok) {
      airportModal.classList.add('hidden');
      resetAirportForm();
      loadAirports();
    } else {
      const data = await response.json();
      alert(data.message || 'Error saving airport');
    }
  } catch (error) {
    console.error('Error saving airport:', error);
  }
}

window.editAirport = function(id) {
  const airport = airportsData.find(a => a.id === id);
  if (!airport) return;
  
  document.getElementById('airportId').value = airport.id;
  document.getElementById('airportName').value = airport.name;
  document.getElementById('airportCity').value = airport.city;
  document.getElementById('airportLat').value = airport.lat;
  document.getElementById('airportLng').value = airport.lng;
  
  if (airportParentSelect) {
    airportParentSelect.value = airport.parentId || '';
  }
  
  airportModalFormTitle.textContent = 'Edit Airport';
  airportModal.classList.remove('hidden');
};

async function deleteAirport(id) {
  if (!confirm('Are you sure you want to delete this airport? All equipment at this airport will also be affected.')) return;
  
  try {
    await fetch(`${API_URL}/airports/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    loadAirports();
  } catch (error) {
    console.error('Error deleting airport:', error);
  }
}

function resetAirportForm() {
  airportForm.reset();
  document.getElementById('airportId').value = '';
  airportModalFormTitle.textContent = 'Add New Airport';
}

window.viewSnmpData = async function(equipmentId) {
  const equipment = equipmentData.find(e => e.id === equipmentId);
  const snmpConfig = equipment.snmp_config || {};
  
  if (!equipment || !snmpConfig || !snmpConfig.enabled) {
    alert('SNMP is not enabled for this equipment');
    return;
  }
  
  const snmpDataContent = document.getElementById('snmpDataContent');
  snmpDataContent.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-primary);"></i><p style="margin-top: 15px;">Loading SNMP data...</p></div>';
  document.getElementById('snmpDataModal').classList.remove('hidden');
  
  try {
    const response = await fetch(`${API_URL}/snmp/data/${equipmentId}`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to fetch SNMP data');
    }
    
    if (data.error) {
      snmpDataContent.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-danger); border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h4 style="color: var(--accent-danger); margin-bottom: 10px;"><i class="fas fa-exclamation-triangle"></i> Warning</h4>
          <p style="color: var(--text-secondary);">${data.error}</p>
          ${data.cached ? '<p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 10px;">Showing cached data from previous successful connection</p>' : ''}
        </div>
      `;
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">';
    
    for (const [key, value] of Object.entries(data)) {
      if (key === 'error' || key === 'cached') continue;
      
      const isObject = value !== null && typeof value === 'object';
      let finalValue = isObject ? value.value : value;
      let finalLabel = isObject && value.label ? value.label : key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const finalUnit = isObject && value.unit ? value.unit : '';
      
      // --- HAPUS TULISAN DALAM KURUNG PADA LABEL ---
      finalLabel = finalLabel.replace(/\s*\(1=Online,\s*2=Battery\)/gi, '');
      
      // --- PENERJEMAH NILAI (TRANSLATOR) UNTUK STATUS ---
      const lblLower = finalLabel.toLowerCase();
      if (lblLower.includes('ups status') || lblLower.includes('ups')) {
        if (finalValue === '0' || finalValue === '2') finalValue = '<span style="color: #f59e0b; font-weight: bold;">Battery</span>';
        else if (finalValue === '1') finalValue = '<span style="color: #10b981; font-weight: bold;">Online</span>';
      } else if (lblLower.includes('power status') || lblLower.includes('fan status') || lblLower.includes('cooling')) {
        if (finalValue === '0') finalValue = '<span style="color: #ef4444; font-weight: bold;">OFF</span>';
        else if (finalValue === '1') finalValue = '<span style="color: #10b981; font-weight: bold;">ON</span>';
      } else if (lblLower.includes('alarm status') || lblLower.includes('radar status')) {
        if (finalValue === '0') finalValue = '<span style="color: #10b981; font-weight: bold;">Normal</span>';
        else if (finalValue === '1') finalValue = '<span style="color: #f59e0b; font-weight: bold;">Warning</span>';
        else if (finalValue === '2') finalValue = '<span style="color: #ef4444; font-weight: bold;">Critical</span>';
      }
      html += `
        <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="color: var(--text-muted); font-size: 0.75rem; margin-bottom: 5px;">${finalLabel}</div>
          <div style="color: var(--text-primary); font-size: 1.1rem; font-weight: 600;">${finalValue} <span style="font-size: 0.85rem; color: var(--text-muted);">${finalUnit}</span></div>
        </div>
      `;
    }
    html += '</div>';
    
    snmpDataContent.innerHTML = html;
  } catch (error) {
    console.error('Error fetching SNMP data:', error);
    snmpDataContent.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-danger); border-radius: 8px; padding: 20px;">
        <h4 style="color: var(--accent-danger); margin-bottom: 10px;"><i class="fas fa-times-circle"></i> Error</h4>
        <p style="color: var(--text-secondary);">${error.message}</p>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 15px;">
          Make sure:<br>
          1. Device IP ${snmpConfig.ip} is reachable<br>
          2. SNMP port ${snmpConfig.port} is open<br>
          3. Community string "${snmpConfig.community}" is correct
        </p>
      </div>
    `;
  }
};

window.editEquipment = editEquipment;
window.deleteEquipment = deleteEquipment;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.editAirport = editAirport;
window.deleteAirport = deleteAirport;
window.viewSnmpData = viewSnmpData;
window.viewUserProfile = viewUserProfile;

function viewUserProfile(userId) {
  try {
    const user = currentUser;
    
    if (!user) {
      alert('User not found');
      return;
    }
    
    const userDetailContent = document.getElementById('userDetailContent');
    userDetailContent.innerHTML = `
      <div class="user-detail-grid">
        <div class="user-detail-item">
          <label>ID</label>
          <span>${user.id}</span>
        </div>
        <div class="user-detail-item">
          <label>Name</label>
          <span>${user.name}</span>
        </div>
        <div class="user-detail-item">
          <label>Username</label>
          <span>${user.username}</span>
        </div>
        <div class="user-detail-item">
          <label>Role</label>
          <span class="role-badge ${user.role}">${getRoleLabel(user.role)}</span>
        </div>
        <div class="user-detail-item">
          <label>Branch</label>
          <span>${user.branchName || 'Pusat (All)'}</span>
        </div>
      </div>
      <div class="user-detail-actions">
        <button class="btn btn-primary" onclick="editCurrentUserProfile(${user.id});">
          <i class="fas fa-edit"></i> Edit Profile
        </button>
        <button class="btn btn-secondary" onclick="document.getElementById('userDetailModal').classList.add('hidden');">
          <i class="fas fa-times"></i> Close
        </button>
      </div>
    `;
    
    document.getElementById('userDetailModal').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading user profile:', error);
    alert('Error loading user profile');
  }
}

window.editCurrentUserProfile = function(userId) {
  document.getElementById('userDetailModal').classList.add('hidden');
  
  document.getElementById('userId').value = currentUser.id;
  document.getElementById('userName').value = currentUser.name;
  document.getElementById('userUsername').value = currentUser.username;
  document.getElementById('userPassword').value = '';
  document.getElementById('userRole').value = currentUser.role;
  
  document.getElementById('userUsername').readOnly = true;
  
  document.getElementById('userModalFormTitle').textContent = 'Edit Profile';
  document.getElementById('userModal').classList.remove('hidden');
};

// SNMP Template Management
async function loadSnmpTemplates() {
  try {
    const response = await fetch(`${API_URL}/snmp/templates`, {
      headers: getAuthHeaders()
    });
    
    if (response.status === 401 || response.status === 403) {
      return;
    }
    
    snmpTemplatesData = await response.json();
    renderSnmpTemplateTable();
    updateConnectionTemplateSelect();
  } catch (error) {
    console.error('Error loading SNMP templates:', error);
  }
}

function renderSnmpTemplateTable() {
  if (snmpTemplatesData.length === 0) {
    snmpTemplateTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No templates available</td>
      </tr>
    `;
    return;
  }
  
  snmpTemplateTableBody.innerHTML = snmpTemplatesData.map(template => `
    <tr>
      <td><strong>${template.name}</strong></td>
      <td>${template.description || '-'}</td>
      <td><code>${template.oidBase}</code></td>
      <td>${template.isDefault ? '<span class="default-template-badge">Default</span>' : '<span class="custom-template-badge">Custom</span>'}</td>
      <td>${Object.keys(template.oidMappings || {}).length} mappings</td>
      <td>
        <div class="action-buttons">
          <button class="btn-view" onclick="viewSnmpTemplate('${template.id}')" title="View Details" style="background: #10b981; color: white; padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;">
            <i class="fas fa-eye"></i>
          </button>
          ${!template.isDefault ? `
          <button class="btn-edit" onclick="editSnmpTemplate('${template.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteSnmpTemplate('${template.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function updateConnectionTemplateSelect() {
  const connectionTemplateSelect = document.getElementById('connectionTemplate');
  if (!connectionTemplateSelect) return;
  
  const options = snmpTemplatesData.map(t => 
    `<option value="${t.id}">${t.name}</option>`
  ).join('');
  
  connectionTemplateSelect.innerHTML = '<option value="">Select Template</option>' + options;
}

window.viewSnmpTemplate = function(templateId) {
  const template = snmpTemplatesData.find(t => t.id === templateId);
  if (!template) return;
  
  let mappingsHtml = '<table style="width: 100%; font-size: 0.85rem;"><thead><tr><th>Name</th><th>OID</th><th>Type</th><th>Label</th><th>Thresholds</th></tr></thead><tbody>';
  
  for (const [key, mapping] of Object.entries(template.oidMappings)) {
    let thresholds = '-';
    if (mapping.warningThreshold !== undefined || mapping.criticalThreshold !== undefined) {
      thresholds = `W: ${mapping.warningThreshold ?? '-'}, C: ${mapping.criticalThreshold ?? '-'}`;
    } else if (mapping.warningLow !== undefined) {
      thresholds = `W: ${mapping.warningLow}-${mapping.warningHigh}, C: ${mapping.criticalLow}-${mapping.criticalHigh}`;
    }
    
    mappingsHtml += `<tr>
      <td><code>${key}</code></td>
      <td><code>${template.oidBase}.${mapping.oid}</code></td>
      <td>${mapping.type || 'string'}</td>
      <td>${mapping.label || '-'}</td>
      <td>${thresholds}</td>
    </tr>`;
  }
  mappingsHtml += '</tbody></table>';
  
  const snmpDataContent = document.getElementById('snmpDataContent');
  snmpDataContent.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h4 style="margin-bottom: 10px;">${template.name}</h4>
      <p style="color: var(--text-secondary);">${template.description || 'No description'}</p>
      <p><strong>OID Base:</strong> <code>${template.oidBase}</code></p>
      <p><strong>Type:</strong> ${template.isDefault ? '<span class="default-template-badge">Default</span>' : '<span class="custom-template-badge">Custom</span>'}</p>
    </div>
    <h5 style="margin-bottom: 10px;">OID Mappings (${Object.keys(template.oidMappings).length})</h5>
    ${mappingsHtml}
  `;
  
  document.getElementById('snmpDataModal').classList.remove('hidden');
};

window.editSnmpTemplate = function(templateId) {
  const template = snmpTemplatesData.find(t => t.id === templateId);
  if (!template) return;
  
  document.getElementById('snmpTemplateId').value = template.id;
  document.getElementById('snmpTemplateName').value = template.name;
  document.getElementById('snmpTemplateDescription').value = template.description || '';
  document.getElementById('snmpTemplateOidBase').value = template.oidBase;
  
  oidMappingsContainer.innerHTML = '';
  for (const [key, mapping] of Object.entries(template.oidMappings)) {
    addOidMappingRow(key, mapping);
  }
  
  snmpTemplateModalFormTitle.textContent = 'Edit SNMP Template';
  snmpTemplateModal.classList.remove('hidden');
};

window.deleteSnmpTemplate = async function(templateId) {
  if (!confirm('Are you sure you want to delete this template?')) return;
  
  try {
    const response = await fetch(`${API_URL}/snmp/templates/${templateId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (response.ok) {
      loadSnmpTemplates();
      loadEquipment();
    }
  } catch (error) {
    console.error('Error deleting template:', error);
  }
};

function addOidMappingRow(key = '', mapping = { oid: '', type: 'string', label: '', warningThreshold: '', criticalThreshold: '' }) {
  const row = document.createElement('div');
  row.className = 'oid-mapping-row';
  row.innerHTML = `
    <div class="form-group">
      <label>Name</label>
      <input type="text" class="oid-key" value="${key}" placeholder="e.g., temperature">
    </div>
    <div class="form-group">
      <label>OID Suffix</label>
      <input type="text" class="oid-value" value="${mapping.oid}" placeholder="e.g., 6.1.0">
    </div>
    <div class="form-group">
      <label>Type</label>
      <select class="oid-type">
        <option value="string" ${mapping.type === 'string' ? 'selected' : ''}>String</option>
        <option value="integer" ${mapping.type === 'integer' ? 'selected' : ''}>Integer</option>
        <option value="timeticks" ${mapping.type === 'timeticks' ? 'selected' : ''}>Timeticks</option>
      </select>
    </div>
    <div class="form-group">
      <label>Label</label>
      <input type="text" class="oid-label" value="${mapping.label || ''}" placeholder="Display Name">
    </div>
    <div class="form-group">
      <label>Warning</label>
      <input type="number" class="oid-warning" value="${mapping.warningThreshold !== undefined ? mapping.warningThreshold : ''}" placeholder="W">
    </div>
    <div class="form-group">
      <label>Critical</label>
      <input type="number" class="oid-critical" value="${mapping.criticalThreshold !== undefined ? mapping.criticalThreshold : ''}" placeholder="C">
    </div>
    <button type="button" class="btn-remove" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  oidMappingsContainer.appendChild(row);
}

function getOidMappingsFromForm() {
  const mappings = {};
  const rows = oidMappingsContainer.querySelectorAll('.oid-mapping-row');
  
  rows.forEach(row => {
    const key = row.querySelector('.oid-key').value.trim();
    const oid = row.querySelector('.oid-value').value.trim();
    const type = row.querySelector('.oid-type').value;
    const label = row.querySelector('.oid-label').value.trim();
    const warningThreshold = row.querySelector('.oid-warning').value;
    const criticalThreshold = row.querySelector('.oid-critical').value;
    
    if (key && oid) {
      const mapping = { oid, type };
      if (label) mapping.label = label;
      if (warningThreshold) mapping.warningThreshold = parseInt(warningThreshold);
      if (criticalThreshold) mapping.criticalThreshold = parseInt(criticalThreshold);
      mappings[key] = mapping;
    }
  });
  
  return mappings;
}

async function handleSnmpTemplateSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('snmpTemplateId').value;
  const name = document.getElementById('snmpTemplateName').value;
  const description = document.getElementById('snmpTemplateDescription').value;
  const oidBase = document.getElementById('snmpTemplateOidBase').value;
  const oidMappings = getOidMappingsFromForm();
  
  if (Object.keys(oidMappings).length === 0) {
    alert('Please add at least one OID mapping');
    return;
  }
  
  const templateData = { name, description, oidBase, oidMappings };
  
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/snmp/templates/${id}` : `${API_URL}/snmp/templates`;
    
    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(templateData)
    });
    
    if (response.ok) {
      snmpTemplateModal.classList.add('hidden');
      resetSnmpTemplateForm();
      loadSnmpTemplates();
    } else {
      const data = await response.json();
      alert(data.message || 'Error saving template');
    }
  } catch (error) {
    console.error('Error saving template:', error);
  }
}

function resetSnmpTemplateForm() {
  snmpTemplateForm.reset();
  document.getElementById('snmpTemplateId').value = '';
  oidMappingsContainer.innerHTML = '';
  snmpTemplateModalFormTitle.textContent = 'Add Custom SNMP Template';
}

function initSnmpTemplateModal() {
  if (!addSnmpTemplateBtn) return;
  
  addSnmpTemplateBtn.addEventListener('click', () => {
    resetSnmpTemplateForm();
    snmpTemplateModal.classList.remove('hidden');
  });
  
  if (document.getElementById('closeSnmpTemplateModal')) {
    document.getElementById('closeSnmpTemplateModal').addEventListener('click', () => {
      snmpTemplateModal.classList.add('hidden');
      resetSnmpTemplateForm();
    });
  }
  
  if (document.getElementById('cancelSnmpTemplateEdit')) {
    document.getElementById('cancelSnmpTemplateEdit').addEventListener('click', () => {
      snmpTemplateModal.classList.add('hidden');
      resetSnmpTemplateForm();
    });
  }
  
  if (snmpTemplateModal) {
    snmpTemplateModal.addEventListener('click', (e) => {
      if (e.target === snmpTemplateModal) {
        snmpTemplateModal.classList.add('hidden');
        resetSnmpTemplateForm();
      }
    });
  }
  
  if (addOidMappingBtn) {
    addOidMappingBtn.addEventListener('click', () => {
      addOidMappingRow();
    });
  }
  
  if (snmpTemplateForm) {
    snmpTemplateForm.addEventListener('submit', handleSnmpTemplateSubmit);
  }
}

window.editSnmpTemplate = editSnmpTemplate;
window.deleteSnmpTemplate = deleteSnmpTemplate;
window.viewSnmpTemplate = viewSnmpTemplate;

// Equipment Logs Functions
function initEquipmentLogs() {
  // Initialize equipment logs functionality
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', loadEquipmentLogs);
  }
  
  if (filterLogEquipment) {
    filterLogEquipment.addEventListener('change', loadEquipmentLogs);
  }
  
  if (filterLogSource) {
    filterLogSource.addEventListener('change', loadEquipmentLogs);
  }
}

async function loadEquipmentLogs() {
  if (!authToken || !currentUser) return;
  
  try {
    const equipmentId = filterLogEquipment ? filterLogEquipment.value : '';
    const source = filterLogSource ? filterLogSource.value : '';
    
    let url = `${API_URL}/equipment/logs?page=${logsPagination.currentPage}&limit=${logsPagination.pageSize}`;
    if (equipmentId) url += `&equipmentId=${equipmentId}`;
    if (source) url += `&source=${source}`;
    
    const response = await fetch(url, {
      headers: getAuthHeaders()
    });
    
    if (response.status === 401 || response.status === 403) {
      authToken = null;
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      currentUser = null;
      showPublicDashboard();
      return;
    }
    
    const result = await response.json();
    equipmentLogsData = result.data || [];
    logsPagination.total = result.total || 0;
    logsPagination.totalPages = result.totalPages || 1;
    
    renderEquipmentLogsTable();
  } catch (error) {
    console.error('Error loading equipment logs:', error);
  }
}

function renderEquipmentLogsTable() {
  if (!equipmentLogsTableBody) return;
  
  if (equipmentLogsData.length === 0) {
    equipmentLogsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No logs available</td>
      </tr>
    `;
    return;
  }
  
  equipmentLogsTableBody.innerHTML = equipmentLogsData.map(log => {
    const data = log.data || {};
    const status = data.status || 'Normal';
    const timestamp = new Date(log.created_at || log.createdAt).toLocaleString('id-ID');
    
    return `
      <tr>
        <td>${log.equipment_code || '-'}</td>
        <td>${log.equipment_name || '-'}</td>
        <td><span class="status-badge ${status.toLowerCase()}">${status}</span></td>
        <td>${log.source || 'manual'}</td>
        <td>${timestamp}</td>
        <td>
          <button class="btn-view" onclick="viewLogDetail(${log.id})" title="View Details" style="background: #10b981; color: white; padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.viewLogDetail = function(logId) {
  const log = equipmentLogsData.find(l => l.id === logId);
  if (!log) return;
  
  const data = log.data || {};
  let detailsHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">';
  
  for (const [key, value] of Object.entries(data)) {
    if (key === 'status') continue;
    const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
    detailsHtml += `
      <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
        <div style="color: var(--text-muted); font-size: 0.75rem; margin-bottom: 5px;">${key}</div>
        <div style="color: var(--text-primary); font-size: 1rem; font-weight: 600;">${displayValue}</div>
      </div>
    `;
  }
  detailsHtml += '</div>';
  
  const snmpDataContent = document.getElementById('snmpDataContent');
  if (snmpDataContent) {
    snmpDataContent.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h4 style="margin-bottom: 10px;">${log.equipment_name || 'Equipment Log'}</h4>
        <p><strong>Code:</strong> ${log.equipment_code || '-'}</p>
        <p><strong>Status:</strong> <span class="status-badge ${(data.status || 'normal').toLowerCase()}">${data.status || 'Normal'}</span></p>
        <p><strong>Source:</strong> ${log.source || 'manual'}</p>
        <p><strong>Time:</strong> ${new Date(log.created_at || log.createdAt).toLocaleString('id-ID')}</p>
      </div>
      <h5 style="margin-bottom: 10px;">Log Data</h5>
      ${detailsHtml}
    `;
    document.getElementById('snmpDataModal').classList.remove('hidden');
  }
};
