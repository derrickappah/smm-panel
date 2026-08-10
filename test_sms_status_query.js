const vasKey = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2YXNpZCI6MzIyNiwiZXhwIjoxOTU2NTI3OTk5fQ.KToP7MpSQnfpnw5NsJXNWFYmP7KjzpacxOarpnVoOM4';
const recipientPhone = '233599342940';
const senderId = 'SHM TECH';
const customRef = `ref_otp_${Date.now()}`;

async function testSmsStatusFlow() {
  console.log("=== Testing SMS Dispatch with Reference & Status Query ===");
  console.log(`Custom Ref: ${customRef}`);

  // 1. Dispatch SMS with custom ref
  try {
    const sendRes = await fetch('https://api.moolre.com/open/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': vasKey
      },
      body: JSON.stringify({
        type: 1,
        senderid: senderId,
        messages: [
          {
            recipient: recipientPhone,
            message: `BoostUp GH test code: ${Math.floor(100000 + Math.random() * 900000)}`,
            ref: customRef
          }
        ]
      })
    });
    const sendData = await sendRes.json();
    console.log("[1. SEND SMS WITH REF RESPONSE]", JSON.stringify(sendData, null, 2));
  } catch (err) {
    console.error("Send SMS Error:", err);
  }

  // Wait 2 seconds
  await new Promise(r => setTimeout(r, 2000));

  // 2. Query Status using type: 5
  try {
    const statusRes = await fetch('https://api.moolre.com/open/sms/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': vasKey
      },
      body: JSON.stringify({
        type: 5,
        ref: [customRef]
      })
    });
    const statusData = await statusRes.json();
    console.log("[2. QUERY SMS STATUS RESPONSE]", JSON.stringify(statusData, null, 2));
  } catch (err) {
    console.error("Query Status Error:", err);
  }
}

testSmsStatusFlow();
