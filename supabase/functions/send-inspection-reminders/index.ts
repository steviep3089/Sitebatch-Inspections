import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get today's date
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Get all inspections that are due within the next 30 days and haven't been sent reminders
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    // Fetch pending inspections
    const { data: inspections, error: inspectionsError } = await supabaseClient
      .from('inspections')
      .select(`
        id,
        due_date,
        plant_items (plant_id, name, location),
        inspection_types (name)
      `)
      .eq('status', 'pending')
      .gte('due_date', todayStr)
      .lte('due_date', thirtyDaysFromNow)

    if (inspectionsError) throw inspectionsError

    const remindersCreated = []
    const emailsSent = []

    // For each inspection, check if we need to create reminders
    for (const inspection of inspections || []) {
      const dueDate = new Date(inspection.due_date)
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      // Create reminders at 30, 14, 7, and 1 day(s) before due date
      const reminderDays = [30, 14, 7, 1]
      
      for (const days of reminderDays) {
        if (daysUntilDue <= days) {
          // Check if reminder already exists
          const { data: existingReminder } = await supabaseClient
            .from('inspection_reminders')
            .select('id, sent')
            .eq('inspection_id', inspection.id)
            .eq('days_before', days)
            .single()

          if (!existingReminder) {
            // Create new reminder
            const reminderDate = new Date(dueDate)
            reminderDate.setDate(reminderDate.getDate() - days)

            const { data: newReminder, error: reminderError } = await supabaseClient
              .from('inspection_reminders')
              .insert({
                inspection_id: inspection.id,
                reminder_date: reminderDate.toISOString().split('T')[0],
                days_before: days,
                sent: false
              })
              .select()
              .single()

            if (!reminderError && newReminder) {
              remindersCreated.push(newReminder)
            }
          } else if (!existingReminder.sent && daysUntilDue === days) {
            // Send email for this reminder
            const emailSubject = `Inspection Due in ${days} day${days > 1 ? 's' : ''}: ${inspection.plant_items?.plant_id}`
            const emailBody = `
              <h2>Inspection Reminder</h2>
              <p>This is a reminder that an inspection is due soon.</p>
              <ul>
                <li><strong>Plant ID:</strong> ${inspection.plant_items?.plant_id}</li>
                <li><strong>Plant Name:</strong> ${inspection.plant_items?.name}</li>
                <li><strong>Location:</strong> ${inspection.plant_items?.location || 'N/A'}</li>
                <li><strong>Inspection Type:</strong> ${inspection.inspection_types?.name}</li>
                <li><strong>Due Date:</strong> ${new Date(inspection.due_date).toLocaleDateString()}</li>
                <li><strong>Days Until Due:</strong> ${daysUntilDue}</li>
              </ul>
              <p>Please ensure this inspection is completed on time to maintain compliance.</p>
            `

            // Here you would integrate with your email service (e.g., Resend, SendGrid, etc.)
            // For now, we'll just log it
            console.log('Email to send:', emailSubject)
            
            // Mark reminder as sent
            await supabaseClient
              .from('inspection_reminders')
              .update({
                sent: true,
                sent_at: new Date().toISOString()
              })
              .eq('id', existingReminder.id)

            emailsSent.push({
              inspection_id: inspection.id,
              days_before: days,
              subject: emailSubject
            })
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        remindersCreated: remindersCreated.length,
        emailsSent: emailsSent.length,
        details: { remindersCreated, emailsSent }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
