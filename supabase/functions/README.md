# Supabase Edge Functions

This directory contains Supabase Edge Functions for the Sitebatch Inspections application.

## Available Functions

### 1. send-inspection-reminders

Sends email reminders for upcoming inspections. This function should be run on a daily schedule (cron job).

**Functionality:**
- Checks for inspections due within the next 30 days
- Creates reminders at 30, 14, 7, and 1 day(s) before the due date
- Sends emails when the reminder date is reached
- Marks reminders as sent to avoid duplicates

**Deploy:**
```bash
supabase functions deploy send-inspection-reminders
```

**Schedule (add to Supabase Dashboard):**
- Run daily at 9:00 AM: `0 9 * * *`

### 2. update-overdue-inspections

Updates the status of inspections that are past their due date to "overdue".

**Functionality:**
- Finds all pending inspections with a due date in the past
- Updates their status to "overdue"

**Deploy:**
```bash
supabase functions deploy update-overdue-inspections
```

**Schedule (add to Supabase Dashboard):**
- Run daily at midnight: `0 0 * * *`

## Setup Instructions

1. **Deploy Functions:**
   ```bash
   supabase login
   supabase link --project-ref your-project-ref
   supabase functions deploy send-inspection-reminders
   supabase functions deploy update-overdue-inspections
   ```

2. **Set up Cron Jobs:**
   - Go to your Supabase Dashboard
   - Navigate to Database > Extensions
   - Enable the `pg_cron` extension
   - Create cron jobs to call these functions on schedule

3. **Email Integration:**
   - To send actual emails, integrate with an email service (Resend, SendGrid, etc.)
   - Add the email service API key to your Supabase secrets
   - Update the `send-inspection-reminders` function to use the email service

## Environment Variables

These are automatically available in Supabase Edge Functions:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin operations

## Testing Locally

```bash
supabase functions serve send-inspection-reminders
```

Then call it:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-inspection-reminders' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'
```
