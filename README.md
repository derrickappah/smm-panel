# BoostUp GH - Social Media Growth Platform

A comprehensive social media growth platform that allows users to purchase followers, likes, views, and other social media engagement services. Built with React, Supabase, and integrated with SMMGen API for service delivery.

## 🚀 Features

- **User Authentication** - Secure signup and login with Supabase Auth
- **Service Marketplace** - Browse and purchase social media services (Instagram, TikTok, YouTube, etc.)
- **Order Management** - Place orders, track status, and view order history
- **Payment Integration** - Seamless payments via Paystack
- **Admin Dashboard** - Comprehensive admin panel for managing users, services, orders, and transactions
- **Balance System** - User wallet with deposit and refund capabilities
- **Real-time Updates** - Live order status updates and balance tracking
- **Mobile Responsive** - Fully responsive design for all devices

## 🛠️ Tech Stack

### Frontend
- **React.js** - UI framework
- **Tailwind CSS** - Styling
- **React Router** - Navigation
- **Shadcn/ui** - UI components
- **Lucide React** - Icons

### Backend & Services
- **Supabase** - Database, Authentication, and Row Level Security
- **Paystack** - Payment processing
- **SMMGen API** - Social media service provider
- **Vercel** - Hosting and serverless functions

### Infrastructure
- **Vercel Serverless Functions** - API proxy for SMMGen integration
- **PostgreSQL** (via Supabase) - Database
- **Row Level Security (RLS)** - Data access control

## 📁 Project Structure

```
app/
├── api/                    # Vercel serverless functions
│   └── smmgen/            # SMMGen API proxy endpoints
├── backend/               # Backend proxy server (optional)
├── database/               # SQL scripts organized by category
│   ├── setup/            # Initial database setup
│   ├── migrations/        # Database migrations
│   └── fixes/             # Database fix scripts
├── docs/                  # Project documentation
│   ├── setup/            # Setup guides
│   ├── troubleshooting/ # Troubleshooting guides
│   └── admin/            # Admin documentation
├── frontend/              # React frontend application
│   ├── public/          # Static assets
│   └── src/              # Source code
│       ├── components/  # React components
│       ├── pages/       # Page components
│       └── lib/         # Utilities and integrations
└── README.md             # This file
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account
- Paystack account (for payments)
- SMMGen API key (optional, for service integration)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd app
   ```

2. **Set up the frontend**
   ```bash
   cd frontend
   npm install --legacy-peer-deps
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the `frontend` directory:
   ```env
   REACT_APP_SUPABASE_URL=your_supabase_url
   REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
   REACT_APP_PAYSTACK_PUBLIC_KEY=your_paystack_public_key
   ```

4. **Set up the database**
   
   Follow the guide in [`docs/setup/README_SETUP.md`](docs/setup/README_SETUP.md) to:
   - Configure Supabase
   - Run database setup scripts from `database/setup/`
   - Set up Row Level Security policies

5. **Start the development server**
   ```bash
   npm start
   ```

6. **Access the application**
   
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📚 Documentation

### Setup Guides
- **[Quick Setup Guide](docs/setup/README_SETUP.md)** - Get started quickly
- **[Supabase Setup](docs/setup/SUPABASE_SETUP.md)** - Configure Supabase
- **[Vercel Deployment](docs/setup/VERCEL_SETUP.md)** - Deploy to Vercel
- **[SMMGen Integration](docs/setup/SMMGEN_SETUP.md)** - Set up SMMGen API

### Database
- **[Database Scripts](database/README.md)** - Overview of all SQL scripts
- **[Database Setup](database/setup/)** - Initial setup scripts
- **[Migrations](database/migrations/)** - Database migration scripts
- **[Fixes](database/fixes/)** - Database fix scripts

### Troubleshooting
- **[General Troubleshooting](docs/troubleshooting/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Database Troubleshooting](docs/troubleshooting/TROUBLESHOOTING_DATABASE.md)** - Database-specific issues

### Admin
- **[Admin RLS Fix](docs/admin/ADMIN_RLS_FIX.md)** - Fix admin dashboard access issues

## 🚢 Deployment

### Vercel Deployment

1. **Connect your repository** to Vercel
2. **Set environment variables** in Vercel dashboard:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
   - `REACT_APP_PAYSTACK_PUBLIC_KEY`
   - `SMMGEN_API_URL` (optional)
   - `SMMGEN_API_KEY` (optional)

3. **Deploy** - Vercel will automatically build and deploy

For detailed deployment instructions, see [`docs/setup/VERCEL_SETUP.md`](docs/setup/VERCEL_SETUP.md).

## 🔐 Environment Variables

### Frontend (.env)
```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_PAYSTACK_PUBLIC_KEY=your_paystack_public_key
REACT_APP_BACKEND_URL=http://localhost:5000  # Optional, for local backend
```

### Vercel Environment Variables
```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_PAYSTACK_PUBLIC_KEY=your_paystack_public_key
SMMGEN_API_URL=https://smmgen.com/api/v2
SMMGEN_API_KEY=your_smmgen_api_key
```

## 🎯 Key Features Explained

### User Features
- **Browse Services** - View available social media services
- **Place Orders** - Order followers, likes, views, etc.
- **Track Orders** - Monitor order status in real-time
- **Wallet System** - Deposit funds and manage balance
- **Order History** - View past orders and transactions

### Admin Features
- **User Management** - View, search, and manage users
- **Service Management** - Create, edit, and delete services
- **Order Management** - View all orders and update status
- **Transaction Management** - Monitor all transactions
- **Balance Adjustments** - Manually adjust user balances
- **Refund System** - Process refunds for orders

## 🔧 Development

### Running Locally

1. **Frontend Development**
   ```bash
   cd frontend
   npm start
   ```

2. **Backend Proxy (Optional)**
   ```bash
   cd backend
   npm install
   npm start
   ```

### Building for Production

```bash
cd frontend
npm run build
```

The build output will be in `frontend/build/`.

## 📝 Database Scripts

All database scripts are organized in the `database/` directory:

- **Setup Scripts** (`database/setup/`) - Run these first for initial setup
- **Migration Scripts** (`database/migrations/`) - Apply as needed for updates
- **Fix Scripts** (`database/fixes/`) - Use when encountering specific issues

See [`database/README.md`](database/README.md) for detailed information.

## 🐛 Troubleshooting

If you encounter issues:

1. Check the [Troubleshooting Guides](docs/troubleshooting/)
2. Review [Issues Fixed](docs/ISSUES_FIXED.md) for known solutions
3. Verify environment variables are set correctly
4. Ensure database setup scripts have been run

## 📄 License

[Add your license information here]

## 🤝 Contributing

[Add contributing guidelines here]

## 📞 Support

For support and questions:
- Check the [Documentation](docs/)
- Review [Troubleshooting Guides](docs/troubleshooting/)
- [Open an issue](link-to-issues) on GitHub

---

**Made with ❤️ for social media growth**
