import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto'

export const SESSION_COOKIE =
  'dashboard_session'

export const SESSION_MAX_AGE =
  60 * 60 * 12 // 12 jam

function safeCompare(a, b) {
  const first = Buffer.from(String(a || ''))
  const second = Buffer.from(String(b || ''))

  if (first.length !== second.length) {
    return false
  }

  return timingSafeEqual(first, second)
}

export function validateCredentials(
  username,
  password
) {
  const expectedUsername =
    process.env.DASHBOARD_USERNAME

  const expectedPassword =
    process.env.DASHBOARD_PASSWORD

  if (!expectedUsername || !expectedPassword) {
    return false
  }

  return (
    safeCompare(username, expectedUsername) &&
    safeCompare(password, expectedPassword)
  )
}

function sign(value) {
  const secret =
    process.env.DASHBOARD_SESSION_SECRET

  if (!secret) {
    throw new Error(
      'DASHBOARD_SESSION_SECRET belum diset'
    )
  }

  return createHmac('sha256', secret)
    .update(value)
    .digest('base64url')
}

export function createSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({
      expires:
        Date.now() +
        SESSION_MAX_AGE * 1000,
    })
  ).toString('base64url')

  const signature = sign(payload)

  return `${payload}.${signature}`
}

export function verifySessionToken(token) {
  try {
    if (!token) {
      return false
    }

    const [payload, signature] =
      token.split('.')

    if (!payload || !signature) {
      return false
    }

    const expectedSignature =
      sign(payload)

    if (
      !safeCompare(
        signature,
        expectedSignature
      )
    ) {
      return false
    }

    const data = JSON.parse(
      Buffer.from(
        payload,
        'base64url'
      ).toString('utf8')
    )

    if (
      !data.expires ||
      data.expires <= Date.now()
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
}