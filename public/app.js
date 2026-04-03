// API Base URL
const API_URL = '/api';

// State
let authToken = localStorage.getItem('authToken') || null;
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let equipmentData = [];
let airportsData = [];
// Map Picker state
let pickerMap = null;
let pickerMarker = null;
window.activeMapPicker = null; 

// Helper to get auth headers
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return headers;
}

// Theme init
function initTheme() {
  const theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i> <span>Light Mode</span>' : '<i class="fas fa-moon"></i> <span>Dark Mode</span>';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.innerHTML = next === 'dark' ? '<i class="fas fa-sun"></i> <span>Light Mode</span>' : '<i class="fas fa-moon"></i> <span>Dark Mode</span>';
  }
}

// Map init with Bandara Sentani as default (approx 250NM view)
function initMap() {
  const mapContainer = document.getElementById('mapContainer');
  if (!mapContainer) return;
  mapContainer.style.height = '450px';
  
  const sentaniCoords = [-2.5768, 140.5163];
  
  window.map = L.map('mapContainer', { 
    center: sentaniCoords, 
    zoom: 7, 
    zoomControl: false 
  });
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.map);
  L.control.zoom({ position: 'bottomleft' }).addTo(window.map);
  
  window.map.on('click', function(e) {
    const { lat, lng } = e.latlng;
    console.log(`[MAP] Clicked at: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    
    if (window.activeMapPicker) {
      const type = window.activeMapPicker;
      const latInput = document.getElementById(type === 'equipment' ? 'equipmentLat' : 'airportLat');
      const lngInput = document.getElementById(type === 'equipment' ? 'equipmentLng' : 'airportLng');
      
      if (latInput && lngInput) {
        latInput.value = lat.toFixed(6);
        lngInput.value = lng.toFixed(6);
      }
      
      // Restore modal transparency and interaction
      const modalId = type === 'equipment' ? 'equipmentModal' : 'airportModal';
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        const container = modal.querySelector('.modal-container');
        if (container) container.style.border = 'none';
      }
      
      window.activeMapPicker = null;
      console.log(`[MAP] Location populated for ${type}`);
    } else {
      // Default (original logic)
      const latInput = document.getElementById('equipmentLat');
      const lngInput = document.getElementById('equipmentLng');
      if (latInput && lngInput && !document.getElementById('equipmentModal').classList.contains('hidden')) {
        latInput.value = lat.toFixed(6);
        lngInput.value = lng.toFixed(6);
      }
    }
    
    if (window.pickMarker) {
      window.pickMarker.setLatLng(e.latlng);
    } else {
      window.pickMarker = L.marker(e.latlng, { draggable: true }).addTo(window.map)
        .bindPopup("Lokasi Terpilih").openPopup();
    }
  });
  
  loadEquipmentMarkers();
}

// Global "Pick Location" logic
window.enableMapPick = function(type) {
  // ... (original content)
};

// --- NEW ISSUE #10 FUNCTIONS ---
let supCategoriesData = [];

async function loadSupCategories() {
  try {
    const res = await fetch(`${API_URL}/sup-categories`);
    supCategoriesData = await res.json();
  } catch (err) { console.error('Error loading sup categories:', err); }
}

window.handleCategoryChange = function(category) {
  const select = document.getElementById('equipmentSupCategory');
  if (!select) return;
  
  select.innerHTML = '<option value="">Select Sub Category</option>';
  
  const group = supCategoriesData.find(c => c.category === category);
  if (group && group.sub_categories) {
    group.sub_categories.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = sub;
      select.appendChild(opt);
    });
  }
};

window.addNewSupCategory = async function() {
  const category = document.getElementById('equipmentCategory').value;
  if (!category) {
    alert('Please select a main category first');
    return;
  }
  
  const newSub = prompt(`Add new sub-category for ${category}:`);
  if (!newSub) return;
  
  const group = supCategoriesData.find(c => c.category === category) || { category, sub_categories: [] };
  if (!group.sub_categories.includes(newSub)) {
    group.sub_categories.push(newSub);
    try {
      await fetch(`${API_URL}/sup-categories/${category}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sub_categories: group.sub_categories })
      });
      await loadSupCategories();
      handleCategoryChange(category);
      document.getElementById('equipmentSupCategory').value = newSub;
    } catch (err) { console.error('Error saving sub category:', err); }
  }
};

