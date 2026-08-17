import assert from 'assert';

function parseHubtelStatusResponse(hubtelVerifiedData, transactionAmount) {
    let verifiedStatus = null;
    let verifiedAmount = 0;
    let verifiedTransactionId = null;

    if (hubtelVerifiedData) {
        let apiData = hubtelVerifiedData.data || hubtelVerifiedData.Data || hubtelVerifiedData;
        if (Array.isArray(apiData) && apiData.length > 0) {
            apiData = apiData[0];
        }

        verifiedStatus = apiData.TransactionStatus || apiData.InvoiceStatus || apiData.status || apiData.Status || hubtelVerifiedData.status || hubtelVerifiedData.Status;
        verifiedAmount = parseFloat(apiData.AmountAfterFees || apiData.TransactionAmount || apiData.amount || apiData.Amount || apiData.amountPaid || apiData.AmountPaid || 0);
        verifiedTransactionId = apiData.transactionId || apiData.TransactionId || apiData.checkoutId || apiData.CheckoutId || apiData.InvoiceToken || hubtelVerifiedData.transactionId || hubtelVerifiedData.TransactionId;

        const responseCode = hubtelVerifiedData.responseCode || hubtelVerifiedData.ResponseCode;

        const statusMatches = (
            verifiedStatus === 'Paid' || 
            verifiedStatus === 'Success' || 
            apiData.isSuccessful === true ||
            (responseCode === '0000' && verifiedStatus && verifiedStatus !== 'Unpaid' && verifiedStatus !== 'Failed')
        );

        const expectedAmount = parseFloat(transactionAmount);
        const amountMatches = verifiedAmount >= expectedAmount * 0.99;

        if (statusMatches && amountMatches) {
            return {
                isConfirmed: true,
                verifiedStatus,
                verifiedAmount,
                verifiedTransactionId
            };
        }
    }

    return {
        isConfirmed: false,
        verifiedStatus,
        verifiedAmount,
        verifiedTransactionId
    };
}

// 1. Test real Hubtel RMSC Status response from Vodafone Cash payment
const rmscVodafonePayload = {
    ResponseCode: "0000",
    Data: [
        {
            CheckoutId: "e64690ab4ff849b4824e8d035cbe84e6",
            InvoiceStatus: "Success",
            TransactionStatus: "Success",
            PaymentMethod: "MOBILE-MONEY",
            TransactionId: "e64690ab4ff849b4824e8d035cbe84e6",
            AmountAfterFees: 15,
            ClientReference: "da30373cfab24b1483fa184fea1fbaa8",
            TransactionAmount: 15.5,
            ProviderResponseCode: "SUCCESS"
        }
    ]
};

const result1 = parseHubtelStatusResponse(rmscVodafonePayload, 15.00);
assert.strictEqual(result1.isConfirmed, true, "Real Hubtel Vodafone payment should be confirmed");
assert.strictEqual(result1.verifiedStatus, "Success");
assert.strictEqual(result1.verifiedAmount, 15);
assert.strictEqual(result1.verifiedTransactionId, "e64690ab4ff849b4824e8d035cbe84e6");
console.log("✅ Test 1: Real Hubtel RMSC Vodafone Cash payload parsed and confirmed successfully.");

// 2. Test real Hubtel RMSC Status response from MTN Mobile Money payment
const rmscMtnPayload = {
    ResponseCode: "0000",
    Data: [
        {
            CheckoutId: "f14e7ace7eed46daaca3df3675a3e215",
            InvoiceStatus: "Success",
            TransactionStatus: "Success",
            PaymentMethod: "MOBILE-MONEY",
            TransactionId: "f14e7ace7eed46daaca3df3675a3e215",
            AmountAfterFees: 20,
            ClientReference: "20a11b1c3869409dbe518ca55250c47a",
            TransactionAmount: 20.5,
            ProviderResponseCode: "SUCCESSFUL"
        }
    ]
};

const result2 = parseHubtelStatusResponse(rmscMtnPayload, 20.00);
assert.strictEqual(result2.isConfirmed, true, "Real Hubtel MTN payment should be confirmed");
assert.strictEqual(result2.verifiedStatus, "Success");
assert.strictEqual(result2.verifiedAmount, 20);
console.log("✅ Test 2: Real Hubtel RMSC MTN Mobile Money payload parsed and confirmed successfully.");

// 3. Test failed or unpaid status from Hubtel
const rmscFailedPayload = {
    ResponseCode: "2001",
    Data: [
        {
            CheckoutId: "fail_checkout_123",
            InvoiceStatus: "Failed",
            TransactionStatus: "Failed",
            AmountAfterFees: 0,
            TransactionAmount: 15.5
        }
    ]
};

const result3 = parseHubtelStatusResponse(rmscFailedPayload, 15.00);
assert.strictEqual(result3.isConfirmed, false, "Failed Hubtel payment should NOT be confirmed");
console.log("✅ Test 3: Failed Hubtel status rejected correctly.");

// 4. Test amount mismatch
const result4 = parseHubtelStatusResponse(rmscVodafonePayload, 100.00);
assert.strictEqual(result4.isConfirmed, false, "Amount mismatch should NOT be confirmed");
console.log("✅ Test 4: Amount mismatch rejected correctly.");

console.log("\n🎉 ALL UNIT TESTS PASSED!");
