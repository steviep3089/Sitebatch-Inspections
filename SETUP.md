# Setup Guide for Sitebatch Inspections

## Prerequisites

- Node.js (v18 or higher)
- A Supabase account (free tier is fine)
- Git (optional)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a new project
2. Wait for the project to finish setting up (this takes a few minutes)
3. Once ready, go to **Settings** > **API** in your Supabase dashboard
4. Copy your:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## Step 3: Configure Environment Variables

1. Create a `.env` file in the project root:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 4: Set Up Database

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy the contents of `supabase/migrations/20260107_initial_schema.sql`
4. Paste it into the SQL editor and click **Run**
5. This will create all necessary tables and seed some sample inspection types

## Step 5: Deploy Edge Functions (Optional - for email reminders)

If you want automated email reminders:

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Login and link your project:
```bash
supabase login
supabase link --project-ref your-project-ref
```

3. Deploy the functions:
```bash
supabase functions deploy send-inspection-reminders
supabase functions deploy update-overdue-inspections
```

4. Set up cron jobs in Supabase Dashboard:
   - Go to **Database** > **Extensions** and enable `pg_cron`
   - Use the SQL editor to create scheduled jobs

## Step 6: Run the Application

```bash
npm run dev
```

The app should open automatically at `http://localhost:3000`

## Step 7: Create Your First User

1. Click **Sign Up** on the login page
2. Enter an email and password
3. Check your email for a confirmation link (in development, check Supabase dashboard **Authentication** > **Users** to manually confirm)
4. Sign in with your credentials

## Using the Application

### Adding Plant Items

1. Navigate to **Plant Items**
2. Click **Add Plant Item**
3. Fill in:
   - Plant ID (e.g., "PUMP-001")
   - Name (e.g., "Main Water Pump")
   - Location
   - Status (Active/Decommissioned)
   - Install Date
   - Notes

### Scheduling Inspections

1. Navigate to **Inspections**
2. Click **Schedule Inspection**
3. Select:
   - Plant Item
   - Inspection Type (pre-populated from database)
   - Due Date
4. Add any notes

### Viewing Timeline

1. Go to **Plant Items**
2. Click on any plant item to expand its timeline
3. View all inspections (past, upcoming, overdue) in chronological order

### Dashboard Overview

The dashboard shows:
- Total and active plant counts
- Number of overdue inspections
- Inspections due in the next 30 days
- Upcoming inspections table

## Customization

### Adding More Inspection Types

Use the SQL editor in Supabase:
```sql
INSERT INTO inspection_types (name, description, frequency, statutory_requirement) 
VALUES ('Your Inspection Type', 'Description here', 'Frequency', true);
```

### Adjusting Reminder Days

Edit the `send-inspection-reminders` function in:
`supabase/functions/send-inspection-reminders/index.ts`

Look for this line:
```typescript
const reminderDays = [30, 14, 7, 1]  // Modify these values
```

## Troubleshooting

### Can't connect to database
- Check your `.env` file has correct Supabase URL and key
- Ensure you're using the **anon/public** key, not the service role key
- Verify your Supabase project is running

### Tables don't exist
- Make sure you ran the migration SQL in Step 4
- Check the SQL Editor for any errors when running the migration

### Authentication not working
- Go to Supabase Dashboard > **Authentication** > **Providers**
- Ensure Email provider is enabled
- Check **Authentication** > **URL Configuration** for correct redirect URLs

## Next Steps

- Integrate an email service (Resend, SendGrid) for actual email sending
- Add role-based access control for multiple users
- Implement file uploads for inspection certificates
- Add export functionality for compliance reports
- Create mobile app version for field inspections
