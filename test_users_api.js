
async function testCreateUser() {
  const newUser = {
    username: 'testuser_' + Date.now(),
    password: 'password123',
    name: 'Test User',
    role: 'user_cabang',
    branchId: null
  };

  try {
    const response = await fetch('http://localhost:3100/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // We need a token. I'll use the admin token if possible, but for now I'll just check if it returns 401 or 400.
      },
      body: JSON.stringify(newUser)
    });

    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCreateUser();
