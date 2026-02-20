import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const encoder = new TextEncoder()

type UploadRequest = {
  inspection_id?: string
  folder_url?: string
  file_name?: string
  content_type?: string
  file_base64?: string
}

const base64UrlEncode = (value: Uint8Array | string) => {
  const raw = typeof value === 'string' ? encoder.encode(value) : value
  let binary = ''
  for (let i = 0; i < raw.length; i += 1) {
    binary += String.fromCharCode(raw[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const pemToArrayBuffer = (pem: string) => {
  const stripped = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')

  const binary = atob(stripped)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

const signJwt = async (serviceAccountEmail: string, privateKeyPem: string) => {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(unsignedToken)
  )

  const encodedSignature = base64UrlEncode(new Uint8Array(signature))
  return `${unsignedToken}.${encodedSignature}`
}

const getAccessToken = async () => {
  const serviceAccountEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const privateKeyRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')

  if (!serviceAccountEmail || !privateKeyRaw) {
    throw new Error('Google service account env vars are missing')
  }

  const privateKeyPem = privateKeyRaw.replace(/\\n/g, '\n')
  const assertion = await signJwt(serviceAccountEmail, privateKeyPem)

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  const tokenJson = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || 'Failed to obtain Google access token')
  }

  return tokenJson.access_token as string
}

const parseFolderId = (folderUrl: string) => {
  const trimmed = folderUrl.trim()

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed
  }

  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folderMatch?.[1]) {
    return folderMatch[1]
  }

  const url = new URL(trimmed)
  const idParam = url.searchParams.get('id')
  if (idParam) {
    return idParam
  }

  throw new Error('Unable to parse Google Drive folder ID from folder URL')
}

const decodeBase64 = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

const concatBytes = (...parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0

  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as UploadRequest

    if (!body.folder_url || !body.file_name || !body.file_base64) {
      return new Response(
        JSON.stringify({ error: 'folder_url, file_name and file_base64 are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const folderId = parseFolderId(body.folder_url)
    const accessToken = await getAccessToken()

    const metadata = {
      name: body.file_name,
      parents: [folderId],
    }

    const boundary = `sitebatch-${crypto.randomUUID()}`
    const metadataPart = encoder.encode(
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n`
    )

    const filePartHeader = encoder.encode(
      `--${boundary}\r\n` +
      `Content-Type: ${body.content_type || 'application/octet-stream'}\r\n\r\n`
    )

    const fileBytes = decodeBase64(body.file_base64)
    const ending = encoder.encode(`\r\n--${boundary}--`)

    const multipartBody = concatBytes(metadataPart, filePartHeader, fileBytes, ending)

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    )

    const uploadJson = await uploadResponse.json()

    if (!uploadResponse.ok) {
      const apiMessage = uploadJson?.error?.message || 'Google Drive upload failed'
      if (apiMessage.includes('Service Accounts do not have storage quota')) {
        throw new Error(
          'Target folder is not in a Shared Drive. Move/use a Shared Drive folder and grant the service account access, then try again.'
        )
      }
      throw new Error(apiMessage)
    }

    return new Response(
      JSON.stringify({
        success: true,
        file: {
          id: uploadJson.id,
          name: uploadJson.name,
          webViewLink: uploadJson.webViewLink,
          webContentLink: uploadJson.webContentLink,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('upload-certs-to-drive error:', error)

    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
