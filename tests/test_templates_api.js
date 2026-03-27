// Test script to verify templates are loading properly
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const loginData = JSON.stringify({
  username: 'admin',
  password: 'admin123',
  captchaId: 'test',
  captchaAnswer: 'test'
});

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const loginResult = JSON.parse(data);
      if (loginResult.token) {
        console.log('✓ Login successful');
        testTemplates(loginResult.token);
      } else {
        console.log('✗ Login failed:', loginResult);
      }
    } catch (e) {
      console.log('Error parsing login response:', e.message);
    }
  });
});

req.on('error', (error) => {
  console.error('Login request error:', error.message);
});

req.write(loginData);
req.end();

function testTemplates(token) {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/templates',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const templates = JSON.parse(data);
        console.log('\n=== Equipment Templates Results ===\n');
        console.log(`Total templates: ${templates.length}\n`);
        
        templates.forEach((t, idx) => {
          console.log(`${idx + 1}. ${t.name}`);
          console.log(`   Type: ${t.equipment_type}`);
          console.log(`   Brand: ${t.brand || 'N/A'}`);
          console.log(`   Model: ${t.model || 'N/A'}`);
          console.log(`   Parameters: ${t.parameters ? t.parameters.length : 0}`);
          
          if (t.parameters && t.parameters.length > 0) {
            console.log('   - Parameters:');
            t.parameters.forEach(p => {
              console.log(`     • ${p.label} (${p.source}): warning=${p.warning_min}, alarm=${p.alarm_min}`);
            });
          }
          console.log('');
        });
        
        if (templates.length > 0) {
          console.log('✓ Templates loaded successfully!');
        } else {
          console.log('✗ No templates found in database');
        }
      } catch (e) {
        console.log('Error parsing templates response:', e.message);
        console.log('Response:', data.substring(0, 200));
      }
    });
  });

  req.on('error', (error) => {
    console.error('Templates request error:', error.message);
  });

  req.end();
}
