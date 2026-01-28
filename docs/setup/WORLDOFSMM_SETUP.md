# World of SMM Integration Setup

This guide will help you complete the integration of the World of SMM API into your system.

## 1. Database Update

First, you need to add the necessary columns to your database. Run the following SQL migration in your Supabase SQL Editor:

[ADD_WORLDOFSMM_COLUMNS.sql](file:///c:/Users/DELL/Desktop/ephraim/myfolder/app/database/migrations/ADD_WORLDOFSMM_COLUMNS.sql)

## 2. Environment Variables

Add the following environment variables to your Vercel project settings:

- `WORLDOFSMM_API_KEY`: Your World of SMM API key (found on your World of SMM account page).
- `WORLDOFSMM_API_URL`: `https://worldofsmm.com/api/v2` (Optional, defaults to this value).

## 3. Deployment

After adding the environment variables, redeploy your application to Vercel for the changes to take effect.

## 4. Admin Management

Once deployed, you can manage the World of SMM integration via the Admin Dashboard:
- Go to **Admin Dashboard** > **World of SMM**.
- Use the **Test Connection** button to verify your API credentials.
- Use **Sync Services** to fetch available services and import them into your system.
