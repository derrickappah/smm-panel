import requests
import sys
import json
from datetime import datetime

class SMMPanelTester:
    def __init__(self, base_url="https://boost-social-4.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.user_token = None
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                details += f" (Expected {expected_status})"
                try:
                    error_data = response.json()
                    details += f" - {error_data.get('detail', 'No error details')}"
                except:
                    details += f" - Response: {response.text[:200]}"

            self.log_test(name, success, details)
            
            if success:
                try:
                    return response.json()
                except:
                    return {}
            return {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return {}

    def test_user_registration(self):
        """Test user registration"""
        test_user_data = {
            "email": "testuser@example.com",
            "password": "testpass123",
            "name": "Test User"
        }
        
        response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data=test_user_data
        )
        
        if response and 'token' in response:
            self.user_token = response['token']
            return True
        return False

    def test_user_login(self):
        """Test user login with existing credentials"""
        login_data = {
            "email": "user@test.com",
            "password": "user123"
        }
        
        response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data=login_data
        )
        
        if response and 'token' in response:
            self.user_token = response['token']
            return True
        return False

    def test_admin_login(self):
        """Test admin login"""
        admin_data = {
            "email": "admin@boostup.com",
            "password": "admin123"
        }
        
        response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data=admin_data
        )
        
        if response and 'token' in response:
            self.admin_token = response['token']
            return True
        return False

    def test_get_user_profile(self):
        """Test getting user profile"""
        if not self.user_token:
            self.log_test("Get User Profile", False, "No user token available")
            return False
            
        response = self.run_test(
            "Get User Profile",
            "GET",
            "auth/me",
            200,
            token=self.user_token
        )
        return bool(response)

    def test_get_services(self):
        """Test getting all services"""
        response = self.run_test(
            "Get All Services",
            "GET",
            "services",
            200
        )
        
        if response and isinstance(response, list):
            print(f"   Found {len(response)} services")
            return True
        return False

    def test_get_services_by_platform(self):
        """Test getting services by platform"""
        platforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter']
        
        for platform in platforms:
            response = self.run_test(
                f"Get {platform.title()} Services",
                "GET",
                f"services?platform={platform}",
                200
            )
            
            if response and isinstance(response, list):
                print(f"   Found {len(response)} {platform} services")

    def test_user_balance(self):
        """Test getting user balance"""
        if not self.user_token:
            self.log_test("Get User Balance", False, "No user token available")
            return False
            
        response = self.run_test(
            "Get User Balance",
            "GET",
            "user/balance",
            200,
            token=self.user_token
        )
        
        if response and 'balance' in response:
            print(f"   User balance: ${response['balance']}")
            return True
        return False

    def test_deposit_request(self):
        """Test deposit request"""
        if not self.user_token:
            self.log_test("Deposit Request", False, "No user token available")
            return False
            
        deposit_data = {"amount": 50.0}
        
        response = self.run_test(
            "Deposit Request",
            "POST",
            "user/deposit",
            200,
            data=deposit_data,
            token=self.user_token
        )
        return bool(response)

    def test_place_order(self):
        """Test placing an order"""
        if not self.user_token:
            self.log_test("Place Order", False, "No user token available")
            return False
            
        # First get services to find a valid service ID
        services_response = self.run_test(
            "Get Services for Order",
            "GET",
            "services",
            200
        )
        
        if not services_response or not isinstance(services_response, list) or len(services_response) == 0:
            self.log_test("Place Order", False, "No services available")
            return False
            
        service = services_response[0]
        order_data = {
            "service_id": service['id'],
            "link": "https://instagram.com/testprofile",
            "quantity": service['min_quantity']
        }
        
        response = self.run_test(
            "Place Order",
            "POST",
            "orders",
            200,
            data=order_data,
            token=self.user_token
        )
        return bool(response)

    def test_get_user_orders(self):
        """Test getting user orders"""
        if not self.user_token:
            self.log_test("Get User Orders", False, "No user token available")
            return False
            
        response = self.run_test(
            "Get User Orders",
            "GET",
            "orders",
            200,
            token=self.user_token
        )
        
        if response and isinstance(response, list):
            print(f"   Found {len(response)} orders")
            return True
        return False

    def test_admin_stats(self):
        """Test admin stats"""
        if not self.admin_token:
            self.log_test("Admin Stats", False, "No admin token available")
            return False
            
        response = self.run_test(
            "Admin Stats",
            "GET",
            "stats",
            200,
            token=self.admin_token
        )
        
        if response and 'total_users' in response:
            print(f"   Stats: {response}")
            return True
        return False

    def test_admin_get_users(self):
        """Test admin get all users"""
        if not self.admin_token:
            self.log_test("Admin Get Users", False, "No admin token available")
            return False
            
        response = self.run_test(
            "Admin Get Users",
            "GET",
            "admin/users",
            200,
            token=self.admin_token
        )
        
        if response and isinstance(response, list):
            print(f"   Found {len(response)} users")
            return True
        return False

    def test_admin_get_orders(self):
        """Test admin get all orders"""
        if not self.admin_token:
            self.log_test("Admin Get Orders", False, "No admin token available")
            return False
            
        response = self.run_test(
            "Admin Get Orders",
            "GET",
            "admin/orders",
            200,
            token=self.admin_token
        )
        
        if response and isinstance(response, list):
            print(f"   Found {len(response)} orders")
            return True
        return False

    def test_admin_get_deposits(self):
        """Test admin get deposits"""
        if not self.admin_token:
            self.log_test("Admin Get Deposits", False, "No admin token available")
            return False
            
        response = self.run_test(
            "Admin Get Deposits",
            "GET",
            "admin/deposits",
            200,
            token=self.admin_token
        )
        
        if response and isinstance(response, list):
            print(f"   Found {len(response)} deposits")
            return True
        return False

    def test_create_service(self):
        """Test admin create service"""
        if not self.admin_token:
            self.log_test("Create Service", False, "No admin token available")
            return False
            
        service_data = {
            "platform": "instagram",
            "service_type": "followers",
            "name": "Test Instagram Followers",
            "rate": 5.99,
            "min_quantity": 100,
            "max_quantity": 10000,
            "description": "High quality Instagram followers for testing"
        }
        
        response = self.run_test(
            "Create Service",
            "POST",
            "admin/services",
            200,
            data=service_data,
            token=self.admin_token
        )
        return bool(response)

