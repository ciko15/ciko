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

// Global configuration helper
const pluralMap = {
  'limitation': 'limitations',
  'authentication': 'authentications',
  'parsing': 'parsings',
  'sup-category': 'sup-categories',
  'category': 'categories'
};

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

  // Define Base Layers
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  });

  const sentinelSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  });

  window.map = L.map('mapContainer', {
    center: sentaniCoords,
    zoom: 7,
    zoomControl: false,
    layers: [sentinelSatellite] // Default Layer: Satellite
  });

  const baseMaps = {
    "Street View": osm,
    "Satellite View": sentinelSatellite,
    "Dark Mode Map": darkMap
  };

  L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(window.map);
  L.control.zoom({ position: 'bottomleft' }).addTo(window.map);

  window.map.on('click', function (e) {
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
        modal.style.background = 'rgba(0, 0, 0, 0.7)'; // Restore backdrop
        modal.style.pointerEvents = 'auto'; // Restore interaction
        const container = modal.querySelector('.modal-container');
        if (container) {
          container.style.opacity = '1';
          container.style.border = 'none';
        }
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

function generateUniqueCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Global "Pick Location" logic
window.enableMapPick = function (type) {
  window.activeMapPicker = type;

  if (window.map) {
    window.map.setView([-2.5768, 140.5163], 16);
  }

  const modalId = type === 'equipment' ? 'equipmentModal' : 'airportModal';
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.style.background = 'rgba(0, 0, 0, 0.1)';
    overlay.style.pointerEvents = 'none'; // Clicks pass through to map
    const container = overlay.querySelector('.modal-container');
    if (container) {
      container.style.opacity = '0.4';
      container.style.border = '2px dashed var(--accent-primary)';
    }
  }

  console.log(`[MAP] Picker enabled for ${type}`);
};

// --- NEW ISSUE #10 FUNCTIONS ---
let authenticationsData = [];
let supCategoriesData = [];

async function loadAuthentications() {
  try {
    const res = await fetch(`${API_URL}/config/authentications`, { headers: getAuthHeaders() });
    const data = await res.json();
    authenticationsData = Array.isArray(data) ? data : (data.data || []);
  } catch (err) {
    console.error('Error loading authentications:', err);
    authenticationsData = [];
  }
}

async function loadAuthenticationsFromConfig() {
  try {
    const res = await fetch('/db/equipment_otentication_config.json');
    const data = await res.json();
    authenticationsData = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error loading authentications from config:', err);
    authenticationsData = [];
  }
}

async function loadParsingConfig() {
  try {
    const res = await fetch('/db/equipment_parsing_config.json');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error loading parsing config:', err);
    return [];
  }
}

window.showAddDataSourceForm = async function (equipmentId) {
  const parsingConfig = await loadParsingConfig();
  const modal = document.getElementById('dataSourceOverlayModal');
  const form = document.getElementById('addDataSourceForm');
  
  if (!modal || !form) return;

  // Initialize fields
  const equipmentIdDisplay = document.getElementById('equipmentIdDisplay');
  const dataSourceIdInput = document.getElementById('dataSourceId');
  const templateSelect = document.getElementById('dataSourceTemplate');
  
  if (equipmentIdDisplay) equipmentIdDisplay.value = equipmentId;
  if (dataSourceIdInput) dataSourceIdInput.value = Math.random().toString(36).substr(2, 8).toUpperCase();
  
  if (templateSelect) {
    templateSelect.innerHTML = '<option value="">Pilih Template</option>' + 
      parsingConfig.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  // Show modal
  modal.classList.remove('hidden');

  // Event listener for cancel
  const cancelButton = document.getElementById('cancelAddDataSource');
  const closeButton = document.getElementById('closeDataSourceOverlayModal');
  
  const closeModal = () => {
    modal.classList.add('hidden');
    form.reset();
  };

  if (cancelButton) cancelButton.onclick = closeModal;
  if (closeButton) closeButton.onclick = closeModal;

  // Form submission
  form.onsubmit = async (event) => {
    event.preventDefault();

    const newSource = {
      equipment_id: equipmentId,
      id: dataSourceIdInput.value,
      name: document.getElementById('dataSourceName').value,
      ip_address: document.getElementById('dataSourceIp').value,
      udp_port: document.getElementById('dataSourceUdpPort').value,
      parsing_id: templateSelect.value,
    };

    try {
      const res = await fetch('/db/equipment_otentication_config.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSource),
      });

      if (res.ok) {
        alert('Data source berhasil ditambahkan!');
        closeModal();
      } else {
        alert('Gagal menambahkan data source!');
      }
    } catch (err) {
      console.error('Error saving data source:', err);
      alert('Terjadi kesalahan saat menyimpan data source!');
    }
  };
};

window.addDataSourceRow = function (sourceId = '') {
  const container = document.getElementById('dataSourceContainer');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'data-source-row';
  row.style.display = 'flex';
  row.style.gap = '10px';
  row.style.marginBottom = '10px';
  row.style.alignItems = 'center';

  let options = '<option value="">Select Data Source</option>';
  authenticationsData.forEach(auth => {
    options += `<option value="${auth.id}" ${auth.id == sourceId ? 'selected' : ''}>${auth.name} (${auth.type || 'SNMP'})</option>`;
  });

  row.innerHTML = `
    <select class="form-control data-source-select" style="flex: 1;">
      ${options}
    </select>
    <button type="button" class="btn-delete remove-source-btn" title="Remove Source">
      <i class="fas fa-trash"></i>
    </button>
  `;

  row.querySelector('.remove-source-btn').addEventListener('click', () => row.remove());
  container.appendChild(row);
};

async function loadSupCategories() {
  try {
    const res = await fetch(`${API_URL}/config/sup-categories`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    supCategoriesData = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error loading sup categories:', err);
    supCategoriesData = [];
  }
}

window.handleCategoryChange = function (category) {
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

window.addNewSupCategory = async function () {
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
      await fetch(`${API_URL}/config/sup-categories/${category}`, {
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

window.addIpComponentRow = function (data = { name: '', ip_address: '' }) {
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
      <button type="button" class="btn-delete" onclick="document.getElementById('${rowId}').remove()" title="Remove Component">
        <i class="fas fa-trash"></i>
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
    const res = await fetch(`${API_URL}/equipment?isActive=true`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const result = await res.json();
    const equipment = result.data || result;

    console.log(`[MAP] Received ${Array.isArray(equipment) ? equipment.length : 0} equipment items for map`);

    // Create bounds to auto-fit
    const bounds = L.latLngBounds();
    let hasCoords = false;

    if (Array.isArray(equipment)) {
      equipment.forEach(item => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lng);

        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          hasCoords = true;
          bounds.extend([lat, lng]);

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

          // Show popup on hover
          marker.on('mouseover', function () { this.openPopup(); });
          marker.on('mouseout', function () { this.closePopup(); });
        } else {
          console.warn(`[MAP] Skipping marker for ${item.name} (ID: ${item.id}) - Invalid coords: ${item.lat}, ${item.lng}`);
        }
      });

      // Auto-fit bounds if we have valid coordinates
      if (hasCoords) {
        window.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      }
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
      <td style="text-align: center;">
        <span class="status-badge ${item.isActive !== false ? 'Active' : 'Inactive'}">
          ${item.isActive !== false ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td style="text-align: center;">${item.name}</td>
      <td style="text-align: center;">${item.category} (${item.sup_category || '-'})</td>
      <td style="text-align: center;">${item.merk || '-'} / ${item.type || '-'}</td>
      <td style="text-align: center;">${item.lat}, ${item.lng}</td>
      <td style="text-align: center; white-space: nowrap;">
        <button class="btn-view" title="View Details" onclick="viewEquipmentDetail(${item.id})">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn-edit" title="Edit" onclick="editEquipment(${item.id})">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-delete" title="Delete" onclick="deleteEquipment(${item.id})">
          <i class="fas fa-trash"></i>
        </button>
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
    category: document.getElementById('equipmentCategory').value,
    sup_category: document.getElementById('equipmentSupCategory').value,
    merk: document.getElementById('equipmentMerk').value,
    type: document.getElementById('equipmentType').value,
    status: 'Active',
    status_ops: 'Normal', // Default as field was removed
    airportId: document.getElementById('equipmentAirport').value,
    lat: latVal ? parseFloat(latVal) : null,
    lng: lngVal ? parseFloat(lngVal) : null,
    description: document.getElementById('equipmentDescription').value,
    isActive: document.getElementById('equipmentActive').checked,
    dataSources: Array.from(document.querySelectorAll('.data-source-select'))
      .map(select => select.value)
      .filter(id => id !== '')
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

window.editEquipment = async function (id) {
  const item = equipmentData.find(e => e.id == id);
  if (!item) return;

  const getElement = (id) => {
    const element = document.getElementById(id);
    if (!element) {
      console.warn(`Element with ID '${id}' not found.`);
    }
    return element;
  };

  const equipmentForm = getElement('equipmentForm');
  if (equipmentForm) equipmentForm.reset();

  const equipmentId = getElement('equipmentId');
  if (equipmentId) equipmentId.value = item.id;

  const equipmentName = getElement('equipmentName');
  if (equipmentName) equipmentName.value = item.name;

  const equipmentCode = getElement('equipmentCode');
  if (equipmentCode) {
    equipmentCode.value = item.id || '';
    equipmentCode.readOnly = true;
  }

  const equipmentCategory = getElement('equipmentCategory');
  if (equipmentCategory) {
    equipmentCategory.value = item.category;
    handleCategoryChange(item.category);
  }

  const equipmentSupCategory = getElement('equipmentSupCategory');
  if (equipmentSupCategory) equipmentSupCategory.value = item.sup_category || '';

  const equipmentMerk = getElement('equipmentMerk');
  if (equipmentMerk) equipmentMerk.value = item.merk || '';

  const equipmentType = getElement('equipmentType');
  if (equipmentType) equipmentType.value = item.type || '';

  const equipmentAirport = getElement('equipmentAirport');
  if (equipmentAirport) equipmentAirport.value = item.airportId || '';

  const equipmentStatusOps = getElement('equipmentStatusOps');
  if (equipmentStatusOps) equipmentStatusOps.value = item.status_ops || 'Normal';

  const equipmentLat = getElement('equipmentLat');
  if (equipmentLat) equipmentLat.value = item.lat || '';

  const equipmentLng = getElement('equipmentLng');
  if (equipmentLng) equipmentLng.value = item.lng || '';

  const equipmentDescription = getElement('equipmentDescription');
  if (equipmentDescription) equipmentDescription.value = item.description || '';

  const equipmentActive = getElement('equipmentActive');
  if (equipmentActive) equipmentActive.checked = item.isActive !== false;

  // Clear and populate Data Sources
  const container = getElement('dataSourceContainer');
  if (container) {
    // Clear and populate logic here
  }

  document.getElementById('modalFormTitle').textContent = 'Edit Equipment';
  document.getElementById('equipmentModal').classList.remove('hidden');
}

window.viewEquipmentDetail = async function (id) {
  const item = equipmentData.find(e => e.id == id);
  if (!item) return;

  const content = document.getElementById('equipmentDetailContent');
  content.innerHTML = '<div class="loading-spinner">Loading details...</div>';
  document.getElementById('equipmentDetailModal').classList.remove('hidden');

  try {
    const limitRes = await fetch(`${API_URL}/config/limitations`, { headers: getAuthHeaders() });

    let limit = null;
    if (limitRes.ok) {
      const limitations = await limitRes.json();
      const limitArray = Array.isArray(limitations) ? limitations : (limitations.data || []);
      if (Array.isArray(limitArray)) {
        limit = limitArray.find(l => l.sup_category === item.sup_category);
      }
    }

    // Build HTML separately to avoid deep template nesting issues
    let limitHtml = '<p class="empty-state">No standard limitation for this sub-category</p>';
    if (limit && limit.name) {
      const thresholdHtml = (limit.value_type === 'numeric' || !limit.value_type) ? `
        <div class="threshold-range">
          <div class="range-item danger">ALV: ${limit.alv}</div>
          <div class="range-item warning">WLV: ${limit.wlv}</div>
          <div class="range-item warning">WHV: ${limit.whv}</div>
          <div class="range-item danger">AHV: ${limit.ahv}</div>
        </div>
      ` : '';

      limitHtml = `
        <p><strong>Parameter:</strong> ${limit.name}</p>
        <p><strong>Normal Value:</strong> ${limit.expected_value || limit.value || '-'}</p>
        <p><strong>Value Type:</strong> <span class="badge badge-outline">${limit.value_type || 'numeric'}</span></p>
        ${thresholdHtml}
      `;
    }

    content.innerHTML = `
      <div class="detail-grid">
        <div class="detail-card">
          <h4><i class="fas fa-info-circle"></i> General Information</h4>
          <p><strong>Name:</strong> ${item.name}</p>
          <p><strong>Category:</strong> ${item.category} / ${item.sup_category || '-'}</p>
          <p><strong>Brand/Type:</strong> ${item.merk || '-'} / ${item.type || '-'}</p>
          <p><strong>Status Operasional:</strong> <span class="status-badge ${item.status_ops || item.status}">${item.status_ops || item.status}</span></p>
          <p><strong>Coordinate:</strong> ${item.lat}, ${item.lng}</p>
          <p><strong>Description:</strong> ${item.description || '-'}</p>
        </div>
        <div class="detail-card">
          <h4><i class="fas fa-exclamation-triangle"></i> Standard Limitation</h4>
          ${limitHtml}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Detail error:', err);
    content.innerHTML = `
      <div class="detail-grid">
        <div class="detail-card">
          <h4><i class="fas fa-info-circle"></i> General Information</h4>
          <p><strong>Name:</strong> ${item.name}</p>
          <p><strong>Category:</strong> ${item.category} / ${item.sup_category || '-'}</p>
          <p><strong>Brand/Type:</strong> ${item.merk || '-'} / ${item.type || '-'}</p>
          <p><strong>Status Operasional:</strong> <span class="status-badge ${item.status_ops || item.status}">${item.status_ops || item.status}</span></p>
          <p><strong>Coordinate:</strong> ${item.lat}, ${item.lng}</p>
          <p><strong>Description:</strong> ${item.description || '-'}</p>
        </div>
        <div class="detail-card">
          <h4><i class="fas fa-exclamation-triangle"></i> Standard Limitation</h4>
          <p class="status-error"><i class="fas fa-exclamation-circle"></i> Limitation data unavailable</p>
        </div>
      </div>
    `;
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
    const res = await fetch(`${API_URL}/airports`, {
      headers: getAuthHeaders()
    });
    const result = await res.json();
    airportsData = result.data || result;

    const tableBody = document.getElementById('airportsTableBody');
    if (tableBody) {
      tableBody.innerHTML = airportsData.map(a => `
        <tr>
          <td>${a.name}</td>
          <td>${a.city}</td>
          <td>${a.ipBranch || '-'}</td>
          <td>${a.totalEquipment || 0}</td>
          <td>
            <button class="btn-edit" onclick="editAirport(${a.id})" title="Edit Airport"><i class="fas fa-edit"></i></button>
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

window.editAirport = function (id) {
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
  // Check both possible ID naming conventions for robustness
  const usernameEl = document.getElementById('sidebarUsername') || document.getElementById('username');
  const passwordEl = document.getElementById('sidebarPassword') || document.getElementById('password');

  if (!usernameEl || !passwordEl) {
    console.error('Login fields not found');
    return;
  }

  const username = usernameEl.value;
  const password = passwordEl.value;

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

      // Refresh application data now that we are authenticated
      await loadSupCategories();
      loadEquipment();
      loadStats();
      loadAirports();

      // Close login modal if open
      const loginModal = document.getElementById('loginModal');
      if (loginModal) loginModal.classList.add('hidden');
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
      const labels = {
        dashboard: 'Map Dashboard',
        cabang: 'Cabang',
        equipment: 'Equipment',
        airports: 'Airports',
        'equipment-logs': 'Logs',
        users: 'Users',
        configure: 'System Configuration'
      };
      hb.innerHTML = `<span>${labels[sectionId] || sectionId}</span>`;
    }

    if (sectionId === 'configure') {
      initConfigureNav();
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

  if (authToken) {
    await loadSupCategories();
    await loadAuthentications();
    loadStats();
    loadAirports();
    loadEquipment();
  }

  const sidebarAuthForm = document.getElementById('sidebarAuthForm');
  if (sidebarAuthForm) sidebarAuthForm.addEventListener('submit', handleLogin);

  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  document.getElementById('sidebarLogoutBtn').addEventListener('click', () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    location.reload();
  });
  if (document.getElementById('addDataSourceBtn')) {
    document.getElementById('addDataSourceBtn').addEventListener('click', async () => {
      const equipmentIdInput = document.getElementById('equipmentId');
      if (!equipmentIdInput || !equipmentIdInput.value) {
        alert('ID Equipment tidak ditemukan! Pastikan form equipment terbuka.');
        return;
      }

      const equipmentId = equipmentIdInput.value;
      const parsingConfig = await loadParsingConfig();

      // Open a new window for adding data source
      const newWindow = window.open('', '_blank', 'width=600,height=700');
      if (!newWindow) {
        alert('Popup window blocked! Please allow popups for this site.');
        return;
      }

      newWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Tambah Data Source</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            label { display: block; margin-bottom: 5px; }
            input, select, button { margin-bottom: 15px; width: 100%; padding: 8px; box-sizing: border-box; }
          </style>
        </head>
        <body>
          <h3>Tambah Data Source</h3>
          <form id="addDataSourceForm">
            <label for="equipmentId">ID Equipment:</label>
            <input type="text" id="equipmentId" value="${equipmentId}" readonly><br>

            <label for="dataSourceId">ID Data Source:</label>
            <input type="text" id="dataSourceId" value="${Math.random().toString(36).substr(2, 8).toUpperCase()}" readonly><br>

            <label for="dataSourceName">Nama Data Source:</label>
            <input type="text" id="dataSourceName" required><br>

            <label for="dataSourceIp">IP Address:</label>
            <input type="text" id="dataSourceIp" required><br>

            <label for="dataSourceUdpPort">UDP Port:</label>
            <input type="number" id="dataSourceUdpPort" required><br>

            <label for="dataSourceTemplate">Template Parsing:</label>
            <select id="dataSourceTemplate" required></select><br>

            <button type="submit">Simpan</button>
            <button type="button" id="cancelButton">Batal</button>
          </form>

          <script>
            const parsingConfigs = ${JSON.stringify(parsingConfig)};
            const templateSelect = document.getElementById('dataSourceTemplate');
            templateSelect.innerHTML = parsingConfigs.map(p => \`<option value="\${p.id}">\${p.name}</option>\`).join('');

            document.getElementById('cancelButton').addEventListener('click', () => {
              window.close();
            });

            document.getElementById('addDataSourceForm').addEventListener('submit', async (event) => {
              event.preventDefault();

              const newSource = {
                equipment_id: document.getElementById('equipmentId').value,
                id: document.getElementById('dataSourceId').value,
                name: document.getElementById('dataSourceName').value,
                ip_address: document.getElementById('dataSourceIp').value,
                udp_port: document.getElementById('dataSourceUdpPort').value,
                parsing_id: document.getElementById('dataSourceTemplate').value,
              };

              try {
                const res = await fetch('/db/equipment_otentication_config.json', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newSource),
                });

                if (res.ok) {
                  alert('Data source berhasil ditambahkan!');
                  window.close();
                } else {
                  alert('Gagal menambahkan data source!');
                }
              } catch (err) {
                console.error('Error saving data source:', err);
                alert('Terjadi kesalahan saat menyimpan data source!');
              }
            });
          </script>
        </body>
        </html>
      `);
    });
  }

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('active');
    });

    document.getElementById('addEquipmentBtn').addEventListener('click', () => {
      document.getElementById('equipmentForm').reset();
      document.getElementById('equipmentId').value = '';
      document.getElementById('equipmentCode').value = generateUniqueCode(8);

      // Clear data sources for new equipment
      const container = document.getElementById('dataSourceContainer');
      if (container) container.innerHTML = '';

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

    // Missing Close Listeners
    const closeEquipmentDetailModal = document.getElementById('closeEquipmentDetailModal');
    if (closeEquipmentDetailModal) {
      closeEquipmentDetailModal.addEventListener('click', () => {
        document.getElementById('equipmentDetailModal').classList.add('hidden');
      });
    }

    const closeUserModal = document.getElementById('closeUserModal');
    if (closeUserModal) {
      closeUserModal.addEventListener('click', () => {
        document.getElementById('userModal').classList.add('hidden');
      });
    }

    const closeUserDetailModal = document.getElementById('closeUserDetailModal');
    if (closeUserDetailModal) {
      closeUserDetailModal.addEventListener('click', () => {
        document.getElementById('userDetailModal').classList.add('hidden');
      });
    }

    const closeSnmpDataModal = document.getElementById('closeSnmpDataModal');
    if (closeSnmpDataModal) {
      closeSnmpDataModal.addEventListener('click', () => {
        document.getElementById('snmpDataModal').classList.add('hidden');
      });
    }

    const closeSnmpTemplateModal = document.getElementById('closeSnmpTemplateModal');
    if (closeSnmpTemplateModal) {
      closeSnmpTemplateModal.addEventListener('click', () => {
        document.getElementById('snmpTemplateModal').classList.add('hidden');
      });
    }

    const closeTemplateModal = document.getElementById('closeTemplateModal');
    if (closeTemplateModal) {
      closeTemplateModal.addEventListener('click', () => {
        document.getElementById('templateModal').classList.add('hidden');
      });
    }

    // Missing Cancel Listeners
    const cancelEquipmentEdit = document.getElementById('cancelEquipmentEdit');
    if (cancelEquipmentEdit) {
      cancelEquipmentEdit.addEventListener('click', () => {
        document.getElementById('equipmentModal').classList.add('hidden');
      });
    }

    const cancelUserEdit = document.getElementById('cancelUserEdit');
    if (cancelUserEdit) {
      cancelUserEdit.addEventListener('click', () => {
        document.getElementById('userModal').classList.add('hidden');
      });
    }

    const cancelSnmpTemplateEdit = document.getElementById('cancelSnmpTemplateEdit');
    if (cancelSnmpTemplateEdit) {
      cancelSnmpTemplateEdit.addEventListener('click', () => {
        document.getElementById('snmpTemplateModal').classList.add('hidden');
      });
    }

    const cancelTemplateEdit = document.getElementById('cancelTemplateEdit');
    if (cancelTemplateEdit) {
      cancelTemplateEdit.addEventListener('click', () => {
        document.getElementById('templateModal').classList.add('hidden');
      });
    }

    // Global Config Form
    const configForm = document.getElementById('configForm');
    if (configForm) {
      configForm.addEventListener('submit', handleConfigSubmit);
    }
  });

// Configure Section Logic
function initConfigureNav() {
  const configNavItems = document.querySelectorAll('#configureSection .config-nav-item');
  const configContents = document.querySelectorAll('#configureSection .config-content-item');

  const setActiveConfig = (configId) => {
    configNavItems.forEach(item => {
      if (item.getAttribute('data-config') === configId) item.classList.add('active');
      else item.classList.remove('active');
    });

    configContents.forEach(content => {
      if (content.id === `config${configId.charAt(0).toUpperCase() + configId.slice(1).replace(/-([a-z])/g, g => g[1].toUpperCase())}Content`) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    });

    loadConfigData(configId);
  };

  configNavItems.forEach(item => {
    // Remove existing listeners to prevent duplicates
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);

    newItem.addEventListener('click', () => {
      setActiveConfig(newItem.getAttribute('data-config'));
    });
  });

  // Set default active tab if none active
  const activeItem = document.querySelector('#configureSection .config-nav-item.active');
  if (activeItem) loadConfigData(activeItem.getAttribute('data-config'));
}

async function loadConfigData(tab) {
  // Simple helper for dynamic tbody ID to avoid complex template literal
  const baseTab = tab.charAt(0).toUpperCase() + tab.slice(1);
  const formattedTab = baseTab.replace(/-([a-z])/g, g => g[1].toUpperCase());
  const tbodyId = `config${formattedTab}TableBody`;

  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

  try {
    const pathType = pluralMap[tab] || (tab + 's');
    const endpoint = `/api/config/${pathType}`;
    const res = await fetch(endpoint, { headers: getAuthHeaders() });
    const data = await res.json();

    if (!Array.isArray(data)) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state text-danger">Error: Invalid data format received</td></tr>`;
      return;
    }

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No configuration items found</td></tr>';
      return;
    }

    renderConfigTable(tab, data, tbody);
  } catch (err) {
    console.error('Config load error:', err);
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state text-danger">Error: ${err.message}</td></tr>`;
  }
}

function renderConfigTable(tab, data, tbody) {
  tbody.innerHTML = '';

  data.forEach(item => {
    const tr = document.createElement('tr');

    if (tab === 'limitation') {
      tr.innerHTML = `
        <td><strong>${item.name}</strong></td>
        <td><span class="badge badge-info">${item.sup_category}</span></td>
        <td>${item.value_type || 'numeric'}</td>
        <td>${item.expected_value || (item.wlv ? `Range: ${item.alv}-${item.ahv}` : '-')}</td>
        <td>
          <button class="btn-edit" onclick="editConfig('limitation', '${item.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteConfig('limitation', '${item.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      `;
    } else if (tab === 'authentication') {
      tr.innerHTML = `
        <td><strong>${item.name}</strong></td>
        <td><code>${item.ip_address}</code></td>
        <td>${item.equipt_id ? `ID: ${item.equipt_id}` : '<span class="text-muted">Global</span>'}</td>
        <td>
          <button class="btn-edit" onclick="editConfig('authentication', '${item.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteConfig('authentication', '${item.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      `;
    } else if (tab === 'parsing') {
      tr.innerHTML = `
        <td><strong>${item.name}</strong></td>
        <td><span class="badge badge-secondary">${item.category}</span></td>
        <td><code>${item.parser_file || '-'}</code></td>
        <td>
          <button class="btn-edit" onclick="editConfig('parsing', '${item.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteConfig('parsing', '${item.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      `;
    } else if (tab === 'sup-category') {
      tr.innerHTML = `
        <td><strong>${item.category}</strong></td>
        <td>${(item.sub_categories || []).map(s => `<span class="badge badge-outline">${s}</span>`).join(' ')}</td>
        <td>
          <button class="btn-edit" onclick="editConfig('sup-category', '${item.id || item.category}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteConfig('sup-category', '${item.id || item.category}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      `;
    } else if (tab === 'category') {
      tr.innerHTML = `
        <td><strong>${item}</strong></td>
        <td><span class="badge badge-success">System Fixed</span></td>
      `;
    }

    tbody.appendChild(tr);
  });
}

function showAddConfigModal(type) {
  const modal = document.getElementById('configModal');
  const form = document.getElementById('configForm');
  const title = document.getElementById('configModalTitle');
  const container = document.getElementById('configFieldsContainer');

  form.reset();
  document.getElementById('configId').value = '';
  document.getElementById('configType').value = type;

  title.innerHTML = `<i class="fas fa-plus"></i> Add New ${type.charAt(0).toUpperCase() + type.slice(1)}`;

  renderConfigFields(type, null, container);
  modal.classList.remove('hidden');
}

async function editConfig(type, id) {
  try {
    const pluralMap = {
      'limitation': 'limitations',
      'authentication': 'authentications',
      'parsing': 'parsings',
      'sup-category': 'sup-categories'
    };
    const endpoint = `/api/config/${pluralMap[type] || `${type}s`}`;
    const res = await fetch(endpoint, { headers: getAuthHeaders() });
    const list = await res.json();
    const item = Array.isArray(list) ? list.find(i => i.id == id || (type === 'sup-category' && i.category == id)) : list;

    if (!item) return alert('Item not found');

    const modal = document.getElementById('configModal');
    const title = document.getElementById('configModalTitle');
    const container = document.getElementById('configFieldsContainer');

    document.getElementById('configId').value = id;
    document.getElementById('configType').value = type;

    title.innerHTML = `<i class="fas fa-edit"></i> Edit ${type.charAt(0).toUpperCase() + type.slice(1)}`;

    renderConfigFields(type, item, container);
    modal.classList.remove('hidden');
  } catch (err) {
    alert('Error fetching item details');
  }
}

function renderConfigFields(type, item, container) {
  container.innerHTML = '';

  if (type === 'limitation') {
    const categoriesHtml = ['Communication', 'Navigation', 'Surveillance', 'Data Processing', 'Support']
      .map(c => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`).join('');

    container.innerHTML = `
      <div class="form-group-ux">
        <label>Parameter Name</label>
        <input type="text" name="name" value="${item?.name || ''}" required placeholder="e.g. Temperature, Status">
      </div>
      <div class="form-row-ux">
        <div class="form-group-ux">
          <label>Category</label>
          <select name="category" required onchange="updateSubCategoryDropdown(this.value, 'modalSubCat')">
            ${categoriesHtml}
          </select>
        </div>
        <div class="form-group-ux">
          <label>Sub-Category</label>
          <select name="sup_category" id="modalSubCat" required>
            ${item ? `<option value="${item.sup_category}">${item.sup_category}</option>` : '<option value="">Select Category First</option>'}
          </select>
        </div>
      </div>
      <div class="form-row-ux">
        <div class="form-group-ux">
          <label>Value Type</label>
          <select name="value_type" required>
            <option value="numeric" ${item?.value_type === 'numeric' ? 'selected' : ''}>Numeric Range</option>
            <option value="string" ${item?.value_type === 'string' ? 'selected' : ''}>String Match (ok/normal)</option>
            <option value="percent" ${item?.value_type === 'percent' ? 'selected' : ''}>Percentage (%)</option>
          </select>
        </div>
        <div class="form-group-ux">
          <label>Normal/Expected Value</label>
          <input type="text" name="expected_value" value="${item?.expected_value || ''}" placeholder="e.g. ok or 100">
        </div>
      </div>
    `;
    if (!item) setTimeout(() => updateSubCategoryDropdown('Communication', 'modalSubCat'), 100);
  } else if (type === 'authentication') {
    container.innerHTML = `
      <div class="form-group-ux">
        <label>Component Name</label>
        <input type="text" name="name" value="${item?.name || ''}" required>
      </div>
      <div class="form-group-ux">
        <label>IP Address</label>
        <input type="text" name="ip_address" value="${item?.ip_address || ''}" required placeholder="192.168.x.x">
      </div>
    `;
  } else if (type === 'sup-category') {
    const list = ['Communication', 'Navigation', 'Surveillance', 'Data Processing', 'Support'];
    const options = list.map(c => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`).join('');

    container.innerHTML = `
      <div class="form-group-ux">
        <label>Main Category</label>
        <select name="category" ${item ? 'disabled' : ''}>
          ${options}
        </select>
      </div>
      <div class="form-group-ux">
        <label>Sub Categories (Comma separated)</label>
        <textarea name="sub_categories_raw" rows="3" placeholder="VHF A/G, VSCS, HF...">${(item?.sub_categories || []).join(', ')}</textarea>
      </div>
    `;
  }
}

async function handleConfigSubmit(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const type = formData.get('configType');
  const id = formData.get('configId');
  const data = Object.fromEntries(formData.entries());

  if (type === 'sup-category') {
    data.sub_categories = data.sub_categories_raw.split(',').map(s => s.trim()).filter(s => s);
  }

  try {
    const pathType = pluralMap[type] || (type + 's');
    const endpoint = `/api/config/${pathType}`;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${endpoint}/${id}` : endpoint;

    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (res.ok) {
      document.getElementById('configModal').classList.add('hidden');
      loadConfigData(type);
    } else {
      const err = await res.json();
      alert(`Error: ${err.message || 'Operation failed'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function deleteConfig(type, id) {
  if (!confirm('Are you sure you want to delete this configuration?')) return;

  try {
    const pathType = pluralMap[type] || (type + 's');
    const endpoint = `/api/config/${pathType}/${id}`;
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (res.ok) {
      loadConfigData(type);
    }
  } catch (err) {
    alert('Delete failed');
  }
}

function updateSubCategoryDropdown(category, selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const mapping = {
    'Communication': ['VHF A/G', 'VSCS', 'HF', 'VHF G/G', 'DS', 'VSAT', 'Voice REC', 'D-ATIS'],
    'Navigation': ['DVOR', 'DME', 'ILS-TDME', 'ILS-LLZ', 'ILS-GP', 'ILS-IM', 'ILS-MM', 'ILS-OM', 'NDB', 'GNSS', 'MLS', 'GBAS'],
    'Surveillance': ['RADAR', 'ADSB', 'ADSC', 'MLAT'],
    'Data Processing': ['ATCAS', 'AMSC', 'AMHS', 'ASMGCS'],
    'Support': ['G-LLZ', 'G-RADAR', 'G-OPS', 'UPS', 'GENSET']
  };

  const options = mapping[category] || [];
  select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
}

// Global modal closer helper
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}
