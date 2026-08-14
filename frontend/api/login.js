export default async function handler(request) {
  if (request.method === 'GET') {
    return new Response(
      JSON.stringify({
        ok: true,
        message: 'API LOGIN HIDUP',
        hasUsernameEnv: Boolean(
          process.env.DASHBOARD_USERNAME
        ),
        hasPasswordEnv: Boolean(
          process.env.DASHBOARD_PASSWORD
        ),
        hasSecretEnv: Boolean(
          process.env.DASHBOARD_SESSION_SECRET
        ),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'POST LOGIN TERPANGGIL',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}