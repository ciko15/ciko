/**
 * Branch/Airport Monitoring Module
 * TOC - Remote Status Facilities
 * 
 * Features:
 * - Search & Branch List Integration: Shows all branches automatically
 * - Selecting on the right side a branch shows equipment
 * - Filtering by category works dynamically
 * - Clickable equipment cards with detail panel
 */
var liveDataTimer = window.liveDataTimer;

const cabangModule = (function() {
  // State
  let airportsData = [];
  let equipmentData = [];
  let currentAirportFilter = '';
  let currentCategoryFilter = '';
  let currentStatusFilter = '';
  let searchQuery = '';
  let autoRefreshInterval = null;
  
  // DOM Elements
  const cabangGrid = document.getElementById('cabangGrid');
  const searchCabang = document.getElementById('searchCabang');
  const filterAirport = document.getElementById('filterCabangAirport');
  const filterCategory = document.getElementById('filterCabangCategory');
  const filterStatus = document.getElementById('filterCabangStatus');
  const refreshBtn = document.getElementById('refreshCabangBtn');
  
  // Initialize
  function init() {
    bindEvents();
    loadAirports();
    // Load all equipment initially
    loadEquipment();
    startAutoRefresh();
  }
  
  function bindEvents() {
    if (searchCabang) {
      searchCabang.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderCabangGrid();
      });
    }
    
    if (filterAirport) {
      filterAirport.addEventListener('change', (e) => {
        currentAirportFilter = e.target.value;
        renderCabangGrid();
      });
    }
    
    if (filterCategory) {
      filterCategory.addEventListener('change', (e) => {
        currentCategoryFilter = e.target.value;
        renderCabangGrid();
      });
    }
    
    if (filterStatus) {
      filterStatus.addEventListener('change', (e) => {
        currentStatusFilter = e.target.value;
        renderCabangGrid();
      });
    }
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadEquipment();
      });
    }
  }
  
  // Auto-refresh every 20 seconds
  function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
      // Only refresh if the section is visible
      const section = document.getElementById('cabangSection');
      if (section && !section.classList.contains('hidden')) {
        loadEquipment(true); // silent refresh
      }
    }, 20000);
  }
  
  async function loadAirports() {
    try {
      const response = await fetch('/api/airports');
      airportsData = await response.json();
      
      // Populate airport dropdown
      if (filterAirport) {
        // Keep "All Airports"
        filterAirport.innerHTML = '<option value="">All Airports</option>';
        airportsData.forEach(airport => {
          const option = document.createElement('option');
          option.value = airport.id;
          option.textContent = airport.name;
          filterAirport.appendChild(option);
        });
      }
    } catch (error) {
      console.error('[Cabang] Error loading airports:', error);
    }
  }
  
  async function loadEquipment(silent = false) {
    if (!silent && cabangGrid) {
      cabangGrid.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> Refreshing data...</div>';
    }
    
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      // Fetch all equipment with includeData=true
      const response = await fetch('/api/equipment?limit=1000&isActive=true&includeData=true', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const result = await response.json();
      equipmentData = result.data || result;
      
      renderCabangGrid();
    } catch (error) {
      console.error('[Cabang] Error loading equipment:', error);
      if (cabangGrid) {
        cabangGrid.innerHTML = `<div class="empty-state" style="color: var(--accent-danger);"><i class="fas fa-exclamation-triangle"></i> Error loading data</div>`;
      }
    }
  }
  
  function renderCabangGrid() {
    if (!cabangGrid) return;
    
    let filtered = equipmentData;
    
    // Apply Airport Filter - Robust check for both airportId and branchId
    if (currentAirportFilter) {
      const filterId = String(currentAirportFilter);
      filtered = filtered.filter(e => 
        String(e.airportId) === filterId || 
        String(e.branchId) === filterId ||
        (e.airport_id && String(e.airport_id) === filterId) ||
        (e.branch_id && String(e.branch_id) === filterId)
      );
    }
    
    // Apply Category Filter
    if (currentCategoryFilter) {
      filtered = filtered.filter(e => e.category === currentCategoryFilter);
    }
    
    // Apply Status Filter
    if (currentStatusFilter) {
      filtered = filtered.filter(e => {
        const normalized = window.normalizeStatus ? window.normalizeStatus(e.status) : e.status;
        return normalized === currentStatusFilter;
      });
    }
    
    // Apply Search
    if (searchQuery) {
      filtered = filtered.filter(e => 
        e.name.toLowerCase().includes(searchQuery) || 
        (e.airportName && e.airportName.toLowerCase().includes(searchQuery)) ||
        (e.code && e.code.toLowerCase().includes(searchQuery))
      );
    }
    
    if (filtered.length === 0) {
      cabangGrid.innerHTML = '<div class="empty-state">No equipment found matching the filters.</div>';
      return;
    }
    
    cabangGrid.innerHTML = filtered.map(item => {
      const status = (item.status || 'Offline').toLowerCase();
      const statusClass = ['normal', 'alarm', 'warning'].includes(status) ? status : 'offline';
      
      // Action Data
      let dataHtml = '';
      
      if (item.lastData) {
        // Optimized for grouped data: item.lastData = { "TX 1": { param1: val1, ... }, "TX 2": { ... } }
        const sources = Object.keys(item.lastData);
        
        if (sources.length > 0) {
          dataHtml = `<div class="card-sources-container">
            ${sources.map(sourceName => {
              const sourceData = item.lastData[sourceName];
              const dataKeys = Object.keys(sourceData).filter(k => !k.startsWith('_') && k !== 'error' && k !== 'cached').slice(0, 4);
              const srcStatus = sourceData._status || 'Normal';
              const srcTime = sourceData._logged_at ? new Date(sourceData._logged_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
              
              const statusClass = srcStatus.toLowerCase();
              
              return `
                <div class="source-group ${statusClass}">
                  <div class="source-header">
                    <div class="source-header-main">
                      <i class="fas fa-microchip"></i>
                      <span class="source-name-text">${sourceName}</span>
                      <span class="source-status-pill ${statusClass}">${srcStatus}</span>
                    </div>
                    <div class="source-header-time">${srcTime}</div>
                  </div>
                  <div class="card-data-grid">
                    ${dataKeys.length > 0 ? dataKeys.map(key => {
                      const valObj = sourceData[key];
                      const isObj = valObj !== null && typeof valObj === 'object';
                      const label = isObj && valObj.label ? valObj.label : key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                      const val = isObj ? valObj.value : valObj;
                      const unit = isObj && valObj.unit ? valObj.unit : '';
                      return `<div class="data-point">
                        <span class="data-label">${label}</span>
                        <span class="data-value">${val}${unit}</span>
                      </div>`;
                    }).join('') : `
                      <div class="data-point empty">
                        <span class="data-label">Status</span>
                        <span class="data-value">${srcStatus}</span>
                      </div>
                    `}
                  </div>
                </div>
              `;
            }).join('')}
          </div>`;
        } else {
          dataHtml = `
            <div class="empty-data waiting">
              <i class="fas fa-satellite-dish fa-spin"></i>
              <span>Waiting for data collection...</span>
            </div>`;
        }
      } else {
        dataHtml = `
          <div class="empty-data waiting">
            <i class="fas fa-satellite-dish fa-spin"></i>
            <span>Waiting for data collection...</span>
          </div>`;
      }
      
      const lastUpdate = item.lastUpdate ? new Date(item.lastUpdate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never';
      const location = item.airportName || item.branchName || 'Unknown Location';
      const showLocation = location !== 'Unknown Location';
      
      return `
        <div class="cabang-card ${statusClass}" data-id="${item.id}">
          <div class="card-top">
            <div class="card-info">
              <h3>${item.name}</h3>
              <span class="code">${item.code || ''}</span>
            </div>
            <div class="status-badge ${statusClass}">${status}</div>
          </div>
          
          ${showLocation ? `
          <div class="card-location">
            <i class="fas fa-map-marker-alt"></i>
            <span>${location}</span>
          </div>` : ''}
          
          ${dataHtml}
          
          <div class="card-footer">
            <span class="category-tag">${item.category}</span>
            <span class="last-update">Updated: ${lastUpdate}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  // Public API to support Map Dashboard interaction
  function selectAirport(airportId) {
    if (filterAirport) {
      filterAirport.value = airportId;
      currentAirportFilter = airportId;
      renderCabangGrid();
    }
  }
  
  function setFilter(category) {
    if (filterCategory) {
      filterCategory.value = category;
      currentCategoryFilter = category;
      renderCabangGrid();
    }
  }
  
  return {
    init: init,
    loadAirports: loadAirports,
    loadEquipment: loadEquipment,
    selectAirport: selectAirport,
    setFilters: function(category, status) {
      if (category !== undefined) {
        currentCategoryFilter = category;
        if (filterCategory) filterCategory.value = category;
      }
      if (status !== undefined) {
        // Use global normalization if available, otherwise fallback to local normalization
        const normalizedStatus = typeof window.normalizeStatus === 'function' 
          ? window.normalizeStatus(status) 
          : status;
          
        currentStatusFilter = normalizedStatus;
        if (filterStatus) filterStatus.value = normalizedStatus;
      }
      // Reset search if we are coming from dashboard for a specific view
      if (category !== undefined || (status !== undefined && status !== '')) {
        searchQuery = '';
        if (searchCabang) searchCabang.value = '';
        currentAirportFilter = '';
        if (filterAirport) filterAirport.value = '';
      }
      renderCabangGrid();
    },

    refresh: () => loadEquipment()
  };
})();

// Global reference for external access
window.cabangModule = cabangModule;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  cabangModule.init();
});