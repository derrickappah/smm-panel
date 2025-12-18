import requests
import json
import uuid

BASE_URL = "https://boost-social-4.preview.emergentagent.com/api"

def test_unauthenticated_approval():
    print("Testing unauthenticated approval...")
    data = {
        "transaction_id": str(uuid.uuid4()),
        "payment_method": "paystack"
    }
    response = requests.post(f"{BASE_URL}/approve-deposit-universal", json=data)
    print(f"Response: {response.status_code}")
    if response.status_code == 401:
        print("✅ SUCCESS: Unauthenticated request correctly blocked (401)")
    else:
        print(f"❌ FAILURE: Unauthenticated request returned {response.status_code}")

def test_unauthenticated_init():
    print("\nTesting unauthenticated initialization (Korapay)...")
    data = {
        "amount": 10,
        "reference": "test-ref",
        "customer": {"email": "test@test.com"}
    }
    response = requests.post(f"{BASE_URL}/korapay-init", json=data)
    print(f"Response: {response.status_code}")
    if response.status_code == 401:
        print("✅ SUCCESS: Unauthenticated initialization correctly blocked (401)")
    else:
        print(f"❌ FAILURE: Unauthenticated initialization returned {response.status_code}")

if __name__ == "__main__":
    try:
        test_unauthenticated_approval()
        test_unauthenticated_init()
    except Exception as e:
        print(f"Error during testing: {e}")
