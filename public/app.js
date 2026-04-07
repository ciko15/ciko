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

// Global Toast Notification System
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'info-circle';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'exclamation-circle';
  if (type === 'warning') icon = 'exclamation-triangle';

  toast.innerHTML = `
    <i class="fas fa-${icon} toast-icon"></i>
    <div class="toast-message">${message}</div>
  `;

  container.appendChild(toast);

  // Remove toast after animation
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
      if (container.childNodes.length === 0) container.remove();
    }
  }, 4000);
}

// Global Custom Confirmation Modal
function showConfirm(title, message, options = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';

    const icon = options.type === 'warning' ? 'exclamation-triangle' : 'trash-alt';
    const confirmText = options.confirmText || 'Hapus';
    const cancelText = options.cancelText || 'Batal';

    overlay.innerHTML = `
      <div class="confirm-modal-container">
        <div class="confirm-modal-icon">
          <i class="fas fa-${icon}"></i>
        </div>
        <div class="confirm-modal-title">${title}</div>
        <div class="confirm-modal-message">${message}</div>
        <div class="confirm-modal-footer">
          <button class="confirm-modal-btn confirm-modal-btn-cancel">${cancelText}</button>
          <button class="confirm-modal-btn confirm-modal-btn-confirm">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = (result) => {
      overlay.style.opacity = '0';
      overlay.querySelector('.confirm-modal-container').style.transform = 'scale(0.9)';
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 200);
    };

    overlay.querySelector('.confirm-modal-btn-confirm').onclick = () => cleanup(true);
    overlay.querySelector('.confirm-modal-btn-cancel').onclick = () => cleanup(false);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
  });
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
  const modal = document.getElementById('mapPickerModal');
  if (!modal) return;

  modal.classList.remove('hidden');

  // Initialize Map in Picker if needed
  if (!window.pickerMap) {
    window.pickerMap = L.map('mapPickerContainer').setView([-2.5768, 140.5163], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(window.pickerMap);

    window.pickerMap.on('click', function (e) {
      const { lat, lng } = e.latlng;
      if (window.pickerMarker) {
        window.pickerMarker.setLatLng(e.latlng);
      } else {
        window.pickerMarker = L.marker(e.latlng, { draggable: true }).addTo(window.pickerMap);
      }

      document.getElementById('pickedCoordsText').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      document.getElementById('confirmLocationBtn').disabled = false;
    });
  } else {
    setTimeout(() => {
      window.pickerMap.invalidateSize();
    }, 200);
  }

  // Reset status
  document.getElementById('pickedCoordsText').textContent = 'None (Click on map)';
  document.getElementById('confirmLocationBtn').disabled = true;
  if (window.pickerMarker) {
    window.pickerMap.removeLayer(window.pickerMarker);
    window.pickerMarker = null;
  }
};

// Confirm Location Logic
document.getElementById('confirmLocationBtn')?.addEventListener('click', () => {
  if (window.pickerMarker) {
    const pos = window.pickerMarker.getLatLng();
    const type = window.activeMapPicker;

    if (type === 'equipment') {
      document.getElementById('equipmentLat').value = pos.lat.toFixed(6);
      document.getElementById('equipmentLng').value = pos.lng.toFixed(6);
    } else if (type === 'airport') {
      document.getElementById('airportLat').value = pos.lat.toFixed(6);
      document.getElementById('airportLng').value = pos.lng.toFixed(6);
    }

    document.getElementById('mapPickerModal').classList.add('hidden');
  }
});

// Close Map Picker Modal
document.getElementById('closeMapPickerModal')?.addEventListener('click', () => {
  document.getElementById('mapPickerModal').classList.add('hidden');
});

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
    const res = await fetch(`${API_URL}/config/parsings`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    return Array.isArray(data) ? data : (data.data || []);
  } catch (err) {
    console.error('Error loading parsing config:', err);
    return [];
  }
}

window.showAddDataSourceForm = async function (equipmentId, editSource = null) {
  const parsingConfig = await loadParsingConfig();
  const modal = document.getElementById('dataSourceOverlayModal');
  const form = document.getElementById('addDataSourceForm');
  const titleEl = modal.querySelector('.modal-header h3');

  if (!modal || !form) return;

  // Initialize fields
  const equipmentIdDisplay = document.getElementById('equipmentIdDisplay');
  const dataSourceIdInput = document.getElementById('dataSourceId');
  const templateSelect = document.getElementById('dataSourceTemplate');
  const nameInput = document.getElementById('dataSourceName');
  const ipInput = document.getElementById('dataSourceIp');
  const portInput = document.getElementById('dataSourceUdpPort');

  // Set Modal Title
  if (titleEl) titleEl.innerHTML = editSource
    ? `<i class="fas fa-edit"></i> Edit Data Source`
    : `<i class="fas fa-database"></i> Tambah Data Source`;

  if (equipmentIdDisplay) equipmentIdDisplay.value = equipmentId;

  if (editSource) {
    if (dataSourceIdInput) dataSourceIdInput.value = editSource.id;
    if (nameInput) nameInput.value = editSource.name || '';
    if (ipInput) ipInput.value = editSource.ip_address || '';
    if (portInput) portInput.value = editSource.udp_port || '';
  } else {
    form.reset();
    if (equipmentIdDisplay) equipmentIdDisplay.value = equipmentId;
    if (dataSourceIdInput) dataSourceIdInput.value = generateUniqueCode(8);
  }

  if (templateSelect) {
    templateSelect.innerHTML = '<option value="">Pilih Template</option>' +
      parsingConfig.map(p => `<option value="${p.id}" ${editSource && editSource.parsing_id == p.id ? 'selected' : ''}>${p.name}</option>`).join('');
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

    const payload = {
      name: nameInput.value,
      ip_address: ipInput.value,
      equipt_id: equipmentId,
      parsing_id: templateSelect.value,
      udp_port: portInput.value
    };

    try {
      const method = editSource ? 'PUT' : 'POST';
      const url = editSource
        ? `${API_URL}/config/authentications/${editSource.id}`
        : `${API_URL}/config/authentications`;

      const res = await fetch(url, {
        method: method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(`Data source berhasil ${editSource ? 'diperbarui' : 'ditambahkan'}!`, 'success');

        // Refresh global authentications list
        await loadAuthentications();

        // Refresh the table in the equipment form
        window.refreshDataSourceTable(equipmentId);

        closeModal();
      } else {
        const err = await res.json();
        showToast(`Gagal ${editSource ? 'memperbarui' : 'menambahkan'} data source: ` + (err.message || 'Server error'), 'error');
      }
    } catch (err) {
      console.error('Error saving data source:', err);
      showToast('Terjadi kesalahan saat menyimpan data source!', 'error');
    }
  };
};

window.refreshDataSourceTable = function (equipmentId) {
  const tbody = document.getElementById('dataSourceTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const mySources = authenticationsData.filter(auth => auth.equipt_id == equipmentId);
  mySources.forEach(source => window.addDataSourceRow(source.id));
};

window.addDataSourceRow = function (sourceId) {
  const tbody = document.getElementById('dataSourceTableBody');
  if (!tbody) return;

  const source = authenticationsData.find(auth => auth.id == sourceId);
  if (!source) return;

  const row = document.createElement('tr');
  row.style.borderBottom = '1px solid var(--border-color)';

  row.innerHTML = `
    <td style="padding: 10px 5px;">${source.name}</td>
    <td style="padding: 10px 5px;">${source.ip_address}</td>
    <td style="padding: 10px 5px; text-align: center; white-space: nowrap;">
      <button type="button" class="btn-edit edit-source-btn" style="margin-right: 5px;" title="Edit Source">
        <i class="fas fa-edit"></i>
      </button>
      <button type="button" class="btn-delete remove-source-btn" title="Remove Source">
        <i class="fas fa-trash"></i>
      </button>
    </td>
  `;

  // Action Buttons Logic
  row.querySelector('.edit-source-btn').addEventListener('click', () => {
    const equipmentId = document.getElementById('equipmentId').value;
    window.showAddDataSourceForm(equipmentId, source);
  });

  row.querySelector('.remove-source-btn').addEventListener('click', () => {
    const equipmentId = document.getElementById('equipmentId').value;
    window.deleteDataSource(sourceId, equipmentId);
  });

  tbody.appendChild(row);
};

window.deleteDataSource = async function (sourceId, equipmentId) {
  const confirmed = await showConfirm(
    'Hapus Data Source?',
    'Apakah Anda yakin ingin menghapus data source ini?',
    { type: 'danger', confirmText: 'Ya, Hapus' }
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_URL}/config/authentications/${sourceId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      // Refresh global data
      authenticationsData = authenticationsData.filter(a => a.id != sourceId);
      showToast('Data source berhasil dihapus', 'success');
      // Refresh table
      window.refreshDataSourceTable(equipmentId);
    } else {
      showToast('Gagal menghapus data source dari server.', 'error');
    }
  } catch (err) {
    console.error('Error deleting data source:', err);
    showToast('Terjadi kesalahan saat menghapus data source.', 'error');
  }
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
    showToast('Please select a main category first', 'warning');
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
    const res = await fetch(`${API_URL}/equipment?isActive=all`, { headers: getAuthHeaders() });
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
        <button class="btn-delete" title="Delete" onclick="deleteEquipment('${item.id}')">
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
    id: id,
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
    const isEdit = document.getElementById('modalFormTitle').textContent.includes('Edit');
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `${API_URL}/equipment/${id}` : `${API_URL}/equipment`;
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
  // Status Ops is removed as requested

  const equipmentLat = getElement('equipmentLat');
  if (equipmentLat) equipmentLat.value = item.lat || '';

  const equipmentLng = getElement('equipmentLng');
  if (equipmentLng) equipmentLng.value = item.lng || '';

  const equipmentDescription = getElement('equipmentDescription');
  if (equipmentDescription) equipmentDescription.value = item.description || '';

  const equipmentActive = getElement('equipmentActive');
  if (equipmentActive) equipmentActive.checked = item.isActive !== false;

  // Clear and populate Data Sources Table
  const tbody = document.getElementById('dataSourceTableBody');
  if (tbody) {
    tbody.innerHTML = '';

    // Ensure authentications are loaded
    if (authenticationsData.length === 0) await loadAuthentications();

    // Filter authentications for this equipment
    const mySources = authenticationsData.filter(auth => auth.equipt_id == item.id);
    if (mySources.length > 0) {
      mySources.forEach(source => window.addDataSourceRow(source.id));
    }
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
    // 1. Fetch latest Data Sources (Authentications)
    if (typeof loadAuthentications === 'function' && (!authenticationsData || authenticationsData.length === 0)) {
      await loadAuthentications();
    }
    
    // 2. Fetch Parsing Configs
    let parsings = [];
    if (typeof loadParsingConfig === 'function') {
      parsings = await loadParsingConfig();
    }

    // Filter sources for this equipment (using loose equality for string/number id)
    const mySources = (authenticationsData || []).filter(auth => String(auth.equipt_id) === String(item.id));
    
    let sourcesHtml = '';
    if (mySources.length > 0) {
      sourcesHtml = `
        <div class="detail-card" style="grid-column: 1 / -1; margin-top: 20px;">
          <h4><i class="fas fa-database"></i> Connected Data Sources</h4>
          <div class="table-responsive">
            <table class="config-table" style="width: 100%; font-size: 0.9rem;">
              <thead>
                <tr style="text-align: left; border-bottom: 2px solid var(--border-color);">
                  <th style="padding: 10px;">Name</th>
                  <th style="padding: 10px;">IP Address</th>
                  <th style="padding: 10px;">Port</th>
                  <th style="padding: 10px;">Template / Protocol</th>
                </tr>
              </thead>
              <tbody>
                ${mySources.map(source => {
                  const template = (parsings || []).find(p => String(p.id) === String(source.parsing_id));
                  return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 10px;">${source.name}</td>
                      <td style="padding: 10px; font-family: monospace;">${source.ip_address}</td>
                      <td style="padding: 10px;">${source.port || '-'}</td>
                      <td style="padding: 10px;">
                        <span class="badge badge-outline">${template ? template.name : 'Unknown'}</span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      sourcesHtml = `
        <div class="detail-card" style="grid-column: 1 / -1; margin-top: 20px;">
          <h4><i class="fas fa-database"></i> Connected Data Sources</h4>
          <p class="empty-state">No data sources configured for this equipment.</p>
        </div>
      `;
    }

    // 3. Fetch Standard Limitations
    const limitRes = await fetch(`${API_URL}/config/limitations`, { headers: getAuthHeaders() });
    let limit = null;
    if (limitRes.ok) {
      const limitations = await limitRes.json();
      const limitArray = Array.isArray(limitations) ? limitations : (limitations.data || []);
      if (Array.isArray(limitArray)) {
        limit = limitArray.find(l => l.sup_category === item.sup_category);
      }
    }

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

    // 4. Update Modal Content
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
        ${sourcesHtml}
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

window.deleteEquipment = async function (id) {
  if (!id) {
    console.error('[ERROR] Delete called with no ID');
    return;
  }

  const confirmed = await showConfirm(
    'Hapus Perlengkapan?',
    'Apakah Anda yakin ingin menghapus perlengkapan ini? Data yang terkait akan terhapus secara permanen.',
    { type: 'danger', confirmText: 'Ya, Hapus' }
  );

  if (!confirmed) return;

  try {
    console.log(`[DEBUG] Attempting to delete equipment ID: ${id}`);
    const res = await fetch(`${API_URL}/equipment/remove/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    // Check if the response is actually JSON before parsing
    const contentType = res.headers.get("content-type");
    let result = {};
    if (contentType && contentType.indexOf("application/json") !== -1) {
      result = await res.json();
    } else {
      const text = await res.text();
      console.warn('[DEBUG] Non-JSON response received:', text);
      result = { message: text || 'No detailed message' };
    }

    if (res.ok) {
      loadEquipment();
      loadStats();
      if (typeof loadEquipmentMarkers === 'function') loadEquipmentMarkers();
    } else {
      let errorMsg = result.message || 'Unknown error';
      if (res.status === 404) {
        errorMsg = 'Endpoint not found (404). Silakan hubungi administrator atau periksa URL.';
      } else if (res.status === 401 || res.status === 403) {
        errorMsg = 'Anda tidak memiliki akses untuk menghapus data ini (Unauthorized).';
      }
      showToast('Delete failed: ' + errorMsg, 'error');
      console.error('Delete error details:', result);
    }
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Terjadi kesalahan saat menghapus data: ' + err.message, 'error');
  }
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
      showToast('Login successful! Redirecting...', 'success');
      setTimeout(() => location.reload(), 1000);
    } else {
      showToast(result.message || 'Invalid credentials', 'error');
    }
  } catch (err) {
    console.error('Login error:', err);
    showToast('An error occurred during login', 'error');
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
      if (sectionId === 'configure' && typeof window.initConfigurationNav === 'function') {
        window.initConfigurationNav();
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
        'equipment-logs': 'History Logs',
        users: 'Users',
        configure: 'System Configuration'
      };
      hb.innerHTML = `<span>${labels[sectionId] || sectionId}</span>`;
    }

    if (sectionId === 'equipment-logs') {
      loadHistoryLogs();
    }

    if (sectionId === 'configure') {
      initConfigureNav();
    }
    if (sectionId === 'users') {
      loadUsers();
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
        showToast('ID Equipment tidak ditemukan! Pastikan form equipment terbuka.', 'warning');
        return;
      }

      window.showAddDataSourceForm(equipmentIdInput.value);
    });
  }

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
  });

  document.getElementById('addEquipmentBtn').addEventListener('click', () => {
    document.getElementById('equipmentForm').reset();
    // Generate ID immediately so child data sources can be added
    document.getElementById('equipmentId').value = Date.now();
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

  const configForm = document.getElementById('configForm');
  if (configForm) {
    configForm.addEventListener('submit', window.handleConfigSubmit);
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
    closeUserModal.onclick = () => document.getElementById('userModal').classList.add('hidden');
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

  // History Logs listeners
  const refreshLogsBtn = document.getElementById('refreshLogsBtn');
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', () => loadHistoryLogs());
  }

  // Filter listeners for logs
  ['logsPageSize', 'filterLogEquipment', 'filterLogSource'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => loadHistoryLogs());
  });
});

// Configure Section Logic
window.initConfigureNav = function () {
  const navList = document.querySelector('#configureSection .config-nav-list');
  if (!navList) return;

  const setActiveConfig = (configId) => {
    const configNavItems = document.querySelectorAll('#configureSection .config-nav-item');
    const configContents = document.querySelectorAll('#configureSection .config-content-item');

    configNavItems.forEach(item => {
      if (item.getAttribute('data-config') === configId) item.classList.add('active');
      else item.classList.remove('active');
    });

    configContents.forEach(content => {
      const targetId = `config${configId.charAt(0).toUpperCase() + configId.slice(1).replace(/-([a-z])/g, g => g[1].toUpperCase())}Content`;
      if (content.id === targetId) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    });

    loadConfigData(configId);
  };

  // Use event delegation on the navList
  if (!navList.dataset.hasListener) {
    navList.addEventListener('click', (e) => {
      const item = e.target.closest('.config-nav-item');
      if (item) {
        setActiveConfig(item.getAttribute('data-config'));
      }
    });
    navList.dataset.hasListener = 'true';
  }

  // Set initial state from active class
  const activeItem = document.querySelector('#configureSection .config-nav-item.active');
  if (activeItem) {
    setActiveConfig(activeItem.getAttribute('data-config'));
  }
}

window.loadConfigData = async function (tab) {
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

window.renderConfigTable = function (tab, data, tbody) {
  tbody.innerHTML = '';

  data.forEach(item => {
    const tr = document.createElement('tr');

    if (tab === 'limitation') {
      const minLimits = `min: ${item.min_alarm_limit || item.alv || '-'} / ${item.min_warning_limit || item.wlv || '-'}`;
      const maxLimits = `max: ${item.max_warning_limit || item.whv || '-'} / ${item.max_alarm_limit || item.ahv || '-'}`;
      
      tr.innerHTML = `
        <td><strong>${item.name}</strong></td>
        <td><span class="badge badge-info">${item.sup_category}</span></td>
        <td>${item.value_type || 'numeric'}</td>
        <td style="font-size: 0.85rem;">
          <div><small class="text-muted">Expected:</small> ${item.expected_value || '-'}</div>
          <div class="text-warning">${minLimits}</div>
          <div class="text-danger">${maxLimits}</div>
        </td>
        <td>
          <div class="action-buttons">
            <button class="btn-edit" onclick="editConfig('limitation', '${item.id}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn-delete" onclick="deleteConfigData('limitation', '${item.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      `;
    } else if (tab === 'authentication') {
      tr.innerHTML = `
        <td><strong>${item.name}</strong></td>
        <td><code>${item.ip_address}</code></td>
        <td>${item.equipt_id ? `ID: ${item.equipt_id}` : '<span class="text-muted">Global</span>'}</td>
        <td>
          <button class="btn-edit" onclick="editConfig('authentication', '${item.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteConfigData('authentication', '${item.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      `;
    } else if (tab === 'parsing') {
      tr.innerHTML = `
        <td><strong>${item.name}</strong></td>
        <td><span class="badge badge-secondary">${item.category}</span></td>
        <td><code>${item.files || '-'}</code></td>
        <td>
          <button class="btn-edit" onclick="editConfig('parsing', '${item.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteConfigData('parsing', '${item.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      `;
    } else if (tab === 'sup-category') {
      tr.innerHTML = `
        <td><strong>${item.category}</strong></td>
        <td>${(item.sub_categories || []).map(s => `<span class="badge badge-outline">${s}</span>`).join(' ')}</td>
        <td>
          <button class="btn-edit" onclick="editConfig('sup-category', '${item.id || item.category}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteConfigData('sup-category', '${item.id || item.category}')" title="Delete"><i class="fas fa-trash"></i></button>
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

window.showAddConfigModal = function (type) {
  const modal = document.getElementById('configModal');
  const form = document.getElementById('configForm');
  const title = document.getElementById('configModalTitle');
  const container = document.getElementById('configFieldsContainer');

  form.reset();
  const newId = typeof generateUniqueCode === 'function' ? generateUniqueCode(8) : `cfg_${Date.now()}`;
  document.getElementById('configId').value = newId;
  document.getElementById('configType').value = type;
  document.getElementById('configMode').value = 'add';

  title.innerHTML = `<i class="fas fa-plus"></i> Add New ${type.charAt(0).toUpperCase() + type.slice(1)}`;

  renderConfigFields(type, null, container);
  modal.classList.remove('hidden');
}

window.editConfig = async function (type, id) {
  try {
    const endpoint = `/api/config/${pluralMap[type] || `${type}s`}`;
    const res = await fetch(endpoint, { headers: getAuthHeaders() });
    const list = await res.json();
    const item = Array.isArray(list) ? list.find(i => i.id == id || (type === 'sup-category' && i.category == id)) : list;

    if (!item) return showToast('Item not found', 'error');

    const modal = document.getElementById('configModal');
    const title = document.getElementById('configModalTitle');
    const container = document.getElementById('configFieldsContainer');

    document.getElementById('configId').value = id;
    document.getElementById('configType').value = type;
    document.getElementById('configMode').value = 'edit';

    title.innerHTML = `<i class="fas fa-edit"></i> Edit ${type.charAt(0).toUpperCase() + type.slice(1)}`;

    renderConfigFields(type, item, container);
    modal.classList.remove('hidden');
  } catch (err) {
    showToast('Error fetching item details', 'error');
  }
}

window.renderConfigFields = function (type, item, container) {
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
      <div class="form-row-ux">
        <div class="form-group-ux">
          <label>Min. Alarm Limit</label>
          <input type="number" step="any" name="min_alarm_limit" value="${item?.min_alarm_limit || item?.alv || ''}" placeholder="Min Alarm">
        </div>
        <div class="form-group-ux">
          <label>Min. Warning Limit</label>
          <input type="number" step="any" name="min_warning_limit" value="${item?.min_warning_limit || item?.wlv || ''}" placeholder="Min Warning">
        </div>
      </div>
      <div class="form-row-ux">
        <div class="form-group-ux">
          <label>Max. Warning Limit</label>
          <input type="number" step="any" name="max_warning_limit" value="${item?.max_warning_limit || item?.whv || ''}" placeholder="Max Warning">
        </div>
        <div class="form-group-ux">
          <label>Max. Alarm Limit</label>
          <input type="number" step="any" name="max_alarm_limit" value="${item?.max_alarm_limit || item?.ahv || ''}" placeholder="Max Alarm">
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
  } else if (type === 'parsing') {
    container.innerHTML = `
      <div class="form-group-ux">
        <label>Parsing Template Name</label>
        <input type="text" name="name" value="${item?.name || ''}" required placeholder="e.g. DVOR MARU 220">
      </div>
      <div class="form-group-ux">
        <label>Category</label>
        <select name="category" required>
          <option value="Communication" ${item?.category === 'Communication' ? 'selected' : ''}>Communication</option>
          <option value="Navigation" ${item?.category === 'Navigation' ? 'selected' : ''}>Navigation</option>
          <option value="Surveillance" ${item?.category === 'Surveillance' ? 'selected' : ''}>Surveillance</option>
          <option value="Data Processing" ${item?.category === 'Data Processing' ? 'selected' : ''}>Data Processing</option>
          <option value="Support" ${item?.category === 'Support' ? 'selected' : ''}>Support</option>
        </select>
      </div>
      <div class="form-group-ux">
        <label>Parser File Path</label>
        <input type="text" name="files" value="${item?.files || ''}" required placeholder="/public/parsers/name.js">
        <small class="text-muted">Enter path relative to root directory</small>
      </div>
    `;
  }
}

window.handleConfigSubmit = async function (e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const type = formData.get('configType');
  const id = formData.get('configId');
  const mode = formData.get('configMode');
  const data = Object.fromEntries(formData.entries());

  if (type === 'sup-category') {
    data.sub_categories = data.sub_categories_raw.split(',').map(s => s.trim()).filter(s => s);
  }

  try {
    const pathType = pluralMap[type] || (type + 's');
    const endpoint = `/api/config/${pathType}`;
    const method = mode === 'edit' ? 'PUT' : 'POST';
    const url = mode === 'edit' ? `${endpoint}/${id}` : endpoint;

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
      showToast(`Error: ${err.message || 'Operation failed'}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

window.deleteConfigData = async function (type, id) {
  const confirmed = await showConfirm(
    'Hapus Konfigurasi?',
    'Are you sure you want to delete this configuration?',
    { type: 'danger', confirmText: 'Hapus' }
  );
  if (!confirmed) return;

  try {
    const pathType = pluralMap[type] || (type + 's');
    const endpoint = `/api/config/${pathType}/${id}`;
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (res.ok) {
      loadConfigData(type);
    } else {
      showToast('Delete failed', 'error');
    }
  } catch (err) {
    showToast('Delete failed', 'error');
  }
}

window.updateSubCategoryDropdown = function (category, selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const group = supCategoriesData.find(c => c.category === category);
  const options = group ? (group.sub_categories || []) : [];
  
  if (options.length === 0) {
    select.innerHTML = '<option value="">No sub-categories found</option>';
  } else {
    select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
  }
}

// Global modal closer helper
window.closeModal = function (id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

// --- USER MANAGEMENT LOGIC ---
let usersData = [];

async function loadUsers() {
  const tbody = document.getElementById('userTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading users...</td></tr>';

  try {
    const res = await fetch(`${API_URL}/users`, { headers: getAuthHeaders() });
    if (res.ok) {
      usersData = await res.json();
      renderUserTable(usersData);
    } else {
      console.error('Failed to load users');
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderUserTable(data) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(user => `
    <tr>
      <td>${user.id}</td>
      <td>${user.name || user.username}</td>
      <td>${user.username}</td>
      <td><span class="badge badge-${user.role}">${user.role}</span></td>
      <td class="actions">
        <button class="btn-edit" onclick="editUser(${user.id})" title="Edit User"><i class="fas fa-edit"></i></button>
        <button class="btn-delete" onclick="deleteUser(${user.id})" title="Delete User"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

window.addUser = function () {
  document.getElementById('userId').value = '';
  document.getElementById('userForm').reset();
  document.getElementById('userModalFormTitle').textContent = 'Add New User';
  document.getElementById('userModal').classList.remove('hidden');
};

window.editUser = async function (id) {
  const user = usersData.find(u => u.id == id);
  if (!user) return;

  document.getElementById('userId').value = user.id;
  document.getElementById('userName').value = user.name || user.username;
  document.getElementById('userUsername').value = user.username;
  document.getElementById('userRole').value = user.role;
  document.getElementById('userPassword').value = ''; // Don't show password
  document.getElementById('userPassword').required = false;

  document.getElementById('userModalFormTitle').textContent = 'Edit User';
  document.getElementById('userModal').classList.remove('hidden');
};

window.deleteUser = async function (id) {
  const confirmed = await showConfirm(
    'Hapus User?',
    'Are you sure you want to delete this user?',
    { type: 'danger', confirmText: 'Hapus' }
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_URL}/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      loadUsers();
    } else {
      showToast('Failed to delete user', 'error');
    }
  } catch (err) {
    console.error('Error deleting user:', err);
  }
};

// User Form Submit
document.addEventListener('DOMContentLoaded', () => {
  const userForm = document.getElementById('userForm');
  if (userForm) {
    userForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('userId').value;
      const data = {
        name: document.getElementById('userName').value,
        username: document.getElementById('userUsername').value,
        role: document.getElementById('userRole').value
      };

      const password = document.getElementById('userPassword').value;
      if (password) data.password = password;

      try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/users/${id}` : `${API_URL}/users`;

        const res = await fetch(url, {
          method,
          headers: getAuthHeaders(),
          body: JSON.stringify(data)
        });

        if (res.ok) {
          showToast('User saved successfully', 'success');
          document.getElementById('userModal').classList.add('hidden');
          loadUsers();
        } else {
          const err = await res.json();
          showToast('Error: ' + (err.message || 'Failed to save user'), 'error');
        }
      } catch (err) {
        console.error('Error saving user:', err);
      }
    });
  }

  // User Modal Close
  const closeUserModal = document.getElementById('closeUserModal');
  if (closeUserModal) {
    closeUserModal.onclick = () => document.getElementById('userModal').classList.add('hidden');
  }

  // Global user add button listener
  const addUserBtn = document.getElementById('addUserBtn');
  if (addUserBtn) addUserBtn.onclick = window.addUser;
});

// --- HISTORY LOGS LOGIC ---
async function loadHistoryLogs() {
  const tbody = document.getElementById('equipmentLogsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading context logs...</td></tr>';

  try {
    const page = 1; // Default for now
    const limit = document.getElementById('logsPageSize')?.value || 50;
    const search = document.getElementById('filterLogEquipment')?.value || '';
    const source = document.getElementById('filterLogSource')?.value || '';

    // We combine search and source for the backend query for now
    const querySearch = search || source;

    const url = `/api/history-logs?page=${page}&limit=${limit}&search=${encodeURIComponent(querySearch)}`;
    const res = await fetch(url, { headers: getAuthHeaders() });

    if (res.ok) {
      const result = await res.json();
      renderHistoryLogsTable(result.data || []);
    } else {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state text-danger">Failed to load logs</td></tr>';
    }
  } catch (err) {
    console.error('Error loading history logs:', err);
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state text-danger">Error: ' + err.message + '</td></tr>';
  }
}

function renderHistoryLogsTable(data) {
  const tbody = document.getElementById('equipmentLogsTableBody');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No logs found in the selected period</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(log => {
    const date = new Date(log.timestamp).toLocaleString('id-ID');
    const dataPreview = log.data ? JSON.stringify(log.data).substring(0, 80) + '...' : '-';

    return `
        <tr>
          <td style="font-family: monospace; white-space: nowrap;">${date}</td>
          <td><strong>${log.equipmentName || 'Unknown'}</strong></td>
          <td><span class="badge badge-outline">${log.ip || 'N/A'}</span></td>
          <td class="text-muted" style="font-size: 0.85rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${dataPreview}</td>
          <td>
            <button class="btn-view" onclick='viewLogDetail(${JSON.stringify(log).replace(/'/g, "&apos;")})' title="View Detail"><i class="fas fa-search-plus"></i></button>
          </td>
        </tr>
      `;
  }).join('');
}

window.viewLogDetail = function (log) {
  alert(JSON.stringify(log, null, 2));
  // In a real implementation, this could open a modal
};

window.loadHistoryLogs = loadHistoryLogs;