def main():
    print("🚀 Starting SMM Panel Backend API Tests")
    print("=" * 50)
    
    tester = SMMPanelTester()
    
    # Test authentication flows
    print("\n📋 AUTHENTICATION TESTS")
    print("-" * 30)
    
    # Try existing user login first
    if not tester.test_user_login():
        # If login fails, try registration
        tester.test_user_registration()
    
    tester.test_admin_login()
    tester.test_get_user_profile()
    
    # Test service endpoints
    print("\n📋 SERVICE TESTS")
    print("-" * 30)
    tester.test_get_services()
    tester.test_get_services_by_platform()
    
    # Test user functionality
    print("\n📋 USER FUNCTIONALITY TESTS")
    print("-" * 30)
    tester.test_user_balance()
    tester.test_deposit_request()
    tester.test_place_order()
    tester.test_get_user_orders()
    
    # Test admin functionality
    print("\n📋 ADMIN FUNCTIONALITY TESTS")
    print("-" * 30)
    tester.test_admin_stats()
    tester.test_admin_get_users()
    tester.test_admin_get_orders()
    tester.test_admin_get_deposits()
    tester.test_create_service()
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 FINAL RESULTS")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    # Save detailed results
    results = {
        "timestamp": datetime.now().isoformat(),
        "summary": {
            "tests_run": tester.tests_run,
            "tests_passed": tester.tests_passed,
            "success_rate": round(tester.tests_passed/tester.tests_run*100, 1)
        },
        "test_results": tester.test_results
    }
    
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: /app/backend_test_results.json")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())