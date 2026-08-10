const vasKey = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2YXNpZCI6MzIyNiwiZXhwIjoxOTU2NTI3OTk5fQ.KToP7MpSQnfpnw5NsJXNWFYmP7KjzpacxOarpnVoOM4';
const recipientPhone = '233599342940';

async function runLiveMoolreTest() {
  console.log("=== Testing Moolre API Live ===");

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
  let registeredSenderId = 'BoostUpGH';
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

    if (listData.status === 1 && Array.isArray(listData.data) && listData.data.length > 0) {
      const approved = listData.data.find(item => item.approval === 'Approved');
      if (approved) {
        registeredSenderId = approved.senderid;
        console.log(`Using approved Sender ID from account: "${registeredSenderId}"`);
      } else {
        console.log(`No approved Sender ID found in list. First Sender ID is "${listData.data[0].senderid}" (${listData.data[0].approval})`);
        registeredSenderId = listData.data[0].senderid;
      }
    }
  } catch (err) {
    console.error("List Sender IDs fetch error:", err);
  }

  // 3. Send Test SMS via POST
  console.log(`\nAttempting to send SMS to ${recipientPhone} using Sender ID: "${registeredSenderId}"...`);
  try {
    const smsPayload = {
      type: 1,
      senderid: registeredSenderId,
      messages: [
        {
          recipient: recipientPhone,
          message: "Your BoostUp GH verification code is: 123456. Valid for 10 minutes."
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
    console.log("[3. SEND SMS (POST) RESPONSE]", JSON.stringify(sendData, null, 2));
  } catch (err) {
    console.error("Send SMS error:", err);
  }
}

runLiveMoolreTest();
