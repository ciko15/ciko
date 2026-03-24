/**
 * Branch/Airport Monitoring Module
 * TOC - Remote Status Facilities
 * 
 * Features:
 * - Search & Branch List Integration: Shows all branches automatically
 * - Selecting on the right side a branch shows equipment
 * - Filtering by category works dynamically
 * - Clickable equipment cards with detail panel
 * - Auto-refresh every 15 seconds
 */

const cabangModule = (function() {
  // State
  let airportsData = [];
  let equipmentData = [];
  let currentAirportFilter = '';
  let currentCategoryFilter = '';
  let searchQuery = '';
  let autoRefreshInterval = null;
  
  // DOM Elements
  const cabangTableBody = document.getElementById('cabangTableBody');
  const searchCabang = document.getElementById('searchCabang');
  const filterAirport = document.getElementById('filterCabangAirport');
  const filterCategory = document.getElementById('filterCabangCategory');
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
        renderCabangTable();
      });
    }
    
    if (filterAirport) {
      filterAirport.addEventListener('change', (e) => {
        currentAirportFilter = e.target.value;
        renderCabangTable();
      });
    }
    
    if (filterCategory) {
      filterCategory.addEventListener('change', (e) => {
        currentCategoryFilter = e.target.value;
        renderCabangTable();
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
    if (!silent && cabangTableBody) {
      cabangTableBody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-spinner fa-spin"></i> Refreshing data...</td></tr>';
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
      
      renderCabangTable();
    } catch (error) {
      console.error('[Cabang] Error loading equipment:', error);
      if (cabangTableBody) {
        cabangTableBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color: var(--accent-danger);"><i class="fas fa-exclamation-triangle"></i> Error loading data</td></tr>`;
      }
    }
  }
  
  function renderCabangTable() {
    if (!cabangTableBody) return;
    
    let filtered = equipmentData;
    
    // Apply Airport Filter
    if (currentAirportFilter) {
      filtered = filtered.filter(e => String(e.airportId) === String(currentAirportFilter) || String(e.branchId) === String(currentAirportFilter));
    }
    
    // Apply Category Filter
    if (currentCategoryFilter) {
      filtered = filtered.filter(e => e.category === currentCategoryFilter);
    }
    
    // Apply Search
    if (searchQuery) {
      filtered = filtered.filter(e => 
        e.name.toLowerCase().includes(searchQuery) || 
        e.airportName.toLowerCase().includes(searchQuery) ||
        (e.code && e.code.toLowerCase().includes(searchQuery))
      );
    }
    
    if (filtered.length === 0) {
      cabangTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No equipment found matching the filters.</td></tr>';
      return;
    }
    
    cabangTableBody.innerHTML = filtered.map(item => {
      const statusClass = item.status.toLowerCase();
      const isActive = item.isActive !== false;
      const isActiveHtml = `<span style="color: ${isActive ? '#10b981' : '#ef4444'}; font-weight: 600;">${isActive ? 'Active' : 'Inactive'}</span>`;
      
      // Parse Realtime Data (Action Data)
      let dataHtml = '<div class="action-data-summary">-</div>';
      if (item.lastData) {
        const dataKeys = Object.keys(item.lastData).filter(k => k !== 'error' && k !== 'cached').slice(0, 4);
        if (dataKeys.length > 0) {
          dataHtml = `<div class="action-data-grid">
            ${dataKeys.map(key => {
              const valObj = item.lastData[key];
              const isObj = valObj !== null && typeof valObj === 'object';
              const label = isObj && valObj.label ? valObj.label : key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              const val = isObj ? valObj.value : valObj;
              const unit = isObj && valObj.unit ? valObj.unit : '';
              return `<div class="data-item"><span class="data-label">${label}:</span> <span class="data-value">${val}${unit}</span></div>`;
            }).join('')}
          </div>`;
        }
      }
      
      const lastUpdate = item.lastUpdate ? new Date(item.lastUpdate).toLocaleString('id-ID') : '-';
      
      return `
        <tr data-id="${item.id}">
          <td>${isActiveHtml}</td>
          <td>
            <div style="font-weight: 600;">${item.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${item.code || ''}</div>
          </td>
          <td><span class="category-badge ${item.category.toLowerCase().replace(' ', '-')}">${item.category}</span></td>
          <td>${item.airportName || '-'}</td>
          <td>${dataHtml}</td>
          <td><div style="font-size: 0.85rem;">${lastUpdate}</div></td>
        </tr>
      `;
    }).join('');
  }
  
  // Public API to support Map Dashboard interaction
  function selectAirport(airportId) {
    if (filterAirport) {
      filterAirport.value = airportId;
      currentAirportFilter = airportId;
      renderCabangTable();
    }
  }
  
  function setFilter(category) {
    if (filterCategory) {
      filterCategory.value = category;
      currentCategoryFilter = category;
      renderCabangTable();
    }
  }
  
  return {
    init,
    loadAirports,
    loadEquipment,
    selectAirport,
    setFilter,
    refresh: () => loadEquipment()
  };
})();

// Global reference for external access
window.cabangModule = cabangModule;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  cabangModule.init();
});