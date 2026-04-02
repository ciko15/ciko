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
  window.activeMapPicker = type;
  document.getElementById('mapPickerModal').classList.remove('hidden');
  
  // Initialize map if not already done
  if (!pickerMap) {
    const sentaniCoords = [-2.5768, 140.5163];
    pickerMap = L.map('mapPickerContainer').setView(sentaniCoords, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);
    
    pickerMap.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (pickerMarker) {
        pickerMarker.setLatLng(e.latlng);
      } else {
        pickerMarker = L.marker(e.latlng, { draggable: true }).addTo(pickerMap);
        pickerMarker.on('dragend', () => {
          const pos = pickerMarker.getLatLng();
          document.getElementById('pickedCoordsText').textContent = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        });
      }
      document.getElementById('pickedCoordsText').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      document.getElementById('confirmLocationBtn').disabled = false;
    });
  }
  
  // Ensure map is correctly sized when modal opens
  setTimeout(() => {
    pickerMap.invalidateSize();
    // Center at current values if they exist
    const latInput = document.getElementById(type === 'equipment' ? 'equipmentLat' : 'airportLat');
    const lngInput = document.getElementById(type === 'equipment' ? 'equipmentLng' : 'airportLng');
    if (latInput?.value && lngInput?.value) {
      const currentPos = [parseFloat(latInput.value), parseFloat(lngInput.value)];
      if (!isNaN(currentPos[0]) && !isNaN(currentPos[1]) && currentPos[0] !== 0) {
        pickerMap.setView(currentPos, 15);
        if (pickerMarker) pickerMarker.setLatLng(currentPos);
        else pickerMarker = L.marker(currentPos, { draggable: true }).addTo(pickerMap);
        document.getElementById('pickedCoordsText').textContent = `${currentPos[0].toFixed(6)}, ${currentPos[1].toFixed(6)}`;
        document.getElementById('confirmLocationBtn').disabled = false;
      }
    }
  }, 300);
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
      <td style="text-align: center;"><span class="status-dot ${item.status.toLowerCase()}"></span></td>
      <td style="text-align: center;">${item.name}</td>
      <td style="text-align: center;">${item.category}</td>
      <td style="text-align: center;">${airportsData.find(a => a.id == item.airportId)?.name || 'N/A'}</td>
      <td style="text-align: center;"><span class="status-badge ${item.status}">${item.status}</span></td>
      <td style="text-align: center;">${item.lat}, ${item.lng}</td>
      <td style="text-align: center;">
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
    airportId: document.getElementById('equipmentAirport').value,
    status: document.getElementById('equipmentStatus').value,
    lat: latVal ? parseFloat(latVal) : null,
    lng: lngVal ? parseFloat(lngVal) : null,
    description: document.getElementById('equipmentDescription').value
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
      document.getElementById('equipmentModal').classList.add('hidden');
      loadEquipment();
      loadStats();
      loadEquipmentMarkers();
    }
  } catch (err) { console.error('Form submit error:', err); }
}

window.editEquipment = function(id) {
  const item = equipmentData.find(e => e.id == id);
  if (!item) return;
  
  document.getElementById('equipmentId').value = item.id;
  document.getElementById('equipmentName').value = item.name;
  document.getElementById('equipmentCode').value = item.code || '';
  document.getElementById('equipmentCategory').value = item.category;
  document.getElementById('equipmentAirport').value = item.airportId;
  document.getElementById('equipmentStatus').value = item.status;
  document.getElementById('equipmentLat').value = item.lat || '';
  document.getElementById('equipmentLng').value = item.lng || '';
  document.getElementById('equipmentDescription').value = item.description || '';
  
  document.getElementById('modalFormTitle').textContent = 'Edit Equipment';
  document.getElementById('equipmentModal').classList.remove('hidden');
}

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
  const u = document.getElementById('sidebarUsername').value;
  const p = document.getElementById('sidebarPassword').value;
  
  if (u === 'admin' && p === 'ciko') {
    currentUser = { username: 'Admin', role: 'admin' };
  } else if (u === 'admin' && p === 'ciko1234') {
    currentUser = { username: 'Super Admin', role: 'superadmin' };
  }
  
  if (currentUser) {
    authToken = 'static-token-' + Date.now();
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateAuthUI();
    loadEquipment();
  } else {
    alert('Invalid credentials');
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
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMap();
  initNavigation();
  updateAuthUI();
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
