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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    console.error('SMTP email error (request):', error)
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
    const requestId = body?.request_id

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: 'request_id is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    const { data: request, error: requestError } = await supabaseClient
      .from('user_requests')
      .select('id, description, created_at, admin_id, requester_id')
      .eq('id', requestId)
      .single()

    if (requestError || !request) {
      throw requestError || new Error('Request not found')
    }

    const { data: admin, error: adminError } = await supabaseClient
      .from('user_profiles')
      .select('email')
      .eq('id', request.admin_id)
      .single()

    if (adminError || !admin) {
      throw adminError || new Error('Admin user not found')
    }

    const { data: requester, error: requesterError } = await supabaseClient
      .from('user_profiles')
      .select('email')
      .eq('id', request.requester_id)
      .single()

    if (requesterError || !requester) {
      throw requesterError || new Error('Requester not found')
    }

    const portalUrl = Deno.env.get('PORTAL_BASE_URL') ?? 'http://localhost:3000'

    const subject = `New request from ${requester.email}`

    const created = request.created_at ? new Date(request.created_at).toLocaleString() : 'Unknown time'

    const html = `
      <h2>New Request Submitted</h2>
      <p>You have received a new request in Sitebatch Inspections.</p>
      <ul>
        <li><strong>From:</strong> ${requester.email}</li>
        <li><strong>Created At:</strong> ${created}</li>
      </ul>
      <p><strong>Description:</strong></p>
      <p>${request.description.replace(/\n/g, '<br />')}</p>
      <p>
        <a href="${portalUrl}" target="_blank" rel="noopener noreferrer">
          Open Sitebatch Inspections Portal
        </a>
      </p>
    `

    await sendEmail(admin.email, subject, html)

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('send-request-email error:', error)

    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
