import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
import uuid
from datetime import datetime, timezone
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def seed_database():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    print("🌱 Seeding database...")
    
    # Create admin user
    admin_exists = await db.users.find_one({"email": "admin@boostup.com"})
    if not admin_exists:
        admin_password = bcrypt.hashpw("admin123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        admin_user = {
            "id": str(uuid.uuid4()),
            "email": "admin@boostup.com",
            "name": "Admin User",
            "password_hash": admin_password,
            "balance": 1000.0,
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        print("✅ Admin user created (email: admin@boostup.com, password: admin123)")
    else:
        print("ℹ️  Admin user already exists")
    
    # Create test user
    user_exists = await db.users.find_one({"email": "user@test.com"})
    if not user_exists:
        user_password = bcrypt.hashpw("user123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        test_user = {
            "id": str(uuid.uuid4()),
            "email": "user@test.com",
            "name": "Test User",
            "password_hash": user_password,
            "balance": 100.0,
            "role": "user",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(test_user)
        print("✅ Test user created (email: user@test.com, password: user123)")
    else:
        print("ℹ️  Test user already exists")
    
    # Create sample services
    services_count = await db.services.count_documents({})
    if services_count == 0:
        services = [
            # Instagram
            {
                "id": str(uuid.uuid4()),
                "platform": "instagram",
                "service_type": "followers",
                "name": "Instagram Followers - High Quality",
                "rate": 2.50,
                "min_quantity": 100,
                "max_quantity": 10000,
                "description": "Real and active Instagram followers with fast delivery",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "platform": "instagram",
                "service_type": "likes",
                "name": "Instagram Likes - Instant",
                "rate": 1.00,
                "min_quantity": 50,
                "max_quantity": 5000,
                "description": "Instant likes from real accounts",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "platform": "instagram",
                "service_type": "views",
                "name": "Instagram Video Views",
                "rate": 0.50,
                "min_quantity": 100,
                "max_quantity": 50000,
                "description": "High retention video views",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            # TikTok
            {
                "id": str(uuid.uuid4()),
                "platform": "tiktok",
                "service_type": "followers",
                "name": "TikTok Followers - Premium",
                "rate": 3.00,
                "min_quantity": 100,
                "max_quantity": 10000,
                "description": "Premium TikTok followers with high engagement",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "platform": "tiktok",
                "service_type": "likes",
                "name": "TikTok Likes - Fast",
                "rate": 1.50,
                "min_quantity": 50,
                "max_quantity": 10000,
                "description": "Fast and reliable TikTok likes",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "platform": "tiktok",
                "service_type": "views",
                "name": "TikTok Views - Organic",
                "rate": 0.80,
                "min_quantity": 1000,
                "max_quantity": 100000,
                "description": "Organic looking views for your TikTok videos",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            # YouTube
            {
                "id": str(uuid.uuid4()),
                "platform": "youtube",
                "service_type": "subscribers",
                "name": "YouTube Subscribers - Real",
                "rate": 5.00,
                "min_quantity": 50,
                "max_quantity": 5000,
                "description": "Real YouTube subscribers that won't drop",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "platform": "youtube",
                "service_type": "views",
                "name": "YouTube Views - High Retention",
                "rate": 2.00,
                "min_quantity": 100,
                "max_quantity": 50000,
                "description": "High retention YouTube views from real users",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "platform": "youtube",
                "service_type": "likes",
                "name": "YouTube Likes",
                "rate": 3.00,
                "min_quantity": 50,
                "max_quantity": 5000,
                "description": "Real likes for your YouTube videos",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            # Facebook
            {
                "id": str(uuid.uuid4()),
                "platform": "facebook",
                "service_type": "likes",
                "name": "Facebook Page Likes",
                "rate": 4.00,
                "min_quantity": 100,
                "max_quantity": 10000,
                "description": "Real Facebook page likes from active users",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "platform": "facebook",
                "service_type": "followers",
                "name": "Facebook Profile Followers",
                "rate": 3.50,
                "min_quantity": 100,
                "max_quantity": 5000,
                "description": "Increase your profile followers",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            # Twitter
            {
                "id": str(uuid.uuid4()),
                "platform": "twitter",
                "service_type": "followers",
                "name": "Twitter Followers - Active",
                "rate": 4.50,
                "min_quantity": 100,
                "max_quantity": 10000,
                "description": "Active Twitter followers from real accounts",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "platform": "twitter",
                "service_type": "retweets",
                "name": "Twitter Retweets",
                "rate": 2.50,
                "min_quantity": 10,
                "max_quantity": 1000,
                "description": "Real retweets for your tweets",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
        ]
        
        await db.services.insert_many(services)
        print(f"✅ Created {len(services)} sample services")
    else:
        print(f"ℹ️  Database already has {services_count} services")
    
    print("🎉 Database seeding completed!")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_database())
