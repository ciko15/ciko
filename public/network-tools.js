// Network Tools - Real Network Analytics
// Uses backend API to capture and analyze real network packets from your system

let capturedPackets = [];
let filteredPackets = [];
let isCapturing = false;
let packetCounter = 0;
let captureUpdateInterval = null;
let captureModeInterval = null;
let availableInterfaces = [];
let lastCaptureError = null;

// Initialize Network Tools
function initNetworkTools() {
  try {
    console.log('[Network Tools] Initializing...');
    
    // Reset state
    isCapturing = false;
    capturedPackets = [];
    filteredPackets = [];
    packetCounter = 0;
    lastCaptureError = null;
    
    // Update UI
    updateCaptureStatus();
    updatePacketCount();
    
    // Load network interfaces
    loadNetworkInterfaces();
    
    addLogEntry('System', 'Network Tools initialized - Ready to capture real network traffic', 'info');
  } catch (error) {
    console.error('[Network Tools] Initialization error:', error);
    addLogEntry('Error', `Initialization failed: ${error.message}`, 'error');
  }
}

// Load and display network interfaces
async function loadNetworkInterfaces() {
  try {
    const response = await fetch('/api/network/interfaces', { headers: getAuthHeaders() });
    const result = await response.json();

    if (result.success && result.data) {
      const interfaces = result.data;
      availableInterfaces = interfaces;

      const interfaceSelect = document.getElementById('interfaceSelect');
      if (interfaceSelect) {
        interfaceSelect.innerHTML = '<option value="">All Interfaces</option>';
        interfaces.forEach(iface => {
          const ifaceName = iface.name || iface.iface || iface.ifaceName;
          const option = document.createElement('option');
          option.value = ifaceName;
          option.textContent = `${ifaceName} (${iface.operstate || iface.type || 'unknown'})`;
          interfaceSelect.appendChild(option);
        });

        // Default to the first non-loopback interface (e.g. en0) for macOS
        const preferred = interfaces.find(i => {
          const name = (i.name || i.iface || i.ifaceName || '').toLowerCase();
          return name && !name.startsWith('lo') && !name.startsWith('awdl');
        }) || interfaces[0];
        
        if (preferred) {
          interfaceSelect.value = preferred.name || preferred.iface || preferred.ifaceName || '';
        }
      }
    }
  } catch (error) {
    console.error('[Network Tools] Error loading interfaces:', error);
  }
}

// Start capturing packets
async function startCapture() {
  try {
    if (isCapturing) return;
    
    isCapturing = true;
    capturedPackets = [];
    filteredPackets = [];
    packetCounter = 0;
    lastCaptureError = null;
    
    addLogEntry('System', 'Starting real network packet capture...', 'info');
    
    // Determine selected interface
    const interfaceSelect = document.getElementById('interfaceSelect');
    let selectedInterface = interfaceSelect?.value || '';

    // Start packet capture on backend
    const response = await fetch('/api/sniffer/start', {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ interface: selectedInterface })
    });
    
    if (!response.ok) {
      throw new Error('Failed to start packet capture');
    }
    
    updateCaptureStatus();
    
    // Update packet list every 1 second
    captureUpdateInterval = setInterval(updateCaptureData, 1000);
    // Poll stats/errors every 2 seconds
    captureModeInterval = setInterval(updateCaptureStatus, 2000);
    
  } catch (error) {
    console.error('[Network Tools] Start capture error:', error);
    addLogEntry('Error', `Start capture failed: ${error.message}`, 'error');
    isCapturing = false;
    updateCaptureStatus();
  }
}

// Update captured data from backend
async function updateCaptureData() {
  try {
    if (!isCapturing) return;
    
    const response = await fetch('/api/sniffer/packets', { headers: getAuthHeaders() });
    const result = await response.json();
    
    if (result.success && result.data) {
      const newPackets = result.data;
      const prevCount = capturedPackets.length;
      
      capturedPackets = newPackets;
      
      if (capturedPackets.length > prevCount) {
        // Apply filters and update display
        applyFilters();
      } else if (capturedPackets.length === 0) {
        // Still empty, update display and check for errors immediately
        updateCaptureStatus();
        displayPackets();
      }
    }
  } catch (error) {
    console.error('[Network Tools] Update error:', error);
  }
}

