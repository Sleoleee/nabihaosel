import {
  next,
} from '@vercel/functions'

import {
  SESSION_COOKIE,
  verifySessionToken,
} from './auth/session.js'

function getCookie(
  request,
  cookieName
) {
  const header =
    request.headers.get('cookie')

  if (!header) {
    return null
  }

  const cookies = header.split(';')

  for (const cookie of cookies) {
    const trimmed = cookie.trim()

    const equalIndex =
      trimmed.indexOf('=')

    if (equalIndex === -1) {
      continue
    }

    const name =
      trimmed.slice(0, equalIndex)

    const value =
      trimmed.slice(equalIndex + 1)

    if (name === cookieName) {
      return decodeURIComponent(value)
    }
  }

  return null
}

export default function middleware(
  request
) {
  const url =
    new URL(request.url)

  const pathname =
    url.pathname

  const session =
    getCookie(
      request,
      SESSION_COOKIE
    )

  const authenticated =
    verifySessionToken(session)

  if (
    pathname === '/auth-login'
  ) {
    return next()
  }

  if (
    pathname === '/login.html'
  ) {
    if (authenticated) {
      return Response.redirect(
        new URL('/', request.url),
        302
      )
    }

    return next()
  }

  if (!authenticated) {
    return Response.redirect(
      new URL(
        '/login.html',
        request.url
      ),
      302
    )
  }

  return next()
}

export const config = {
  runtime: 'nodejs',
}