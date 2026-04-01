// Equipment Logs Fix - Enhanced Error Handling + Pagination & Sorting
// Include this file in index.html after app.js
var API_URL = window.API_URL || '/api';
var liveDataTimer = window.liveDataTimer;
var equipmentLogsData = [];
var equipmentLogsTableBody = document.getElementById('equipmentLogsTableBody');
var filterLogEquipment = document.getElementById('filterLogEquipment');
var filterLogSource = document.getElementById('filterLogSource');

// Equipment Logs Pagination & Sorting State
if (typeof logsPagination === 'undefined') {
  var logsPagination = {
    currentPage: 1,
    pageSize: 50,  // Default to 50 rows
    total: 0,
    totalPages: 0
  };
}

if (typeof logsSort === 'undefined') {
  var logsSort = {
    column: 'Waktu Update',
    direction: 'desc'
  };
}

// Function to populate equipment filter dropdown
window.populateEquipmentFilter = function() {
  const filterSelect = document.getElementById('filterLogEquipment');
  if (!filterSelect) return;
  
  // Keep the first option (All Equipment)
  const firstOption = filterSelect.options[0];
  filterSelect.innerHTML = '';
  filterSelect.appendChild(firstOption);
  
  // Add equipment options from equipmentData
  if (typeof equipmentData !== 'undefined' && Array.isArray(equipmentData)) {
    equipmentData.forEach(eq => {
      const option = document.createElement('option');
      option.value = eq.id;
      option.textContent = `${eq.name} (${eq.code})`;
      filterSelect.appendChild(option);
    });
  }
};

// Initialize equipment filter when equipment data is loaded
window.initEquipmentLogsFilter = function() {
  // Populate equipment filter
  window.populateEquipmentFilter();
  
  // Add event listeners for filters
  const filterEquipment = document.getElementById('filterLogEquipment');
  const filterSource = document.getElementById('filterLogSource');
  const pageSizeSelect = document.getElementById('logsPageSize');
  
  if (filterEquipment) {
    filterEquipment.addEventListener('change', () => {
      logsPagination.currentPage = 1; // Reset to first page
      window.loadEquipmentLogs();
    });
  }
  
  if (filterSource) {
    filterSource.addEventListener('change', () => {
      logsPagination.currentPage = 1; // Reset to first page
      window.loadEquipmentLogs();
    });
  }
  
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      logsPagination.pageSize = parseInt(pageSizeSelect.value);
      logsPagination.currentPage = 1; // Reset to first page
      window.renderLogsWithPagination();
    });
  }
  
  console.log('[DEBUG] Equipment logs filter initialized');
};

