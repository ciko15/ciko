// API Base URL
// Global Variables
window.API_URL = '/api';
window.authToken = null;
window.currentUser = null;
window.liveDataTimer = null;
window.autoRefreshTimer = null;
window.isAutoRefreshEnabled = true;
window.currentViewedEquipmentId = null;
window.DEBUG_MODE = true;

// Auto-refresh configuration (20 seconds)
const AUTO_REFRESH_INTERVAL = 20000; // 20 seconds


// Auth Helpers
window.getAuthHeaders = function() {
  const h = { 'Content-Type': 'application/json' };
  const token = window.authToken || localStorage.getItem('authToken');
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
};

window.debugLog = function(msg, data) {
  if (window.DEBUG_MODE || (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE)) {
    console.log(`[DEBUG] ${msg}`, data || '');
  }
};

function initAuth() {
  const t = localStorage.getItem('authToken');
  if (t) window.authToken = t;
}

// ============================================
// AUTO REFRESH FUNCTIONALITY
// Refresh equipment status every 20 seconds
// ============================================

function startAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }
  
  // Refresh equipment data and dashboard stats
  autoRefreshTimer = setInterval(async () => {
    if (!isAutoRefreshEnabled || !authToken || !currentUser) {
      return;
    }
    
    debugLog('[AUTO REFRESH] Refreshing equipment data...');
    
    try {
      // Refresh equipment data
      await loadEquipment();
      
      // Refresh dashboard stats
      await updateDashboardStats(true); // Kirim flag true agar loading spinner tidak berputar-putar
      
      // Refresh cabang module if active
      if (window.cabangModule && selectedAirportForMonitoring) {
        await loadAirportEquipment(selectedAirportForMonitoring.id);
      }
      
      debugLog('[AUTO REFRESH] Data refreshed successfully');
    } catch (error) {
      console.error('[AUTO REFRESH] Error refreshing data:', error);
    }
  }, AUTO_REFRESH_INTERVAL);
  
  debugLog(`[AUTO REFRESH] Started - interval: ${AUTO_REFRESH_INTERVAL}ms`);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    debugLog('[AUTO REFRESH] Stopped');
  }
}

function toggleAutoRefresh(enable) {
  isAutoRefreshEnabled = enable;
  debugLog(`[AUTO REFRESH] ${enable ? 'Enabled' : 'Disabled'}`);
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
  surveillance: { label: 'Surveillance', icon: 'fa-satellite-dish' },
  'configuration': { label: 'Configuration', icon: 'fa-cog' },
  'snmp-templates': { label: 'Data Parsing Templates', icon: 'fa-network-wired' },
  'snmp-tools': { label: 'SNMP Tools', icon: 'fa-wrench' },
  'network-tools': { label: 'Network Tools', icon: 'fa-network-wired' },
  'threshold-settings': { label: 'Threshold Settings', icon: 'fa-sliders-h' },
  'equipment-logs': { label: 'Equipment Logs', icon: 'fa-history' },
  users: { label: 'User Management', icon: 'fa-users' }
};

function updateHeaderBreadcrumb(section, detail = null) {
  const hb = document.getElementById('headerBreadcrumb');
  if (!hb) return;
  const m = sectionMetadata[section];
  if (m) {
    let html = `<span class="breadcrumb-icon"><i class="fas ${m.icon}"></i></span><span class="breadcrumb-text">${m.label}</span>`;
    if (detail) {
      html += `<i class="fas fa-chevron-right" style="font-size: 0.9rem; margin: 0 10px; color: var(--text-muted);"></i><span style="color: var(--accent-primary); font-weight: 700;">${detail}</span>`;
    }
    hb.innerHTML = html;
  }
}

// Equipment Logs
function initEquipmentLogs() {
  // Initialize equipment logs functionality
  console.log('[DEBUG] Initializing equipment logs...');
  
  const refreshBtn = document.getElementById('refreshLogsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (typeof loadEquipmentLogs === 'function') {
        loadEquipmentLogs();
      }
    });
  }
  
  const filterEquipment = document.getElementById('filterLogEquipment');
  const filterSource = document.getElementById('filterLogSource');
  
  if (filterEquipment) {
    filterEquipment.addEventListener('change', () => {
      if (typeof loadEquipmentLogs === 'function') {
        loadEquipmentLogs();
      }
    });
  }
  
  if (filterSource) {
    filterSource.addEventListener('change', () => {
      if (typeof loadEquipmentLogs === 'function') {
        loadEquipmentLogs();
      }
    });
  }
}

// Make loadEquipmentLogs available globally if not already defined
if (typeof window.loadEquipmentLogs === 'undefined') {
  window.loadEquipmentLogs = async function() {
    if (!authToken || !currentUser) {
      console.log('[DEBUG] User not authenticated, skipping equipment logs load');
      if (equipmentLogsTableBody) {
        equipmentLogsTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="empty-state">Please login to view equipment logs</td>
          </tr>
        `;
      }
      return;
    }

    if (!equipmentLogsTableBody) return;

    try {
      const equipmentId = filterLogEquipment ? filterLogEquipment.value : '';
      const source = filterLogSource ? filterLogSource.value : '';

      const params = new URLSearchParams();
      if (equipmentId) params.append('equipmentId', equipmentId);
      if (source) params.append('source', source);
      params.append('limit', '1000');
      params.append('page', '1');
      
      const url = `${API_URL}/equipment/logs?${params.toString()}`;

      const response = await fetch(url, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      equipmentLogsData = result.data || [];
      
      renderEquipmentLogsTable(equipmentLogsData);
    } catch (error) {
      console.error('[DEBUG] Error loading equipment logs:', error);
      
      if (equipmentLogsTableBody) {
        equipmentLogsTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="empty-state" style="color: #ef4444;">
              <i class="fas fa-exclamation-triangle"></i> Error loading logs: ${error.message}
            </td>
          </tr>
        `;
      }
    }
  };
}

