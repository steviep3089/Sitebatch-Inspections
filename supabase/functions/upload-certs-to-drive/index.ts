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
    scope: 'https://www.googleapis.com/auth/drive',
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

const getAccessTokenFromServiceAccount = async () => {
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

const getAccessTokenFromRefreshToken = async () => {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN')

  if (!clientId || !clientSecret || !refreshToken) {
    return null
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

  const tokenJson = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || 'Failed to obtain Google OAuth access token')
  }

  return tokenJson.access_token as string
}

type TokenSource = 'service_account' | 'oauth'

const getAvailableTokens = async () => {
  const hasServiceAccount =
    !!Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') &&
    !!Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')

  const tokens: Array<{ source: TokenSource; token: string }> = []

  if (hasServiceAccount) {
    tokens.push({
      source: 'service_account',
      token: await getAccessTokenFromServiceAccount(),
    })
  }

  const oauthToken = await getAccessTokenFromRefreshToken()
  if (oauthToken) {
    tokens.push({ source: 'oauth', token: oauthToken })
  }

  if (tokens.length === 0) {
    throw new Error('No Google auth method configured. Set service account or OAuth secrets.')
  }

  return tokens
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

type DriveFileMetadata = {
  id: string
  name?: string
  mimeType?: string
  driveId?: string
  shortcutDetails?: {
    targetId?: string
  }
}

const getDriveFileMetadata = async (accessToken: string, fileId: string): Promise<DriveFileMetadata> => {
  const metadataResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id,name,mimeType,driveId,shortcutDetails`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  const metadataJson = await metadataResponse.json().catch(() => ({}))
  if (!metadataResponse.ok) {
    const apiMessage = metadataJson?.error?.message || ''
    if (apiMessage.includes('File not found')) {
      throw new Error(
        `Configured Drive folder ID is not visible to the active upload account: ${fileId}. Re-save the exact folder URL in Admin Tools and confirm the service account has access to that specific folder.`
      )
    }
    throw new Error(metadataJson?.error?.message || 'Failed to read target Drive folder metadata')
  }

  return metadataJson as DriveFileMetadata
}

const resolveUploadFolder = async (accessToken: string, initialFolderId: string): Promise<DriveFileMetadata> => {
  const first = await getDriveFileMetadata(accessToken, initialFolderId)

  if (first.mimeType === 'application/vnd.google-apps.shortcut') {
    const shortcutTargetId = first.shortcutDetails?.targetId
    if (!shortcutTargetId) {
      throw new Error('Folder link points to a shortcut without a target. Use the destination folder link directly.')
    }
    return await getDriveFileMetadata(accessToken, shortcutTargetId)
  }

  return first
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

    const availableTokens = await getAvailableTokens()
    let activeToken = availableTokens[0]
    const parsedFolderId = parseFolderId(body.folder_url)
    let resolvedFolder: DriveFileMetadata

    try {
      resolvedFolder = await resolveUploadFolder(activeToken.token, parsedFolderId)
    } catch (error) {
      const fallback = availableTokens.find((t) => t.source !== activeToken.source)
      const message = (error as Error).message || ''

      if (!fallback || !message.includes('not visible to the active upload account')) {
        throw error
      }

      activeToken = fallback
      resolvedFolder = await resolveUploadFolder(activeToken.token, parsedFolderId)
    }

    if (resolvedFolder.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error('Configured Drive link is not a folder. Please set a valid folder URL in Admin Tools.')
    }

    if (!resolvedFolder.driveId && activeToken.source === 'service_account') {
      const oauthFallback = availableTokens.find((t) => t.source === 'oauth')
      if (!oauthFallback) {
        throw new Error(
          'Configured folder is in My Drive (or not a Shared Drive folder). Set Admin Tools link to a Shared Drive folder URL, or configure OAuth secrets for My Drive uploads.'
        )
      }

      activeToken = oauthFallback
      resolvedFolder = await resolveUploadFolder(activeToken.token, parsedFolderId)
    }

    const folderId = resolvedFolder.id

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
          Authorization: `Bearer ${activeToken.token}`,
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
