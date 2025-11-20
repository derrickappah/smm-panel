from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# ==================== MODELS ====================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    balance: float = 0.0
    role: str = "user"  # user or admin
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Service(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    platform: str  # instagram, tiktok, youtube, facebook, twitter
    service_type: str  # followers, likes, views, comments, subscribers
    name: str
    rate: float  # price per 1000
    min_quantity: int
    max_quantity: int
    description: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ServiceCreate(BaseModel):
    platform: str
    service_type: str
    name: str
    rate: float
    min_quantity: int
    max_quantity: int
    description: str

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    service_id: str
    link: str
    quantity: int
    total_cost: float
    status: str = "pending"  # pending, processing, completed, cancelled
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None

class OrderCreate(BaseModel):
    service_id: str
    link: str
    quantity: int

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: float
    type: str  # deposit or order
    status: str  # pending, approved, rejected
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class DepositRequest(BaseModel):
    amount: float

# ==================== AUTH UTILITIES ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        'user_id': user_id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('user_id')
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        email=user_data.email,
        name=user_data.name
    )
    user_dict = user.model_dump()
    user_dict['password_hash'] = hash_password(user_data.password)
    
    await db.users.insert_one(user_dict)
    
    token = create_token(user.id)
    return {"token": token, "user": user}

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user['id'])
    user_data = User(**user)
    return {"token": token, "user": user_data}

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    return User(**current_user)

# ==================== SERVICE ROUTES ====================

@api_router.get("/services", response_model=List[Service])
async def get_services(platform: Optional[str] = None):
    query = {"platform": platform} if platform else {}
    services = await db.services.find(query, {"_id": 0}).to_list(1000)
    return services

@api_router.post("/admin/services", response_model=Service)
async def create_service(service_data: ServiceCreate, admin: dict = Depends(get_admin_user)):
    service = Service(**service_data.model_dump())
    await db.services.insert_one(service.model_dump())
    return service

# ==================== ORDER ROUTES ====================

@api_router.post("/orders", response_model=Order)
async def create_order(order_data: OrderCreate, current_user: dict = Depends(get_current_user)):
    # Get service
    service = await db.services.find_one({"id": order_data.service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    # Validate quantity
    if order_data.quantity < service['min_quantity'] or order_data.quantity > service['max_quantity']:
        raise HTTPException(
            status_code=400,
            detail=f"Quantity must be between {service['min_quantity']} and {service['max_quantity']}"
        )
    
    # Calculate cost
    total_cost = (order_data.quantity / 1000) * service['rate']
    
    # Check balance
    if current_user['balance'] < total_cost:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Create order
    order = Order(
        user_id=current_user['id'],
        service_id=order_data.service_id,
        link=order_data.link,
        quantity=order_data.quantity,
        total_cost=total_cost
    )
    
    # Deduct balance
    await db.users.update_one(
        {"id": current_user['id']},
        {"$inc": {"balance": -total_cost}}
    )
    
    await db.orders.insert_one(order.model_dump())
    return order

@api_router.get("/orders", response_model=List[Order])
async def get_user_orders(current_user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"user_id": current_user['id']}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders

@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "user_id": current_user['id']}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

# ==================== USER ROUTES ====================

@api_router.get("/user/balance")
async def get_balance(current_user: dict = Depends(get_current_user)):
    return {"balance": current_user['balance']}

@api_router.post("/user/deposit")
async def request_deposit(deposit: DepositRequest, current_user: dict = Depends(get_current_user)):
    if deposit.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    transaction = Transaction(
        user_id=current_user['id'],
        amount=deposit.amount,
        type="deposit",
        status="pending"
    )
    
    await db.transactions.insert_one(transaction.model_dump())
    return {"message": "Deposit request submitted. Waiting for admin approval.", "transaction": transaction}

# ==================== ADMIN ROUTES ====================

@api_router.get("/admin/users", response_model=List[User])
async def get_all_users(admin: dict = Depends(get_admin_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.get("/admin/orders", response_model=List[Order])
async def get_all_orders(admin: dict = Depends(get_admin_user)):
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders

@api_router.put("/admin/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, admin: dict = Depends(get_admin_user)):
    if status not in ["pending", "processing", "completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    update_data = {"status": status}
    if status == "completed":
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.orders.update_one({"id": order_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": "Order status updated"}

@api_router.get("/admin/deposits", response_model=List[Transaction])
async def get_deposits(admin: dict = Depends(get_admin_user)):
    deposits = await db.transactions.find({"type": "deposit"}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return deposits

@api_router.put("/admin/deposits/{transaction_id}")
async def approve_deposit(transaction_id: str, action: str, admin: dict = Depends(get_admin_user)):
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    transaction = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction['status'] != "pending":
        raise HTTPException(status_code=400, detail="Transaction already processed")
    
    new_status = "approved" if action == "approve" else "rejected"
    await db.transactions.update_one({"id": transaction_id}, {"$set": {"status": new_status}})
    
    # Add balance if approved
    if action == "approve":
        await db.users.update_one(
            {"id": transaction['user_id']},
            {"$inc": {"balance": transaction['amount']}}
        )
    
    return {"message": f"Deposit {new_status}"}

@api_router.get("/stats")
async def get_stats(admin: dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({})
    total_orders = await db.orders.count_documents({})
    pending_deposits = await db.transactions.count_documents({"type": "deposit", "status": "pending"})
    
    return {
        "total_users": total_users,
        "total_orders": total_orders,
        "pending_deposits": pending_deposits
    }

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()