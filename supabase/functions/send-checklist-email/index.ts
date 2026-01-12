import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts"

// Polyfill Deno.writeAll for the older smtp/std library when running on newer Deno/edge runtime
if (typeof (Deno as any).writeAll !== 'function') {
  ;(Deno as any).writeAll = async (writer: any, data: Uint8Array) => {
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

async function sendEmail(to: string, subject: string, html: string) {
  const host = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
  const port = Number(Deno.env.get('SMTP_PORT') || '465')
  const username = Deno.env.get('SMTP_USERNAME')
  const password = Deno.env.get('SMTP_PASSWORD')
  const from = Deno.env.get('SMTP_FROM') || username || ''

  if (!username || !password || !from || !to) {
    console.warn('SMTP env vars missing or no recipient; logging email instead of sending.', {
      host,
      port,
      hasUsername: !!username,
      hasPassword: !!password,
      from,
      to,
    })
    console.log('Email to send (subject):', subject)
    console.log('Email to send (to):', to)
    console.log('Email to send (html):', html)
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

    await client.send({
      from,
      to,
      subject,
      content: html,
    })
  } catch (error) {
    console.error('SMTP email error (checklist):', error)
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

    const body = await req.json().catch(() => null)
    const checklistId = body?.checklist_id || body?.checklistId

    if (!checklistId) {
      return new Response(
        JSON.stringify({ error: 'checklist_id is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    const { data: checklist, error: checklistError } = await supabaseClient
      .from('inspection_checklists')
      .select('id, inspection_id, assigned_user_id, status, due_date')
      .eq('id', checklistId)
      .single()

    if (checklistError || !checklist) {
      throw checklistError || new Error('Checklist not found')
    }

    if (!checklist.assigned_user_id) {
      throw new Error('Checklist has no assigned user')
    }

    const { data: user, error: userError } = await supabaseClient
      .from('user_profiles')
      .select('email')
      .eq('id', checklist.assigned_user_id)
      .single()

    if (userError || !user) {
      throw userError || new Error('Assigned user not found')
    }

    const { data: inspection, error: inspectionError } = await supabaseClient
      .from('inspections')
      .select(`
        id,
        due_date,
        assigned_to,
        asset_items (asset_id, name, location),
        inspection_types (name)
      `)
      .eq('id', checklist.inspection_id)
      .single()

    if (inspectionError || !inspection) {
      throw inspectionError || new Error('Inspection not found')
    }

    const portalUrl = Deno.env.get('PORTAL_BASE_URL') ?? 'http://localhost:3000'

    const subject = `New inspection checklist assigned: ${inspection.asset_items?.asset_id || 'Unknown asset'}`

    const due = checklist.due_date || inspection.due_date
    const dueDisplay = due ? new Date(due).toLocaleDateString() : 'Not specified'

    const html = `
      <h2>New Inspection Checklist Assigned</h2>
      <p>You have been assigned a new inspection checklist in Sitebatch Inspections.</p>
      <ul>
        <li><strong>Asset ID:</strong> ${inspection.asset_items?.asset_id || 'N/A'}</li>
        <li><strong>Asset Name:</strong> ${inspection.asset_items?.name || 'N/A'}</li>
        <li><strong>Location:</strong> ${inspection.asset_items?.location || 'N/A'}</li>
        <li><strong>Inspection Type:</strong> ${inspection.inspection_types?.name || 'N/A'}</li>
        <li><strong>Due Date:</strong> ${dueDisplay}</li>
        <li><strong>Company Assigned To:</strong> ${inspection.assigned_to || 'N/A'}</li>
      </ul>
      <p>Please log in to the Sitebatch Inspections portal to review and complete this checklist.</p>
      <p>
        <a href="${portalUrl}" target="_blank" rel="noopener noreferrer">
          Open Sitebatch Inspections Portal
        </a>
      </p>
    `

    await sendEmail(user.email, subject, html)

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('send-checklist-email error:', error)

    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
