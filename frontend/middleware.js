import {
  next,
} from '@vercel/functions'

function getCookie(
  request,
  cookieName
) {
  const cookieHeader =
    request.headers.get('cookie')

  if (!cookieHeader) {
    return null
  }

  const cookies =
    cookieHeader.split(';')

  for (const cookie of cookies) {
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

  const access =
    getCookie(
      request,
      'dashboard_access'
    )

  const allowed =
    access === 'granted'

  // Login page boleh diakses
  if (
    pathname === '/login.html'
  ) {

    // Kalau sudah pernah klik masuk,
    // langsung ke dashboard.
    if (allowed) {
      return Response.redirect(
        new URL('/', request.url),
        302
      )
    }

    return next()
  }

  // Kalau belum klik "Masuk Dashboard",
  // arahkan ke halaman pembuka.
  if (!allowed) {
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