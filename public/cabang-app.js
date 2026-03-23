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
  let filteredAirports = [];
  let equipmentData = [];
  let selectedAirport = null;
  let currentFilter = 'all';
  let searchQuery = '';
  let autoRefreshInterval = null;
  
  // DOM Elements
  const cabangSection = document.getElementById('cabangSection');
  const branchListContainer = document.getElementById('branchListContainer');
  const equipmentCardsContainer = document.getElementById('equipmentCardsContainer');
  const searchLocations = document.getElementById('searchLocations');
  
  // Detail Panel Elements
  const detailPanel = document.getElementById('equipmentDetailPanel');
  const detailPanelOverlay = document.getElementById('detailPanelOverlay');
  const detailPanelBody = document.getElementById('detailPanelBody');
  const closeDetailPanelBtn = document.getElementById('closeDetailPanel');
  
  // Filter buttons
  const filterButtons = document.querySelectorAll('.monitoring-filters .filter-btn');

  // Initialize
  function init() {
    bindEvents();
    loadAirports();
    startAutoRefresh();
  }
  
  function bindEvents() {
    // Search input
    if (searchLocations) {
      searchLocations.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderBranchList();
      });
    }
    
    // Filter buttons
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderEquipmentCards();
      });
    });
    
    // Detail panel close events
    if (closeDetailPanelBtn) {
      closeDetailPanelBtn.addEventListener('click', closeDetailPanel);
    }
    if (detailPanelOverlay) {
      detailPanelOverlay.addEventListener('click', closeDetailPanel);
    }
  }
  
  // Auto-refresh functionality - refresh every 15 seconds
  function startAutoRefresh() {
    // Clear any existing interval
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
    }
    
    // Set new interval - 15 seconds
    autoRefreshInterval = setInterval(() => {
      console.log('[TOC] Auto-refreshing equipment data...');
      if (selectedAirport) {
        loadEquipment(selectedAirport.id);
      }
    }, 15000);
    
    console.log('[TOC] Auto-refresh started (15 seconds interval)');
  }
  
  // Stop auto-refresh
  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
      console.log('[TOC] Auto-refresh stopped');
    }
  }
  
  // Open equipment detail panel
  async function openEquipmentDetail(equipmentId) {
    const equipment = equipmentData.find(e => e.id === equipmentId);
    if (!equipment) return;
    
    // Show panel with loading state
    if (detailPanel) {
      detailPanel.classList.add('open');
    }
    if (detailPanelOverlay) {
      detailPanelOverlay.classList.add('open');
    }
    
    if (detailPanelBody) {
      detailPanelBody.innerHTML = `
        <div class="detail-panel-loading">
          <i class="fas fa-spinner"></i>
          <p>Loading equipment details...</p>
        </div>
      `;
    }
    
    // Fetch equipment details including logs using public endpoints (no auth required)
    try {
      // Fetch latest log for this equipment using public endpoint
      const logsResponse = await fetch(`/api/public/equipment/${equipmentId}/logs?limit=5`);
      const logsData = logsResponse.ok ? await logsResponse.json() : { data: [] };
      const logs = logsData.data || [];
      
      // Render equipment details
      renderEquipmentDetail(equipment, logs);
    } catch (error) {
      console.error('Error loading equipment details:', error);
      // Still render the equipment info even if logs fail
      renderEquipmentDetail(equipment, []);
    }
  }
  
  // Render equipment detail panel content
  function renderEquipmentDetail(equipment, logs) {
    if (!detailPanelBody) return;
    
    const status = equipment.status || 'Normal';
    const category = equipment.category || 'Support';
    const lastUpdate = equipment.lastUpdate || equipment.updated_at || new Date().toISOString();
    const createdAt = equipment.created_at || '-';
    
    // Get IP address from snmp_config if available
    let ipAddress = '-';
    let monitoringMethod = 'Manual';
    if (equipment.snmp_config) {
      const config = typeof equipment.snmp_config === 'string' ? JSON.parse(equipment.snmp_config) : equipment.snmp_config;
      ipAddress = config.ip || config.host || '-';
      monitoringMethod = config.type || 'SNMP';
    }
    
    // Get airport name
    const airport = airportsData.find(a => a.id === equipment.airport_id);
    const airportName = airport ? airport.name : '-';
    
    // Get latest log message
    const latestLog = logs.length > 0 ? logs[0] : null;
    const latestMessage = latestLog ? (latestLog.message || latestLog.data?.message || 'No message') : 'No logs available';
    
    // Category icons
    const categoryIcons = {
      'Communication': 'fa-tower-broadcast',
      'Navigation': 'fa-compass',
      'Surveillance': 'fa-satellite-dish',
      'Data Processing': 'fa-server',
      'Support': 'fa-bolt'
    };
    const iconClass = categoryIcons[category] || 'fa-cog';
    
    detailPanelBody.innerHTML = `
      <!-- Equipment Header -->
      <div class="detail-section">
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
          <div class="equipment-card-icon ${category.toLowerCase().replace(' ', '-')}" style="width: 60px; height: 60px; font-size: 1.5rem;">
            <i class="fas ${iconClass}"></i>
          </div>
          <div>
            <h3 style="color: var(--monitoring-text); margin: 0 0 5px 0; font-size: 1.3rem;">${equipment.name}</h3>
            <span class="detail-status-badge ${status.toLowerCase()}">${status}</span>
          </div>
        </div>
      </div>
      
      <!-- Equipment Information -->
      <div class="detail-section">
        <h4 class="detail-section-title">
          <i class="fas fa-info-circle"></i> Equipment Information
        </h4>
        <div class="detail-info-grid">
          <div class="detail-info-item">
            <label>Equipment Name</label>
            <span>${equipment.name}</span>
          </div>
          <div class="detail-info-item">
            <label>Airport / Location</label>
            <span>${airportName}</span>
          </div>
          <div class="detail-info-item">
            <label>Category</label>
            <span>${category}</span>
          </div>
          <div class="detail-info-item">
            <label>Device IP Address</label>
            <span>${ipAddress}</span>
          </div>
          <div class="detail-info-item">
            <label>Monitoring Method</label>
            <span>${monitoringMethod}</span>
          </div>
          <div class="detail-info-item">
            <label>Current Status</label>
            <span>${status}</span>
          </div>
          <div class="detail-info-item">
            <label>Last Update</label>
            <span>${formatDateTime(lastUpdate)}</span>
          </div>
          <div class="detail-info-item">
            <label>Created At</label>
            <span>${formatDateTime(createdAt)}</span>
          </div>
        </div>
      </div>
      
      <!-- Latest Log Message -->
      <div class="detail-section">
        <h4 class="detail-section-title">
          <i class="fas fa-bell"></i> Latest Log Message
        </h4>
        <div class="detail-info-item full-width" style="background: var(--monitoring-bg);">
          <span style="color: var(--monitoring-text); font-size: 0.95rem; line-height: 1.5;">${latestMessage}</span>
        </div>
      </div>
      
      <!-- Monitoring Log Timeline -->
      <div class="detail-section">
        <h4 class="detail-section-title">
          <i class="fas fa-history"></i> Monitoring Log Timeline (Last 5)
        </h4>
        ${logs.length > 0 ? `
          <div class="detail-timeline">
            ${logs.map(log => {
              const logStatus = log.status || (log.data?.status) || 'Normal';
              const logMessage = log.message || log.data?.message || 'No message';
              const logSource = log.source || 'manual';
              const logTime = log.logged_at || log.timestamp || log.created_at || new Date().toISOString();
              
              return `
                <div class="timeline-item status-${logStatus.toLowerCase()}">
                  <div class="timeline-time">${formatDateTime(logTime)}</div>
                  <span class="timeline-status ${logStatus.toLowerCase()}">${logStatus}</span>
                  <p class="timeline-message">${logMessage}</p>
                  <div class="timeline-source">Source: ${logSource.toUpperCase()}</div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="detail-panel-empty">
            <i class="fas fa-history"></i>
            <p>No logs available for this equipment</p>
          </div>
        `}
      </div>
    `;
  }
  
  // Close detail panel
  function closeDetailPanel() {
    if (detailPanel) {
      detailPanel.classList.remove('open');
    }
    if (detailPanelOverlay) {
      detailPanelOverlay.classList.remove('open');
    }
  }
  
  // Format datetime for display
  function formatDateTime(dateString) {
    if (!dateString || dateString === '-') return '-';
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  // Load airports data
  async function loadAirports() {
    try {
      const response = await fetch('/api/airports');
      airportsData = await response.json();
      // Initialize filtered airports with all airports
      filteredAirports = [...airportsData];
      renderBranchList();
      
      // Auto-select first branch if available
      if (airportsData.length > 0) {
        selectAirport(airportsData[0].id);
      }
    } catch (error) {
      console.error('Error loading airports:', error);
      if (branchListContainer) {
        branchListContainer.innerHTML = `
          <div class="loading-state">
            <i class="fas fa-exclamation-circle"></i>
            <p>Gagal memuat data cabang</p>
          </div>
        `;
      }
    }
  }
  
  // Calculate total equipment for an airport (including children)
  function calculateTotalEquipment(airportId) {
    
    // Get equipment count for this airport
    const airport = airportsData.find(a => a.id === airportId);
    if (airport) {
      // HANYA hitung alat yang ACTIVE untuk menu Cabang
      return airport.totalActiveEquipment !== undefined ? airport.totalActiveEquipment : (airport.totalEquipment || 0);
    }
    return 0;
  }
  
  // Render branch list (sidebar with all airports)
  function renderBranchList() {
    if (!branchListContainer) return;
    
    // Filter airports based on search query
    if (searchQuery) {
      filteredAirports = airportsData.filter(a => 
        a.name.toLowerCase().includes(searchQuery) || 
        (a.city && a.city.toLowerCase().includes(searchQuery))
      );
    } else {
      filteredAirports = [...airportsData];
    }
    
    if (filteredAirports.length === 0) {
      branchListContainer.innerHTML = `
        <div class="empty-branch-list">
          <i class="fas fa-search"></i>
          <p>${searchQuery ? 'Tidak ada hasil pencarian' : 'Tidak ada data cabang'}</p>
        </div>
      `;
      return;
    }
    
    branchListContainer.innerHTML = filteredAirports.map(airport => {
      const isActive = selectedAirport && selectedAirport.id === airport.id;
      const totalEquipment = calculateTotalEquipment(airport.id);
      const hasChildren = airportsData.some(a => a.parentId === airport.id);
      
      return `
        <div class="branch-item ${isActive ? 'active' : ''}" 
             onclick="cabangModule.selectAirport(${airport.id})">
          <div class="branch-icon ${hasChildren ? 'has-children' : ''}">
            <i class="fas fa-plane"></i>
          </div>
          <div class="branch-info">
            <h4 class="branch-name">${airport.name}</h4>
            <span class="branch-city">${airport.city || ''}</span>
          </div>
          <div class="branch-badge">
            <span class="equipment-count">${totalEquipment}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  // Select airport (show equipment)
  async function selectAirport(airportId) {
    // Ensure airports data is loaded first
    if (airportsData.length === 0) {
      await loadAirports();
    }
    
    selectedAirport = airportsData.find(a => a.id === airportId);
    if (!selectedAirport) return;
    
    // Re-render branch list to update active state
    renderBranchList();
    
    // Show the monitoring section (equipment cards)
    const gridSection = document.querySelector('#cabangSection .card');
    const monitoringSection = document.getElementById('cabangMonitoringSection');
    
    if (gridSection) gridSection.classList.add('hidden');
    if (monitoringSection) monitoringSection.classList.remove('hidden');
    
    // Update global breadcrumb agar nama bandara tampil di header atas
    if (typeof updateHeaderBreadcrumb === 'function') {
      updateHeaderBreadcrumb('cabang', selectedAirport.name);
    }
    
    // Load equipment for this airport
    await loadEquipment(airportId);
  }
  
  // Load equipment data
  async function loadEquipment(airportId) {
  try {
    const token = localStorage.getItem('authToken');

    // 🔐 stop kalau belum login
    if (!token) {
      console.log('[Cabang] Belum login, skip load equipment');
      equipmentData = [];
      renderEquipmentCards();
      return;
    }

    // Tambahkan parameter isActive=true agar API hanya memuat alat yang aktif
    const response = await fetch(`/api/equipment?branchId=${airportId}&limit=1000&isActive=true`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    // 🔥 handle 401
    if (response.status === 401) {
      console.warn('[Cabang] Unauthorized - token tidak valid');
      equipmentData = [];
      renderEquipmentCards();
      return;
    }

    if (!response.ok) {
      if (response.status === 500) {
        console.error('[Cabang] Server error (500) loading equipment:', airportId);
        equipmentData = [];
        renderEquipmentCards();
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    const data = result.data || result;

    // 🔥 validasi array
    if (!Array.isArray(data)) {
      console.error('[Cabang] Data bukan array:', data);
      equipmentData = [];
      renderEquipmentCards();
      return;
    }

    // Filter tambahan untuk memastikan murni alat yang aktif saja yang masuk ke array
    equipmentData = data.filter(e => e.isActive === true || e.isActive === 'true' || e.is_active === 1 || e.is_active === '1');

    renderEquipmentCards();

  } catch (error) {
    console.error('Error loading equipment:', error);
    equipmentData = [];
    renderEquipmentCards();
  }
}
  
  // Render equipment cards
  function renderEquipmentCards() {
    if (!equipmentCardsContainer) return;
    
    // Check if an airport is selected
    if (!selectedAirport) {
      equipmentCardsContainer.innerHTML = `
        <div class="monitoring-empty-state">
          <i class="fas fa-hand-point-up"></i>
          <h3>Pilih Branch</h3>
          <p>Pilih branch dari daftar di samping untuk melihat peralatan</p>
        </div>
      `;
      return;
    }
    
    // Filter by category
    let filtered = equipmentData;
    if (currentFilter !== 'all') {
      filtered = equipmentData.filter(e => e.category === currentFilter);
    }
    
    if (filtered.length === 0) {
      equipmentCardsContainer.innerHTML = `
        <div class="monitoring-empty-state">
          <i class="fas fa-box-open"></i>
          <h3>Tidak Ada Peralatan</h3>
          <p>Tidak ada peralatan ${currentFilter !== 'all' ? 'di kategori ' + currentFilter : ''} untuk ${selectedAirport.name}</p>
        </div>
      `;
      return;
    }
    
    equipmentCardsContainer.innerHTML = filtered.map((equipment, index) => {
      const status = equipment.status || 'Normal';
      const category = equipment.category || 'Support';
      const lastUpdate = equipment.lastUpdate || equipment.updated_at || new Date().toISOString();
      const timeAgo = getTimeAgo(lastUpdate);
      
      // Category icon mapping
      const categoryIcons = {
        'Communication': 'fa-tower-broadcast',
        'Navigation': 'fa-compass',
        'Surveillance': 'fa-satellite-dish',
        'Data Processing': 'fa-server',
        'Support': 'fa-bolt'
      };
      
      const iconClass = categoryIcons[category] || 'fa-cog';
      
      const iconCategoryClass = category === 'Support' ? '' : category.toLowerCase().replace(' ', '-');
      
      return `
        <div class="equipment-card status-${status.toLowerCase()}" 
             style="animation-delay: ${index * 0.05}s"
             onclick="cabangModule.openEquipmentDetail(${equipment.id})"
             title="Click to view details">
          <div class="equipment-card-header">
            <div class="equipment-card-icon ${iconCategoryClass}">
              <i class="fas ${iconClass}"></i>
            </div>
            <div class="equipment-status ${status.toLowerCase()}">
              ${status}
            </div>
          </div>
          
          <div class="equipment-card-body">
            <h4 class="equipment-name">${equipment.name}</h4>
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
    
    // Add click cursor style to cards
    setTimeout(() => {
      const cards = equipmentCardsContainer.querySelectorAll('.equipment-card');
      cards.forEach(card => {
        card.style.cursor = 'pointer';
      });
    }, 100);
  }
  
  // Utility: Get time ago string
  function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Baru saja';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
    return `${Math.floor(seconds / 86400)} hari lalu`;
  }
  
  // Set filter and re-render - updated to use dynamic selector
  function setFilter(category) {
    currentFilter = category;
    
    // Update active button state - use dynamic selector to ensure it works
    const buttons = document.querySelectorAll('#cabangSection .monitoring-filters .filter-btn');
    if (buttons && buttons.length > 0) {
      buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === category) {
          btn.classList.add('active');
        }
      });
    }
    
    // Re-render equipment cards with new filter
    renderEquipmentCards();
  }
  
  // Public API
  return {
    init,
    loadAirports,
    selectAirport,
    setFilter,
    openEquipmentDetail,
    closeDetailPanel,
    refresh: loadAirports
  };
})();

// Global reference for external access
window.cabangModule = cabangModule;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  cabangModule.init();
});