window.addIpComponentRow = function(data = { name: '', ip_address: '' }) {
  const container = document.getElementById('ipComponentsContainer');
  const rowId = `ip-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  const div = document.createElement('div');
  div.className = 'form-row ip-component-row';
  div.id = rowId;
  div.innerHTML = `
    <div class="form-group" style="flex: 2;">
      <input type="text" class="comp-name" placeholder="Name (e.g. TX 1)" value="${data.name}">
    </div>
    <div class="form-group" style="flex: 2;">
      <input type="text" class="comp-ip" placeholder="IP Address" value="${data.ip_address}">
    </div>
    <div class="form-group" style="flex: 0; align-self: flex-end; margin-bottom: 15px;">
      <button type="button" class="btn btn-icon delete" onclick="document.getElementById('${rowId}').remove()">
        <i class="fas fa-minus"></i>
      </button>
    </div>
  `;
  container.appendChild(div);
};

async function loadEquipmentMarkers() {
  if (!window.map) return;
  
  // Clear existing markers (except pickMarker)
  window.map.eachLayer(layer => {
    if (layer instanceof L.Marker && layer !== window.pickMarker) {
      window.map.removeLayer(layer);
    }
  });

  try {
    const res = await fetch(`${API_URL}/equipment?isActive=true`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    
    const result = await res.json();
    const equipment = result.data || result;
    
    console.log(`[MAP] Received ${Array.isArray(equipment) ? equipment.length : 0} equipment items for map`);
    
    if (Array.isArray(equipment)) {
      equipment.forEach(item => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lng);

        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          const colors = { Normal: '#10b981', Warning: '#f59e0b', Alert: '#ef4444', Disconnect: '#6b7280' };
          const color = colors[item.status] || '#3b82f6';
          
          const markerHtml = `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.4); cursor: pointer;"></div>`;
          const icon = L.divIcon({ html: markerHtml, className: 'custom-equipment-icon', iconSize: [14, 14], iconAnchor: [7, 7] });

          const marker = L.marker([lat, lng], { icon }).addTo(window.map);
          marker.bindPopup(`
            <div class="map-popup" style="padding: 5px;">
              <strong style="display: block; margin-bottom: 5px; color: var(--text-main); font-size: 0.9rem;">${item.name}</strong>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color};"></span>
                <span style="font-weight: 600; font-size: 0.85rem;">${item.status}</span>
              </div>
              <div style="margin-top: 5px; font-size: 0.75rem; color: var(--text-muted);">${item.category}</div>
            </div>
          `);
        } else {
          console.warn(`[MAP] Skipping marker for ${item.name} (ID: ${item.id}) - Invalid coords: ${item.lat}, ${item.lng}`);
        }
      });
    }
  } catch (err) { 
    console.error('[MAP] Error loading equipment markers:', err); 
  }
}

// Stats loading
async function loadStats() {
  try {
    const res = await fetch(`${API_URL}/equipment/stats`);
    const stats = await res.json();
    
    document.getElementById('totalEquipment').textContent = stats.total || 0;
    if (document.getElementById('normalEquipment')) document.getElementById('normalEquipment').textContent = stats.normal || 0;
    if (document.getElementById('warningEquipment')) document.getElementById('warningEquipment').textContent = stats.warning || 0;
    if (document.getElementById('alertEquipment')) document.getElementById('alertEquipment').textContent = stats.alert || 0;
    if (document.getElementById('disconnectEquipment')) document.getElementById('disconnectEquipment').textContent = stats.disconnect || 0;
    
    if (stats.byCategory) {
      const c = stats.byCategory;
      if (document.getElementById('commCount')) document.getElementById('commCount').textContent = c.Communication || 0;
      if (document.getElementById('navCount')) document.getElementById('navCount').textContent = c.Navigation || 0;
      if (document.getElementById('survCount')) document.getElementById('survCount').textContent = c.Surveillance || 0;
      if (document.getElementById('dataCount')) document.getElementById('dataCount').textContent = c['Data Processing'] || 0;
      if (document.getElementById('supportCount')) document.getElementById('supportCount').textContent = c.Support || 0;
    }
  } catch (err) { console.error('Stats error:', err); }
}

