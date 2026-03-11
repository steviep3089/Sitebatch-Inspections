import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts'

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

type HealthResult = {
  healthy: boolean
  error?: string
  reason?: string
  expires_in?: number
  checked_at: string
}

function getEmailRecipients() {
  const toRaw = Deno.env.get('SMTP_TO') || ''
  return toRaw
    .split(',')
    .map((value: string) => value.trim().replace(/[.;,]+$/, ''))
    .filter(Boolean)
}

async function sendEmailToRecipients(recipients: string[], subject: string, html: string) {
  const host = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
  const port = Number(Deno.env.get('SMTP_PORT') || '465')
  const username = Deno.env.get('SMTP_USERNAME')
  const password = Deno.env.get('SMTP_PASSWORD')
  const from = Deno.env.get('SMTP_FROM') || username || ''

  if (!username || !password || !from || recipients.length === 0) {
    console.warn('SMTP env vars missing or no recipients; logging health email instead of sending.', {
      host,
      port,
      hasUsername: !!username,
      hasPassword: !!password,
      from,
      recipientsCount: recipients.length,
    })
    console.log('Health check email subject:', subject)
    console.log('Health check email html:', html)
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

async function checkGoogleOauthRefreshToken(): Promise<HealthResult> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN')

  const checkedAt = new Date().toISOString()

  if (!clientId || !clientSecret || !refreshToken) {
    return {
      healthy: false,
      reason: 'missing_secrets',
      error: 'Missing one or more OAuth secrets: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN',
      checked_at: checkedAt,
    }
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const tokenJson = await tokenResponse.json().catch(() => ({}))

  if (!tokenResponse.ok || !tokenJson.access_token) {
    return {
      healthy: false,
      reason: tokenJson?.error || 'token_refresh_failed',
      error: tokenJson?.error_description || tokenJson?.error || 'Failed to refresh Google OAuth access token',
      checked_at: checkedAt,
    }
  }

  const accessToken = tokenJson.access_token as string

  const aboutResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const aboutJson = await aboutResponse.json().catch(() => ({}))

  if (!aboutResponse.ok) {
    return {
      healthy: false,
      reason: 'drive_about_failed',
      error: aboutJson?.error?.message || 'Google Drive API check failed',
      checked_at: checkedAt,
    }
  }

  return {
    healthy: true,
    checked_at: checkedAt,
    expires_in: Number(tokenJson.expires_in || 0),
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const notifyOnSuccess = body?.notify_on_success === true

    const result = await checkGoogleOauthRefreshToken()
    const recipients = getEmailRecipients()

    if (!result.healthy || notifyOnSuccess) {
      const portalUrl = Deno.env.get('PORTAL_BASE_URL') ?? 'http://localhost:3000'
      const subject = result.healthy
        ? 'Google OAuth Health Check: OK'
        : 'Google OAuth Health Check: ACTION REQUIRED'

      const html = `
        <h2>Google OAuth Health Check</h2>
        <ul>
          <li><strong>Status:</strong> ${result.healthy ? 'Healthy' : 'Unhealthy'}</li>
          <li><strong>Checked At (UTC):</strong> ${result.checked_at}</li>
          <li><strong>Reason:</strong> ${result.reason || 'ok'}</li>
          <li><strong>Error:</strong> ${result.error || 'None'}</li>
        </ul>
        ${
          result.healthy
            ? ''
            : '<p>Action: Reconnect Google OAuth and update GOOGLE_OAUTH_REFRESH_TOKEN secret to keep My Drive uploads working.</p>'
        }
        <p>
          <a href="${portalUrl}" target="_blank" rel="noopener noreferrer" style="color:#1155cc;text-decoration:underline;">
            Open Sitebatch Inspections Portal
          </a>
          <br />
          ${portalUrl}
        </p>
      `

      await sendEmailToRecipients(recipients, subject, html)
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        notified: !result.healthy || notifyOnSuccess,
        recipients: recipients,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.healthy ? 200 : 400,
      }
    )
  } catch (error) {
    console.error('check-google-oauth-health error:', error)

    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