// Override the original loadEquipmentLogs function with improved version
window.loadEquipmentLogs = async function() {
  if (!authToken || !currentUser) {
    console.log('[DEBUG] User not authenticated, skipping equipment logs load');
    if (equipmentLogsTableBody) {
      equipmentLogsTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">Please login to view equipment logs</td>
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
    params.append('limit', '1000');  // Server max limit is 1000
    params.append('page', '1');      // Required by server validation
    
    const url = `${API_URL}/equipment/logs?${params.toString()}`;
    console.log('[DEBUG] Fetching equipment logs from:', url);

    const response = await fetch(url, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorDetails = null;
      
      try {
        errorDetails = await response.json();
        console.error('[DEBUG] Error response from backend:', errorDetails);
        
        if (errorDetails.errors && Array.isArray(errorDetails.errors)) {
          errorMessage = errorDetails.errors.map(e => `${e.param}: ${e.msg}`).join(', ');
        } else if (errorDetails.message) {
          errorMessage = errorDetails.message;
        }
      } catch (parseError) {
        console.error('[DEBUG] Failed to parse error response:', parseError);
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json();
    window.equipmentLogsData = result.data || [];
    
    console.log(`[DEBUG] Successfully loaded ${window.equipmentLogsData.length} equipment logs`);
    
    logsPagination.total = window.equipmentLogsData.length;
    logsPagination.totalPages = Math.ceil(logsPagination.total / logsPagination.pageSize);
    
    window.renderLogsWithPagination();
  } catch (error) {
    console.error('[DEBUG] Error loading equipment logs:', error);
    
    if (equipmentLogsTableBody) {
      equipmentLogsTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state" style="color: #ef4444; text-align: center; padding: 30px;">
            <div style="margin-bottom: 15px;">
              <i class="fas fa-exclamation-triangle" style="font-size: 2.5rem; color: #ef4444;"></i>
            </div>
            <div style="font-weight: 600; margin-bottom: 10px; font-size: 1.1rem;">Failed to Load Equipment Logs</div>
            <div style="font-size: 0.9rem; opacity: 0.9; margin-bottom: 15px;">${error.message}</div>
            <div style="margin-top: 20px;">
              <button onclick="loadEquipmentLogs()" class="btn btn-primary" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                <i class="fas fa-sync"></i> Retry
              </button>
            </div>
          </td>
        </tr>
      `;
    }
  }
};

// Render logs with pagination and sorting
window.renderLogsWithPagination = function() {
  if (!window.equipmentLogsData || window.equipmentLogsData.length === 0) {
    if (equipmentLogsTableBody) {
      equipmentLogsTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">No logs available yet.</td>
        </tr>
      `;
    }
    window.renderLogsPagination();
    return;
  }
  
  const sortedData = [...window.equipmentLogsData].sort((a, b) => {
    let valA, valB;
    
    switch (logsSort.column) {
      case 'Waktu Update':
        valA = new Date(a["Waktu Update"] || a.logged_at || 0).getTime();
        valB = new Date(b["Waktu Update"] || b.logged_at || 0).getTime();
        break;
      case 'Nama Alat':
        valA = (a["Nama Alat"] || a.equipment_name || '').toLowerCase();
        valB = (b["Nama Alat"] || b.equipment_name || '').toLowerCase();
        break;
      case 'equipment_code':
        valA = (a.equipment_code || '').toLowerCase();
        valB = (b.equipment_code || '').toLowerCase();
        break;
      case 'source':
        valA = (a.source || '').toLowerCase();
        valB = (b.source || '').toLowerCase();
        break;
      default:
        valA = a[logsSort.column];
        valB = b[logsSort.column];
    }
    
    if (valA < valB) return logsSort.direction === 'asc' ? -1 : 1;
    if (valA > valB) return logsSort.direction === 'asc' ? 1 : -1;
    return 0;
  });
  
  const startIndex = (logsPagination.currentPage - 1) * logsPagination.pageSize;
  const endIndex = Math.min(startIndex + logsPagination.pageSize, sortedData.length);
  const pageData = sortedData.slice(startIndex, endIndex);
  
  window.renderEquipmentLogsTable(pageData);
  window.renderLogsPagination();
  window.updateSortIcons();
};

window.renderEquipmentLogsTable = function(logs) {
  if (!equipmentLogsTableBody) return;
  
  console.log('[DEBUG] Rendering', logs.length, 'logs');
  
  if (logs.length === 0) {
    equipmentLogsTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">No logs available.</td>
      </tr>
    `;
    return;
  }
  
  equipmentLogsTableBody.innerHTML = logs.map(log => {
    const logId = log.id || log['ID'];
    const equipmentName = log.equipment_name || log['Nama Alat'] || '-';
    const equipmentCode = log.equipment_code || '-';
    const logSource = log.source || 'none';
    const loggedAt = log.logged_at || log['Waktu Update'] || '';
    const logData = log.data || log['Keterangan'] || {};
    
    const time = loggedAt ? new Date(loggedAt).toLocaleString() : '-';
    
    // Format the data for display - show first 50 chars
    let dataStr = '-';
    if (logData) {
      if (typeof logData === 'object') {
        // Check if it has a status field
        if (logData.status) {
          dataStr = `Status: ${logData.status}`;
        } else {
          // Show first few key-value pairs
          const keys = Object.keys(logData).slice(0, 3);
          dataStr = keys.map(k => `${k}: ${logData[k]}`).join(', ');
        }
      } else {
        dataStr = String(logData).substring(0, 50);
      }
    }
    
    const sourceClass = logSource === 'snmp' ? 'snmp-badge' : 
                       logSource === 'json' ? 'category-badge navigation' :
                       logSource === 'mqtt' ? 'category-badge surveillance' :
                       logSource === 'modbus' ? 'category-badge data-processing' :
                       'category-badge support';
    
    return `
      <tr>
        <td>${time}</td>
        <td>${equipmentName}</td>
        <td><span class="${sourceClass}">${logSource}</span></td>
        <td><code style="font-size: 0.75rem;">${dataStr}</code></td>
        <td>
          <button class="btn-view" onclick="viewLogDetail(${logId})" title="View Details" style="background: #10b981; color: white; padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

window.renderLogsPagination = function() {
  const paginationContainer = document.getElementById('logsPagination');
  if (!paginationContainer) return;
  
  if (logsPagination.total === 0) {
    paginationContainer.innerHTML = '';
    return;
  }
  
  const { currentPage, pageSize, total, totalPages } = logsPagination;
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, total);
  
  let paginationHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
      <span style="color: var(--text-secondary); font-size: 0.85rem;">
        Showing ${startItem}-${endItem} of ${total} logs
      </span>
      <div style="display: flex; gap: 5px; align-items: center;">
        <button onclick="goToLogsPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} style="padding: 6px 12px;" class="btn btn-secondary">
          <i class="fas fa-chevron-left"></i>
        </button>
  `;
  
  const maxPages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
  let endPage = Math.min(totalPages, startPage + maxPages - 1);
  
  if (endPage - startPage + 1 < maxPages) {
    startPage = Math.max(1, endPage - maxPages + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    const isActive = i === currentPage;
    paginationHTML += `
      <button onclick="goToLogsPage(${i})" ${isActive ? 'style="background: var(--accent-primary);"' : ''} style="padding: 6px 12px;" class="btn ${isActive ? 'btn-primary' : 'btn-secondary'}">${i}</button>
    `;
  }
  
  paginationHTML += `
        <button onclick="goToLogsPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 6px 12px;" class="btn btn-secondary">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
  `;
  
  paginationContainer.innerHTML = paginationHTML;
};

window.goToLogsPage = function(page) {
  if (page < 1 || page > logsPagination.totalPages) return;
  logsPagination.currentPage = page;
  window.renderLogsWithPagination();
};

window.sortLogsTable = function(column) {
  if (logsSort.column === column) {
    logsSort.direction = logsSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    logsSort.column = column;
    logsSort.direction = 'asc';
  }
  window.renderLogsWithPagination();
};

window.updateSortIcons = function() {
  document.querySelectorAll('#equipmentLogsSection th.sortable').forEach(th => {
    const sortField = th.getAttribute('data-sort') || th.textContent.trim();
    const icon = th.querySelector('i');
    
    if (icon) {
      if (sortField === logsSort.column) {
        icon.className = logsSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        th.classList.remove('asc', 'desc');
        th.classList.add(logsSort.direction);
      } else {
        icon.className = 'fas fa-sort';
        th.classList.remove('asc', 'desc');
      }
    }
  });
};

// Fixed viewLogDetail function - properly displays log details
window.viewLogDetail = function(logId) {
  const log = window.equipmentLogsData.find(l => (l.id || l['ID']) == logId);
  if (!log) {
    console.error('[DEBUG] Log not found:', logId);
    alert('Log not found');
    return;
  }
  
  console.log('[DEBUG] Viewing log detail:', log);
  
  const equipmentName = log.equipment_name || log['Nama Alat'] || 'Unknown';
  const equipmentCode = log.equipment_code || '-';
  const logSource = log.source || '-';
  const loggedAt = log.logged_at || log['Waktu Update'] || '';
  const logData = log.data || log['Keterangan'] || {};
  
  // Format data for display - show full JSON
  let dataStr = '-';
  if (logData) {
    if (typeof logData === 'object') {
      dataStr = JSON.stringify(logData, null, 2);
    } else {
      dataStr = String(logData);
    }
  }
  
  const timeStr = loggedAt ? new Date(loggedAt).toLocaleString() : '-';
  
  const snmpDataContent = document.getElementById('snmpDataContent');
  
  snmpDataContent.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h4 style="margin-bottom: 10px;">Equipment Log Details</h4>
      <p><strong>Equipment:</strong> ${equipmentName}</p>
      <p><strong>Code:</strong> ${equipmentCode}</p>
      <p><strong>Source:</strong> ${logSource}</p>
      <p><strong>Time:</strong> ${timeStr}</p>
      <p><strong>Log ID:</strong> ${logId}</p>
    </div>
    <h5 style="margin-bottom: 10px;">Log Data:</h5>
    <pre style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 0.85rem;">${dataStr}</pre>
  `;
  
  document.getElementById('snmpDataModal').classList.remove('hidden');
};

// Initialize logs pagination on page load
window.initLogsPagination = function() {
  // Get page size from select if exists
  const logsPageSizeSelect = document.getElementById('logsPageSize');
  if (logsPageSizeSelect) {
    logsPagination.pageSize = parseInt(logsPageSizeSelect.value) || 50;
    
    logsPageSizeSelect.addEventListener('change', () => {
      logsPagination.pageSize = parseInt(logsPageSizeSelect.value);
      logsPagination.currentPage = 1;
      window.renderLogsWithPagination();
    });
  }
  
  // Initialize equipment filter
  window.initEquipmentLogsFilter();
  
  console.log('[DEBUG] Logs pagination initialized with page size:', logsPagination.pageSize);
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    window.initLogsPagination();
  });
} else {
  // DOM already loaded
  window.initLogsPagination();
}

// Also initialize when equipment data is loaded
const originalLoadEquipment = window.loadEquipment;
window.loadEquipment = async function() {
  if (originalLoadEquipment) {
    await originalLoadEquipment.apply(this, arguments);
  }
  // Populate equipment filter after equipment is loaded
  setTimeout(() => {
    window.populateEquipmentFilter();
  }, 500);
};

console.log('[DEBUG] Equipment logs fix with pagination loaded successfully');

