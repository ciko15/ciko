/**
 * Surveillance Module
 * Frontend integration for RADAR (ASTERIX) and ADS-B surveillance
 */
var API_URL = window.API_URL || '/api';
var liveDataTimer = window.liveDataTimer;

const surveillanceModule = (function() {
  'use strict';
  
  let surveillanceData = [];
  let radarTargets = [];
  let adsbAircraft = [];
  let currentFilter = 'all';
  
  // DOM Elements
  const elements = {
    surveillanceSection: null,
    surveillanceTableBody: null,
    radarTargetsTable: null,
    adsbAircraftTable: null,
    filterType: null,
    refreshBtn: null,
    addStationBtn: null
  };
  
  /**
   * Initialize the surveillance module
   */
  function init() {
    console.log('[Surveillance] Initializing module...');
    
    // Get DOM elements
    elements.surveillanceSection = document.getElementById('surveillanceSection');
    elements.surveillanceTableBody = document.getElementById('surveillanceTableBody');
    elements.radarTargetsTable = document.getElementById('radarTargetsTable');
    elements.adsbAircraftTable = document.getElementById('adsbAircraftTable');
    elements.filterType = document.getElementById('filterSurveillanceType');
    elements.refreshBtn = document.getElementById('refreshSurveillanceBtn');
    elements.addStationBtn = document.getElementById('addSurveillanceStationBtn');
    
    // Add event listeners
    if (elements.refreshBtn) {
      elements.refreshBtn.addEventListener('click', loadSurveillanceData);
    }
    
    if (elements.filterType) {
      elements.filterType.addEventListener('change', handleFilterChange);
    }
    
    console.log('[Surveillance] Module initialized');
  }
  
  /**
   * Load surveillance stations data
   */
  async function loadSurveillanceData() {
    if (!authToken) {
      console.log('[Surveillance] Not authenticated');
      return;
    }
    
    try {
      // Load stations
      const stationsRes = await fetch(`${API_URL}/surveillance/stations`, {
        headers: getAuthHeaders()
      });
      surveillanceData = await stationsRes.json();
      
      // Load status
      const statusRes = await fetch(`${API_URL}/surveillance/status`, {
        headers: getAuthHeaders()
      });
      const status = await statusRes.json();
      
      // Update radar targets count
      radarTargets = status.radar?.totalTargets || 0;
      
      // Update ADS-B aircraft count
      adsbAircraft = status.adsb?.totalAircraft || 0;
      
      renderSurveillanceTable();
      
      console.log('[Surveillance] Data loaded:', surveillanceData.length, 'stations');
    } catch (error) {
      console.error('[Surveillance] Error loading data:', error);
    }
  }
  
  /**
   * Render surveillance stations table
   */
  function renderSurveillanceTable() {
    if (!elements.surveillanceTableBody) return;
    
    let filtered = surveillanceData;
    if (currentFilter !== 'all') {
      filtered = surveillanceData.filter(s => s.type === currentFilter);
    }
    
    if (filtered.length === 0) {
      elements.surveillanceTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">No surveillance stations found</td>
        </tr>
      `;
      return;
    }
    
    elements.surveillanceTableBody.innerHTML = filtered.map(station => {
      const typeIcon = station.type === 'radar' ? 'fa-radar' : 'fa-plane';
      const typeClass = station.type === 'radar' ? 'radar-badge' : 'adsb-badge';
      const statusClass = station.isActive ? 'status-normal' : 'status-disconnect';
      const statusLabel = station.isActive ? 'Active' : 'Inactive';
      
      return `
        <tr>
          <td>${station.id}</td>
          <td>
            <strong>${station.name}</strong>
            ${station.airportName ? `<br><small style="color: var(--text-muted);">${station.airportName}</small>` : ''}
          </td>
          <td><span class="category-badge ${typeClass}"><i class="fas ${typeIcon}"></i> ${station.type.toUpperCase()}</span></td>
          <td><code>${station.ip}:${station.port}</code></td>
          <td>${station.lat ? station.lat.toFixed(4) : '-'}, ${station.lng ? station.lng.toFixed(4) : '-'}</td>
          <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
          <td>
            <div class="action-buttons">
              <button class="btn-view" onclick="surveillanceModule.viewStation(${station.id})" title="View Details">
                <i class="fas fa-eye"></i>
              </button>
              ${currentUser && (currentUser.role === 'admin' || currentUser.role === 'user_pusat') ? `
              <button class="btn-edit" onclick="surveillanceModule.editStation(${station.id})" title="Edit">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn-delete" onclick="surveillanceModule.deleteStation(${station.id})" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
  
  /**
   * Handle filter change
   */
  function handleFilterChange(e) {
    currentFilter = e.target.value;
    renderSurveillanceTable();
  }
  
/**
   * View station details
   */
  async function viewStation(id) {
    const station = surveillanceData.find(s => s.id === id);
    if (!station) return;
    
    const content = document.getElementById('surveillanceDetailContent');
    if (!content) return;
    
    // Get radar targets or ADS-B data for this station
    let targetsData = [];
    if (station.type === 'radar') {
      try {
        const res = await fetch(`${API_URL}/surveillance/radar/${id}?limit=50`, {
          headers: getAuthHeaders()
        });
        targetsData = await res.json();
      } catch (e) {
        targetsData = [];
      }
    }
    
    const config = station.config ? JSON.parse(station.config) : {};
    
    // Determine if we can fetch ASTERIX data
    const canFetchAsterix = station.type === 'radar';
    
    content.innerHTML = `
      <div class="surveillance-detail-grid">
        <div class="detail-item">
          <label>ID</label>
          <span>${station.id}</span>
        </div>
        <div class="detail-item">
          <label>Name</label>
          <span>${station.name}</span>
        </div>
        <div class="detail-item">
          <label>Type</label>
          <span class="category-badge ${station.type === 'radar' ? 'radar-badge' : 'adsb-badge'}">${station.type.toUpperCase()}</span>
        </div>
        <div class="detail-item">
          <label>IP Address</label>
          <span><code>${station.ip}</code></span>
        </div>
        <div class="detail-item">
          <label>Port</label>
          <span>${station.port}</span>
        </div>
        <div class="detail-item">
          <label>Multicast IP</label>
          <span>${station.multicast_ip || '-'}</span>
        </div>
        <div class="detail-item">
          <label>Coordinates</label>
          <span>${station.lat || '-'}, ${station.lng || '-'}</span>
        </div>
        <div class="detail-item">
          <label>Airport</label>
          <span>${station.airportName || 'Not assigned'}</span>
        </div>
        <div class="detail-item">
          <label>Status</label>
          <span class="status-badge ${station.isActive ? 'status-normal' : 'status-disconnect'}">${station.isActive ? 'Active' : 'Inactive'}</span>
        </div>
        ${canFetchAsterix ? `
        <div class="detail-item" style="grid-column: 1 / -1; margin-top: 15px;">
          <button onclick="surveillanceModule.fetchAsterixData(${station.id})" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
            <i class="fas fa-satellite-dish"></i> Fetch ASTERIX Data
          </button>
        </div>
        ` : ''}
        ${station.type === 'radar' && targetsData.length > 0 ? `
        <div class="detail-item" style="grid-column: 1 / -1;">
          <label>Recent Targets (${targetsData.length})</label>
          <div style="max-height: 200px; overflow-y: auto; margin-top: 10px;">
            <table style="width: 100%; font-size: 0.85rem;">
              <thead>
                <tr>
                  <th>Target #</th>
                  <th>Mode 3/A</th>
                  <th>Flight Level</th>
                  <th>Position</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                ${targetsData.slice(0, 10).map(t => `
                  <tr>
                    <td>${t.target_number || '-'}</td>
                    <td><code>${t.mode3_a || '-'}</code></td>
                    <td>${t.flight_level || '-'} ft</td>
                    <td>${t.latitude ? t.latitude.toFixed(4) : '-'}, ${t.longitude ? t.longitude.toFixed(4) : '-'}</td>
                    <td>${t.logged_at ? new Date(t.logged_at).toLocaleTimeString() : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}
        ${Object.keys(config).length > 0 ? `
        <div class="detail-item" style="grid-column: 1 / -1;">
          <label>Configuration</label>
          <pre style="background: var(--bg-secondary); padding: 10px; border-radius: 6px; font-size: 0.8rem; margin-top: 5px;">${JSON.stringify(config, null, 2)}</pre>
        </div>
        ` : ''}
      </div>
    `;
    
    document.getElementById('surveillanceDetailModal')?.classList.remove('hidden');
  }
  
  /**
   * Fetch ASTERIX data for a radar station
   */
  async function fetchAsterixData(stationId) {
    const content = document.getElementById('surveillanceDetailContent');
    if (!content) return;
    
    // Show loading state
    const loadingHtml = `
      <div style="text-align: center; padding: 40px;">
        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-primary);"></i>
        <p style="margin-top: 15px;">Fetching ASTERIX data...</p>
      </div>
    `;
    content.innerHTML = loadingHtml;
    
    try {
      const response = await fetch(`${API_URL}/surveillance/fetch-asterix`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stationId: stationId })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch ASTERIX data');
      }
      
      // Display the ASTERIX data
      const targets = result.targets || [];
      const station = result.station;
      
      let targetsHtml = '';
      if (targets.length > 0) {
        targetsHtml = `
          <div style="margin-top: 20px;">
            <h4 style="margin-bottom: 10px;">Targets (${targets.length})</h4>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
              <table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
                <thead style="background: var(--bg-secondary); position: sticky; top: 0;">
                  <tr>
                    <th style="padding: 10px; text-align: left;">Target #</th>
                    <th style="padding: 10px; text-align: left;">Mode 3/A</th>
                    <th style="padding: 10px; text-align: left;">Flight Level</th>
                    <th style="padding: 10px; text-align: left;">Position</th>
                    <th style="padding: 10px; text-align: left;">Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${targets.slice(0, 50).map(t => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 8px;">${t.target_number || '-'}</td>
                      <td style="padding: 8px;"><code>${t.mode3_a || '-'}</code></td>
                      <td style="padding: 8px;">${t.flight_level || '-'} ft</td>
                      <td style="padding: 8px;">${t.latitude ? t.latitude.toFixed(4) : '-'}, ${t.longitude ? t.longitude.toFixed(4) : '-'}</td>
                      <td style="padding: 8px;">${t.logged_at ? new Date(t.logged_at).toLocaleTimeString() : '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      } else {
        targetsHtml = `
          <div style="margin-top: 20px; padding: 20px; background: var(--bg-secondary); border-radius: 8px; text-align: center;">
            <i class="fas fa-info-circle" style="color: var(--text-muted);"></i>
            <p style="color: var(--text-muted); margin-top: 10px;">No targets received from this radar station</p>
          </div>
        `;
      }
      
      content.innerHTML = `
        <div class="surveillance-detail-grid">
          <div class="detail-item">
            <label>Station</label>
            <span>${station?.name || 'Unknown'}</span>
          </div>
          <div class="detail-item">
            <label>Type</label>
            <span class="category-badge radar-badge">RADAR</span>
          </div>
          <div class="detail-item">
            <label>Receiver Status</label>
            <span class="status-badge ${result.receiverStatus === 'connected' ? 'status-normal' : 'status-disconnect'}">
              ${result.receiverStatus || 'unknown'}
            </span>
          </div>
          <div class="detail-item">
            <label>Timestamp</label>
            <span>${result.timestamp ? new Date(result.timestamp).toLocaleString() : '-'}</span>
          </div>
          <div class="detail-item">
            <label>Total Targets</label>
            <span style="font-size: 1.2rem; font-weight: bold;">${targets.length}</span>
          </div>
          ${targetsHtml}
          <div style="grid-column: 1 / -1; margin-top: 20px; text-align: center;">
            <button onclick="surveillanceModule.viewStation(${stationId})" style="background: var(--accent-primary); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">
              <i class="fas fa-arrow-left"></i> Back to Station Details
            </button>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('[Surveillance] Error fetching ASTERIX data:', error);
      content.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px;">
          <h4 style="color: #ef4444; margin-bottom: 10px;"><i class="fas fa-exclamation-triangle"></i> Error</h4>
          <p style="color: var(--text-secondary);">${error.message}</p>
          <div style="margin-top: 20px; text-align: center;">
            <button onclick="surveillanceModule.viewStation(${stationId})" style="background: var(--accent-primary); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">
              <i class="fas fa-arrow-left"></i> Back to Station Details
            </button>
          </div>
        </div>
      `;
    }
  }
  
  /**
   * Edit station
   */
  function editStation(id) {
    const station = surveillanceData.find(s => s.id === id);
    if (!station) return;
    
    // Populate edit form
    document.getElementById('surveillanceStationId').value = station.id;
    document.getElementById('surveillanceStationName').value = station.name;
    document.getElementById('surveillanceStationType').value = station.type;
    document.getElementById('surveillanceStationIP').value = station.ip;
    document.getElementById('surveillanceStationPort').value = station.port;
    document.getElementById('surveillanceStationMulticast').value = station.multicast_ip || '';
    document.getElementById('surveillanceStationLat').value = station.lat || '';
    document.getElementById('surveillanceStationLng').value = station.lng || '';
    document.getElementById('surveillanceStationAirport').value = station.airportId || '';
    document.getElementById('surveillanceStationActive').checked = station.isActive;
    
    document.getElementById('surveillanceFormTitle').textContent = 'Edit Surveillance Station';
    document.getElementById('surveillanceStationModal')?.classList.remove('hidden');
  }
  
  /**
   * Delete station
   */
  async function deleteStation(id) {
    if (!confirm('Are you sure you want to delete this surveillance station?')) return;
    
    try {
      const response = await fetch(`${API_URL}/surveillance/stations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        loadSurveillanceData();
      } else {
        const data = await response.json();
        alert(data.message || 'Error deleting station');
      }
    } catch (error) {
      console.error('[Surveillance] Error deleting station:', error);
      alert('Error deleting station');
    }
  }
  
  /**
   * Handle form submit
   */
  async function handleFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('surveillanceStationId').value;
    const data = {
      name: document.getElementById('surveillanceStationName').value,
      type: document.getElementById('surveillanceStationType').value,
      ip: document.getElementById('surveillanceStationIP').value,
      port: parseInt(document.getElementById('surveillanceStationPort').value),
      multicastIp: document.getElementById('surveillanceStationMulticast').value || null,
      lat: document.getElementById('surveillanceStationLat').value ? parseFloat(document.getElementById('surveillanceStationLat').value) : null,
      lng: document.getElementById('surveillanceStationLng').value ? parseFloat(document.getElementById('surveillanceStationLng').value) : null,
      airportId: document.getElementById('surveillanceStationAirport').value ? parseInt(document.getElementById('surveillanceStationAirport').value) : null,
      isActive: document.getElementById('surveillanceStationActive').checked
    };
    
    try {
      const method = id ? 'PUT' : 'POST';
      const url = id ? `${API_URL}/surveillance/stations/${id}` : `${API_URL}/surveillance/stations`;
      
      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        document.getElementById('surveillanceStationModal')?.classList.add('hidden');
        resetForm();
        loadSurveillanceData();
      } else {
        const result = await response.json();
        alert(result.message || 'Error saving station');
      }
    } catch (error) {
      console.error('[Surveillance] Error saving station:', error);
      alert('Error saving station');
    }
  }
  
  /**
   * Reset form
   */
  function resetForm() {
    document.getElementById('surveillanceStationId').value = '';
    document.getElementById('surveillanceStationName').value = '';
    document.getElementById('surveillanceStationType').value = 'radar';
    document.getElementById('surveillanceStationIP').value = '';
    document.getElementById('surveillanceStationPort').value = '';
    document.getElementById('surveillanceStationMulticast').value = '';
    document.getElementById('surveillanceStationLat').value = '';
    document.getElementById('surveillanceStationLng').value = '';
    document.getElementById('surveillanceStationAirport').value = '';
    document.getElementById('surveillanceStationActive').checked = true;
    document.getElementById('surveillanceFormTitle').textContent = 'Add Surveillance Station';
  }
  
  /**
   * Open add modal
   */
  function openAddModal() {
    resetForm();
    document.getElementById('surveillanceStationModal')?.classList.remove('hidden');
  }
  
  // Public API
  return {
    init,
    loadSurveillanceData,
    viewStation,
    editStation,
    deleteStation,
    handleFormSubmit,
    openAddModal,
    resetForm,
    fetchAsterixData
  };
})();

// Make available globally
window.surveillanceModule = surveillanceModule;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  surveillanceModule.init();
});

