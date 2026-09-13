const clientId = 'jgunjnfo';
const clientSecret = 'nmmixfrh';
const senderId = 'Boostupgh';
const recipientPhone = '233599342940';
const testOtp = Math.floor(100000 + Math.random() * 900000).toString();

async function testNewHubtelCredentials() {
  console.log("=== Testing New Hubtel Credentials & Endpoint ===");
  console.log("Client ID:", clientId);
  console.log("Sender ID:", senderId);
  console.log("Recipient:", recipientPhone);

  // 1. JSON POST with Basic Auth to smsc.hubtel.com
  console.log("\n[1] Testing JSON POST to https://smsc.hubtel.com/v1/messages/send...");
  try {
    const authHeaderValue = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const postPayload = {
      From: senderId,
      To: recipientPhone,
      Content: `Your BoostUp GH verification code via Hubtel is: ${testOtp}.`
    };

    const postRes = await fetch('https://smsc.hubtel.com/v1/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeaderValue
      },
      body: JSON.stringify(postPayload)
    });

    const postData = await postRes.json();
    console.log("POST Response:", JSON.stringify(postData, null, 2));

    if (postRes.ok && (postData.status === 0 || postData.messageId)) {
      console.log("✅ Hubtel JSON POST SMS Dispatch Successful!");
    } else {
      console.warn("⚠️ Hubtel JSON POST response:", postData);
    }
  } catch (err) {
    console.error("POST Error:", err);
  }

  // 2. HTTP GET to smsc.hubtel.com
  console.log("\n[2] Testing HTTP GET to https://smsc.hubtel.com/v1/messages/send...");
  try {
    const getUrl = `https://smsc.hubtel.com/v1/messages/send?clientid=${encodeURIComponent(clientId)}&clientsecret=${encodeURIComponent(clientSecret)}&from=${encodeURIComponent(senderId)}&to=${encodeURIComponent(recipientPhone)}&content=${encodeURIComponent(`Test SMS via Hubtel GET: ${testOtp}`)}`;

    const getRes = await fetch(getUrl, { method: 'GET' });
    const getData = await getRes.json();
    console.log("GET Response:", JSON.stringify(getData, null, 2));

    if (getRes.ok && (getData.status === 0 || getData.messageId)) {
      console.log("✅ Hubtel GET SMS Dispatch Successful!");
    } else {
      console.warn("⚠️ Hubtel GET response:", getData);
    }
  } catch (err) {
    console.error("GET Error:", err);
  }
}

testNewHubtelCredentials();