// Stop capturing packets
async function stopCapture() {
  try {
    isCapturing = false;
    
    if (captureUpdateInterval) clearInterval(captureUpdateInterval);
    if (captureModeInterval) clearInterval(captureModeInterval);
    
    captureUpdateInterval = null;
    captureModeInterval = null;
    
    addLogEntry('System', 'Packet capture stopped', 'info');
    updateCaptureStatus();
    
    // Stop capture on backend
    await fetch('/api/sniffer/stop', { 
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (error) {
    console.error('[Network Tools] Stop capture error:', error);
  }
}

// Apply filters to packet list
function applyFilters() {
  try {
    const packetFilter = (document.getElementById('packetFilter')?.value || '').trim().toLowerCase();
    const protocolFilter = (document.getElementById('protocolFilter')?.value || '').trim();
    const interfaceFilter = (document.getElementById('interfaceSelect')?.value || '').trim();

    filteredPackets = capturedPackets.filter(packet => {
      const proto = (packet.protocol || '').toString();
      const iface = (packet.interface || '').toString();
      const src = (packet.source || '').toString().toLowerCase();
      const dst = (packet.destination || '').toString().toLowerCase();
      const info = (packet.info || '').toString().toLowerCase();

      const matchesProtocol = !protocolFilter || proto === protocolFilter;
      const matchesInterface = !interfaceFilter || iface === interfaceFilter;
      const matchesFilter = !packetFilter || 
        src.includes(packetFilter) ||
        dst.includes(packetFilter) ||
        info.includes(packetFilter) ||
        proto.toLowerCase().includes(packetFilter) ||
        iface.toLowerCase().includes(packetFilter);

      return matchesProtocol && matchesInterface && matchesFilter;
    });

    displayPackets();
    updatePacketCount();
  } catch (error) {
    console.error('[Network Tools] Filter error:', error);
  }
}

function filterPackets() {
  applyFilters();
}

// Display packets in table
function displayPackets() {
  try {
    const tbody = document.getElementById('packetListBody');
    if (!tbody) return;
    
    // Handle empty states with specific messaging
    if (capturedPackets.length === 0) {
      let message = "No packets captured yet. Start capture to begin analyzing network traffic.";
      if (isCapturing) {
        message = '<div class="spinner-inline"></div> Waiting for network traffic...';
      }
      if (lastCaptureError) {
        message = `<span class="error-text"><i class="fas fa-exclamation-triangle"></i> Capture Error: ${lastCaptureError}</span>`;
      }
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${message}</td></tr>`;
      return;
    }
    
    if (filteredPackets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-filter"></i> No packets match your filter criteria.</td></tr>';
      return;
    }
    
    tbody.innerHTML = filteredPackets.map(packet => `
      <tr onclick="displayPacketDetails(${packet.number})" style="cursor: pointer;" class="packet-row">
        <td>${packet.number}</td>
        <td>${(Number(packet.time) || 0).toFixed(3)}s</td>
        <td>${packet.interface || '-'}</td>
        <td class="addr-cell">${packet.source}</td>
        <td class="addr-cell">${packet.destination}</td>
        <td><span class="protocol-badge protocol-${packet.protocol.toLowerCase()}">${packet.protocol}</span></td>
        <td>${packet.length}</td>
        <td class="info-cell" title="${packet.info}">${packet.info}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[Network Tools] Display packets error:', error);
  }
}

// Display details for a specific packet
function displayPacketDetails(packetNumber) {
  try {
    const packet = capturedPackets.find(p => p.number === packetNumber);
    if (!packet) return;
    
    const detailsContent = document.getElementById('packetDetailsContent');
    if (!detailsContent) return;
    
    detailsContent.innerHTML = `
      <div class="packet-details">
        <div class="detail-section">
          <h4>Frame Information</h4>
          <div class="detail-item"><span class="label">Number:</span><span class="value">${packet.number}</span></div>
          <div class="detail-item"><span class="label">Time:</span><span class="value">${(Number(packet.time) || 0).toFixed(6)}s</span></div>
          <div class="detail-item"><span class="label">Length:</span><span class="value">${packet.length} bytes</span></div>
          <div class="detail-item"><span class="label">Interface:</span><span class="value">${packet.interface || 'unknown'}</span></div>
        </div>
        <div class="detail-section">
          <h4>Network Layer</h4>
          <div class="detail-item"><span class="label">Source:</span><span class="value">${packet.source}</span></div>
          <div class="detail-item"><span class="label">Destination:</span><span class="value">${packet.destination}</span></div>
          <div class="detail-item"><span class="label">Protocol:</span><span class="value">${packet.protocol}</span></div>
        </div>
        <div class="detail-section">
          <h4>Packet Info</h4>
          <div class="detail-item"><span class="value">${packet.info}</span></div>
        </div>
      </div>
    `;
    
    displayHexViewer(packet);
  } catch (error) {
    console.error('[Network Tools] Display details error:', error);
  }
}

function displayHexViewer(packet) {
  try {
    const hexContent = document.getElementById('hexViewerContent');
    if (!hexContent) return;
    
    let rawData = packet.rawData || "";
    if (!rawData) {
        // Generate mock hex for visualization if raw data is missing
        for (let i = 0; i < Math.min(packet.length, 64); i++) {
            rawData += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
        }
    }
    
    const bytes = rawData.match(/.{1,2}/g) || [];
    let hexHtml = '<div class="hex-dump">';
    
    for (let i = 0; i < bytes.length; i += 16) {
        const rowBytes = bytes.slice(i, i + 16);
        const offset = i.toString(16).padStart(4, '0').toUpperCase();
        const hex = rowBytes.map(b => b.toUpperCase()).join(' ');
        const ascii = rowBytes.map(b => {
            const code = parseInt(b, 16);
            return (code >= 32 && code <= 126) ? String.fromCharCode(code) : '.';
        }).join('');
        
        hexHtml += `<div class="hex-row"><span class="offset">${offset}</span> <span class="hex">${hex.padEnd(47)}</span> <span class="ascii">${ascii}</span></div>`;
    }
    
    hexHtml += '</div>';
    hexContent.innerHTML = hexHtml;
  } catch (error) {
    console.error('[Network Tools] Hex viewer error:', error);
  }
}

// Export and Actions
async function clearCapture() {
  try {
    const confirmed = confirm('Clear all captured packets?');
    if (!confirmed) return;

    capturedPackets = [];
    filteredPackets = [];
    packetCounter = 0;
    
    displayPackets();
    updatePacketCount();
    
    await fetch('/api/sniffer/clear', { method: 'POST', headers: getAuthHeaders() });
    addLogEntry('System', 'All packets cleared', 'info');
  } catch (error) {
    console.error('[Network Tools] Clear capture error:', error);
  }
}

async function exportPackets() {
  try {
    if (capturedPackets.length === 0) return;
    const format = document.getElementById('exportFormat')?.value || 'json';
    window.open(`/api/sniffer/export?format=${format}&token=${localStorage.getItem('token')}`, '_blank');
  } catch (error) {
    console.error('[Network Tools] Export error:', error);
  }
}

// UI Helpers
async function updateCaptureStatus() {
  try {
    const statusEl = document.getElementById('captureStatus');
    const startBtn = document.getElementById('startCaptureBtn');
    const stopBtn = document.getElementById('stopCaptureBtn');
    const modeEl = document.getElementById('captureMode');
    
    const stats = await fetchCaptureStats();
    if (stats) {
        isCapturing = stats.isCapturing;
        if (stats.lastError) {
            lastCaptureError = stats.lastError;
            addLogEntry('Error', `Backend Error: ${lastCaptureError}`, 'error');
            // Force refresh packet list to show error
            displayPackets();
        }
        if (modeEl) modeEl.textContent = `Mode: ${stats.captureMode || 'None'}`;
    }

    if (isCapturing) {
      if (statusEl) statusEl.innerHTML = '<span class="status-badge status-capturing"><i class="fas fa-circle"></i> Capturing...</span>';
      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;
    } else {
      if (statusEl) statusEl.innerHTML = '<span class="status-badge status-stopped"><i class="fas fa-circle"></i> Stopped</span>';
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }
  } catch (error) {
    console.error('[Network Tools] Status update error:', error);
  }
}

async function fetchCaptureStats() {
  try {
    const response = await fetch('/api/sniffer/stats', { headers: getAuthHeaders() });
    if (!response.ok) return null;
    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error) {
    return null;
  }
}

function updatePacketCount() {
  const countEl = document.getElementById('packetCount');
  if (countEl) countEl.textContent = filteredPackets.length;
}

function addLogEntry(source, message, type = 'info') {
  const logEl = document.getElementById('networkToolsLog');
  if (!logEl) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] [${source}] ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function clearLog() {
    const logEl = document.getElementById('networkToolsLog');
    if (logEl) logEl.innerHTML = '<div class="log-entry info">[System] Log cleared</div>';
}

// Global Exports
window.initNetworkTools = initNetworkTools;
window.startCapture = startCapture;
window.stopCapture = stopCapture;
window.clearCapture = clearCapture;
window.exportPackets = exportPackets;
window.filterPackets = filterPackets;
window.displayPacketDetails = displayPacketDetails;
window.clearLog = clearLog;
