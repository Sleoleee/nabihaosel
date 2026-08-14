import {
  SESSION_COOKIE,
} from '../auth/session.js'

export default function handler(
  request,
  response
) {
  const isSecure =
    request.headers[
      'x-forwarded-proto'
    ] === 'https' ||
    Boolean(process.env.VERCEL)

  const secureFlag =
    isSecure ? '; Secure' : ''

  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly${secureFlag}; SameSite=Lax; Path=/; Max-Age=0`
  )

  response.writeHead(302, {
    Location: '/login.html',
  })

  response.end()
}