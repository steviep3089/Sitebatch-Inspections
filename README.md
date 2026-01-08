# Sitebatch Inspections

A comprehensive plant equipment statutory inspections tracking system.

## Features

- Track plant equipment and their inspection schedules
- Monitor compliance status for each piece of equipment
- Manage active and decommissioned plant items
- Automated email reminders for upcoming inspections
- Timeline view of inspection history and upcoming requirements
- User authentication and role-based access

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example` and add your Supabase credentials

3. Run the development server:
```bash
npm run dev
```

4. Set up Supabase:
   - Create a new Supabase project
   - Run migrations from `supabase/migrations/`
   - Deploy edge functions from `supabase/functions/`

## Database Schema

- **plant_items**: Equipment/plant items with status tracking
- **inspection_types**: Types of statutory inspections required
- **inspections**: Individual inspection records
- **inspection_reminders**: Email reminder configuration

## Tech Stack

- React 18
- Vite
- Supabase (PostgreSQL + Auth + Edge Functions)
- React Router