function renderEquipmentLogsTable(logs) {
  if (!equipmentLogsTableBody) return;
  
  if (!logs || logs.length === 0) {
    equipmentLogsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No logs available.</td>
      </tr>
    `;
    return;
  }
  
  equipmentLogsTableBody.innerHTML = logs.map(log => {
    const logId = log.id;
    const equipmentName = log.equipment_name || '-';
    const equipmentCode = log.equipment_code || '-';
    const logSource = log.source || 'none';
    const loggedAt = log.logged_at || '';
    
    const time = loggedAt ? new Date(loggedAt).toLocaleString() : '-';
    
    const sourceClass = logSource === 'snmp' ? 'snmp-badge' : 'category-badge support';
    
    return `
      <tr>
        <td>${time}</td>
        <td>${equipmentName}</td>
        <td>${equipmentCode}</td>
        <td><span class="${sourceClass}">${logSource}</span></td>
        <td><code style="font-size: 0.75rem;">Log #${logId}</code></td>
        <td>
          <button class="btn-view" onclick="viewEquipmentLogDetail(${logId})" title="View Details" style="background: #10b981; color: white; padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.viewEquipmentLogDetail = function(logId) {
  const log = equipmentLogsData.find(l => l.id === logId);
  if (!log) return;
  
  const snmpDataContent = document.getElementById('snmpDataContent');
  
  snmpDataContent.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h4 style="margin-bottom: 10px;">Equipment Log Details</h4>
      <p><strong>Equipment:</strong> ${log.equipment_name || '-'}</p>
      <p><strong>Code:</strong> ${log.equipment_code || '-'}</p>
      <p><strong>Source:</strong> ${log.source || '-'}</p>
      <p><strong>Time:</strong> ${log.logged_at ? new Date(log.logged_at).toLocaleString() : '-'}</p>
    </div>
    <h5 style="margin-bottom: 10px;">Data:</h5>
    <pre style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 0.85rem;">${JSON.stringify(log.data || {}, null, 2)}</pre>
  `;
  
  document.getElementById('snmpDataModal').classList.remove('hidden');
};

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

// Auth functions moved to top

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
const connectionTemplateSelect = document.getElementById('connectionTemplate');
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
const snmpTemplateTableBody = document.getElementById('snmpTemplateTableBody') || document.getElementById('snmpTemplateTableBody2') || document.getElementById('snmpTemplateTableBody3');
const snmpTemplateModalFormTitle = document.getElementById('snmpTemplateModalFormTitle');
const addSnmpTemplateBtn = document.getElementById('addSnmpTemplateBtn') || document.getElementById('addSnmpTemplateBtn2') || document.getElementById('addSnmpTemplateBtn3');
const oidMappingsContainer = document.getElementById('oidMappingsContainer');
const addOidMappingBtn = document.getElementById('addOidMappingBtn');
const equipmentLogsNavItem = document.getElementById('equipmentLogsNavItem');
const surveillanceNavItem = document.getElementById('surveillanceNavItem');
const filterLogEquipment = document.getElementById('filterLogEquipment');
const filterLogSource = document.getElementById('filterLogSource');
const refreshLogsBtn = document.getElementById('refreshLogsBtn');
const equipmentLogsTableBody = document.getElementById('equipmentLogsTableBody');

let snmpTemplatesData = [];
let equipmentLogsData = [];
let publicMap = null;
let map = null;
let airportsData = [];

// Logs pagination
var logsPagination = { currentPage: 1, pageSize: 100, total: 0, totalPages: 0 };
var logsSort = { column: 'Waktu Update', direction: 'desc' };

// Floating hover card state
let activeAirport = null, currentMarkerElement = null, closeTimeout = null, hideCardTimeout = null, isCardHovered = false, isMarkerHovered = false;

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
  initDashboardFilters();
  
  if (authToken && currentUser) loadSnmpTemplates();
});

// Public Dashboard - Fixed to work without authentication
async function initPublicDashboard() {
  debugLog('Initializing public dashboard...');
  
  // Show loading state for all stats
  const statIds = ['publicTotalEquipment', 'publicNormalEquipment', 'publicWarningEquipment', 'publicAlertEquipment', 'publicDisconnectEquipment', 'publicCommCount', 'publicNavCount', 'publicSurvCount', 'publicDataCount', 'publicSupportCount'];
  statIds.forEach(id => showLoadingState(id));
  
  try {
    // Fetch equipment stats from public endpoint - only counts active equipment (is_active = true)
    const statsRes = await fetch(`${API_URL}/equipment/stats`);
    
    if (!statsRes.ok) throw new Error(`Equipment stats API error: ${statsRes.status}`);
    
    const stats = await statsRes.json();
    
    if (!stats || typeof stats !== 'object') throw new Error('Equipment stats data is invalid');
    
    // Also fetch airports for map display
    const airportsRes = await fetch(`${API_URL}/airports`);
    const airports = airportsRes.ok ? await airportsRes.json() : [];
    
    // Update stats - only active equipment are counted (is_active = true)
    hideLoadingState('publicTotalEquipment', stats.total || 0);
    hideLoadingState('publicNormalEquipment', stats.normal || 0);
    hideLoadingState('publicWarningEquipment', stats.warning || 0);
    hideLoadingState('publicAlertEquipment', stats.alert || 0);
    hideLoadingState('publicDisconnectEquipment', stats.disconnect || 0);
    
    // Update category counts from stats
    updateStatElement('publicCommCount', stats.byCategory?.Communication || 0);
    updateStatElement('publicNavCount', stats.byCategory?.Navigation || 0);
    updateStatElement('publicSurvCount', stats.byCategory?.Surveillance || 0);
    updateStatElement('publicDataCount', stats.byCategory?.['Data Processing'] || 0);
    updateStatElement('publicSupportCount', stats.byCategory?.Support || 0);
    
    // Process airports for map display
    if (Array.isArray(airports)) {
      airports.forEach(airport => {
        const eq = airport.activeEquipmentCount || airport.equipmentCount || { Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0 };
        airport.totalEquipment = airport.totalActiveEquipment !== undefined ? airport.totalActiveEquipment : (airport.totalEquipment || 0);
        airport.equipmentCount = eq;
      });
      initPublicMap(airports);
    }
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
      
      // Menggunakan mapping warna berdasarkan status (Bukan lagi hanya hijau/biru)
      const markerColors = {
        Normal: { bg: '#10b981', shadow: 'rgba(16,185,129,' },
        Warning: { bg: '#f59e0b', shadow: 'rgba(245,158,11,' },
        Alert: { bg: '#ef4444', shadow: 'rgba(239,68,68,' },
        Disconnect: { bg: '#6b7280', shadow: 'rgba(107,114,128,' }
      };
      const normalizedStatus = normalizeStatus(airport.status);
      const colors = markerColors[normalizedStatus] || markerColors.Normal;
      
      const isBranch = (airport.parentId || airport.parent_id) ? true : false;
      
      // Create marker with colored shadow (no white border)
      const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div class="marker-container" style="position:relative;width:24px;height:24px;">
          <div class="marker-inner" style="
            background: ${colors.bg};
            width: 18px;
            height: 18px;
            border-radius: 50%;
            box-shadow: 0 0 12px ${colors.shadow}0.6), 0 2px 6px rgba(0,0,0,0.4);
            cursor: pointer;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          "></div>
        </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      
      const marker = L.marker([airport.lat, airport.lng], { icon: markerIcon, zIndexOffset: isBranch ? 500 : 1000 }).addTo(publicMap);
      
      marker.on('mouseover', function (e) {
        if (e && e.originalEvent) e.originalEvent.stopPropagation();
        
        // Get the marker element and apply hover effects
        const el = this.getElement();
        if (el) {
          const markerDiv = el.querySelector('.marker-inner');
          if (markerDiv) {
            // Scale up and apply blink animation
            markerDiv.style.transform = 'scale(1.3)';
            markerDiv.style.animation = 'markerBlink 1.5s ease-in-out infinite';
            // Enhance shadow on hover
            const enhancedShadow = `0 0 20px ${colors.shadow}0.9), 0 4px 12px rgba(0,0,0,0.5)`;
            markerDiv.style.boxShadow = enhancedShadow;
          }
          el.style.zIndex = '99999';
        }
        this.setZIndexOffset(10000);
        isMarkerHovered = true;
        clearCloseTimeout();
        showFloatingHoverCard(airport, marker, this);
      });
      
      marker.on('mouseout', function (e) {
        if (e && e.originalEvent) e.originalEvent.stopPropagation();
        
        // Reset marker to original state
        const el = this.getElement();
        if (el) {
          const markerDiv = el.querySelector('.marker-inner');
          if (markerDiv) {
            markerDiv.style.transform = 'scale(1)';
            markerDiv.style.animation = 'none';
            // Restore original shadow
            const originalShadow = `0 0 12px ${colors.shadow}0.6), 0 2px 6px rgba(0,0,0,0.4)`;
            markerDiv.style.boxShadow = originalShadow;
          }
          el.style.zIndex = '';
      }
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
  if (hideCardTimeout) { clearTimeout(hideCardTimeout); hideCardTimeout = null; }
  let card = document.querySelector('.floating-hover-card');
  if (!card) { createFloatingHoverCard(); card = document.querySelector('.floating-hover-card'); }
  
  // Mencegah animasi me-restart berulang kali jika sedang meng-hover bandara yang sama
  if (activeAirport && activeAirport.id === airport.id && card.classList.contains('visible') && !card.classList.contains('closing')) {
    return;
  }

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
  
  // Hapus class, trigger DOM reflow, dan tambahkan lagi untuk memaksa animasi berulang
  card.classList.remove('visible', 'closing');
  
  // Trik khusus: Reset langsung animasi pada elemen dalamnya (inner)
  const innerCard = card.querySelector('.floating-hover-card-inner');
  if (innerCard) {
    innerCard.style.animation = 'none';
    void innerCard.offsetWidth; // Reflow paksa pada inner
    innerCard.style.animation = '';
  }
  
  void card.offsetWidth; // Trik jitu reflow browser
  card.classList.add('visible');
}

function hideFloatingHoverCard() {
  const card = document.querySelector('.floating-hover-card');
  if (card) {
    card.classList.add('closing');
    setTimeout(() => { card.classList.remove('visible', 'closing'); activeAirport = null; currentMarkerElement = null; isCardHovered = false; }, 150);
    if (hideCardTimeout) clearTimeout(hideCardTimeout);
    hideCardTimeout = setTimeout(() => { 
      card.classList.remove('visible', 'closing'); 
      activeAirport = null; 
      currentMarkerElement = null; 
      isCardHovered = false; 
      hideCardTimeout = null;
    }, 150);
  }
}

function navigateToEquipment(category, airportId, airportName) {
  hideFloatingHoverCard();
  
  // Convert airportId to number (it's passed as string from data attribute)
  const numericAirportId = parseInt(airportId, 10);
  console.log('[DEBUG] navigateToEquipment called:', { category, airportId: numericAirportId, airportName });
  
  if (currentUser) {
    localStorage.setItem('equipmentFilter', JSON.stringify({ category: category, airportId: numericAirportId, airportName: airportName }));
    
    // Navigate to cabang section - manually show the section and load module
    const cabangSection = document.getElementById('cabangSection');
    const dashboardSection = document.getElementById('dashboardSection');
    
    if (dashboardSection) {
      dashboardSection.classList.add('hidden');
    }
    if (cabangSection) {
      cabangSection.classList.remove('hidden');
    }
    
    // Update navigation state
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => n.classList.remove('active'));
    const cabangNavItem = document.querySelector('.nav-item[data-section="cabang"]');
    if (cabangNavItem) {
      cabangNavItem.classList.add('active');
    }
    
    // Update header breadcrumb
    updateHeaderBreadcrumb('cabang', airportName);
    localStorage.setItem('currentSection', 'cabang');
    
    // Now use cabangModule for proper airport selection
    setTimeout(async () => {
      if (window.cabangModule) {
        // Ensure airports are loaded
        await window.cabangModule.loadAirports();
        
        console.log('[DEBUG] Calling cabangModule.selectAirport with:', numericAirportId);
        
        // Select the airport (this will show the monitoring section and load equipment)
        await window.cabangModule.selectAirport(numericAirportId);
        
        // Apply the category filter
        console.log('[DEBUG] Applying filter:', category);
        window.cabangModule.setFilter(category);
      } else {
        console.error('[DEBUG] cabangModule not found');
      }
    }, 500);
  } else {
    localStorage.setItem('pendingEquipmentFilter', JSON.stringify({ category: category, airportId: numericAirportId, airportName: airportName }));
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
    document.getElementById('originalCaptchaAnswer').value = data.answer;
    document.getElementById('captchaQuestion').textContent = data.question;
  } catch (err) { console.error('Error loading captcha:', err); }
}

function initMap() {
  const mapContainer = document.getElementById('mapContainer');
  if (!mapContainer) return;
  
  // Set same dimensions as public map for consistency
  mapContainer.style.minHeight = '400px';
  mapContainer.style.height = '450px';
  
  map = L.map('mapContainer', { center: [-2.5, 118], zoom: 5, zoomControl: false, preferCanvas: true, bubblingMouseEvents: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18, minZoom: 4 }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  updateMapMarkers();
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const captchaAnswer = document.getElementById('captchaAnswer').value;
  const originalCaptchaAnswer = document.getElementById('originalCaptchaAnswer').value;
  
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: username, 
        password: password, 
        captchaAnswer: captchaAnswer, 
        originalCaptchaAnswer: originalCaptchaAnswer 
      })
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

  if (usersNavItem && equipmentLogsNavItem && surveillanceNavItem) {
    if (currentUser.role === 'admin' || currentUser.role === 'user_pusat') {
      usersNavItem.style.display = 'flex';
      equipmentLogsNavItem.style.display = 'flex';
      surveillanceNavItem.style.display = 'flex';
    } else {
      usersNavItem.style.display = 'none';
      equipmentLogsNavItem.style.display = 'none';
      surveillanceNavItem.style.display = 'none';
    }
  }
  
  // FIX: Initialize dashboard stats to loading state before data loads
  const dashboardStatIds = ['totalEquipment', 'normalEquipment', 'warningEquipment', 'alertEquipment', 'disconnectEquipment'];
  dashboardStatIds.forEach(id => showLoadingState(id));
  
  try { await loadAirports(); } catch (e) { console.error('Error loading airports:', e); }
  try { await loadAirportsToSelect(); } catch (e) { console.error('Error loading airports for select:', e); }
  try { initMap(); } catch (e) { console.error('Error initializing map:', e); }
  try { await loadEquipment(); } catch (e) { console.error('Error loading equipment:', e); }
  try { loadUsers(); } catch (e) { console.error('Error loading users:', e); }
  
  // FIX: Ensure dashboard stats are updated after all data loads
  // This is the final sync step - ensure stats are correct after login
  try {
    await updateDashboardStats();
  } catch (e) {
    console.error('Error updating dashboard stats:', e);
    // Fallback: set stats to 0 if update fails
    dashboardStatIds.forEach(id => hideLoadingState(id, 0));
  }
  
  applyRoleAccess();
  
  // Initialize dashboard interactive filters
  initDashboardFilters();
  
  // Choose initial section
  const savedSection = localStorage.getItem('currentSection') || 'dashboard';
  if (typeof switchMainSection === 'function') {
    switchMainSection(savedSection);
  } else if (typeof restoreNavigation === 'function') {
    restoreNavigation(savedSection);
  }
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
  // FIX: Added resetAllData() and initPublicDashboard() to refresh data on logout
  document.getElementById('confirmLogout').addEventListener('click', () => {
    // Stop auto-refresh on logout
    stopAutoRefresh();
    
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentSection');
    currentUser = null;
    logoutModal.classList.add('hidden');
    
    const appContainer = document.querySelector('.app-container');
    if (appContainer) { appContainer.classList.add('hidden'); appContainer.style.display = 'none'; }
    
    // FIX: Reset all data to prevent stale data issues
    resetAllData();
    
    showPublicDashboard();
    
    // FIX: Refresh public dashboard data immediately after logout
    // This ensures the summary data appears without needing to refresh
    initPublicDashboard();
    
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('captchaAnswer').value = '';
  });
  
  logoutModal.addEventListener('click', e => { if (e.target === logoutModal) logoutModal.classList.add('hidden'); });
  
  if (addEquipmentBtn) addEquipmentBtn.addEventListener('click', () => { resetEquipmentForm(); equipmentModal.classList.remove('hidden'); });
  document.getElementById('closeEquipmentModal').addEventListener('click', () => equipmentModal.classList.add('hidden'));
  document.getElementById('cancelEquipmentEdit').addEventListener('click', () => { equipmentModal.classList.add('hidden'); resetEquipmentForm(); });
  // Robust equipment modal close
  equipmentModal.addEventListener('click', e => {
    if (e.target === equipmentModal) {
      e.stopPropagation();
      equipmentModal.classList.add('hidden');
      resetEquipmentForm();
    }
  });
  const equipCloseBtn = document.getElementById('closeEquipmentModal');
  if (equipCloseBtn) {
    equipCloseBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      equipmentModal.classList.add('hidden');
      resetEquipmentForm();
    });
  }
  
  const sdm = document.getElementById('snmpDataModal');
  if (sdm) {
    // Robust overlay close with stopPropagation
    sdm.addEventListener('click', e => {
      if (e.target === sdm) {
        sdm.classList.add('hidden');
        currentViewedEquipmentId = null;
        if (liveDataTimer) {
          clearInterval(liveDataTimer);
          liveDataTimer = null;
        }
      }
    });
    // Robust close button with preventDefault
    const closeBtn = document.getElementById('closeSnmpDataModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        sdm.classList.add('hidden');
        currentViewedEquipmentId = null;
        if (liveDataTimer) {
          clearInterval(liveDataTimer);
          liveDataTimer = null;
        }
      });
    }
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
  
  if (addUserBtn) addUserBtn.addEventListener('click', async () => { resetUserForm(); await loadAirportsToSelect(); userModal.classList.remove('hidden'); });
  document.getElementById('closeUserModal').addEventListener('click', () => userModal.classList.add('hidden'));
  document.getElementById('cancelUserEdit').addEventListener('click', () => { userModal.classList.add('hidden'); resetUserForm(); });
  userModal.addEventListener('click', e => { if (e.target === userModal) { userModal.classList.add('hidden'); resetUserForm(); } });
  
  if (addAirportBtn) addAirportBtn.addEventListener('click', async () => { resetAirportForm(); await loadAirportsToSelect(); airportModal.classList.remove('hidden'); });
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

function switchMainSection(sectionId) {
  debugLog(`Switching to section: ${sectionId}`);
  
  if (!contentSections || !navItems) return;
  
  // Hide all sections
  contentSections.forEach(c => c.classList.add('hidden'));
  
  // Update nav active state
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.nav-dropdown-item, .nav-link').forEach(n => n.classList.remove('active'));
  
  const activeNavItem = document.querySelector(`.nav-item[data-section="${sectionId}"], .nav-dropdown-item[data-section="${sectionId}"]`);
  if (activeNavItem) activeNavItem.classList.add('active');
  
  // Show target section
  const section = document.getElementById(`${sectionId}Section`) || document.getElementById(`${sectionId}-templatesSection`); // compatibility
  if (section) {
    section.classList.remove('hidden');
  } else {
    console.warn(`Section not found: ${sectionId}Section`);
    // Fallback search for a section with 'Section' suffix
    const fallbackSection = document.querySelector(`[id^="${sectionId}"][id$="Section"]`);
    if (fallbackSection) fallbackSection.classList.remove('hidden');
  }
  
  // Update state
  localStorage.setItem('currentSection', sectionId);
  updateHeaderBreadcrumb(sectionId);
  
  // Specific module loads
  switch(sectionId) {
    case 'dashboard':
      if (typeof updateDashboardStats === 'function') updateDashboardStats(true);
      if (typeof initMap === 'function' && !window.map) initMap();
      break;
    case 'cabang':
      if (window.cabangModule) {
        window.cabangModule.loadAirports();
        window.cabangModule.loadEquipment();
      }
      break;
    case 'snmp-templates':
      if (typeof loadSnmpTemplates === 'function') loadSnmpTemplates();
      break;
    case 'threshold-settings':
      if (typeof initThresholdSettings === 'function') initThresholdSettings();
      break;
    case 'configuration':
      if (typeof initConfigurationNav === 'function') initConfigurationNav();
      break;
    case 'surveillance':
      if (typeof initSurveillanceApp === 'function') initSurveillanceApp();
      break;
    case 'equipment-logs':
      if (typeof initEquipmentLogs === 'function') initEquipmentLogs();
      if (typeof loadEquipmentLogs === 'function') loadEquipmentLogs();
      break;
  }

  // Handle responsive sidebar behavior
  if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('active')) {
    sidebar.classList.remove('active');
  }
}


function initNavigation() {
  if (!navItems || 0 === navItems.length) return;
  
  // Initial navigation based on saved state
  const savedSection = localStorage.getItem('currentSection') || 'dashboard';
  setTimeout(() => switchMainSection(savedSection), 100);

  // Handle dropdown menu toggle
  const dropdownToggles = document.querySelectorAll('.nav-dropdown-toggle');
  dropdownToggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const dropdown = toggle.closest('.nav-dropdown');
      dropdown.classList.toggle('open');
    });
  });
  
  // Handle dropdown item clicks
  const dropdownItems = document.querySelectorAll('.nav-dropdown-item');
  dropdownItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const s = item.dataset.section;
      localStorage.setItem('currentSection', s);
      updateHeaderBreadcrumb(s);
      
      // Remove active from all nav items
      navItems.forEach(n => n.classList.remove('active'));
      dropdownItems.forEach(d => d.classList.remove('active'));
      item.classList.add('active');
      
      // Close dropdown
      const dropdown = item.closest('.nav-dropdown');
      if (dropdown) dropdown.classList.remove('open');
      
      // Hide all sections
      contentSections.forEach(c => c.classList.add('hidden'));
      
      // Show target section
      if ('snmp-templates' === s) {
        document.getElementById('snmp-templatesSection')?.classList.remove('hidden');
        loadSnmpTemplates();
      } else if ('snmp-tools' === s) {
        document.getElementById('snmpToolsSection')?.classList.remove('hidden');
      } else if ('threshold-settings' === s) {
        document.getElementById('thresholdSettingsSection')?.classList.remove('hidden');
        if (typeof initThresholdSettings === 'function') {
          initThresholdSettings();
        }
      } else if ('configuration' === s) {
        document.getElementById('configurationSection')?.classList.remove('hidden');
        initConfigurationNav();
      } else if ('cabang' === s) {
        document.getElementById('cabangSection')?.classList.remove('hidden');
        window.cabangModule && window.cabangModule.loadAirports();
      } else if ('airports' === s) {
        document.getElementById('airportsSection')?.classList.remove('hidden');
        initAirportsGrid();
        loadAirportsGrid();
      } else if ('equipment-logs' === s) {
        if (authToken && currentUser) { loadEquipment(); loadEquipmentLogs(); }
        document.getElementById('equipmentLogsSection')?.classList.remove('hidden');
      } else if ('surveillance' === s) {
        document.getElementById('surveillanceSection')?.classList.remove('hidden');
        if (window.surveillanceModule) {
          window.surveillanceModule.loadSurveillanceData();
        }
      } else {
        document.getElementById(`${s}Section`)?.classList.remove('hidden');
      }

      if (window.innerWidth <= 768) sidebar.classList.remove('active');
      if ('dashboard' === s && map) setTimeout(() => map.invalidateSize(), 100);
    });
  });
  
  // Handle regular nav items (non-dropdown)
  navItems.forEach(i => {
    // Skip dropdown items (they're handled separately)
    if (i.classList.contains('nav-dropdown-item') || i.classList.contains('nav-dropdown-toggle')) return;
    
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
        window.cabangModule && window.cabangModule.loadAirports();
      } else if ('airports' === s) {
        document.getElementById('airportsSection')?.classList.remove('hidden');
        initAirportsGrid();
        loadAirportsGrid();
      } else if ('equipment-logs' === s) {
        if (authToken && currentUser) { loadEquipment(); loadEquipmentLogs(); }
        document.getElementById('equipmentLogsSection')?.classList.remove('hidden');
      } else if ('snmp-templates' === s) {
        document.getElementById('snmp-templatesSection')?.classList.remove('hidden');
        if (typeof loadSnmpTemplates === 'function') {
          loadSnmpTemplates();
        }
      } else if ('equipment-templates' === s) {
        document.getElementById('equipment-templatesSection')?.classList.remove('hidden');
        if (typeof loadTemplates === 'function') {
          loadTemplates();
        }
      } else if ('users' === s) {
        document.getElementById('usersSection')?.classList.remove('hidden');
        if (typeof loadUsers === 'function') {
          loadUsers();
        }
      } else if ('snmp-tools' === s) {
        document.getElementById('snmpToolsSection')?.classList.remove('hidden');
        if (typeof initSnmpTools === 'function') {
          initSnmpTools();
        }
      } else if ('threshold-settings' === s) {
        document.getElementById('thresholdSettingsSection')?.classList.remove('hidden');
        if (typeof initThresholdSettings === 'function') {
          initThresholdSettings();
        }
      } else if ('network-monitor' === s) {
        document.getElementById('networkMonitorSection')?.classList.remove('hidden');
        if (typeof initNetworkMonitor === 'function') {
          try {
            initNetworkMonitor();
          } catch (error) {
            console.error('Error initializing network monitor:', error);
          }
        }
      } else if ('network-tools' === s) {
        document.getElementById('networkToolsSection')?.classList.remove('hidden');
        // Initialize Network Tools when section is shown
        setTimeout(() => {
          if (typeof initNetworkTools === 'function') {
            try {
              initNetworkTools();
            } catch (error) {
              console.error('Error initializing network tools:', error);
            }
          }
        }, 100);
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
      // Load monitoring data for cabang section
      window.cabangModule && window.cabangModule.loadAirports();
    } else if ('airports' === s) {
      document.getElementById('airportsSection')?.classList.remove('hidden');
      initAirportsGrid();
      loadAirportsGrid();
    } else if ('equipment-logs' === s) {
      if (authToken && currentUser) { loadEquipment(); loadEquipmentLogs(); }
      document.getElementById('equipmentLogsSection')?.classList.remove('hidden');
    } else if ('snmp-templates' === s) {
      document.getElementById('snmp-templatesSection')?.classList.remove('hidden');
      if (typeof loadSnmpTemplates === 'function') {
        loadSnmpTemplates();
      }
    } else if ('equipment-templates' === s) {
      document.getElementById('equipment-templatesSection')?.classList.remove('hidden');
      if (typeof loadTemplates === 'function') {
        loadTemplates();
      }
    } else if ('users' === s) {
      document.getElementById('usersSection')?.classList.remove('hidden');
      if (typeof loadUsers === 'function') {
        loadUsers();
      }
    } else if ('snmp-tools' === s) {
      document.getElementById('snmp-toolsSection')?.classList.remove('hidden');
      if (typeof initSnmpTools === 'function') {
        initSnmpTools();
      }
    } else if ('threshold-settings' === s) {
      document.getElementById('thresholdSettingsSection')?.classList.remove('hidden');
      if (typeof initThresholdSettings === 'function') {
        initThresholdSettings();
      }
    } else if ('network-tools' === s) {
      document.getElementById('networkToolsSection')?.classList.remove('hidden');
      setTimeout(() => {
        if (typeof initNetworkTools === 'function') {
          try {
            initNetworkTools();
          } catch (error) {
            console.error('Error initializing network tools:', error);
          }
        }
      }, 100);
    } else if ('snmp-tools' === s) {
      document.getElementById('snmp-toolsSection')?.classList.remove('hidden');
      if (typeof initSnmpTools === 'function') {
        initSnmpTools();
      }
    } else {
      document.getElementById(`${s}Section`)?.classList.remove('hidden');
    }
    
    if ('dashboard' === s && map) setTimeout(() => map.invalidateSize(), 100);
  }
}

if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
  });
}

if (sidebarToggle) {
  sidebarToggle.addEventListener('click', toggleSidebar);
}

if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

// Event Listeners
function initEventListeners() {
  // Login form submit handler
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  // Equipment form submit handler
  if (equipmentForm) {
    equipmentForm.addEventListener('submit', handleEquipmentSubmit);
  }
  
  // Airport form submit handler
  if (airportForm) {
    airportForm.addEventListener('submit', handleAirportSubmit);
  }
  
  // User form submit handler
  if (userForm) {
    userForm.addEventListener('submit', handleUserSubmit);
  }
  
  // Search and filter handlers
  if (searchEquipment) {
    searchEquipment.addEventListener('input', handleEquipmentSearch);
  }
  
  if (filterCategory) {
    filterCategory.addEventListener('change', handleEquipmentFilter);
  }
  
  if (filterAirport) {
    filterAirport.addEventListener('change', handleEquipmentFilter);
  }
}

// Helper function to normalize status values
window.normalizeStatus = function(status) {
  if (!status) return 'Normal';
  const s = status.toString().toLowerCase();
  if (s === 'alert' || s === 'critical' || s === 'alarm') return 'Alert';
  if (s === 'warning') return 'Warning';
  if (s === 'disconnect' || s === 'disconnected' || s === 'offline') return 'Disconnect';
  return 'Normal';
};

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
    
    // FIX: Update dashboard stats after airports load
    // This ensures the dashboard shows correct counts after login
    if (authToken && currentUser) {
      await updateDashboardStats();
    }
  } catch (error) {
    console.error('Error loading airports:', error);
  }
}

// FIX: New function to update dashboard stats from equipment data
// This is the core fix for the sync issue - calculates stats from actual equipment data
async function updateDashboardStats(isAutoRefresh = false) {
  debugLog('Updating dashboard stats...');
  
  const dashboardStatIds = ['totalEquipment', 'normalEquipment', 'warningEquipment', 'alertEquipment', 'disconnectEquipment'];
  
  // Hanya tampilkan icon putaran loading jika INI BUKAN AUTO REFRESH (agar tidak berkedip)
  if (!isAutoRefresh) {
    dashboardStatIds.forEach(id => showLoadingState(id));
  }
  
  try {
    // WAJIB Tarik SEMUA data equipment (isActive=all) agar Menu Airports tetap akurat setelah refresh
    const response = await fetch(`${API_URL}/equipment?limit=10000&isActive=all`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch equipment: ${response.status}`);
    }
    
    const result = await response.json();
    const equipmentList = result.data || result;
    
    // Filter hanya alat aktif untuk perhitungan Dashboard Atas (Top Stats)
    const activeEquipmentList = equipmentList.filter(e => e.isActive === true || e.isActive === 'true' || e.is_active === 1 || e.is_active === '1');
    
    // Calculate stats from actual equipment data
    const stats = {
      total: activeEquipmentList.length,
      normal: 0,
      warning: 0,
      alert: 0,
      disconnect: 0
    };
    
    // Category counts
    const categories = {
      Communication: 0,
      Navigation: 0,
      Surveillance: 0,
      'Data Processing': 0,
      Support: 0
    };
    
    activeEquipmentList.forEach(eq => {
      const status = normalizeStatus(eq.status);
      if (status === 'Normal') stats.normal++;
      else if (status === 'Warning') stats.warning++;
      else if (status === 'Alert') stats.alert++;
      else if (status === 'Disconnect') stats.disconnect++;
      
      // Count categories
      if (categories[eq.category] !== undefined) {
        categories[eq.category]++;
      }
    });
    
    // Update dashboard stats
    hideLoadingState('totalEquipment', stats.total);
    hideLoadingState('normalEquipment', stats.normal);
    hideLoadingState('warningEquipment', stats.warning);
    hideLoadingState('alertEquipment', stats.alert);
    hideLoadingState('disconnectEquipment', stats.disconnect);
    
    // Update category counts
    updateStatElement('commCount', categories.Communication);
    updateStatElement('navCount', categories.Navigation);
    updateStatElement('survCount', categories.Surveillance);
    updateStatElement('dataCount', categories['Data Processing']);
    updateStatElement('supportCount', categories.Support);
    
    debugLog('Dashboard stats updated successfully', stats);
    
    // Also update airports with correct equipment counts from the full equipment list
    updateAirportEquipmentCounts(equipmentList);
    
  } catch (error) {
    console.error('Error updating dashboard stats:', error);
    dashboardStatIds.forEach(id => showErrorState(id, 'Error'));
  }
}

