import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  validateCredentials,
} from '../auth/session.js'

export default function handler(
  request,
  response
) {
  if (request.method !== 'POST') {
    return response.status(405).json({
      success: false,
      message: 'Method not allowed',
    })
  }

  let body = request.body

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }

  const username =
    body?.username || ''

  const password =
    body?.password || ''

  console.log('LOGIN DEBUG', {
    hasUsernameEnv:
      Boolean(
        process.env.DASHBOARD_USERNAME
      ),

    hasPasswordEnv:
      Boolean(
        process.env.DASHBOARD_PASSWORD
      ),

    hasSecretEnv:
      Boolean(
        process.env.DASHBOARD_SESSION_SECRET
      ),

    usernameMatches:
      username ===
      process.env.DASHBOARD_USERNAME,

    usernameLengthReceived:
      username.length,

    usernameLengthExpected:
      process.env
        .DASHBOARD_USERNAME
        ?.length || 0,

    passwordLengthReceived:
      password.length,

    passwordLengthExpected:
      process.env
        .DASHBOARD_PASSWORD
        ?.length || 0,
  })

  const valid =
    validateCredentials(
      username,
      password
    )

  if (!valid) {
    return response.status(401).json({
      success: false,
      message:
        'Username atau password salah.',
    })
  }

  const token =
    createSessionToken()

  const isSecure =
    request.headers[
      'x-forwarded-proto'
    ] === 'https' ||
    Boolean(process.env.VERCEL)

  const secureFlag =
    isSecure
      ? '; Secure'
      : ''

  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly${secureFlag}; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`
  )

  return response.status(200).json({
    success: true,
  })
}