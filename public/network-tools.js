// Network Tools - Real Network Analytics
// Uses backend API to capture and analyze real network packets from your system


var liveDataTimer = window.liveDataTimer;
let capturedPackets = [];
let filteredPackets = [];
let isCapturing = false;
let packetCounter = 0;
let captureStartTime = null;
let captureUpdateInterval = null;
let captureModeInterval = null;
let availableInterfaces = [];

// Initialize Network Tools
function initNetworkTools() {
  try {
    debugLog('Initializing Network Tools with Real Network Capture...');
    
    // Check if required elements exist
    const requiredElements = [
      'networkToolsSection',
      'packetListBody',
      'packetDetailsContent',
      'hexViewerContent',
      'networkToolsLog',
      'startCaptureBtn',
      'stopCaptureBtn',
      'packetFilter',
      'protocolFilter',
      'captureStatus',
      'packetCount'
    ];
    
    for (const elementId of requiredElements) {
      const element = document.getElementById(elementId);
      if (!element) {
        console.warn(`[Network Tools] Element not found: ${elementId}`);
      }
    }
    
    // Reset capture state
    isCapturing = false;
    capturedPackets = [];
    filteredPackets = [];
    packetCounter = 0;
    
    // Update UI
    updateCaptureStatus();
    updatePacketCount();
    
    // Load network interfaces
    loadNetworkInterfaces();
    
    addLogEntry('System', 'Network Tools initialized - Ready to capture real network traffic', 'info');
    debugLog('Network Tools initialized successfully');
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

      addLogEntry('System', `Found ${interfaces.length} network interfaces`, 'info');
      debugLog('Network interfaces:', interfaces);

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

        // Default to the first non-loopback interface (e.g. en0) to make capture work on macOS
        const preferred = interfaces.find(i => {
          const name = (i.name || i.iface || i.ifaceName || '').toLowerCase();
          return name && !name.startsWith('lo');
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

// Start capturing packets from real network traffic
async function startCapture() {
  try {
    if (isCapturing) return;
    
    isCapturing = true;
    captureStartTime = Date.now();
    capturedPackets = [];
    filteredPackets = [];
    packetCounter = 0;
    
    addLogEntry('System', 'Starting real network packet capture...', 'info');
    updateCaptureStatus();
    
    // Determine selected interface (if any)
    const interfaceSelect = document.getElementById('interfaceSelect');
    let selectedInterface = interfaceSelect?.value || '';

    // If "All Interfaces" is selected (empty value), fall back to a known interface to improve macOS behavior.
    if (!selectedInterface && availableInterfaces.length > 0) {
      const preferred = availableInterfaces.find(i => {
        const name = (i.name || i.iface || i.ifaceName || '').toLowerCase();
        return name && !name.startsWith('lo');
      }) || availableInterfaces[0];
      selectedInterface = preferred.name || preferred.iface || preferred.ifaceName || '';
      addLogEntry('System', `Using default interface: ${selectedInterface}`, 'info');
    }

    // Start packet capture on backend
    const response = await fetch('/api/sniffer/start', {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ interface: selectedInterface })
    });
    
    if (!response.ok) {
      throw new Error('Failed to start packet capture');
    }
    
    addLogEntry('System', 'Real packet capture started - analyzing network traffic', 'success');
    
    // Update packet list every 1 second
    captureUpdateInterval = setInterval(updateCaptureData, 1000);

    // Poll capture status/mode periodically while capturing
    captureModeInterval = setInterval(updateCaptureStatus, 5000);
    
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
    
    // Fetch packets from backend
    const response = await fetch('/api/sniffer/packets', { headers: getAuthHeaders() });
    const result = await response.json();
    
    if (result.success && result.data) {
      const newPackets = result.data;
      
      // Only add new packets we haven't seen
      const existingIds = new Set(capturedPackets.map(p => p.number));
      const newItems = newPackets.filter(p => !existingIds.has(p.number));
      
      capturedPackets = newPackets;
      
      if (newItems.length > 0) {
        addLogEntry('Capture', `Captured ${newItems.length} new packets`, 'info');
      }
      
      // Apply filters and update display
      applyFilters();
    }
  } catch (error) {
    console.error('[Network Tools] Update error:', error);
  }
}

// Stop capturing packets
async function stopCapture() {
  try {
    isCapturing = false;
    
    if (captureUpdateInterval) {
      clearInterval(captureUpdateInterval);
      captureUpdateInterval = null;
    }

    if (captureModeInterval) {
      clearInterval(captureModeInterval);
      captureModeInterval = null;
    }
    
    addLogEntry('System', `Packet capture stopped. Total packets captured: ${capturedPackets.length}`, 'info');
    updateCaptureStatus();
    
    // Stop capture on backend
    await fetch('/api/sniffer/stop', { 
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (error) {
    console.error('[Network Tools] Stop capture error:', error);
    addLogEntry('Error', `Stop capture failed: ${error.message}`, 'error');
  }
}

// Apply filters to packet list
function applyFilters() {
  try {
    const packetFilter = (document.getElementById('packetFilter')?.value || '').trim().toLowerCase();
    const protocolFilter = (document.getElementById('protocolFilter')?.value || '').trim();
    const interfaceFilter = (document.getElementById('interfaceSelect')?.value || '').trim();

    filteredPackets = capturedPackets.filter(packet => {
      const proto = (packet.protocol || '').toString().trim();
      const iface = (packet.interface || '').toString().trim();
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

// Wrapper function for filter changes
function filterPackets() {
  applyFilters();
}

// Display packets in table
function displayPackets() {
  try {
    const tbody = document.getElementById('packetListBody');
    if (!tbody) return;
    
    if (filteredPackets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No packets captured. Start capture to begin analyzing network traffic.</td></tr>';
      return;
    }
    
    tbody.innerHTML = filteredPackets.map(packet => `
      <tr onclick="displayPacketDetails(${packet.number})" style="cursor: pointer;" class="packet-row">
        <td>${packet.number}</td>
        <td>${new Date(packet.time * 1000).toLocaleTimeString()}</td>
        <td title="${packet.interface}">${packet.interface}</td>
        <td title="${packet.source}">${packet.source}</td>
        <td title="${packet.destination}">${packet.destination}</td>
        <td><span class="protocol-badge protocol-${packet.protocol.toLowerCase()}">${packet.protocol}</span></td>
        <td>${packet.length}</td>
        <td title="${packet.info}">${packet.info.substring(0, 40)}...</td>
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
    
    const details = `
      <div class="packet-details">
        <div class="detail-section">
          <h4>Frame Information</h4>
          <div class="detail-item">
            <span class="label">Packet #:</span>
            <span class="value">${packet.number}</span>
          </div>
          <div class="detail-item">
            <span class="label">Timestamp:</span>
            <span class="value">${new Date(packet.time * 1000).toISOString()}</span>
          </div>
          <div class="detail-item">
            <span class="label">Length:</span>
            <span class="value">${packet.length} bytes</span>
          </div>
          <div class="detail-item">
            <span class="label">Interface:</span>
            <span class="value">${packet.interface}</span>
          </div>
          <div class="detail-item">
            <span class="label">Direction:</span>
            <span class="value">${packet.direction === 'in' ? '📥 Inbound' : '📤 Outbound'}</span>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>Network Layer</h4>
          <div class="detail-item">
            <span class="label">Source IP:</span>
            <span class="value" style="font-family: monospace;">${packet.source}</span>
          </div>
          <div class="detail-item">
            <span class="label">Destination IP:</span>
            <span class="value" style="font-family: monospace;">${packet.destination}</span>
          </div>
          <div class="detail-item">
            <span class="label">Protocol:</span>
            <span class="value"><span class="protocol-badge protocol-${packet.protocol.toLowerCase()}">${packet.protocol}</span></span>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>Traffic Information</h4>
          <div class="detail-item">
            <span class="label">Info:</span>
            <span class="value">${packet.info}</span>
          </div>
          <div class="detail-item">
            <span class="label">Data Rate:</span>
            <span class="value">${(Number(packet.rate) || 0).toFixed(2)} KB/s</span>
          </div>
        </div>
      </div>
    `;
    
    detailsContent.innerHTML = details;
    
    // Display hex viewer
    displayHexViewer(packet);
  } catch (error) {
    console.error('[Network Tools] Display details error:', error);
  }
}

// Display hex viewer for packet
function displayHexViewer(packet) {
  try {
    const hexContent = document.getElementById('hexViewerContent');
    if (!hexContent) return;
    
    // Generate hex representation of packet
    let hexHtml = '<div style="font-family: monospace; font-size: 11px; line-height: 1.6;">';
    
    // Create a sample hex representation from packet data
    const sampleHex = generateHexDump(packet);
    
    sampleHex.forEach((row, index) => {
      const offset = (index * 16).toString(16).padStart(8, '0').toUpperCase();
      hexHtml += `
        <div>
          <span style="color: #888; margin-right: 15px;">${offset}</span>
          <span style="margin-right: 20px;">${row.hex}</span>
          <span style="color: #666;">${row.ascii}</span>
        </div>
      `;
    });
    
    hexHtml += '</div>';
    hexContent.innerHTML = hexHtml;
  } catch (error) {
    console.error('[Network Tools] Hex viewer error:', error);
  }
}

// Generate hex dump representation
function generateHexDump(packet) {
  const rows = [];

  // Try to use real packet raw data if available
  let hexData = '';
  if (packet.rawData && typeof packet.rawData === 'string') {
    // Assume rawData is a hex string (e.g., "deadbeef...")
    hexData = packet.rawData.replace(/\s+/g, '');
  }

  // Fall back to a pseudo-random hex dump when raw data is not available
  if (!hexData || hexData.length < 2) {
    const length = Math.min(packet.length || 64, 64);
    for (let i = 0; i < length; i++) {
      hexData += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    }
  }

  // Split into rows of 16 bytes (32 hex chars)
  for (let i = 0; i < hexData.length; i += 32) {
    const chunk = hexData.substr(i, 32);
    const bytes = chunk.match(/.{1,2}/g) || [];
    const hex = bytes.map(b => b.toUpperCase()).join(' ');
    const ascii = bytes
      .map(b => {
        const code = parseInt(b, 16);
        return (code >= 32 && code <= 126) ? String.fromCharCode(code) : '.';
      })
      .join('');

    rows.push({ hex, ascii });
  }

  return rows.length > 0 ? rows : [{ hex: 'No data', ascii: '' }];
}

// Clear captured packets
async function clearCapture() {
  try {
    const confirmed = await showConfirm(
      'Kosongkan Logs?', 
      'Apakah Anda yakin ingin menghapus semua tangkapan log?',
      { type: 'warning', confirmText: 'Kosongkan' }
    );
    if (!confirmed) return;

    capturedPackets = [];
    filteredPackets = [];
    packetCounter = 0;
    
    const tbody = document.getElementById('packetListBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No packets captured. Start capture to begin.</td></tr>';
    }
    
    const detailsContent = document.getElementById('packetDetailsContent');
    if (detailsContent) {
      detailsContent.innerHTML = '<div class="empty-state">Select a packet to view details</div>';
    }
    
    const hexContent = document.getElementById('hexViewerContent');
    if (hexContent) {
      hexContent.innerHTML = '<div class="empty-state">Select a packet to view hex data</div>';
    }
    
    updatePacketCount();
    addLogEntry('System', 'All packets cleared', 'info');
    
    // Clear on backend
    await fetch('/api/sniffer/clear', { 
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (error) {
    console.error('[Network Tools] Clear capture error:', error);
    addLogEntry('Error', `Clear failed: ${error.message}`, 'error');
  }
}

// Update packet count
function updatePacketCount() {
  try {
    const countEl = document.getElementById('packetCount');
    if (countEl) {
      countEl.textContent = filteredPackets.length;
    }
  } catch (error) {
    console.error('[Network Tools] Packet count update error:', error);
  }
}

// Add log entry
function addLogEntry(source, message, type = 'info') {
  try {
    const logEl = document.getElementById('networkToolsLog');
    if (!logEl) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${timestamp}] [${source}] ${message}`;
    
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  } catch (error) {
    console.error('[Network Tools] Log entry error:', error);
  }
}


// Apply filters to packet list
function applyFilters() {
  try {
    const packetFilter = document.getElementById('packetFilter')?.value?.toLowerCase() || '';
    const protocolFilter = document.getElementById('protocolFilter')?.value || '';
    
    filteredPackets = capturedPackets.filter(packet => {
      const matchesProtocol = !protocolFilter || packet.protocol === protocolFilter;
      const matchesFilter = !packetFilter || 
        packet.source.includes(packetFilter) ||
        packet.destination.includes(packetFilter) ||
        packet.info.toLowerCase().includes(packetFilter) ||
        packet.protocol.toLowerCase().includes(packetFilter);
      
      return matchesProtocol && matchesFilter;
    });
    
    displayPackets();
    updatePacketCount();
  } catch (error) {
    console.error('[Network Tools] Filter error:', error);
  }
}

// Wrapper function for filter changes
function filterPackets() {
  applyFilters();
}

// Display packets in table
function displayPackets() {
  try {
    const tbody = document.getElementById('packetListBody');
    if (!tbody) return;
    
    if (filteredPackets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No packets match filter criteria</td></tr>';
      return;
    }
    
    tbody.innerHTML = filteredPackets.map(packet => `
      <tr onclick="displayPacketDetails(${packet.number})" style="cursor: pointer;">
        <td>${packet.number}</td>
        <td>${(Number(packet.time) || 0).toFixed(3)}s</td>
        <td>${packet.source}</td>
        <td>${packet.destination}</td>
        <td><span class="protocol-badge protocol-${packet.protocol.toLowerCase()}">${packet.protocol}</span></td>
        <td>${packet.length}</td>
        <td>${packet.info}</td>
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
    
    const details = `
      <div class="packet-details">
        <div class="detail-section">
          <h4>Frame Information</h4>
          <div class="detail-item">
            <span class="label">Number:</span>
            <span class="value">${packet.number}</span>
          </div>
          <div class="detail-item">
            <span class="label">Time:</span>
            <span class="value">${(Number(packet.time) || 0).toFixed(3)} seconds</span>
          </div>
          <div class="detail-item">
            <span class="label">Length:</span>
            <span class="value">${packet.length} bytes</span>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>IP Layer</h4>
          <div class="detail-item">
            <span class="label">Source IP:</span>
            <span class="value">${packet.source}</span>
          </div>
          <div class="detail-item">
            <span class="label">Destination IP:</span>
            <span class="value">${packet.destination}</span>
          </div>
          <div class="detail-item">
            <span class="label">Protocol:</span>
            <span class="value">${packet.protocol}</span>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>Packet Info</h4>
          <div class="detail-item">
            <span class="label">Info:</span>
            <span class="value">${packet.info}</span>
          </div>
        </div>
      </div>
    `;
    
    detailsContent.innerHTML = details;
    
    // Display hex viewer
    displayHexViewer(packet);
  } catch (error) {
    console.error('[Network Tools] Display details error:', error);
  }
}

// Display hex viewer for packet
function displayHexViewer(packet) {
  try {
    const hexContent = document.getElementById('hexViewerContent');
    if (!hexContent) return;
    
    // Generate hex data if not available
    let rawData = packet.rawData;
    if (!rawData || rawData.length === 0) {
      // Generate sample hex data based on packet length
      const length = packet.length || 64;
      rawData = generateSampleHexData(length);
    }
    
    const hexData = rawData.match(/.{1,32}/g) || [];
    const offsetStart = 0;
    
    let hexHtml = '<table class="hex-table" style="width: 100%; border-collapse: collapse;">';
    
    hexData.forEach((row, index) => {
      const offset = (index * 16).toString(16).padStart(8, '0').toUpperCase();
      const hex = row.match(/.{1,2}/g)?.map((byte, i) => {
        const highlight = i % 8 === 4 ? ' style="margin-left: 10px;"' : '';
        return `<span${highlight}>${byte}</span>`;
      }).join(' ') || '';
      
      const ascii = row.match(/.{1,2}/g)?.map(byte => {
        const charCode = parseInt(byte, 16);
        return (charCode >= 32 && charCode <= 126) ? String.fromCharCode(charCode) : '.';
      }).join('') || '';
      
      hexHtml += `
        <tr>
          <td style="font-weight: bold; color: #888; margin-right: 10px;">${offset}</td>
          <td style="font-family: monospace; margin-right: 20px;">${hex}</td>
          <td style="font-family: monospace; color: #888;">${ascii}</td>
        </tr>
      `;
    });
    
    hexHtml += '</table>';
    hexContent.innerHTML = hexHtml;
  } catch (error) {
    console.error('[Network Tools] Hex viewer error:', error);
  }
}

// Generate sample hex data for display
function generateSampleHexData(length) {
  let hex = '';
  // Ethernet header (14 bytes)
  hex += 'ffffffffffff' + 'aabbccddeeff' + '0800';
  // IP header (20 bytes)
  hex += '45000028' + '00004000' + '40060000' + 'c0a80101' + 'c0a80102';
  // TCP header (20 bytes)
  hex += '12345678' + 'abcdabcd' + '00000000' + '00000000' + '50020000' + '00000000';
  
  // Fill remaining with random data
  const remaining = length - 54; // 14 + 20 + 20
  for (let i = 0; i < remaining && hex.length < length * 2; i++) {
    hex += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  
  return hex.substring(0, length * 2);
}



// Export packets to JSON/CSV/XML/PCAP
async function exportPackets() {
  try {
    if (capturedPackets.length === 0) {
      showToast('No packets to export', 'warning');
      return;
    }

    const format = document.getElementById('exportFormat')?.value || 'json';
    const response = await fetch(`/api/sniffer/export?format=${encodeURIComponent(format)}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    let blob;
    let filename;

    if (format === 'json') {
      const data = await response.json();
      if (!data.success) {
        throw new Error('Export failed on server');
      }
      const jsonString = JSON.stringify(data.data, null, 2);
      blob = new Blob([jsonString], { type: 'application/json' });
      filename = `packets_${Date.now()}.json`;
    } else {
      blob = await response.blob();
      const extension = format === 'pcap' ? 'pcap' : format === 'xml' ? 'xml' : 'csv';
      filename = `packets_${Date.now()}.${extension}`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addLogEntry('System', `Exported ${capturedPackets.length} packets (${format.toUpperCase()})`, 'success');
  } catch (error) {
    console.error('[Network Tools] Export error:', error);
    addLogEntry('Error', `Export failed: ${error.message}`, 'error');
  }
}

// Update capture status indicator
async function updateCaptureStatus() {
  try {
    const statusEl = document.getElementById('captureStatus');
    const modeEl = document.getElementById('captureMode');
    const startBtn = document.getElementById('startCaptureBtn');
    const stopBtn = document.getElementById('stopCaptureBtn');
    
    if (isCapturing) {
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-badge status-capturing"><i class="fas fa-circle"></i> Capturing</span>';
      }
      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;
    } else {
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-badge status-stopped"><i class="fas fa-circle"></i> Stopped</span>';
      }
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }

    if (modeEl) {
      const stats = await fetchCaptureStats();
      const mode = stats?.captureMode || 'unknown';
      modeEl.textContent = `Mode: ${mode}`;
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
    console.error('[Network Tools] Fetch stats error:', error);
    return null;
  }
}

// Update packet count
function updatePacketCount() {
  try {
    const countEl = document.getElementById('packetCount');
    if (countEl) {
      countEl.textContent = filteredPackets.length;
    }
  } catch (error) {
    console.error('[Network Tools] Packet count update error:', error);
  }
}

// Add log entry
function addLogEntry(source, message, type = 'info') {
  try {
    const logEl = document.getElementById('networkToolsLog');
    if (!logEl) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${timestamp}] [${source}] ${message}`;
    
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  } catch (error) {
    console.error('[Network Tools] Log entry error:', error);
  }
}

// Clear log
function clearLog() {
  try {
    const logEl = document.getElementById('networkToolsLog');
    if (logEl) {
      logEl.innerHTML = '<div class="log-entry info">[System] Log cleared</div>';
    }
  } catch (error) {
    console.error('[Network Tools] Clear log error:', error);
  }
}
// Export functions to global scope
window.initNetworkTools = initNetworkTools;
window.startCapture = startCapture;
window.stopCapture = stopCapture;
window.clearCapture = clearCapture;
window.exportPackets = exportPackets;
window.filterPackets = filterPackets;
window.displayPacketDetails = displayPacketDetails;
