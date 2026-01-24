import requests
import json
import time

BASE_URL = "http://localhost:3000" # Update to your local dev URL
AUTH_TOKEN = "YOUR_AUTH_TOKEN" # Update with a valid user JWT

headers = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}

def test_url_validation():
    print("Testing URL Validation...")
    payload = {
        "service_id": "84c8d551-7f9a-4c22-b9e7-f0a9967f0581", # Replace with valid UUID
        "link": "invalid-url-no-host",
        "quantity": 100,
        "total_cost": 0.50
    }
    
    response = requests.post(f"{BASE_URL}/api/order/create", headers=headers, json=payload)
    print(f"Status: {response.status_code}, Body: {response.json()}")
    if response.status_code == 400 and "Invalid URL" in response.json().get("error", ""):
        print("✅ URL Validation Passed")
    else:
        print("❌ URL Validation Failed")

def test_rate_limiting():
    print("\nTesting Rate Limiting...")
    payload = {
        "service_id": "84c8d551-7f9a-4c22-b9e7-f0a9967f0581", # Replace with valid UUID
        "link": "https://instagram.com/p/test",
        "quantity": 100,
        "total_cost": 0.50
    }
    
    for i in range(12):
        response = requests.post(f"{BASE_URL}/api/order/create", headers=headers, json=payload)
        print(f"Request {i+1}: {response.status_code}")
        if response.status_code == 429:
            print("✅ Rate Limiting Triggered")
            return
        time.sleep(1)
    
    print("❌ Rate Limiting Failed to Trigger")

if __name__ == "__main__":
    test_url_validation()
    # test_rate_limiting() # Uncomment to test rate limit (requires valid user and funds)