// Function to initialize interactive filtering from Dashboard to Cabang
function initDashboardFilters() {
  // 1. Status Cards
  const statusCards = document.querySelectorAll('#dashboardSection .stat-card');
  statusCards.forEach(card => {
    card.style.cursor = 'pointer';
    card.title = 'Klik untuk melihat di Cabang';

    card.addEventListener('click', () => {
      const h3 = card.querySelector('h3');
      if (!h3) return;

      const status = h3.textContent.trim();
      console.log(`[Dashboard] Filtering by status: ${status}`);

      // Navigasi ke Cabang
      if (typeof switchMainSection === 'function') {
        switchMainSection('cabang');
      } else {
        // Fallback jika switchMainSection belum ada (meskipun seharusnya ada setelah update ini)
        // Manual switch as seen in initNavigation
        contentSections.forEach(c => c.classList.add('hidden'));
        document.getElementById('cabangSection')?.classList.remove('hidden');
        navItems.forEach(n => n.classList.remove('active'));
        document.querySelector('.nav-item[data-section="cabang"]')?.classList.add('active');
        localStorage.setItem('currentSection', 'cabang');
        updateHeaderBreadcrumb('cabang');
      }

      // Set filter di modul Cabang
      if (window.cabangModule && window.cabangModule.setFilters) {
        const filterStatus = status === 'Total' ? '' : status;
        window.cabangModule.setFilters(undefined, filterStatus);
      }
    });
  });
  
  // 2. Category Items
  const categoryItems = document.querySelectorAll('#dashboardSection .category-item');
  categoryItems.forEach(item => {
    item.style.cursor = 'pointer';
    item.title = 'Klik untuk melihat di Cabang';

    item.addEventListener('click', () => {
      const category = item.dataset.category;
      console.log(`[Dashboard] Filtering by category: ${category}`);

      // Navigasi ke Cabang
      if (typeof switchMainSection === 'function') {
        switchMainSection('cabang');
      } else {
        contentSections.forEach(c => c.classList.add('hidden'));
        document.getElementById('cabangSection')?.classList.remove('hidden');
        navItems.forEach(n => n.classList.remove('active'));
        document.querySelector('.nav-item[data-section="cabang"]')?.classList.add('active');
        localStorage.setItem('currentSection', 'cabang');
        updateHeaderBreadcrumb('cabang');
      }

      // Set filter di modul Cabang
      if (window.cabangModule && window.cabangModule.setFilters) {
        window.cabangModule.setFilters(category, '');
      }
    });
  });
}

