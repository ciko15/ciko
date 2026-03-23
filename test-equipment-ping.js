const { execFile } = require('child_process');
const ping = require('ping');

// Import functions from server
const path = require('path');

/**
 * Wrapper untuk ping yang lebih robust
 */
async function securePing(host, timeout = 10) {
  return new Promise((resolve) => {
    systemPing(host, timeout).then(result => {
      if (result.success || result.alive) {
        resolve(result);
      } else {
        try {
          const probePromise = ping.promise.probe(host, { 
            timeout: 4,
            extra: ['-c', '1']
          });
          
          const timeoutHandle = setTimeout(() => {
            resolve({
              success: false,
              alive: false,
              error: 'Ping timeout (library)'
            });
          }, timeout * 1000);
          
          probePromise.then(res => {
            clearTimeout(timeoutHandle);
            resolve({
              success: true,
              alive: res.alive,
              time: res.time,
              error: null
            });
          }).catch(err => {
            clearTimeout(timeoutHandle);
            resolve({
              success: false,
              alive: false,
              error: `Both methods failed: ${err.message}`
            });
          });
        } catch (err) {
          resolve(result);
        }
      }
    }).catch(err => {
      resolve({
        success: false,
        alive: false,
        error: `System ping error: ${err.message}`
      });
    });
  });
}

function systemPing(host, timeout = 10) {
  return new Promise((resolve) => {
    try {
      const isWindows = process.platform === 'win32';
      const cmd = isWindows ? 'ping' : 'ping';
      const args = isWindows 
        ? ['-n', '1', '-w', `${timeout * 1000}`, host] 
        : ['-c', '1', '-W', `${timeout * 1000}`, host];
      
      const child = execFile(cmd, args, { timeout: timeout * 1000 + 1000 }, (error, stdout, stderr) => {
        try {
          if (error && error.killed) {
            resolve({
              success: false,
              alive: false,
              error: 'Ping timeout'
            });
            return;
          }
          
          if (error && error.code !== 0) {
            resolve({
              success: false,
              alive: false,
              error: `Host unreachable (code: ${error.code})`
            });
            return;
          }
          
          let rtt = null;
          if (isWindows) {
            const match = stdout.match(/time[<=]+(\d+)ms/i);
            rtt = match ? parseInt(match[1]) : null;
          } else {
            const match = stdout.match(/time[<=]+(\d+(?:\.\d+)?)\s*ms/i);
            rtt = match ? parseFloat(match[1]) : null;
          }
          
          resolve({
            success: true,
            alive: true,
            time: rtt,
            error: null
          });
        } catch (parseErr) {
          resolve({
            success: false,
            alive: false,
            error: `Parse error: ${parseErr.message}`
          });
        }
      });
    } catch (err) {
      resolve({
        success: false,
        alive: false,
        error: `Exec error: ${err.message}`
      });
    }
  });
}

// Test
(async () => {
  console.log('\n=== TESTING SECUREPING FIX ===\n');
  
  const result = await securePing('192.168.1.103', 15);
  
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('\n✅ If alive=true above, the fix is working!');
  
  // Simulate equipment ping response
  if (result.alive) {
    console.log('\n=== EQUIPMENT PING RESPONSE ===\n');
    const equipmentResponse = {
      success: true,
      equipmentId: 1,
      equipmentName: 'Sample Equipment',
      ip: '192.168.1.103',
      status: 'reachable',
      minRtt: result.time,
      maxRtt: result.time,
      avgRtt: result.time,
      packetLoss: 0,
      responseTime: result.time,
      timestamp: new Date().toISOString()
    };
    console.log(JSON.stringify(equipmentResponse, null, 2));
  }
  
  process.exit(0);
})();
