const vasKey = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2YXNpZCI6MjcwMywiZXhwIjoxOTU2NTI3OTk5fQ.dS3km2zIh-Fhl8IR8oz5s_bBZJAupV3ZPxXeKxCAeM8';
const recipientPhone = '233596599174';
const senderId = 'Boostupgh';
const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
const customRef = `ref_otp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

async function sendTestSms() {
  console.log(`=== Sending Test Verification SMS ===`);
  console.log(`Recipient: ${recipientPhone}`);
  console.log(`Sender ID: ${senderId}`);
  console.log(`Generated OTP: ${testOtp}`);
  console.log(`SMS Ref: ${customRef}`);

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
      console.log(`\n✅ SUCCESS: Verification SMS containing OTP [${testOtp}] dispatched to ${recipientPhone} via Moolre with Sender ID "${senderId}"!`);
    } else {
      console.error(`\n❌ SMS DELIVERY FAILED:`, data);
    }
  } catch (err) {
    console.error(`\n❌ Network / HTTP Error:`, err);
  }
}

sendTestSms();