// FIX: Helper function to update airport equipment counts from equipment list
function updateAirportEquipmentCounts(equipmentList) {
  if (!equipmentList || !Array.isArray(equipmentList)) return;
  
  airportsData.forEach(airport => {
    const airportEquipment = equipmentList.filter(eq => eq.airportId === airport.id || eq.branchId === airport.id);
    const activeEquipment = airportEquipment.filter(e => e.isActive === true || e.isActive === 'true' || e.is_active === 1 || e.is_active === '1');
    
    // Update ALL equipment counts (For Menu Airports)
    airport.totalEquipment = airportEquipment.length;
    airport.totalActiveEquipment = activeEquipment.length;
    
    // Update equipment count by category (ALL)
    const counts = { Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0 };
    airportEquipment.forEach(eq => {
      if (counts[eq.category] !== undefined) {
        counts[eq.category]++;
      }
    });
    airport.equipmentCount = counts;

    // Update active equipment count by category
    const activeCounts = { Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0 };
    activeEquipment.forEach(eq => {
      if (activeCounts[eq.category] !== undefined) {
        activeCounts[eq.category]++;
      }
    });
    airport.activeEquipmentCount = activeCounts;
  });
  
  // Refresh map markers with updated data
  if (map) {
    updateMapMarkers();
  }
}

// FIX: New function to reset all data on logout
function resetAllData() {
  debugLog('Resetting all data...');
  
  // Clear data arrays
  airportsData = [];
  equipmentData = [];
  
  // Reset dashboard stats to 0
  const dashboardStatIds = ['totalEquipment', 'normalEquipment', 'warningEquipment', 'alertEquipment', 'disconnectEquipment'];
  dashboardStatIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '0';
  });
  
  // Reset category counts
  const categoryIds = ['commCount', 'navCount', 'survCount', 'dataCount', 'supportCount'];
  categoryIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '0';
  });
  
  // Clear map if exists
  if (map) {
    map.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });
  }
  
  debugLog('All data reset complete');
}