// Equipment CRUD
async function loadEquipment() {
  try {
    const res = await fetch(`${API_URL}/equipment`, { headers: getAuthHeaders() });
    const result = await res.json();
    equipmentData = result.data || result;
    renderEquipmentTable(equipmentData);
  } catch (err) { console.error('Equipment load error:', err); }
}

function renderEquipmentTable(data) {
  const tbody = document.getElementById('equipmentTableBody');
  if (!tbody) return;
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No equipment available</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(item => `
    <tr>
      <td style="text-align: center;"><span class="status-dot ${(item.status_ops || item.status || 'Normal').toLowerCase()}"></span></td>
      <td style="text-align: center;">${item.name}</td>
      <td style="text-align: center;">${item.category} (${item.sup_category || '-'})</td>
      <td style="text-align: center;">${item.merk || '-'} / ${item.type || '-'}</td>
      <td style="text-align: center;"><span class="status-badge ${item.status_ops || item.status || 'Normal'}">${item.status_ops || item.status || 'Normal'}</span></td>
      <td style="text-align: center;">${item.lat}, ${item.lng}</td>
      <td style="text-align: center;">
        <button class="btn btn-icon" onclick="viewEquipmentDetail(${item.id})"><i class="fas fa-eye"></i></button>
        <button class="btn btn-icon" onclick="editEquipment(${item.id})"><i class="fas fa-edit"></i></button>
        <button class="btn btn-icon delete" onclick="deleteEquipment(${item.id})"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

async function handleEquipmentSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('equipmentId').value;
  const latVal = document.getElementById('equipmentLat').value.replace(',', '.');
  const lngVal = document.getElementById('equipmentLng').value.replace(',', '.');
  
  const data = {
    name: document.getElementById('equipmentName').value,
    code: document.getElementById('equipmentCode').value,
    category: document.getElementById('equipmentCategory').value,
    sup_category: document.getElementById('equipmentSupCategory').value,
    merk: document.getElementById('equipmentMerk').value,
    type: document.getElementById('equipmentType').value,
    status: document.getElementById('equipmentStatus').value,
    status_ops: document.getElementById('equipmentStatusOps').value,
    airportId: document.getElementById('equipmentAirport').value,
    lat: latVal ? parseFloat(latVal) : null,
    lng: lngVal ? parseFloat(lngVal) : null,
    description: document.getElementById('equipmentDescription').value,
    isActive: document.getElementById('equipmentActive').checked
  };
  
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/equipment/${id}` : `${API_URL}/equipment`;
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    
    if (res.ok) {
      const savedEquip = await res.json();
      const currentId = id || savedEquip.id;
      
      // Save IP Components
      const ipRows = document.querySelectorAll('.ip-component-row');
      await fetch(`${API_URL}/otentication/${currentId}`, { method: 'DELETE', headers: getAuthHeaders() });
      for (const row of ipRows) {
        const name = row.querySelector('.comp-name').value;
        const ip = row.querySelector('.comp-ip').value;
        if (name && ip) {
          await fetch(`${API_URL}/otentication`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ name, ip_address: ip, equipt_id: currentId })
          });
        }
      }
      
      // Save Limitations
      const limitData = {
        equipt_id: currentId,
        name: data.name,
        category: data.category,
        value: document.getElementById('limitValue').value,
        wlv: document.getElementById('limitWlv').value,
        alv: document.getElementById('limitAlv').value,
        whv: document.getElementById('limitWhv').value,
        ahv: document.getElementById('limitAhv').value
      };
      await fetch(`${API_URL}/limitations`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(limitData)
      });

      document.getElementById('equipmentModal').classList.add('hidden');
      loadEquipment();
      loadStats();
      loadEquipmentMarkers();
    }
  } catch (err) { console.error('Form submit error:', err); }
}

