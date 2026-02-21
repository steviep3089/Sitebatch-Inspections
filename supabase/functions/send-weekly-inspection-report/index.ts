import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts"

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

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-GB')
}

const startOfDay = (date: Date) => {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const wrapForEmail = (value: string, maxLineLength = 48) => {
  if (!value) return ''

  const words = value.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length <= maxLineLength) {
      currentLine = candidate
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  }

  if (currentLine) lines.push(currentLine)
  return lines.map((line) => escapeHtml(line)).join('<br/>')
}

async function sendEmailToRecipients(recipients: string[], subject: string, html: string) {
  const host = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
  const port = Number(Deno.env.get('SMTP_PORT') || '465')
  const username = Deno.env.get('SMTP_USERNAME')
  const password = Deno.env.get('SMTP_PASSWORD')
  const from = Deno.env.get('SMTP_FROM') || username || ''

  if (!username || !password || !from || recipients.length === 0) {
    console.warn('SMTP env vars missing or no recipients; logging report instead of sending.', {
      host,
      port,
      hasUsername: !!username,
      hasPassword: !!password,
      from,
      recipientsCount: recipients.length,
    })
    console.log('Weekly report subject:', subject)
    console.log('Weekly report html:', html)
    return
  }

  const client = new SmtpClient()

  try {
    await client.connectTLS({
      hostname: host,
      port,
      username,
      password,
    })

    for (const recipient of recipients) {
      await client.send({
        from,
        to: recipient,
        subject,
        content: html,
      })
    }
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

    const { data: recipientRows, error: recipientError } = await supabaseClient
      .from('report_recipients')
      .select('email')
      .eq('is_active', true)

    if (recipientError) throw recipientError

    const recipients = (recipientRows || [])
      .map((row: any) => String(row.email || '').trim().toLowerCase())
      .filter(Boolean)

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active report recipients configured.', recipients: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const today = startOfDay(new Date())
    const todayStr = today.toISOString().split('T')[0]
    const dueIn14 = new Date(today)
    dueIn14.setDate(dueIn14.getDate() + 14)
    const dueIn14Str = dueIn14.toISOString().split('T')[0]

    const { data: dueInspections, error: dueError } = await supabaseClient
      .from('inspections')
      .select(`
        id,
        due_date,
        status,
        asset_items (asset_id, name, location),
        inspection_types (name)
      `)
      .in('status', ['pending', 'overdue'])
      .gte('due_date', todayStr)
      .lte('due_date', dueIn14Str)
      .order('due_date', { ascending: true })

    if (dueError) throw dueError

    const { data: onHoldInspections, error: onHoldError } = await supabaseClient
      .from('inspections')
      .select(`
        id,
        due_date,
        hold_reason,
        asset_items (asset_id, name, location),
        inspection_types (name)
      `)
      .eq('status', 'on_hold')
      .order('due_date', { ascending: true })

    if (onHoldError) throw onHoldError

    const onHoldIds = (onHoldInspections || []).map((row: any) => row.id)

    let latestOnHoldByInspection: Record<string, any> = {}
    let userEmailById: Record<string, string> = {}

    if (onHoldIds.length > 0) {
      const { data: onHoldLogs, error: onHoldLogsError } = await supabaseClient
        .from('inspection_logs')
        .select('inspection_id, created_by, created_at, details')
        .eq('action', 'on_hold')
        .in('inspection_id', onHoldIds)
        .order('created_at', { ascending: false })

      if (onHoldLogsError) throw onHoldLogsError

      for (const row of onHoldLogs || []) {
        if (!latestOnHoldByInspection[row.inspection_id]) {
          latestOnHoldByInspection[row.inspection_id] = row
        }
      }

      const onHoldUserIds = Array.from(new Set((onHoldLogs || []).map((row: any) => row.created_by).filter(Boolean)))
      if (onHoldUserIds.length > 0) {
        const { data: users, error: usersError } = await supabaseClient
          .from('user_profiles')
          .select('id, email')
          .in('id', onHoldUserIds)

        if (usersError) throw usersError

        for (const user of users || []) {
          userEmailById[user.id] = user.email
        }
      }
    }

    const { data: waitingCertsInspections, error: waitingError } = await supabaseClient
      .from('inspections')
      .select(`
        id,
        due_date,
        date_completed,
        completed_date,
        waiting_on_certs,
        certs_received,
        certs_na,
        asset_items (asset_id, name, location),
        inspection_types (name)
      `)
      .eq('status', 'completed')
      .or('waiting_on_certs.eq.true,and(certs_received.eq.false,certs_na.eq.false)')
      .order('date_completed', { ascending: true })

    if (waitingError) throw waitingError

  const tableStyle = 'width:100%;border-collapse:collapse;margin:10px 0 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;'
  const cardCellStyle = 'padding:14px 16px;border:1px solid #d8d8d8;background:#ffffff;'
  const labelCellStyle = 'width:28%;padding:4px 0;font-weight:700;vertical-align:top;'
  const valueCellStyle = 'width:72%;padding:4px 0;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;'
  const sectionTitleStyle = 'margin:0 0 8px 0;font-family:Arial,sans-serif;'
  const sectionWrapStyle = 'margin:24px 0;padding:14px 14px 18px 14px;border:1px solid #e5e7eb;background:#ffffff;'
  const cardSpacerRow = '<tr><td style="border:none;padding:0;height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>'

    const detailRow = (label: string, value: string) => `
      <tr>
        <td style="${labelCellStyle}">${label}</td>
        <td style="${valueCellStyle}">${value}</td>
      </tr>
    `

    const dueRowsHtml = (dueInspections || []).map((inspection: any) => `
      <tr>
        <td style="${cardCellStyle}">
          <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;">
            ${detailRow('Asset ID', escapeHtml(inspection.asset_items?.asset_id || 'N/A'))}
            ${detailRow('Asset Name', wrapForEmail(inspection.asset_items?.name || 'N/A', 70))}
            ${detailRow('Inspection Type', wrapForEmail(inspection.inspection_types?.name || 'N/A', 70))}
            ${detailRow('Due Date', escapeHtml(formatDate(inspection.due_date)))}
            ${detailRow('Status', escapeHtml(inspection.status || 'N/A'))}
          </table>
        </td>
      </tr>
      ${cardSpacerRow}
    `).join('')

    const onHoldRowsHtml = (onHoldInspections || []).map((inspection: any) => {
      const logRow = latestOnHoldByInspection[inspection.id]
      const placedBy = logRow?.created_by ? (userEmailById[logRow.created_by] || 'Unknown user') : 'Unknown user'
      return `
        <tr>
          <td style="${cardCellStyle}">
            <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;">
              ${detailRow('Asset ID', escapeHtml(inspection.asset_items?.asset_id || 'N/A'))}
              ${detailRow('Asset Name', wrapForEmail(inspection.asset_items?.name || 'N/A', 70))}
              ${detailRow('Inspection Type', wrapForEmail(inspection.inspection_types?.name || 'N/A', 70))}
              ${detailRow('Due Date', escapeHtml(formatDate(inspection.due_date)))}
              ${detailRow('Comment', wrapForEmail(inspection.hold_reason || 'No comment provided', 70))}
              ${detailRow('Placed On Hold By', wrapForEmail(placedBy, 70))}
            </table>
          </td>
        </tr>
        ${cardSpacerRow}
      `
    }).join('')

    const waitingRowsHtml = (waitingCertsInspections || []).map((inspection: any) => {
      const completedSource = inspection.date_completed || inspection.completed_date || null
      let daysSinceCompleted = 'N/A'

      if (completedSource) {
        const completedDate = startOfDay(new Date(completedSource))
        const diffMs = today.getTime() - completedDate.getTime()
        if (!Number.isNaN(diffMs)) {
          daysSinceCompleted = String(Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24))))
        }
      }

      return `
        <tr>
          <td style="${cardCellStyle}">
            <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;">
              ${detailRow('Asset ID', escapeHtml(inspection.asset_items?.asset_id || 'N/A'))}
              ${detailRow('Asset Name', wrapForEmail(inspection.asset_items?.name || 'N/A', 70))}
              ${detailRow('Inspection Type', wrapForEmail(inspection.inspection_types?.name || 'N/A', 70))}
              ${detailRow('Completed Date', escapeHtml(formatDate(completedSource)))}
              ${detailRow('Days Since Completed', escapeHtml(daysSinceCompleted))}
            </table>
          </td>
        </tr>
        ${cardSpacerRow}
      `
    }).join('')

    const reportDate = new Date().toLocaleDateString('en-GB')

    const html = `
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;font-family:Arial,sans-serif;color:#1f2937;">
      <tr>
      <td style="padding:0 12px 14px 12px;">
      <h2 style="margin:0 0 12px 0;">Weekly Sitebatch Inspection Report</h2>
      <p style="margin:0 0 18px 0;"><strong>Report date:</strong> ${reportDate}</p>

      <div style="${sectionWrapStyle}">
      <h3 style="${sectionTitleStyle}">1) Inspections due in the next 14 days (${(dueInspections || []).length})</h3>
      ${dueRowsHtml
        ? `<table border="0" cellspacing="0" cellpadding="0" width="100%" style="${tableStyle}">
            <tbody>${dueRowsHtml}</tbody>
          </table>`
        : '<p style="margin:8px 0 20px 0;">None.</p>'}
      </div>

      <div style="${sectionWrapStyle}">
      <h3 style="${sectionTitleStyle}">2) Inspections on hold (${(onHoldInspections || []).length})</h3>
      ${onHoldRowsHtml
        ? `<table border="0" cellspacing="0" cellpadding="0" width="100%" style="${tableStyle}">
            <tbody>${onHoldRowsHtml}</tbody>
          </table>`
        : '<p style="margin:8px 0 20px 0;">None.</p>'}
      </div>

      <div style="${sectionWrapStyle}">
      <h3 style="${sectionTitleStyle}">3) Waiting for certs (${(waitingCertsInspections || []).length})</h3>
      ${waitingRowsHtml
        ? `<table border="0" cellspacing="0" cellpadding="0" width="100%" style="${tableStyle}">
            <tbody>${waitingRowsHtml}</tbody>
          </table>`
        : '<p style="margin:8px 0 20px 0;">None.</p>'}
      </div>
      </td>
      </tr>
      </table>
    `

    const subject = `Weekly Inspection Report - ${reportDate}`
    await sendEmailToRecipients(recipients, subject, html)

    return new Response(
      JSON.stringify({
        success: true,
        recipients,
        summary: {
          due_next_14_days: (dueInspections || []).length,
          on_hold: (onHoldInspections || []).length,
          waiting_for_certs: (waitingCertsInspections || []).length,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