function updateAirportStats() {
  const totalEl = document.getElementById('totalAirports');
  const normalEl = document.getElementById('normalAirports');
  const warningEl = document.getElementById('warningAirports');
  const alertEl = document.getElementById('alertAirports');
  const disconnectEl = document.getElementById('disconnectAirports');
  const commEl = document.getElementById('commCount');
  const navEl = document.getElementById('navCount');
  const survEl = document.getElementById('survCount');
  const dataEl = document.getElementById('dataCount');
  const supportEl = document.getElementById('supportCount');
  
  if (totalEl) totalEl.textContent = airportsData.length;
  if (normalEl) normalEl.textContent = airportsData.filter(a => a.status === 'Normal').length;
  if (warningEl) warningEl.textContent = airportsData.filter(a => a.status === 'Warning').length;
  if (alertEl) alertEl.textContent = airportsData.filter(a => a.status === 'Alert').length;
  if (disconnectEl) disconnectEl.textContent = airportsData.filter(a => a.status === 'Disconnect').length;
  
  let categories = { Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0 };
  airportsData.forEach(airport => {
    Object.keys(categories).forEach(cat => {
      categories[cat] += airport.equipmentCount[cat] || 0;
    });
  });
  
  if (commEl) commEl.textContent = categories.Communication;
  if (navEl) navEl.textContent = categories.Navigation;
  if (survEl) survEl.textContent = categories.Surveillance;
  if (dataEl) dataEl.textContent = categories['Data Processing'];
  if (supportEl) supportEl.textContent = categories.Support;
}

function populateAirportSelects() {
  const parentAirports = airportsData.filter(a => !a.parentId);
  const parentOptions = parentAirports.map(a => `<option value="${a.id}">${a.city}</option>`).join('');
  const defaultParentOption = '<option value="">None (Main Airport)</option>';
  
  if (airportParentSelect) {
    airportParentSelect.innerHTML = defaultParentOption + parentOptions;
  }
  
  // Show ALL airports with proper formatting
  const options = airportsData.map(a => {
    const indent = a.parentId ? '└─ ' : '';
    // Show airport name and city, no "(Main)" label
    return `<option value="${a.id}">${indent}${a.name} - ${a.city}</option>`;
  }).join('');
  
  const defaultOption = '<option value="">Select Airport</option>';
  const allOption = '<option value="">All Airports</option>';
  
  equipmentAirportSelect.innerHTML = defaultOption + options;
  filterAirport.innerHTML = allOption + options;
}

function renderAirportTable() {
  renderAirportsTable(); // Arahkan ke fungsi grid agar tabel seragam
}

function updateMapMarkers() {
  if (!map) return;
  
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });

  // Create floating hover card for dashboard map too
  createFloatingHoverCard();
  
  // Marker colors based on status with colored shadows (no white border)
  const markerColors = {
    Normal: { bg: '#10b981', shadow: 'rgba(16,185,129,' },
    Warning: { bg: '#f59e0b', shadow: 'rgba(245,158,11,' },
    Alert: { bg: '#ef4444', shadow: 'rgba(239,68,68,' },
    Disconnect: { bg: '#6b7280', shadow: 'rgba(107,114,128,' }
  };
  
  airportsData.forEach(airport => {
    const normalizedStatus = normalizeStatus(airport.status);
    const colors = markerColors[normalizedStatus] || markerColors.Normal;
    const isBranch = (airport.parentId || airport.parent_id) ? true : false;
    
    // Create marker with colored shadow and hover effects (no white border)
    const markerIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div class="marker-container" style="position:relative;width:24px;height:24px;">
        <div class="marker-inner" style="
          background: ${colors.bg};
          width: 18px;
          height: 18px;
          border-radius: 50%;
          box-shadow: 0 0 12px ${colors.shadow}0.6), 0 2px 6px rgba(0,0,0,0.4);
          cursor: pointer;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        "></div>
      </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([airport.lat, airport.lng], {
      icon: markerIcon,
      zIndexOffset: isBranch ? 500 : 1000
    }).addTo(map);

    // Add hover event handlers - same as public map
    marker.on('mouseover', function (e) {
      if (e && e.originalEvent) e.originalEvent.stopPropagation();
      
      // Get the marker element and apply hover effects
      const el = this.getElement();
      if (el) {
        const markerDiv = el.querySelector('.marker-inner');
        if (markerDiv) {
          // Scale up and apply blink animation on hover
          markerDiv.style.transform = 'scale(1.3)';
          markerDiv.style.animation = 'markerBlink 1.5s ease-in-out infinite';
          // Enhanced shadow on hover
          markerDiv.style.boxShadow = `0 0 20px ${colors.shadow}0.9), 0 4px 12px rgba(0,0,0,0.5)`;
        }
        el.style.zIndex = '99999';
      }
      this.setZIndexOffset(10000);
      isMarkerHovered = true;
      clearCloseTimeout();
      showFloatingHoverCard(airport, marker, this);
    });
    
    marker.on('mouseout', function (e) {
      if (e && e.originalEvent) e.originalEvent.stopPropagation();
      
      // Reset marker to original state
      const el = this.getElement();
      if (el) {
        const markerDiv = el.querySelector('.marker-inner');
        if (markerDiv) {
          markerDiv.style.transform = 'scale(1)';
          markerDiv.style.animation = 'none';
          // Restore original shadow
          markerDiv.style.boxShadow = `0 0 12px ${colors.shadow}0.6), 0 2px 6px rgba(0,0,0,0.4)`;
        }
        el.style.zIndex = '';
      }
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
    const params = new URLSearchParams();
    if (currentUser && currentUser.branchId) {
      params.append('branchId', currentUser.branchId);
    }
    params.append('isActive', 'all'); // Tarik data active maupun inactive
    const url = `${API_URL}/equipment${params.toString() ? `?${params.toString()}` : ''}`;

    const response = await fetch(url, {
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
    
    const result = await response.json();
    // Handle paginated response - data is in result.data
    equipmentData = result.data || result;
    // Terapkan ulang filter yang sedang aktif agar Auto-Refresh tidak mereset pilihan user
    filterEquipment();
  } catch (error) {
    console.error('Error loading equipment:', error);
  }
}

function renderEquipmentTable(data) {
  // Ensure data is an array
  if (!Array.isArray(data)) {
    console.error('renderEquipmentTable: data is not an array', data);
    data = [];
  }
  
  if (data.length === 0) {
    equipmentTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">No equipment data available</td>
      </tr>
    `;
    return;
  }
  
  // Hilangkan pesan "empty" jika ada
  if (equipmentTableBody.querySelector('.empty-state')) {
    equipmentTableBody.innerHTML = '';
  }

  // Ambil baris yang sudah ada di tabel saat ini
  const existingRows = Array.from(equipmentTableBody.querySelectorAll('tr[data-id]'));
  const currentIds = data.map(item => String(item.id));

  // 1. Hapus baris peralatan yang sudah tidak ada/dihapus
  existingRows.forEach(row => {
    if (!currentIds.includes(row.dataset.id)) {
      row.remove();
    }
  });

  // 2. Tambah baru atau perbarui yang lama SECARA SELEKTIF
  data.forEach(item => {
    let row = equipmentTableBody.querySelector(`tr[data-id="${item.id}"]`);
    
    // Struktur HTML untuk setiap kolom
    const isActiveHtml = `<strong><span style="color: ${item.isActive ? '#10b981' : '#ef4444'}; font-weight: 600;">${item.isActive ? 'Active' : 'Inactive'}</span></strong>`;
    const nameHtml = item.name;
    const categoryHtml = `<span class="category-badge ${item.category.toLowerCase().replace(' ', '-')}">${getCategoryIcon(item.category)} ${item.category}</span>`;
    const airportHtml = item.airportName;
    const statusHtml = `<span class="status-badge ${item.status}">${item.status}</span>`;
    const connectionHtml = item.hasSnmp ? '<span class="snmp-badge"><i class="fas fa-network-wired"></i> Active</span>' : '<span class="snmp-badge inactive"><i class="fas fa-network-wired"></i> -</span>';
    
    let actionsHtml = `
      <div class="action-buttons">
        <button class="btn-view" onclick="viewEquipmentDetail(${item.id})" title="View Details" style="background: #10b981; color: white; padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;">
          <i class="fas fa-info-circle"></i>
        </button>
        <button class="btn-ping" onclick="pingEquipment(${item.id})" title="Ping Equipment" style="background: #06b6d4; color: white; padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;">
          <i class="fas fa-wifi"></i>
        </button>
        ${item.hasSnmp ? `<button class="btn-snmp" onclick="viewSnmpData(${item.id})" title="View SNMP Data" style="background: #8b5cf6; color: white; padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;"><i class="fas fa-satellite-dish"></i></button>` : ''}
        ${currentUser && (currentUser.role === 'admin' || currentUser.role === 'user_pusat' || currentUser.role === 'teknisi_cabang') ? `<button class="btn-edit" onclick="editEquipment(${item.id})" title="Edit"><i class="fas fa-edit"></i></button>` : ''}
        ${currentUser && (currentUser.role === 'admin' || currentUser.role === 'user_pusat') ? `<button class="btn-delete" onclick="deleteEquipment(${item.id})" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    `;

    if (!row) {
      // JIKA BARIS BELUM ADA (Alat Baru), tambahkan ke tabel
      row = document.createElement('tr');
      row.dataset.id = item.id;
      row.innerHTML = `
        <td class="col-active">${isActiveHtml}</td>
        <td class="col-name">${nameHtml}</td>
        <td class="col-category">${categoryHtml}</td>
        <td class="col-airport">${airportHtml}</td>
        <td class="col-status">${statusHtml}</td>
        <td class="col-connection">${connectionHtml}</td>
        <td class="col-actions">${actionsHtml}</td>
      `;
      equipmentTableBody.appendChild(row);
    } else {
      // JIKA BARIS SUDAH ADA, periksa perubahannya satu per satu
      const updateCell = (selector, newHtml, animate = false) => {
        const cell = row.querySelector(selector);
        if (cell && cell.innerHTML !== newHtml) {
          cell.innerHTML = newHtml;
          // Hanya mainkan animasi berkedip jika nilainya benar-benar berubah (misal: Status)
          if (animate) {
            cell.style.animation = 'none';
            void cell.offsetWidth; // Memaksa browser me-restart animasi
            cell.style.animation = 'highlightValue 1s ease-out';
          }
        }
      };

      updateCell('.col-active', isActiveHtml);
      updateCell('.col-name', nameHtml);
      updateCell('.col-category', categoryHtml);
      updateCell('.col-airport', airportHtml);
      updateCell('.col-status', statusHtml, true); // Animasi aktif HANYA untuk status yang berubah!
      updateCell('.col-connection', connectionHtml);
      updateCell('.col-actions', actionsHtml);
    }
  });
}

function getCategoryIcon(category) {
  const icons = { 'Communication': '<i class="fas fa-tower-broadcast"></i>', 'Navigation': '<i class="fas fa-compass"></i>', 'Surveillance': '<i class="fas fa-satellite-dish"></i>', 'Data Processing': '<i class="fas fa-server"></i>', 'Support': '<i class="fas fa-bolt"></i>' };
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
  
  // Get isActive from checkbox (default to true if not checked)
  const isActiveCheckbox = document.getElementById('equipmentActive');
  const isActive = isActiveCheckbox ? isActiveCheckbox.checked : true;

  const bypassGatewayCheckbox = document.getElementById('equipmentBypassGateway');
  const bypassGateway = bypassGatewayCheckbox ? bypassGatewayCheckbox.checked : false;

  // Add bypassGateway to connectionConfig
  if (connectionConfig) {
    connectionConfig.bypassGateway = bypassGateway;
  }
  
  const equipment = { 
    name,
    code,
    category,
    status,
    airportId,
    branchId: airportId,
    description,
    snmpConfig: connectionConfig,
    isActive: isActive,
    ipAddress: connectionConfig.ip || ''
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
  document.getElementById('equipmentAirport').value = equipment.branchId || equipment.airportId;
  document.getElementById('equipmentDescription').value = equipment.description || '';
  
  // Set isActive checkbox
  const isActiveCheckbox = document.getElementById('equipmentActive');
  if (isActiveCheckbox) {
    // Default to true if isActive is not set or is null
    isActiveCheckbox.checked = equipment.isActive === true;
    
    // Update toggle label based on isActive value
    const activeLabel = document.getElementById('equipmentActiveLabel');
    if (activeLabel) {
      activeLabel.textContent = equipment.isActive !== false ? 'Active' : 'Inactive';
    }
  }

  // Set Bypass Gateway checkbox
  const bypassGatewayCheckbox = document.getElementById('equipmentBypassGateway');
  const snmpConfig = equipment.snmp_config || {};
  if (bypassGatewayCheckbox) {
      bypassGatewayCheckbox.checked = snmpConfig.bypassGateway === true;
      const bypassLabel = document.getElementById('bypassGatewayLabel');
      if (bypassLabel) {
          bypassLabel.textContent = snmpConfig.bypassGateway === true ? 'Standalone (Direct Ping)' : 'Tiered (Gateway Ping)';
      }
  }
  
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
  
  // Reset toggle switch label
  const activeLabel = document.getElementById('equipmentActiveLabel');
  if (activeLabel) {
    activeLabel.textContent = 'Active';
  }
  
  if (connectionMethodSelect) {
    connectionMethodSelect.value = 'snmp';
    connectionMethodSelect.dispatchEvent(new Event('change'));
  }
  if (connectionTemplateSelect) {
    connectionTemplateSelect.value = '';
  }
}

// Add event listener for toggle switch to update label dynamically
document.addEventListener('DOMContentLoaded', function() {
  const equipmentActiveCheckbox = document.getElementById('equipmentActive');
  const equipmentActiveLabel = document.getElementById('equipmentActiveLabel');
  
  if (equipmentActiveCheckbox && equipmentActiveLabel) {
    equipmentActiveCheckbox.addEventListener('change', function() {
      equipmentActiveLabel.textContent = this.checked ? 'Active' : 'Inactive';
    });
  }
});

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
  // Temporarily bypass role check for debugging
  // if (currentUser.role !== 'admin' && currentUser.role !== 'user_pusat') return;
  
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
      <td>${user.branchName || user.branch_name || 'Pusat (All)'}</td>
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
  const branchValue = document.getElementById('branch')?.value;
  const branchId = branchValue ? parseInt(branchValue, 10) : null;
  
  // Validate password for new users
  if (!id && (!password || password.length < 6)) {
    alert('Password is required and must be at least 6 characters');
    return;
  }
  
  const userData = { name, username, role, branchId };
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

    // Load airports to select
    await loadAirportsToSelect();
    
    const branchSelect = document.getElementById('branch');
    if (branchSelect) {
      branchSelect.value = user.branchId || user.branch_id || '';
    }
    
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

async function loadAirportsToSelect() {
  const select = document.getElementById('branch');
  if (!select) return;

  try {
    const res = await fetch(`${API_URL}/airports`, {
      headers: getAuthHeaders()
    });

    const result = await res.json();
    const airports = Array.isArray(result) ? result : (result.data || []);

    if (!Array.isArray(airports)) return;

    // Show all airports with city name for better UX
    const options = airports.map(a =>
      `<option value="${a.id}">${a.name} - ${a.city}</option>`
    ).join('');

    select.innerHTML = '<option value="">Semua Cabang</option>' + options;
  } catch (err) {
    console.error('Gagal load airports:', err);
  }
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
  const ipBranch = document.getElementById('airportIpBranch') ? document.getElementById('airportIpBranch').value : '';
  
  const airportData = { name, city, lat, lng, parentId, ipBranch };
  
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

window.editAirport = async function(id) {
  const airport = airportsData.find(a => a.id === id);
  if (!airport) return;
  
  document.getElementById('airportId').value = airport.id;
  document.getElementById('airportName').value = airport.name;
  document.getElementById('airportCity').value = airport.city;
  document.getElementById('airportLat').value = airport.lat;
  document.getElementById('airportLng').value = airport.lng;
  
  if (document.getElementById('airportIpBranch')) {
    document.getElementById('airportIpBranch').value = airport.ip_branch || airport.ipBranch || '';
  }
  
  // Load parent airports
  await loadAirportsToSelect();
  
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
  if (document.getElementById('airportIpBranch')) {
    document.getElementById('airportIpBranch').value = '';
  }
}

// ============================================
// AIRPORTS GRID VIEW WITH SEARCH & FILTER
// ============================================

let airportsGridData = [];
let selectedAirportForMonitoring = null;
let selectedChildAirportForMonitoring = null;
let airportEquipmentFilter = 'all';

function initAirportsGrid() {
  const searchInput = document.getElementById('searchAirports');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      renderAirportsTable(term);
    });
  }

  // Search for child airports in monitoring view
  const searchChildInput = document.getElementById('searchChildAirports');
  if (searchChildInput) {
    searchChildInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      // Only apply filter if we're in monitoring view
      if (selectedAirportForMonitoring) {
        renderChildAirportsForMonitoring(term);
      }
    });
  }

// Filter buttons for equipment categories
  const filterButtons = document.querySelectorAll('#cabangSection .monitoring-filters .filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      airportEquipmentFilter = btn.dataset.filter;
      renderAirportEquipmentCards();
    });
  });
}