window.editEquipment = async function(id) {
  const item = equipmentData.find(e => e.id == id);
  if (!item) return;
  
  document.getElementById('equipmentForm').reset();
  document.getElementById('ipComponentsContainer').innerHTML = '';
  
  document.getElementById('equipmentId').value = item.id;
  document.getElementById('equipmentName').value = item.name;
  document.getElementById('equipmentCode').value = item.code || '';
  document.getElementById('equipmentCategory').value = item.category;
  handleCategoryChange(item.category);
  document.getElementById('equipmentSupCategory').value = item.sup_category || '';
  document.getElementById('equipmentMerk').value = item.merk || '';
  document.getElementById('equipmentType').value = item.type || '';
  document.getElementById('equipmentAirport').value = item.airportId || '';
  document.getElementById('equipmentStatus').value = item.status || 'Active';
  document.getElementById('equipmentStatusOps').value = item.status_ops || 'Normal';
  document.getElementById('equipmentLat').value = item.lat || '';
  document.getElementById('equipmentLng').value = item.lng || '';
  document.getElementById('equipmentDescription').value = item.description || '';
  document.getElementById('equipmentActive').checked = item.isActive !== false;
  
  // Load IP Components
  try {
    const res = await fetch(`${API_URL}/otentication/${id}`);
    const components = await res.json();
    components.forEach(c => addIpComponentRow(c));
  } catch (err) { console.error('Error loading components:', err); }
  
  // Load Limitations
  try {
    const res = await fetch(`${API_URL}/limitations/${id}`);
    const limit = await res.json();
    if (limit && !limit.error) {
      document.getElementById('limitValue').value = limit.value || '';
      document.getElementById('limitWlv').value = limit.wlv || '';
      document.getElementById('limitAlv').value = limit.alv || '';
      document.getElementById('limitWhv').value = limit.whv || '';
      document.getElementById('limitAhv').value = limit.ahv || '';
    }
  } catch (err) { console.error('Error loading limitations:', err); }
  
  document.getElementById('modalFormTitle').textContent = 'Edit Equipment';
  document.getElementById('equipmentModal').classList.remove('hidden');
}

window.viewEquipmentDetail = async function(id) {
  const item = equipmentData.find(e => e.id == id);
  if (!item) return;
  
  const content = document.getElementById('equipmentDetailContent');
  content.innerHTML = '<div class="loading-spinner">Loading details...</div>';
  document.getElementById('equipmentDetailModal').classList.remove('hidden');
  
  try {
    const [authRes, limitRes] = await Promise.all([
      fetch(`${API_URL}/otentication/${id}`),
      fetch(`${API_URL}/limitations/${id}`)
    ]);
    const components = await authRes.json();
    const limit = await limitRes.json();
    
    content.innerHTML = `
      <div class="detail-grid">
        <div class="detail-card">
          <h4>General Information</h4>
          <p><strong>Name:</strong> ${item.name}</p>
          <p><strong>Category:</strong> ${item.category} / ${item.sup_category || '-'}</p>
          <p><strong>Brand/Type:</strong> ${item.merk || '-'} / ${item.type || '-'}</p>
          <p><strong>Status Operasional:</strong> <span class="status-badge ${item.status_ops || item.status}">${item.status_ops || item.status}</span></p>
          <p><strong>Coordinate:</strong> ${item.lat}, ${item.lng}</p>
          <p><strong>Keterangan:</strong> ${item.description || '-'}</p>
        </div>
        <div class="detail-card">
          <h4>IP Components (Otentication)</h4>
          ${components.length > 0 ? `
            <table class="data-table">
              <thead><tr><th>Component</th><th>IP Address</th></tr></thead>
              <tbody>${components.map(c => `<tr><td>${c.name}</td><td>${c.ip_address}</td></tr>`).join('')}</tbody>
            </table>
          ` : '<p>No IP components configured</p>'}
        </div>
        <div class="detail-card full-width">
          <h4>Threshold Limitations</h4>
          ${limit && !limit.error ? `
            <table class="data-table">
              <thead>
                <tr><th>Value</th><th>WLV</th><th>ALV</th><th>WHV</th><th>AHV</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>${limit.value || '0'}</td>
                  <td class="status-warning">${limit.wlv || '-'}</td>
                  <td class="status-error">${limit.alv || '-'}</td>
                  <td class="status-warning">${limit.whv || '-'}</td>
                  <td class="status-error">${limit.ahv || '-'}</td>
                </tr>
              </tbody>
            </table>
          ` : '<p>No specific limitations configured</p>'}
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = '<p class="status-error">Failed to load detail data</p>';
  }
};

async function deleteEquipment(id) {
  if (!confirm('Are you sure?')) return;
  try {
    const res = await fetch(`${API_URL}/equipment/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (res.ok) {
      loadEquipment();
      loadStats();
      loadEquipmentMarkers();
    }
  } catch (err) { console.error('Delete error:', err); }
}

