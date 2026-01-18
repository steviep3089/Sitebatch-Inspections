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

async function sendEmail(subject: string, html: string) {
  // SMTP configuration (Gmail-friendly defaults)
  const host = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
  const port = Number(Deno.env.get('SMTP_PORT') || '465')
  const username = Deno.env.get('SMTP_USERNAME')
  const password = Deno.env.get('SMTP_PASSWORD')
  const from = Deno.env.get('SMTP_FROM') || username || ''
  const toRaw = Deno.env.get('SMTP_TO')

  if (!username || !password || !from || !toRaw) {
    console.warn('SMTP env vars missing; logging email instead of sending.', {
      host,
      port,
      hasUsername: !!username,
      hasPassword: !!password,
      from,
      hasTo: !!toRaw,
    })
    console.log('Email to send (subject):', subject)
    console.log('Email to send (html):', html)
    return
  }

  const to = toRaw
    .split(',')
    .map((r) => r.trim().replace(/[.;,]+$/, ''))
    .filter(Boolean)

  const client = new SmtpClient()

  try {
    await client.connectTLS({
      hostname: host,
      port,
      username,
      password,
    })

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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const body = await req.json().catch(() => null as any)
    const singleTemplateId = body?.template_id || body?.templateId || null

    let itemsQuery = supabaseClient
      .from('inspection_item_templates')
      .select(`
        id,
        unique_id,
        description,
        expiry_date,
        expiry_na,
        inspection_item_template_assets(
          asset_id,
          asset_items(asset_id, name)
        )
      `)
      .eq('expiry_na', false)
      .not('expiry_date', 'is', null)

    if (singleTemplateId) {
      itemsQuery = itemsQuery.eq('id', singleTemplateId)
    } else {
      // Include both due-soon and overdue items in one pass.
      itemsQuery = itemsQuery.lte('expiry_date', thirtyDaysFromNow)
    }

    const { data: items, error: itemsError } = await itemsQuery
    if (itemsError) throw itemsError

    const remindersCreated = []
    const emailsSent = []
    const portalUrl = Deno.env.get('PORTAL_BASE_URL') ?? 'http://localhost:3000'

    for (const item of items || []) {
      if (!item.expiry_date) continue

      const expiryDate = new Date(item.expiry_date)
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      const assetLabels =
        (item.inspection_item_template_assets || [])
          .map((row: any) => row.asset_items?.asset_id)
          .filter(Boolean)

      const assetLine = assetLabels.length > 0 ? assetLabels.join(', ') : 'All assets'

      const reminderDays = [30, 14, 7, 1]
      for (const days of reminderDays) {
        if (daysUntilExpiry > days) continue

        const shouldSendToday = daysUntilExpiry === days

        const { data: existingReminder } = await supabaseClient
          .from('inspection_item_reminders')
          .select('id, sent')
          .eq('template_id', item.id)
          .eq('reminder_type', 'due')
          .eq('days_before', days)
          .single()

        let reminderRecord = existingReminder

        if (!reminderRecord) {
          const reminderDate = new Date(expiryDate)
          reminderDate.setDate(reminderDate.getDate() - days)

          const { data: newReminder, error: reminderError } = await supabaseClient
            .from('inspection_item_reminders')
            .insert({
              template_id: item.id,
              reminder_type: 'due',
              reminder_date: reminderDate.toISOString().split('T')[0],
              days_before: days,
              sent: false,
            })
            .select()
            .single()

          if (!reminderError && newReminder) {
            remindersCreated.push(newReminder)
            reminderRecord = newReminder
          }
        }

        if (shouldSendToday && reminderRecord && !reminderRecord.sent) {
          const emailSubject = `Item Expiry in ${days} day${days > 1 ? 's' : ''}: ${item.unique_id || item.description || 'Inspection item'}`
          const emailBody = `
            <h2>Inspection Item Reminder</h2>
            <p>This is a reminder that an inspection item expires soon.</p>
            <ul>
              <li><strong>Unique ID:</strong> ${item.unique_id || 'N/A'}</li>
              <li><strong>Description:</strong> ${item.description || 'N/A'}</li>
              <li><strong>Assets:</strong> ${assetLine}</li>
              <li><strong>Expiry Date:</strong> ${new Date(item.expiry_date).toLocaleDateString('en-GB')}</li>
              <li><strong>Days Until Expiry:</strong> ${daysUntilExpiry}</li>
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
            .from('inspection_item_reminders')
            .update({
              sent: true,
              sent_at: new Date().toISOString(),
            })
            .eq('id', reminderRecord.id)

          emailsSent.push({
            template_id: item.id,
            days_before: days,
            subject: emailSubject,
          })
        }
      }

      if (daysUntilExpiry < 0) {
        const { data: existingOverdue } = await supabaseClient
          .from('inspection_item_reminders')
          .select('id, sent')
          .eq('template_id', item.id)
          .eq('reminder_type', 'overdue')
          .single()

        if (!existingOverdue || !existingOverdue.sent) {
          let overdueReminder = existingOverdue

          if (!overdueReminder) {
            const { data: newOverdue, error: overdueError } = await supabaseClient
              .from('inspection_item_reminders')
              .insert({
                template_id: item.id,
                reminder_type: 'overdue',
                reminder_date: expiryDate.toISOString().split('T')[0],
                days_before: 0,
                sent: false,
              })
              .select()
              .single()

            if (!overdueError && newOverdue) {
              remindersCreated.push(newOverdue)
              overdueReminder = newOverdue
            }
          }

          const emailSubject = `Expired Item: ${item.unique_id || item.description || 'Inspection item'}`
          const emailBody = `
            <h2>Inspection Item Expired</h2>
            <p>This inspection item has expired.</p>
            <ul>
              <li><strong>Unique ID:</strong> ${item.unique_id || 'N/A'}</li>
              <li><strong>Description:</strong> ${item.description || 'N/A'}</li>
              <li><strong>Assets:</strong> ${assetLine}</li>
              <li><strong>Expiry Date:</strong> ${new Date(item.expiry_date).toLocaleDateString('en-GB')}</li>
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

          if (overdueReminder?.id) {
            await supabaseClient
              .from('inspection_item_reminders')
              .update({
                sent: true,
                sent_at: new Date().toISOString(),
              })
              .eq('id', overdueReminder.id)
          }

          emailsSent.push({
            template_id: item.id,
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
        details: { remindersCreated, emailsSent },
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