async function loadAirportsGrid() {
  try {
    const response = await fetch(`${API_URL}/airports`);
    airportsGridData = await response.json();
    renderAirportsTable();
  } catch (error) {
    console.error('Error loading airports grid:', error);
    const tableBody = document.getElementById('airportsTableBody');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-state">Error loading airports</td>
        </tr>
      `;
    }
  }
}

function renderAirportsTable(searchTerm = '') {
  const tableBody = document.getElementById('airportsTableBody');
  if (!tableBody) return;

  const dataToUse = airportsGridData.length > 0 ? airportsGridData : airportsData;
  let filtered = dataToUse;

  if (searchTerm) {
    filtered = filtered.filter(a =>
      a.name.toLowerCase().includes(searchTerm) ||
      a.city.toLowerCase().includes(searchTerm)
    );
  }

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">No airports found</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(airport => {
    const totalEquipment = calculateAirportTotalEquipment(airport.id);
    
    return `
      <tr>
        <td>
          <strong>${airport.name}</strong>
        </td>
        <td>${airport.city}</td>
        <td><code style="color: var(--accent-primary); font-weight: bold;">${airport.ip_branch || airport.ipBranch || '-'}</code></td>
        <td>
          <div class="clickable-count" onclick="viewAirportEquipment(${airport.id})" title="Klik untuk memfilter alat di bandara ini">
            ${totalEquipment} Equipment
          </div>
        </td>
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

function renderAirportsGrid(searchTerm = '', statusFilter = '') {
  const grid = document.getElementById('airportsGrid');
  if (!grid) return;
  
  let filtered = airportsGridData.filter(a => !a.parentId);
  
  if (searchTerm) {
    filtered = filtered.filter(a => 
      a.name.toLowerCase().includes(searchTerm) || 
      a.city.toLowerCase().includes(searchTerm)
    );
  }
  
  if (statusFilter) {
    filtered = filtered.filter(a => a.status === statusFilter);
  }
  
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="loading-state">
        <i class="fas fa-inbox"></i>
        <p>No airports found</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = filtered.map(airport => {
    const totalEquipment = calculateAirportTotalEquipment(airport.id);
    const statusClass = (airport.status || 'Normal').toLowerCase();
    
    return `
      <div class="airport-card" onclick="selectAirportForMonitoring(${airport.id})">
        <div class="airport-card-header">
          <div class="airport-icon">
            <i class="fas fa-plane"></i>
          </div>
          <div class="airport-basic-info">
            <h3>${airport.name}</h3>
            <span class="city">${airport.city}</span>
          </div>
        </div>
        
        <div class="airport-stats-row">
          <div class="airport-stat">
            <i class="fas fa-tools"></i>
            <span>${totalEquipment} Equipment</span>
          </div>
          <div class="airport-stat status-${statusClass}">
            <span>${airport.status || 'Normal'}</span>
          </div>
        </div>
        
        <div class="airport-equipment-breakdown">
          ${renderEquipmentBreakdown(airport.equipmentCount)}
        </div>
      </div>
    `;
  }).join('');
}

function calculateAirportTotalEquipment(airportId) {
  let total = 0;
  const dataToUse = airportsGridData.length > 0 ? airportsGridData : airportsData;
  const airport = dataToUse.find(a => a.id === airportId);
  if (airport && airport.equipmentCount) {
    const counts = airport.equipmentCount;
    total = (counts.Communication || 0) + 
            (counts.Navigation || 0) + 
            (counts.Surveillance || 0) + 
            (counts['Data Processing'] || 0) + 
            (counts.Support || 0);
  }
  
  return total;
}

function renderEquipmentBreakdown(equipmentCount) {
  if (!equipmentCount) return '';
  
  const categories = [
    { key: 'Communication', icon: 'fa-tower-broadcast', color: '#3b82f6' },
    { key: 'Navigation', icon: 'fa-compass', color: '#10b981' },
    { key: 'Surveillance', icon: 'fa-satellite-dish', color: '#f59e0b' },
    { key: 'Data Processing', icon: 'fa-server', color: '#8b5cf6' },
    { key: 'Support', icon: 'fa-bolt', color: '#ef4444' }
  ];
  
  return categories.map(cat => {
    const count = equipmentCount[cat.key] || 0;
    if (count === 0) return '';
    return `
      <div class="breakdown-item" style="color: ${cat.color};">
        <i class="fas ${cat.icon}"></i>
        <span>${count}</span>
      </div>
    `;
  }).join('');
}

async function selectAirportForMonitoring(airportId) {
  selectedAirportForMonitoring = airportsGridData.find(a => a.id === airportId);
  if (!selectedAirportForMonitoring) return;
  
  // Hide grid, show monitoring in cabang section
  const gridSection = document.querySelector('#cabangSection .card');
  const monitoringSection = document.getElementById('cabangMonitoringSection');
  
  if (gridSection) gridSection.classList.add('hidden');
  if (monitoringSection) monitoringSection.classList.remove('hidden');
  
  updateHeaderBreadcrumb('cabang', selectedAirportForMonitoring.name);
  
  // Update title
  const titleEl = document.getElementById('monitoringAirportName');
  if (titleEl) {
    titleEl.innerHTML = `<i class="fas fa-plane"></i> ${selectedAirportForMonitoring.name} - ${selectedAirportForMonitoring.city}`;
  }
  
  // Render child airports
  renderChildAirportsForMonitoring();
  
  // Load equipment
  await loadAirportEquipment(airportId);
}

function renderChildAirportsForMonitoring(searchTerm = '') {
  const container = document.getElementById('childAirportsList');
  if (!container || !selectedAirportForMonitoring) return;

  const children = airportsGridData.filter(a => a.parentId === selectedAirportForMonitoring.id);

  // Filter children by search term
  let filteredChildren = children;
  if (searchTerm) {
    filteredChildren = children.filter(a =>
      a.name.toLowerCase().includes(searchTerm) ||
      a.city.toLowerCase().includes(searchTerm)
    );
  }

  let html = '';

  // Parent airport item (without "(Main)" label)
  const isParentActive = !selectedChildAirportForMonitoring;
  const parentCounts = selectedAirportForMonitoring.activeEquipmentCount || selectedAirportForMonitoring.equipmentCount || {};
  const parentTotal = (parentCounts.Communication || 0) +
                      (parentCounts.Navigation || 0) +
                      (parentCounts.Surveillance || 0) +
                      (parentCounts['Data Processing'] || 0) +
                      (parentCounts.Support || 0);

  html += `
    <div class="child-airport-item parent-item ${isParentActive ? 'active' : ''}" 
         onclick="selectChildAirportForMonitoring(${selectedAirportForMonitoring.id})">
      <div class="child-icon main">
        <i class="fas fa-plane"></i>
      </div>
      <span class="child-name">${selectedAirportForMonitoring.name}</span>
      <span class="child-badge">${parentTotal}</span>
    </div>
  `;

  if (filteredChildren.length === 0) {
    html += `
      <div style="text-align: center; padding: 15px; color: var(--text-muted); font-size: 0.8rem; border-top: 1px solid var(--border-color); margin-top: 10px;">
        <i class="fas fa-info-circle"></i> ${searchTerm ? 'No matching locations' : 'No child locations'}
      </div>
    `;
  } else {
    filteredChildren.forEach(child => {
      const isActive = selectedChildAirportForMonitoring && selectedChildAirportForMonitoring.id === child.id;
      const childCounts = child.activeEquipmentCount || child.equipmentCount || {};
      const totalEquipment = (childCounts.Communication || 0) + 
                             (childCounts.Navigation || 0) + 
                             (childCounts.Surveillance || 0) + 
                             (childCounts['Data Processing'] || 0) + 
                             (childCounts.Support || 0);

      html += `
        <div class="child-airport-item ${isActive ? 'active' : ''}" 
             onclick="selectChildAirportForMonitoring(${child.id})">
          <div class="child-icon">
            <i class="fas fa-plane"></i>
          </div>
          <span class="child-name">${child.name}</span>
          <span class="child-badge">${totalEquipment}</span>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

async function selectChildAirportForMonitoring(childId) {
  if (childId === selectedAirportForMonitoring.id) {
    selectedChildAirportForMonitoring = null;
  } else {
    selectedChildAirportForMonitoring = airportsGridData.find(a => a.id === childId);
  }
  
  renderChildAirportsForMonitoring();
  
  const targetAirport = selectedChildAirportForMonitoring || selectedAirportForMonitoring;
  updateHeaderBreadcrumb('cabang', targetAirport.name);
  await loadAirportEquipment(targetAirport.id);
}

let airportEquipmentData = [];

async function loadAirportEquipment(airportId) {
  try {
    const token = localStorage.getItem('authToken');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    
    // Mengambil hanya equipment yang statusnya active
    const response = await fetch(`${API_URL}/equipment?airportId=${airportId}&limit=1000&isActive=true`, { headers });
    const result = await response.json();
    
    // Proteksi ganda di client-side untuk membuang alat yang inactive
    const allEq = result.data || result;
    airportEquipmentData = allEq.filter(e => e.isActive !== false && e.is_active !== 0 && e.is_active !== false);
    
    renderAirportEquipmentCards();
  } catch (error) {
    console.error('Error loading airport equipment:', error);
    airportEquipmentData = [];
    renderAirportEquipmentCards();
  }
}

function renderAirportEquipmentCards() {
  const container = document.getElementById('airportEquipmentCards');
  if (!container) return;

  let filtered = airportEquipmentData;
  if (airportEquipmentFilter !== 'all') {
    filtered = airportEquipmentData.filter(e => e.category === airportEquipmentFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="monitoring-empty-state">
        <i class="fas fa-box-open"></i>
        <h3>No Equipment</h3>
        <p>No equipment found in this category</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((equipment, index) => {
    const status = equipment.status || 'Normal';
    const category = equipment.category || 'Support';
    const lastUpdate = equipment.lastUpdate || equipment.updated_at || new Date().toISOString();
    const timeAgo = getTimeAgo(lastUpdate);

    const categoryIcons = {
      'Communication': 'fa-tower-broadcast',
      'Navigation': 'fa-compass',
      'Surveillance': 'fa-satellite-dish',
      'Data Processing': 'fa-server',
      'Support': 'fa-bolt'
    };

    const iconClass = categoryIcons[category] || 'fa-cog';

    return `
      <div class="equipment-card status-${status.toLowerCase()}" style="animation-delay: ${index * 0.05}s">
        <div class="equipment-card-header">
          <div class="equipment-card-icon" style="background: transparent; border: none;">
            <i class="fas ${iconClass}" style="color: white;"></i>
          </div>
          <div class="equipment-status ${status.toLowerCase()}">
            ${status}
          </div>
        </div>

        <div class="equipment-card-body">
          <h4 class="equipment-name">${equipment.name}</h4>
          <span class="equipment-code">${equipment.code || 'N/A'}</span>
          <span class="equipment-category">${category}</span>
        </div>

        <div class="equipment-card-footer">
          <div class="equipment-last-update">
            <i class="fas fa-clock"></i>
            <span>${timeAgo}</span>
          </div>
          <div class="equipment-signal">
            <div class="signal-bar ${status === 'Normal' ? 'active' : ''}"></div>
            <div class="signal-bar ${status === 'Normal' ? 'active' : ''}"></div>
            <div class="signal-bar ${status === 'Normal' ? 'active' : ''}"></div>
            <div class="signal-bar ${status === 'Normal' ? 'active' : ''}"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function showAirportsGrid() {
  selectedAirportForMonitoring = null;
  selectedChildAirportForMonitoring = null;
  airportEquipmentFilter = 'all';

  const gridSection = document.querySelector('#cabangSection .card');
  const monitoringSection = document.getElementById('cabangMonitoringSection');

  if (gridSection) gridSection.classList.remove('hidden');
  if (monitoringSection) monitoringSection.classList.add('hidden');

  // Clear search input for child airports
  const searchChildInput = document.getElementById('searchChildAirports');
  if (searchChildInput) {
    searchChildInput.value = '';
  }

  updateHeaderBreadcrumb('cabang'); // Kembalikan breadcrumb ke standar

  // Reset filter buttons
  const filterButtons = document.querySelectorAll('#cabangSection .monitoring-filters .filter-btn');
  filterButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.filter === 'all') btn.classList.add('active');
  });

  loadAirportsGrid();
}

function getTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

// Make functions available globally
window.selectAirportForMonitoring = selectAirportForMonitoring;
window.selectChildAirportForMonitoring = selectChildAirportForMonitoring;

window.pingEquipment = async function(equipmentId) {
  // Cegah auto-refresh live data menimpa tampilan Ping test
  currentViewedEquipmentId = null;

  const equipment = equipmentData.find(e => e.id === equipmentId);
  const snmpConfig = equipment.snmp_config || {};
  
  const pingModal = document.getElementById('snmpDataModal');
  const pingContent = document.getElementById('snmpDataContent');
  
  if (!equipment) {
    alert('Equipment not found');
    return;
  }
  
  pingContent.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-primary);"></i><p style="margin-top: 15px;">Pinging equipment...</p></div>';
  pingModal.classList.remove('hidden');
  
  try {
    const response = await fetch(`${API_URL}/equipment/${equipmentId}`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Failed to ping equipment');
    }
    
    const equipmentItem = await response.json();
    const config = equipmentItem.snmp_config || {};
    const ip = config.ip;
    
    if (!ip) {
      throw new Error('No IP address configured for this equipment');
    }
    
    const pingResponse = await fetch(`${API_URL}/equipment/${equipmentId}/ping`, {
      headers: getAuthHeaders()
    });
    
    const pingResult = await pingResponse.json();
    
    if (pingResult.success) {
      pingContent.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h4 style="color: #10b981; margin-bottom: 10px;"><i class="fas fa-check-circle"></i> Equipment Reachable</h4>
          <p style="color: var(--text-secondary);">IP Address: <strong>${ip}</strong></p>
          <p style="color: var(--text-muted); font-size: 0.85rem;">Response time:</p>
          <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; margin-top: 10px;">
            <p style="margin: 5px 0;">Min: <strong>${(pingResult.statistics && pingResult.statistics.min != null) ? Number(pingResult.statistics.min).toFixed(2) : 'N/A'} ms</strong></p>
            <p style="margin: 5px 0;">Max: <strong>${(pingResult.statistics && pingResult.statistics.max != null) ? Number(pingResult.statistics.max).toFixed(2) : 'N/A'} ms</strong></p>
            <p style="margin: 5px 0;">Avg: <strong>${(pingResult.statistics && pingResult.statistics.avg != null) ? Number(pingResult.statistics.avg).toFixed(2) : 'N/A'} ms</strong></p>
            <p style="margin: 5px 0;">Packet Loss: <strong>${pingResult.packets ? pingResult.packets.loss : (pingResult.statistics && pingResult.statistics.loss != null ? pingResult.statistics.loss : '0%')}</strong></p>
          </div>
        </div>
        <div style="text-align: center;">
          <button onclick="document.getElementById('snmpDataModal').classList.add('hidden')" style="background: var(--accent-primary); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">Close</button>
        </div>
      `;
    } else {
      pingContent.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h4 style="color: #ef4444; margin-bottom: 10px;"><i class="fas fa-times-circle"></i> Equipment Unreachable</h4>
          <p style="color: var(--text-secondary);">IP Address: <strong>${ip}</strong></p>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 10px;">${pingResult.message || 'Device is not responding to ping'}</p>
        </div>
        <div style="text-align: center;">
        <button onclick="document.getElementById('snmpDataModal').classList.add('hidden'); currentViewedEquipmentId = null; if (liveDataTimer) clearInterval(liveDataTimer);" style="background: var(--accent-primary); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">Close</button>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error pinging equipment:', error);
    pingContent.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 20px;">
        <h4 style="color: #ef4444; margin-bottom: 10px;"><i class="fas fa-exclamation-triangle"></i> Ping Error</h4>
        <p style="color: var(--text-secondary);">${error.message}</p>
      </div>
      <div style="text-align: center; margin-top: 15px;">
        <button onclick="document.getElementById('snmpDataModal').classList.add('hidden')" style="background: var(--accent-primary); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">Close</button>
      </div>
    `;
  }
};

// FIXED: Robust snmpDataModal close handler
document.addEventListener('DOMContentLoaded', function() {
  const snmpModal = document.getElementById('snmpDataModal');
  if (snmpModal) {
    // ESC key close
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !snmpModal.classList.contains('hidden')) {
        snmpModal.classList.add('hidden');
        if (window.liveDataTimer) {
          clearInterval(window.liveDataTimer);
          window.liveDataTimer = null;
        }
        window.currentViewedEquipmentId = null;
      }
    });
  }
});

