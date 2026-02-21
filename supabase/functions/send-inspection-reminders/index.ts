import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts"

// Polyfill Deno.writeAll for the older smtp/std library when running on newer Deno/edge runtime
if (typeof (Deno as any).writeAll !== 'function') {
  (Deno as any).writeAll = async (writer: any, data: Uint8Array) => {
    let offset = 0
    while (offset < data.length) {
      const written = await writer.write(data.subarray(offset))
      if (!written) break
      offset += written
    }
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getEmailRecipients() {
  const toRaw = Deno.env.get('SMTP_TO') || ''
  return toRaw
    .split(',')
    .map((r) => r.trim().replace(/[.;,]+$/, ''))
    .filter(Boolean)
}

async function sendEmail(subject: string, html: string) {
  // SMTP configuration (Gmail-friendly defaults)
  const host = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
  const port = Number(Deno.env.get('SMTP_PORT') || '465')
  const username = Deno.env.get('SMTP_USERNAME')
  const password = Deno.env.get('SMTP_PASSWORD')
  const from = Deno.env.get('SMTP_FROM') || username || ''
  const to = getEmailRecipients()

  if (!username || !password || !from || to.length === 0) {
    console.warn('SMTP env vars missing; logging email instead of sending.', {
      host,
      port,
      hasUsername: !!username,
      hasPassword: !!password,
      from,
      hasTo: to.length > 0,
    })
    console.log('Email to send (subject):', subject)
    console.log('Email to send (html):', html)
    return to
  }

  const client = new SmtpClient()

  try {
    // Use TLS connection (works with Gmail on port 465)
    await client.connectTLS({
      hostname: host,
      port,
      username,
      password,
    })

    // Send one email per recipient to avoid SMTP libraries
    // bundling multiple addresses into a single invalid RCPT command
    for (const recipient of to) {
      await client.send({
        from,
        to: recipient,
        subject,
        content: html,
      })
    }
  } catch (error) {
    console.error('SMTP email error:', error)
  } finally {
    try {
      await client.close()
    } catch (_) {
      // ignore close errors
    }
  }

  return to
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

    // Optional: allow a single inspection to be targeted explicitly
    // when this function is invoked with a JSON body, e.g.
    // { "inspection_id": "..." }. This lets the UI trigger
    // immediate reminders when a due date is changed to exactly
    // 30/14/7/1 days from today, while preserving the existing
    // daily-cron behaviour when no body is provided.
    const body = await req.json().catch(() => null as any)
    const singleInspectionId = body?.inspection_id || body?.inspectionId || null
    const triggerType = body?.trigger || null

    // Build base query for pending inspections
    let inspectionsQuery = supabaseClient
      .from('inspections')
      .select(`
        id,
        due_date,
        assigned_to,
        notes,
        asset_items (asset_id, name, location),
        inspection_types (name)
      `)
      .eq('status', 'pending')

    if (singleInspectionId) {
      inspectionsQuery = inspectionsQuery.eq('id', singleInspectionId)
    } else {
      inspectionsQuery = inspectionsQuery
        .gte('due_date', todayStr)
        .lte('due_date', thirtyDaysFromNow)
    }

    // Fetch pending inspections
    const { data: inspections, error: inspectionsError } = await inspectionsQuery

    if (inspectionsError) throw inspectionsError

    const remindersCreated = []
    const emailsSent = []

    // Base URL for the portal/dashboard (can be overridden via env when deployed)
    const portalUrl = Deno.env.get('PORTAL_BASE_URL') ?? 'http://localhost:3000'

    // For each inspection, check if we need to create reminders
    for (const inspection of inspections || []) {
      if (!inspection.due_date) {
        // Skip inspections without a due date
        continue
      }

      const dueDate = new Date(inspection.due_date)
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      if (singleInspectionId && triggerType === 'manual_alert') {
        const daysLabel =
          daysUntilDue < 0
            ? `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} overdue`
            : daysUntilDue === 0
              ? 'due today'
              : `${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} until due`

        const emailSubject = `Inspection alert: ${inspection.asset_items?.asset_id} (${daysLabel})`
        const emailBody = `
          <h2>Inspection Alert</h2>
          <p>An inspection alert has been triggered from the inspection modal.</p>
          <ul>
            <li><strong>Asset ID:</strong> ${inspection.asset_items?.asset_id}</li>
            <li><strong>Asset Name:</strong> ${inspection.asset_items?.name}</li>
            <li><strong>Location:</strong> ${inspection.asset_items?.location || 'N/A'}</li>
            <li><strong>Inspection Type:</strong> ${inspection.inspection_types?.name}</li>
            <li><strong>Due Date:</strong> ${new Date(inspection.due_date).toLocaleDateString('en-GB')}</li>
            <li><strong>Status:</strong> ${daysLabel}</li>
            <li><strong>Company Assigned To:</strong> ${inspection.assigned_to || 'N/A'}</li>
            <li><strong>Notes:</strong> ${inspection.notes || 'N/A'}</li>
          </ul>
          <p>
            <a
              href="${portalUrl}"
              target="_blank"
              rel="noopener noreferrer"
              style="color:#1155cc;text-decoration:underline;"
            >
              Open Sitebatch Inspections Portal
            </a>
            <br />
            ${portalUrl}
          </p>
        `

        const recipients = await sendEmail(emailSubject, emailBody)

        emailsSent.push({
          inspection_id: inspection.id,
          days_before: null,
          subject: emailSubject,
          recipients,
        })

        continue
      }

      // Create reminders at 30, 14, 7, and 1 day(s) before due date
      const reminderDays = [30, 14, 7, 1]
      let inspectionEmailSent = false
      
      for (const days of reminderDays) {
        // Only care about inspections that are within this reminder window
        if (daysUntilDue > days) continue

        const shouldSendToday = daysUntilDue === days && triggerType !== 'created'

        // Check if reminder already exists
        const { data: existingReminder } = await supabaseClient
          .from('inspection_reminders')
          .select('id, sent')
          .eq('inspection_id', inspection.id)
          .eq('days_before', days)
          .single()

        let reminderRecord = existingReminder

        if (!reminderRecord) {
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
            reminderRecord = newReminder
          }
        }

        // If today is exactly the reminder threshold and we haven't sent yet, log an email
        if (shouldSendToday && reminderRecord && !reminderRecord.sent) {
          const emailSubject = `Inspection Due in ${days} day${days > 1 ? 's' : ''}: ${inspection.asset_items?.asset_id}`
          const emailBody = `
            <h2>Inspection Reminder</h2>
            <p>This is a reminder that an inspection is due soon.</p>
            <ul>
              <li><strong>Asset ID:</strong> ${inspection.asset_items?.asset_id}</li>
              <li><strong>Asset Name:</strong> ${inspection.asset_items?.name}</li>
              <li><strong>Location:</strong> ${inspection.asset_items?.location || 'N/A'}</li>
              <li><strong>Inspection Type:</strong> ${inspection.inspection_types?.name}</li>
              <li><strong>Due Date:</strong> ${new Date(inspection.due_date).toLocaleDateString('en-GB')}</li>
              <li><strong>Days Until Due:</strong> ${daysUntilDue}</li>
              <li><strong>Company Assigned To:</strong> ${inspection.assigned_to || 'N/A'}</li>
              <li><strong>Notes:</strong> ${inspection.notes || 'N/A'}</li>
            </ul>
            <p>Please ensure this inspection is completed on time to maintain compliance.</p>
            <p>
              <a
                href="${portalUrl}"
                target="_blank"
                rel="noopener noreferrer"
                style="color:#1155cc;text-decoration:underline;"
              >
                Open Sitebatch Inspections Portal
              </a>
              <br />
              ${portalUrl}
            </p>
          `

          await sendEmail(emailSubject, emailBody)

          // Mark reminder as sent
          await supabaseClient
            .from('inspection_reminders')
            .update({
              sent: true,
              sent_at: new Date().toISOString()
            })
            .eq('id', reminderRecord.id)

          emailsSent.push({
            inspection_id: inspection.id,
            days_before: days,
            subject: emailSubject
          })
          inspectionEmailSent = true
        }
      }

      // For newly created inspections already inside the 30-day window,
      // send an immediate informational email once with the exact days until due.
      if (
        singleInspectionId &&
        triggerType === 'created' &&
        daysUntilDue >= 0 &&
        daysUntilDue <= 30 &&
        !inspectionEmailSent
      ) {
        const { data: existingCreatedReminder } = await supabaseClient
          .from('inspection_reminders')
          .select('id, sent')
          .eq('inspection_id', inspection.id)
          .eq('days_before', 0)
          .single()

        let createdReminderRecord = existingCreatedReminder

        if (!createdReminderRecord) {
          const { data: newCreatedReminder, error: createdReminderError } = await supabaseClient
            .from('inspection_reminders')
            .insert({
              inspection_id: inspection.id,
              reminder_date: todayStr,
              days_before: 0,
              sent: false,
            })
            .select()
            .single()

          if (!createdReminderError && newCreatedReminder) {
            remindersCreated.push(newCreatedReminder)
            createdReminderRecord = newCreatedReminder
          }
        }

        if (createdReminderRecord && !createdReminderRecord.sent) {
          const emailSubject = `New inspection created - due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}: ${inspection.asset_items?.asset_id}`
          const emailBody = `
            <h2>New Inspection Created</h2>
            <p>A new inspection has been created and is due within the configured reminder window.</p>
            <ul>
              <li><strong>Asset ID:</strong> ${inspection.asset_items?.asset_id}</li>
              <li><strong>Asset Name:</strong> ${inspection.asset_items?.name}</li>
              <li><strong>Location:</strong> ${inspection.asset_items?.location || 'N/A'}</li>
              <li><strong>Inspection Type:</strong> ${inspection.inspection_types?.name}</li>
              <li><strong>Due Date:</strong> ${new Date(inspection.due_date).toLocaleDateString('en-GB')}</li>
              <li><strong>Days Until Due:</strong> ${daysUntilDue}</li>
              <li><strong>Company Assigned To:</strong> ${inspection.assigned_to || 'N/A'}</li>
              <li><strong>Notes:</strong> ${inspection.notes || 'N/A'}</li>
            </ul>
            <p>
              <a
                href="${portalUrl}"
                target="_blank"
                rel="noopener noreferrer"
                style="color:#1155cc;text-decoration:underline;"
              >
                Open Sitebatch Inspections Portal
              </a>
              <br />
              ${portalUrl}
            </p>
          `

          await sendEmail(emailSubject, emailBody)

          await supabaseClient
            .from('inspection_reminders')
            .update({
              sent: true,
              sent_at: new Date().toISOString(),
            })
            .eq('id', createdReminderRecord.id)

          emailsSent.push({
            inspection_id: inspection.id,
            days_before: 0,
            subject: emailSubject,
          })
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        remindersCreated: remindersCreated.length,
        emailsSent: emailsSent.length,
        recipients:
          triggerType === 'manual_alert'
            ? (emailsSent[0]?.recipients || getEmailRecipients())
            : undefined,
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
