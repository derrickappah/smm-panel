const vasKey = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2YXNpZCI6MjcwMywiZXhwIjoxOTU2NTI3OTk5fQ.dS3km2zIh-Fhl8IR8oz5s_bBZJAupV3ZPxXeKxCAeM8';
const recipientPhone = '233599342940';
const senderId = 'Boostupgh';

async function runLiveMoolreTest() {
  console.log("=== Testing New Moolre API Key & Approved Sender ID ===");
  console.log("Sender ID:", senderId);

  // 1. Check Balance
  try {
    const balRes = await fetch('https://api.moolre.com/open/sms/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': vasKey
      },
      body: JSON.stringify({ type: 2 })
    });
    const balData = await balRes.json();
    console.log("[1. BALANCE RESPONSE]", JSON.stringify(balData, null, 2));
  } catch (err) {
    console.error("Balance fetch error:", err);
  }

  // 2. List Sender IDs
  try {
    const listRes = await fetch('https://api.moolre.com/open/sms/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': vasKey
      },
      body: JSON.stringify({ type: 7 })
    });
    const listData = await listRes.json();
    console.log("[2. SENDER IDS LIST RESPONSE]", JSON.stringify(listData, null, 2));
  } catch (err) {
    console.error("List Sender IDs fetch error:", err);
  }

  // 3. Send Test SMS via POST
  console.log(`\nAttempting to send SMS to ${recipientPhone} using Sender ID: "${senderId}"...`);
  try {
    const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const customRef = `ref_test_${Date.now()}`;

    const smsPayload = {
      type: 1,
      senderid: senderId,
      messages: [
        {
          recipient: recipientPhone,
          message: `Your BoostUp GH verification code is: ${testOtp}. Valid for 10 minutes.`,
          ref: customRef
        }
      ]
    };

    const sendRes = await fetch('https://api.moolre.com/open/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': vasKey
      },
      body: JSON.stringify(smsPayload)
    });
    const sendData = await sendRes.json();
    console.log("[3. SEND SMS RESPONSE]", JSON.stringify(sendData, null, 2));
  } catch (err) {
    console.error("Send SMS error:", err);
  }
}

runLiveMoolreTest();
