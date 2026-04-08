// Network Packet Sniffer
// Captures and processes real network packets

const { spawn, exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const networkMonitor = require('./monitor');

class PacketSniffer {
  constructor() {
    this.isActive = false;
    this.packets = [];
    this.captureInterval = null;
    this.captureMode = 'unknown';
    this.tcpdumpProcess = null;
    this.tcpdumpAvailable = null;
    this.tsharkProcess = null;
    this.tsharkAvailable = null;
    this.packetCounter = 0;
    this.currentInterface = null;
    this.lastError = null;
  }

  async isTcpdumpAvailable() {
    if (this.tcpdumpAvailable !== null) return this.tcpdumpAvailable;
    try {
      const { stdout } = await execPromise('command -v tcpdump');
      this.tcpdumpAvailable = !!stdout.trim();
    } catch (error) {
      this.tcpdumpAvailable = false;
    }
    return this.tcpdumpAvailable;
  }

  async isTsharkAvailable() {
    if (this.tsharkAvailable !== null) return this.tsharkAvailable;
    try {
      const { stdout } = await execPromise('command -v tshark');
      this.tsharkAvailable = !!stdout.trim();
    } catch (error) {
      this.tsharkAvailable = false;
    }
    return this.tsharkAvailable;
  }

  async start(interfaceName = null) {
    if (this.isActive) return;

    this.isActive = true;
    this.packets = [];
    this.packetCounter = 0;
    
    // Choose a better default than 'any' for macOS
    if ((!interfaceName || interfaceName === 'any' || interfaceName === '') && process.platform === 'darwin') {
      this.currentInterface = 'en0'; // Primary choice for Mac
    } else {
      this.currentInterface = interfaceName || 'en0'; // Fallback to en0 if nothing provided
    }
    
    console.log(`[Packet Sniffer] Using interface: ${this.currentInterface}`);
    this.lastError = null;

    // Prioritize real tools (tshark/tcpdump) if available
    const tsharkAvailable = await this.isTsharkAvailable();
    const tcpdumpAvailable = await this.isTcpdumpAvailable();

    if (tsharkAvailable) {
      console.log(`[Packet Sniffer] Starting real capture using Tshark on ${this.currentInterface}`);
      this.captureMode = 'tshark';
      this.startTsharkCapture(this.currentInterface);
    } else if (tcpdumpAvailable) {
      console.log(`[Packet Sniffer] Starting real capture using Tcpdump on ${this.currentInterface}`);
      this.captureMode = 'tcpdump';
      this.startTcpdumpCapture(this.currentInterface);
    } else {
      console.log(`[Packet Sniffer] No capture tools found (tshark/tcpdump). Real capture is not possible.`);
      this.captureMode = 'none';
      this.isActive = false;
    }
  }

  startTcpdumpCapture(interfaceName) {
    try {
      const args = ['-l', '-n', '-i', interfaceName, '-s', '0'];
      this.tcpdumpProcess = spawn('tcpdump', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let buffer = '';
      this.tcpdumpProcess.stdout.setEncoding('utf8');

      this.tcpdumpProcess.stdout.on('data', chunk => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          const packet = this.parseTcpdumpLine(line, interfaceName);
          if (packet) {
            this.packets.push(packet);
            if (this.packets.length > 1000) {
              this.packets.shift();
            }
          }
        }
      });

      this.tcpdumpProcess.stderr.setEncoding('utf8');
      this.tcpdumpProcess.stderr.on('data', data => {
        const errorMsg = data.toString().trim();
        console.warn('[Packet Sniffer] tcpdump:', errorMsg);
        if (!this.lastError) {
          this.lastError = errorMsg;
        } else if (!this.lastError.includes(errorMsg)) {
          this.lastError += '\n' + errorMsg;
        }
      });

      this.tcpdumpProcess.on('close', code => {
        console.log('[Packet Sniffer] tcpdump exited with code', code);
        this.tcpdumpProcess = null;
        this.isActive = false;
      });

      this.tcpdumpProcess.on('error', error => {
        console.error('[Packet Sniffer] tcpdump error:', error.message);
        this.tcpdumpProcess = null;
        this.isActive = false;
      });
    } catch (error) {
      console.error('[Packet Sniffer] Failed to start tcpdump:', error);
      this.isActive = false;
    }
  }

  parseTcpdumpLine(line, interfaceName) {
    try {
      const now = Date.now() / 1000;
      const packet = {
        number: ++this.packetCounter,
        time: now,
        interface: interfaceName || 'any',
        source: 'unknown',
        destination: 'unknown',
        protocol: 'UNKNOWN',
        length: 0,
        info: line,
        direction: 'in',
        rawData: ''
      };

      const match = line.match(/^(\d{2}:\d{2}:\d{2}\.\d+)\s+(\S+)\s+(.+?)\s+>\s+(.+?):\s*(.*)$/);
      if (match) {
        packet.protocol = match[2];
        packet.source = match[3];
        packet.destination = match[4];
        packet.info = match[5];
      }

      const lengthMatch = line.match(/length\s+(\d+)/);
      if (lengthMatch) {
        packet.length = parseInt(lengthMatch[1], 10);
      }

      if (packet.protocol) {
        packet.protocol = packet.protocol.toUpperCase();
      }

      return packet;
    } catch (error) {
      console.error('[Packet Sniffer] Parse line error:', error);
      return null;
    }
  }

  stopTcpdump() {
    if (this.tcpdumpProcess) {
      this.tcpdumpProcess.kill('SIGINT');
      this.tcpdumpProcess = null;
    }
  }

  startTsharkCapture(interfaceName) {
    try {
      const args = ['-l', '-n', '-i', interfaceName, '-T', 'json'];
      this.tsharkProcess = spawn('tshark', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let buffer = '';
      let braceDepth = 0;
      let currentObject = '';

      this.tsharkProcess.stdout.setEncoding('utf8');

      this.tsharkProcess.stdout.on('data', chunk => {
        buffer += chunk;
        
        // Faster parsing: find JSON objects by looking for complete { ... } patterns
        // Note: tshark -T json outputs a single array [ {obj}, {obj} ]
        // We can split by '}\n  ,' or '}\n]' or similar
        
        let startIdx = buffer.indexOf('{');
        while (startIdx !== -1) {
            // Find the potential end of the object
            // This is a simplification but much faster than character loop
            // In tshark -T json, objects are nicely formatted with newlines
            let endIdx = buffer.indexOf('}\n', startIdx);
            if (endIdx === -1) break; // Incomplete object
            
            const potentialJson = buffer.substring(startIdx, endIdx + 1);
            try {
                const obj = JSON.parse(potentialJson);
                const packet = this.parseTsharkJsonPacket(obj, interfaceName);
                if (packet) {
                    this.packets.push(packet);
                    if (this.packets.length > 1000) this.packets.shift();
                }
                buffer = buffer.substring(endIdx + 1);
                startIdx = buffer.indexOf('{');
            } catch (err) {
                // If it wasn't valid JSON, maybe the } wasn't the real end
                // We search for the next possible }
                startIdx = buffer.indexOf('{', startIdx + 1);
            }
        }
        
        // Prevent buffer from growing indefinitely if we can't find valid JSON
        if (buffer.length > 50000) {
            const lastStart = buffer.lastIndexOf('{');
            buffer = lastStart !== -1 ? buffer.substring(lastStart) : '';
        }
      });

      this.tsharkProcess.stderr.setEncoding('utf8');
      this.tsharkProcess.stderr.on('data', data => {
        const errorMsg = data.toString().trim();
        console.warn('[Packet Sniffer] tshark stderr:', errorMsg);
        
        // Filter out informational messages that aren't real errors
        const isInfo = errorMsg.includes('Capturing on') || 
                      errorMsg.match(/^\d+ packets captured$/i) ||
                      errorMsg.includes('Packets captured:');
        
        if (!isInfo) {
          if (!this.lastError) {
            this.lastError = errorMsg;
          } else if (!this.lastError.includes(errorMsg)) {
            this.lastError += '\n' + errorMsg;
          }
        }
      });

      this.tsharkProcess.on('close', code => {
        console.log('[Packet Sniffer] tshark exited with code', code);
        this.tsharkProcess = null;
        this.isActive = false;
      });

      this.tsharkProcess.on('error', error => {
        console.error('[Packet Sniffer] tshark error:', error.message);
        this.tsharkProcess = null;
        this.isActive = false;
      });
    } catch (error) {
      console.error('[Packet Sniffer] Failed to start tshark:', error);
      this.isActive = false;
    }
  }

  stopTshark() {
    if (this.tsharkProcess) {
      this.tsharkProcess.kill('SIGINT');
      this.tsharkProcess = null;
    }
  }

  parseTsharkJsonPacket(obj, interfaceName) {
    try {
      const layers = obj._source?.layers;
      if (!layers) return null;

      const packet = {
        number: ++this.packetCounter,
        time: Date.now() / 1000,
        interface: interfaceName || 'any',
        source: 'unknown',
        destination: 'unknown',
        protocol: 'UNKNOWN',
        length: 0,
        info: '',
        direction: 'in',
        rawData: ''
      };

      if (layers.frame) {
        packet.time = parseFloat(layers.frame['frame.time_epoch'] || packet.time);
        packet.length = parseInt(layers.frame['frame.len'] || packet.length, 10) || packet.length;
      }

      if (layers.ip) {
        packet.source = layers.ip['ip.src'] || packet.source;
        packet.destination = layers.ip['ip.dst'] || packet.destination;
        packet.protocol = layers.ip['ip.proto'] || packet.protocol;
      }

      if (layers.tcp) {
        packet.protocol = 'TCP';
        packet.info = layers.tcp['tcp.analysis'] || layers.tcp['tcp.flags'] || '';
      } else if (layers.udp) {
        packet.protocol = 'UDP';
        packet.info = layers.udp['udp.length'] || '';
      } else if (layers.icmp) {
        packet.protocol = 'ICMP';
      }

      if (!packet.info) {
        packet.info = obj._source?.layers?.frame?.['frame.marked'] || '';
      }

      return packet;
    } catch (error) {
      console.error('[Packet Sniffer] Parse tshark packet error:', error);
      return null;
    }
  }

  stop() {
    if (!this.isActive) return;

    this.isActive = false;

    this.stopTcpdump();
    this.stopTshark();

    networkMonitor.stopCapturing();
    console.log('[Packet Sniffer] Stopped - total packets:', this.packets.length);
  }

  getPackets(filter = {}) {
    let result = [...this.packets];

    if (filter.protocol) {
      result = result.filter(p => p.protocol === filter.protocol);
    }

    if (filter.source) {
      result = result.filter(p => p.source.includes(filter.source));
    }

    if (filter.destination) {
      result = result.filter(p => p.destination.includes(filter.destination));
    }

    if (filter.interface) {
      result = result.filter(p => p.interface === filter.interface);
    }

    return result.slice(-500);
  }

  getStatistics() {
    const stats = {
      totalPackets: this.packets.length,
      isCapturing: this.isActive,
      protocolDistribution: {},
      interfaceDistribution: {},
      bytesTransferred: 0
    };

    for (const packet of this.packets) {
      stats.protocolDistribution[packet.protocol] = (stats.protocolDistribution[packet.protocol] || 0) + 1;
      stats.interfaceDistribution[packet.interface] = (stats.interfaceDistribution[packet.interface] || 0) + 1;
      stats.bytesTransferred += packet.length;
    }

    stats.captureMode = this.captureMode;
    stats.lastError = this.lastError;
    return stats;
  }

  clear() {
    this.packets = [];
    console.log('[Packet Sniffer] Packets cleared');
  }

  export(format = 'json') {
    if (format === 'json') {
      return {
        timestamp: new Date().toISOString(),
        totalPackets: this.packets.length,
        isCapturing: this.isActive,
        packets: this.packets
      };
    }

    let csv = 'No.,Time,Interface,Source,Destination,Protocol,Length,Direction,Info\n';
    for (const packet of this.packets) {
      csv += `${packet.number},${packet.time},${packet.interface},${packet.source},${packet.destination},${packet.protocol},${packet.length},${packet.direction},${packet.info}\n`;
    }
    return csv;
  }

  getPacketDetails(packetNumber) {
    const packet = this.packets.find(p => p.number === packetNumber);
    if (!packet) return null;

    return {
      ...packet,
      details: {
        frame: {
          number: packet.number,
          time: new Date(packet.time * 1000).toISOString(),
          length: packet.length,
          interface: packet.interface
        },
        network: {
          sourceIP: packet.source,
          destinationIP: packet.destination,
          protocol: packet.protocol
        },
        traffic: {
          direction: packet.direction,
          rate: packet.rate?.toFixed(2) + ' KB/s',
          info: packet.info
        }
      }
    };
  }
}

module.exports = new PacketSniffer();
