const key1 = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2YXNpZCI6MzIyNiwiZXhwIjoxOTU2NTI3OTk5fQ.KToP7MpSQnfpnw5NsJXNWFYmP7KjzpacxOarpnVoOM4';
const recipientPhone = '233599342940';

async function testKey1WithShmTech() {
  console.log("=== Testing Key 1 with Sender ID SHM TECH ===");
  try {
    const res = await fetch('https://api.moolre.com/open/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': key1
      },
      body: JSON.stringify({
        type: 1,
        senderid: 'SHM TECH',
        messages: [{ recipient: recipientPhone, message: `Your BoostUp GH verification code is: ${Math.floor(100000 + Math.random() * 900000)}.` }]
      })
    });
    const data = await res.json();
    console.log("Key 1 (SHM TECH) Response:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}

testKey1WithShmTech();
