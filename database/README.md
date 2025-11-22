# Database Scripts

This directory contains all SQL scripts for database setup, migrations, and fixes.

## Directory Structure

### `setup/`
Initial database setup scripts. Run these first when setting up a new database.

- **SUPABASE_DATABASE_SETUP.sql** - Complete database schema setup
- **VERIFY_DATABASE_SETUP.sql** - Verification script to check database setup

### `migrations/`
Database migration scripts for adding new features or updating schema.

- **ADD_SMMGEN_FIELD.sql** - Adds `smmgen_service_id` field to services table
- **POPULATE_SERVICES.sql** - Populates services table with initial data
- **SYNC_SMMGEN_SERVICES.sql** - Syncs services with SMMGen API

### `fixes/`
Scripts to fix database issues or bugs.

- **FIX_ADMIN_RLS.sql** - Fixes Row Level Security policies for admin users
- **FIX_RLS_POLICIES.sql** - General RLS policy fixes
- **FIX_SERVICES_CONSTRAINT.sql** - Fixes constraints on services table
- **SIMPLE_RLS_FIX.sql** - Simplified RLS fix script

## Usage

1. **Initial Setup**: Run scripts in `setup/` directory first
2. **Migrations**: Apply migrations in order as needed
3. **Fixes**: Apply fixes only when encountering specific issues

## Important Notes

- Always backup your database before running any scripts
- Test scripts in a development environment first
- Some scripts may have dependencies on others (check comments in files)