// Airport management
async function loadAirports() {
  try {
    const res = await fetch(`${API_URL}/airports`);
    airportsData = await res.json();
    
    const tableBody = document.getElementById('airportsTableBody');
    if (tableBody) {
      tableBody.innerHTML = airportsData.map(a => `
        <tr>
          <td>${a.name}</td>
          <td>${a.city}</td>
          <td>${a.ipBranch || '-'}</td>
          <td>${a.totalEquipment || 0}</td>
          <td>
            <button class="btn btn-icon" onclick="editAirport(${a.id})"><i class="fas fa-edit"></i></button>
          </td>
        </tr>
      `).join('');
    }
    
    const airportSelect = document.getElementById('equipmentAirport');
    if (airportSelect) {
      airportSelect.innerHTML = '<option value="">Select Airport</option>' + 
        airportsData.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      
      // Auto-select first airport if none chosen
      if (airportsData.length > 0 && !airportSelect.value) {
        airportSelect.value = airportsData[0].id;
      }
    }
  } catch (err) { console.error('Airports load error:', err); }
}

async function handleAirportSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('airportId').value;
  const latVal = document.getElementById('airportLat').value.replace(',', '.');
  const lngVal = document.getElementById('airportLng').value.replace(',', '.');
  
  const data = {
    name: document.getElementById('airportName').value,
    city: document.getElementById('airportCity').value,
    lat: latVal ? parseFloat(latVal) : null,
    lng: lngVal ? parseFloat(lngVal) : null,
    ipBranch: document.getElementById('airportIpBranch').value
  };
  
  try {
    const res = await fetch(`${API_URL}/airports/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    
    if (res.ok) {
      document.getElementById('airportModal').classList.add('hidden');
      loadAirports();
      loadStats();
    }
  } catch (err) { console.error('Airport save error:', err); }
}

window.editAirport = function(id) {
  const airport = airportsData.find(a => a.id == id);
  if (!airport) return;
  
  document.getElementById('airportId').value = airport.id;
  document.getElementById('airportName').value = airport.name;
  document.getElementById('airportCity').value = airport.city;
  document.getElementById('airportLat').value = airport.lat;
  document.getElementById('airportLng').value = airport.lng;
  document.getElementById('airportIpBranch').value = airport.ipBranch || '';
  
  document.getElementById('airportModalFormTitle').textContent = 'Edit Airport Configuration';
  document.getElementById('airportModal').classList.remove('hidden');
}

// Auth UI
function updateAuthUI() {
  const sidebarLogin = document.getElementById('sidebarLoginForm');
  const sidebarPanel = document.getElementById('sidebarUserPanel');
  const logoutBtn = document.getElementById('sidebarLogoutBtn');
  const userNameEl = document.getElementById('sidebarUserName');
  
  if (currentUser) {
    if (sidebarLogin) sidebarLogin.classList.add('hidden');
    if (sidebarPanel) sidebarPanel.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (userNameEl) userNameEl.textContent = currentUser.username;
    
    document.querySelectorAll('.hidden-initial').forEach(el => el.classList.remove('hidden-initial'));
  } else {
    if (sidebarLogin) sidebarLogin.classList.remove('hidden');
    if (sidebarPanel) sidebarPanel.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    
    document.querySelectorAll('.hidden-initial').forEach(el => el.classList.add('hidden-initial'));
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('sidebarUsername').value;
  const password = document.getElementById('sidebarPassword').value;
  
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const result = await res.json();
    
    if (result.success) {
      authToken = result.token;
      currentUser = result.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      updateAuthUI();
      loadEquipment();
      loadStats();
      loadAirports();
    } else {
      alert(result.message || 'Invalid credentials');
    }
  } catch (err) {
    console.error('Login error:', err);
    alert('An error occurred during login');
  }
}

// Navigation
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');
  const lastSection = localStorage.getItem('currentSection') || 'dashboard';

  const switchSection = (sectionId) => {
    navItems.forEach(i => {
      if (i.getAttribute('data-section') === sectionId) i.classList.add('active');
      else i.classList.remove('active');
    });

    sections.forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(sectionId + 'Section');
    if (target) {
      target.classList.remove('hidden');
      if (sectionId === 'dashboard' && window.map) setTimeout(() => window.map.invalidateSize(), 200);
      if (sectionId === 'templates' && typeof window.initConfigurationNav === 'function') {
        window.initConfigurationNav();
        window.setActiveConfig('snmp-templates');
      }
    }
    
    localStorage.setItem('currentSection', sectionId);
    
    const hb = document.getElementById('headerBreadcrumb');
    if (hb) {
      const labels = { dashboard: 'Map Dashboard', cabang: 'Cabang', equipment: 'Equipment', airports: 'Airports', 'equipment-logs': 'Logs', users: 'Users' };
      hb.innerHTML = `<span>${labels[sectionId] || sectionId}</span>`;
    }
  };

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchSection(item.getAttribute('data-section'));
    });
  });

  switchSection(lastSection);
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initMap();
  initNavigation();
  updateAuthUI();
  await loadSupCategories();
  loadStats();
  loadAirports();
  loadEquipment();
  
  document.getElementById('sidebarAuthForm').addEventListener('submit', handleLogin);
  document.getElementById('sidebarLogoutBtn').addEventListener('click', () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    location.reload();
  });
  
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
  });
  
  document.getElementById('addEquipmentBtn').addEventListener('click', () => {
    document.getElementById('equipmentForm').reset();
    document.getElementById('equipmentId').value = '';
    
    // Auto-select first airport if available
    const airportSelect = document.getElementById('equipmentAirport');
    if (airportSelect && airportsData.length > 0) {
      airportSelect.value = airportsData[0].id;
    }
    
    document.getElementById('modalFormTitle').textContent = 'Add New Equipment';
    document.getElementById('equipmentModal').classList.remove('hidden');
  });
  
  document.getElementById('closeEquipmentModal').addEventListener('click', () => {
    document.getElementById('equipmentModal').classList.add('hidden');
  });

  // Map Picker Modal listeners
  document.getElementById('closeMapPickerModal').addEventListener('click', () => {
    document.getElementById('mapPickerModal').classList.add('hidden');
  });

  document.getElementById('confirmLocationBtn').addEventListener('click', () => {
    if (pickerMarker && window.activeMapPicker) {
      const pos = pickerMarker.getLatLng();
      const type = window.activeMapPicker;
      const latInput = document.getElementById(type === 'equipment' ? 'equipmentLat' : 'airportLat');
      const lngInput = document.getElementById(type === 'equipment' ? 'equipmentLng' : 'airportLng');
      if (latInput && lngInput) {
        latInput.value = pos.lat.toFixed(6);
        lngInput.value = pos.lng.toFixed(6);
      }
      document.getElementById('mapPickerModal').classList.add('hidden');
    }
  });
  
  document.getElementById('equipmentForm').addEventListener('submit', handleEquipmentSubmit);
  
  // Airport Modal listeners
  const closeAirportModal = document.getElementById('closeAirportModal');
  if (closeAirportModal) {
    closeAirportModal.addEventListener('click', () => {
      document.getElementById('airportModal').classList.add('hidden');
    });
  }
  
  const cancelAirportEdit = document.getElementById('cancelAirportEdit');
  if (cancelAirportEdit) {
    cancelAirportEdit.addEventListener('click', () => {
      document.getElementById('airportModal').classList.add('hidden');
    });
  }
  
  const airportForm = document.getElementById('airportForm');
  if (airportForm) {
    airportForm.addEventListener('submit', handleAirportSubmit);
  }
});