window.viewSnmpData = async function(equipmentId, silent = false) {
  window.currentViewedEquipmentId = equipmentId;

  const equipment = equipmentData.find(e => e.id === equipmentId);
  const snmpConfig = equipment.snmp_config || {};
  
  if (!equipment || !snmpConfig || !snmpConfig.enabled) {
    alert('SNMP is not enabled for this equipment');
    return;
  }
  
  const snmpDataContent = document.getElementById('snmpDataContent');
  if (!silent) {
    // Set interval (1s) untuk Live Update
    if (liveDataTimer) clearInterval(liveDataTimer);
    liveDataTimer = setInterval(() => {
      const modal = document.getElementById('snmpDataModal');
      if (modal && modal.classList.contains('hidden')) {
        clearInterval(liveDataTimer);
      } else if (currentViewedEquipmentId) {
        viewSnmpData(currentViewedEquipmentId, true);
      }
    }, 1000);

    snmpDataContent.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-primary);"></i><p style="margin-top: 15px;">Loading Data...</p></div>';
    document.getElementById('snmpDataModal').classList.remove('hidden');
  }
  
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
    
    for (let [key, valueObj] of Object.entries(data)) {
      if (key === 'error' || key === 'cached') continue;
      
      const isObject = valueObj !== null && typeof valueObj === 'object';
      let finalValue = isObject ? valueObj.value : valueObj;
      let finalLabel = isObject && valueObj.label ? valueObj.label : key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const finalUnit = isObject && valueObj.unit ? valueObj.unit : '';
      
      // --- HAPUS TULISAN DALAM KURUNG PADA LABEL SECARA PAKSA ---
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
      } else if (lblLower.includes('digital input')) {
        if (finalValue === '0') finalValue = '<span style="color: #6b7280; font-weight: bold;">Low (0)</span>';
        else if (finalValue === '1') finalValue = '<span style="color: #3b82f6; font-weight: bold;">High (1)</span>';
      }
      
      html += `
        <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="color: var(--text-muted); font-size: 0.75rem; margin-bottom: 5px;">${finalLabel}</div>
          <div style="color: var(--text-primary); font-size: 1.1rem; font-weight: 600; ${silent ? 'animation: highlightValue 1s ease-out;' : ''}">
            ${finalValue} <span style="font-size: 0.85rem; color: var(--text-muted);">${finalUnit}</span>
          </div>
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
window.pingEquipment = pingEquipment;
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
  console.log('[DEBUG] loadSnmpTemplates called');
  try {
    const response = await fetch(`${API_URL}/snmp/templates`, {
      headers: getAuthHeaders()
    });
    
    console.log('[DEBUG] loadSnmpTemplates response status:', response.status);
    
    // Temporarily bypass auth check for debugging
    // if (response.status === 401 || response.status === 403) {
    //   console.log('[DEBUG] loadSnmpTemplates: Unauthorized');
    //   return;
    // }
    
    if (!response.ok) {
      console.error('[DEBUG] loadSnmpTemplates: Response not ok', response.status);
      return;
    }
    
    const responseText = await response.text();
    console.log('[DEBUG] loadSnmpTemplates response text:', responseText);
    snmpTemplatesData = JSON.parse(responseText);
    console.log('[DEBUG] loadSnmpTemplates data:', snmpTemplatesData);
    renderSnmpTemplateTable();
    updateConnectionTemplateSelect();
  } catch (error) {
    console.error('[DEBUG] Error loading SNMP templates:', error);
  }
}

function renderSnmpTemplateTable() {
  console.log('[DEBUG] renderSnmpTemplateTable called, data length:', snmpTemplatesData.length);
  console.log('[DEBUG] snmpTemplateTableBody element:', snmpTemplateTableBody);
  
  if (!snmpTemplateTableBody) {
    console.error('[DEBUG] snmpTemplateTableBody is null!');
    return;
  }
  
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
      <td><code>${template.oidBase || 'N/A'}</code></td>
      <td>${template.protocol ? `<span class="protocol-badge">${template.protocol.toUpperCase()}</span>` : '<span class="protocol-badge">SNMP</span>'}</td>
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
  
  // Set protocol if available (backward compatible)
  const protocolSelect = document.getElementById('snmpTemplateProtocol');
  if (protocolSelect && template.protocol) {
    protocolSelect.value = template.protocol;
  }
  
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
  
  const protocol = document.getElementById('snmpTemplateProtocol').value;
  const templateData = { name, description, oidBase, oidMappings, protocol };
  
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

// Equipment Detail Modal
function initEquipmentDetailModal() {
  const m = document.getElementById('equipmentDetailModal');
  if (!m) return;
  const c = document.getElementById('closeEquipmentDetailModal');
  if (c) c.addEventListener('click', () => m.classList.add('hidden'));
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
}
window.viewEquipmentDetail = async function(id) {
  const m = document.getElementById('equipmentDetailModal');
  const c = document.getElementById('equipmentDetailContent');
  const t = document.getElementById('equipmentDetailTitle');
  if (!m || !c) return;
  c.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i><p>Loading...</p></div>';
  m.classList.remove('hidden');
  try {
    const r = await fetch(API_URL + '/equipment/' + id, { headers: getAuthHeaders() });
    if (!r.ok) throw new Error('Failed');
    const e = await r.json();
    if (t) t.textContent = e.name;
    let an = '-';
    if (e.airportId) { const a = airportsData.find(x => x.id === e.airportId); an = a ? a.name : 'Airport #' + e.airportId; }
    const sc = e.snmp_config || {};
    let ci = sc.enabled ? '<span style="font-family:monospace;">' + (sc.ip||'-') + ':' + (sc.port||161) + '</span>' : '<span style="color:var(--text-muted)">Not Configured</span>';
    let li = e.lat && e.lng ? e.lat + ', ' + e.lng : '<span style="color:var(--text-muted)">Not set</span>';
    c.innerHTML = '<div style="max-width:800px;margin:0 auto;"><div style="display:flex;align-items:center;gap:20px;margin-bottom:25px;padding-bottom:20px;border-bottom:1px solid var(--border-color);"><div style="width:60px;height:60px;border-radius:12px;background:var(--primary-color);display:flex;align-items:center;justify-content:center;"><i class="fas fa-tools" style="font-size:1.5rem;color:white;"></i></div><div><h2 style="margin:0;font-size:1.5rem;">' + e.name + '</h2><span style="color:var(--text-muted)">' + e.code + '</span></div><div style="margin-left:auto;"><span class="status-badge ' + e.status + '">' + e.status + '</span></div></div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px;"><div style="background:var(--bg-secondary);padding:20px;border-radius:12px;"><h4 style="margin:0 0 15px 0;color:var(--primary-color)">Basic Information</h4><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="color:var(--text-muted)">ID</span><span>#' + e.id + '</span></div><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="color:var(--text-muted)">Category</span><span>' + e.category + '</span></div><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="color:var(--text-muted)">Airport</span><span>' + an + '</span></div><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="color:var(--text-muted)">Status</span><span class="status-badge ' + e.status + '">' + e.status + '</span></div><div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted)">Active</span><span style="color:' + (e.is_active ? '#10b981' : '#ef4444') + '">' + (e.is_active ? 'Yes' : 'No') + '</span></div></div><div style="background:var(--bg-secondary);padding:20px;border-radius:12px;"><h4 style="margin:0 0 15px 0;color:var(--primary-color)">Connection & Location</h4><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="color:var(--text-muted)">IP:Port</span>' + ci + '</div><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="color:var(--text-muted)">Location</span><span>' + li + '</span></div><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="color:var(--text-muted)">Community</span><span style="font-family:monospace;">' + (sc.community||'-') + '</span></div><div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted)">Template</span><span>' + (sc.templateId||'-') + '</span></div></div></div>' + (e.description ? '<div style="background:var(--bg-secondary);padding:20px;border-radius:12px;margin-top:20px;"><h4 style="margin:0 0 15px 0;color:var(--primary-color)">Description</h4><p style="margin:0;color:var(--text-secondary)">' + e.description + '</p></div>' : '') + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:25px;"><button onclick="document.getElementById(\'equipmentDetailModal\').classList.add(\'hidden\')" class="btn btn-secondary">Close</button>' + (e.hasSnmp ? '<button onclick="document.getElementById(\'equipmentDetailModal\').classList.add(\'hidden\');viewSnmpData(' + e.id + ')" class="btn btn-primary" style="background:#8b5cf6">Data</button>' : '') + '<button onclick="document.getElementById(\'equipmentDetailModal\').classList.add(\'hidden\');editEquipment(' + e.id + ')" class="btn btn-primary">Edit</button></div></div>';
  } catch (err) { c.innerHTML = '<div style="text-align:center;padding:20px;"><p style="color:#ef4444">Error: ' + err.message + '</p><button onclick="document.getElementById(\'equipmentDetailModal\').classList.add(\'hidden\')" class="btn btn-secondary">Close</button></div>'; }
};
document.addEventListener('DOMContentLoaded', () => initEquipmentDetailModal());
