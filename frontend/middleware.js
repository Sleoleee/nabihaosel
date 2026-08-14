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
    request.headers.get(
      'cookie'
    )

  if (!header) {
    return null
  }

  const cookies =
    header.split(';')

  for (
    const cookie of cookies
  ) {
    const trimmed =
      cookie.trim()

    const equalIndex =
      trimmed.indexOf('=')

    if (equalIndex === -1) {
      continue
    }

    const name =
      trimmed.slice(
        0,
        equalIndex
      )

    const value =
      trimmed.slice(
        equalIndex + 1
      )

    if (name === cookieName) {
      return decodeURIComponent(
        value
      )
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

  // Endpoint login harus
  // bisa diakses tanpa session.
  if (
    pathname === '/api/login'
  ) {
    return next()
  }

  // Login page
  if (
    pathname === '/login.html'
  ) {
    // Kalau sudah login,
    // tidak perlu melihat
    // login page lagi.
    if (authenticated) {
      return Response.redirect(
        new URL('/', request.url),
        302
      )
    }

    return next()
  }

  // Semua halaman lain
  // membutuhkan session.
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