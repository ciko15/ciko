const { execFile } = require('child_process');
const ping = require('ping');

async function testSystemPing(host) {
  return new Promise((resolve) => {
    const cmd = 'ping';
    const args = ['-c', '1', host];
    
    console.log('\n[TEST] Starting system ping...');
    console.log('[TEST] Command:', cmd, args.join(' '));
    
    const startTime = Date.now();
    execFile(cmd, args, { timeout: 12000 }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      console.log('[TEST] Completed in', duration, 'ms');
      console.log('[TEST] Exit code:', error ? error.code : 0);
      console.log('[TEST] Stdout:', stdout.substring(0, 200));
      if (stderr) console.log('[TEST] Stderr:', stderr);
      console.log('[TEST] Error message:', error ? error.message : 'None');
      
      if (error && error.code !== 0) {
        resolve({ alive: false, method: 'system', error: error.message });
        return;
      }
      
      const match = stdout.match(/time[<=]+(\d+(?:\.\d+)?)\s*ms/i);
      const rtt = match ? parseFloat(match[1]) : null;
      
      resolve({ alive: true, method: 'system', time: rtt });
    });
  });
}

async function testLibraryPing(host) {
  return new Promise((resolve) => {
    console.log('\n[TEST] Starting library ping...');
    const startTime = Date.now();
    
    ping.promise.probe(host, { timeout: 4, extra: ['-c', '1'] })
      .then(res => {
        const duration = Date.now() - startTime;
        console.log('[TEST] Completed in', duration, 'ms');
        console.log('[TEST] Result:', JSON.stringify(res, null, 2));
        resolve({ alive: res.alive, method: 'library', time: res.time });
      })
      .catch(err => {
        const duration = Date.now() - startTime;
        console.log('[TEST] Completed in', duration, 'ms');
        console.log('[TEST] Error:', err.message);
        resolve({ alive: false, method: 'library', error: err.message });
      });
  });
}

(async () => {
  const host = '192.168.1.103';
  console.log('====================================');
  console.log('PING TROUBLESHOOTING TEST');
  console.log('Target:', host);
  console.log('====================================');

  const systemResult = await testSystemPing(host);
  console.log('\n[RESULT] System Ping:', JSON.stringify(systemResult, null, 2));

  const libraryResult = await testLibraryPing(host);
  console.log('\n[RESULT] Library Ping:', JSON.stringify(libraryResult, null, 2));

  console.log('\n====================================');
  console.log('SUMMARY:');
  console.log('System ping:', systemResult.alive ? '✅ SUCCESS' : '❌ FAILED');
  if (systemResult.time) console.log('  RTT:', systemResult.time, 'ms');
  if (systemResult.error) console.log('  Error:', systemResult.error);
  console.log('Library ping:', libraryResult.alive ? '✅ SUCCESS' : '❌ FAILED');
  if (libraryResult.time) console.log('  RTT:', libraryResult.time, 'ms');
  if (libraryResult.error) console.log('  Error:', libraryResult.error);
  console.log('====================================\n');

  process.exit(0);
})();
