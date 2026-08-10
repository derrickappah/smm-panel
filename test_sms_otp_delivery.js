const vasKey = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2YXNpZCI6MzIyNiwiZXhwIjoxOTU2NTI3OTk5fQ.KToP7MpSQnfpnw5NsJXNWFYmP7KjzpacxOarpnVoOM4';
const recipientPhone = '233599342940';
const senderId = 'SHM TECH';
const testOtp = Math.floor(100000 + Math.random() * 900000).toString();

async function sendTestSms() {
  console.log(`=== Sending Test Verification SMS ===`);
  console.log(`Recipient: ${recipientPhone}`);
  console.log(`Sender ID: ${senderId}`);
  console.log(`Generated OTP: ${testOtp}`);

  const smsPayload = {
    type: 1,
    senderid: senderId,
    messages: [
      {
        recipient: recipientPhone,
        message: `Your BoostUp GH verification code is: ${testOtp}. Valid for 10 minutes.`
      }
    ]
  };

  try {
    const res = await fetch('https://api.moolre.com/open/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': vasKey
      },
      body: JSON.stringify(smsPayload)
    });

    const data = await res.json();
    console.log('\n--- Moolre SMS Gateway Response ---');
    console.log(JSON.stringify(data, null, 2));

    if (data.status === 1 && data.code === 'SMS01') {
      console.log(`\n✅ SUCCESS: Verification SMS containing OTP [${testOtp}] dispatched to ${recipientPhone} via Moolre!`);
    } else {
      console.error(`\n❌ SMS DELIVER FAILED:`, data);
    }
  } catch (err) {
    console.error(`\n❌ Network / HTTP Error:`, err);
  }
}

sendTestSms();
