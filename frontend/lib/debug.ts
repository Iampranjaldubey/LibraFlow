/**
 * Browser-console debugging helpers for LibraFlow API integration.
 *
 * Usage (paste into browser DevTools console):
 *
 *   import('/lib/debug').then(d => d.runDiagnostics())
 *
 * Or, since this is bundled, just call window.__libraryDebug.run() after
 * the app has loaded (the app registers it automatically in development).
 */

const BASE_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) ||
  "http://localhost:8080"

// ─── Individual checks ────────────────────────────────────────────────────────

function checkToken(): { ok: boolean; token: string | null; user: unknown } {
  const token = localStorage.getItem("token")
  const userRaw = localStorage.getItem("user")
  let user: unknown = null
  try {
    user = userRaw ? JSON.parse(userRaw) : null
  } catch {
    user = "(malformed JSON)"
  }
  return { ok: !!token, token, user }
}

function checkCookie(): { ok: boolean; value: string | null } {
  const match = document.cookie.match(/(?:^|;\s*)auth-token=([^;]*)/)
  const value = match ? decodeURIComponent(match[1]) : null
  return { ok: !!value, value: value ? `${value.slice(0, 20)}…` : null }
}

async function pingBackend(): Promise<{
  ok: boolean
  status?: number
  latencyMs?: number
  error?: string
}> {
  const t0 = Date.now()
  try {
    // /auth/login with empty body — will 400 but proves the server is reachable
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    })
    return { ok: true, status: res.status, latencyMs: Date.now() - t0 }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function testBooksEndpoint(): Promise<{
  ok: boolean
  status?: number
  body?: unknown
  error?: string
}> {
  const token = localStorage.getItem("token")
  try {
    const res = await fetch(`${BASE_URL}/books`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(5000),
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = "(non-JSON response)"
    }
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function testTransactionsEndpoint(): Promise<{
  ok: boolean
  status?: number
  body?: unknown
  error?: string
}> {
  const token = localStorage.getItem("token")
  try {
    const res = await fetch(`${BASE_URL}/transactions`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(5000),
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = "(non-JSON response)"
    }
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Main diagnostic runner ───────────────────────────────────────────────────

export async function runDiagnostics() {
  console.group("%c🔍 LibraFlow API Diagnostics", "font-size:14px;font-weight:bold;color:#22c55e")
  console.log("Backend URL:", BASE_URL)

  // 1. Token
  const tokenCheck = checkToken()
  console.group(tokenCheck.ok ? "✅ Token" : "❌ Token")
  if (tokenCheck.ok) {
    console.log("Token (first 30 chars):", tokenCheck.token?.slice(0, 30) + "…")
    console.log("Stored user:", tokenCheck.user)
  } else {
    console.warn("No token found in localStorage — all protected requests will 401")
  }
  console.groupEnd()

  // 2. Cookie
  const cookieCheck = checkCookie()
  console.group(cookieCheck.ok ? "✅ Auth cookie" : "⚠️  Auth cookie")
  if (cookieCheck.ok) {
    console.log("auth-token cookie (first 20 chars):", cookieCheck.value)
  } else {
    console.warn(
      "auth-token cookie missing — proxy/middleware will redirect to /login on hard navigation"
    )
  }
  console.groupEnd()

  // 3. Backend reachability
  console.group("🌐 Backend ping")
  const ping = await pingBackend()
  if (ping.ok) {
    console.log(`✅ Backend reachable — HTTP ${ping.status} in ${ping.latencyMs}ms`)
  } else {
    console.error(`❌ Backend unreachable — ${ping.error} (${ping.latencyMs}ms)`)
    console.warn(
      "Check that the Spring Boot server is running on",
      BASE_URL,
      "and that CORS allows http://localhost:3000"
    )
  }
  console.groupEnd()

  // 4. GET /books
  console.group("📚 GET /books")
  const booksResult = await testBooksEndpoint()
  if (booksResult.ok) {
    const count = Array.isArray((booksResult.body as any)?.data)
      ? (booksResult.body as any).data.length
      : "?"
    console.log(`✅ HTTP ${booksResult.status} — ${count} books returned`)
  } else {
    console.error(`❌ HTTP ${booksResult.status ?? "network error"}`)
    console.log("Response body:", booksResult.body ?? booksResult.error)
    if (booksResult.status === 401) {
      console.warn("→ Token is missing or expired. Log in again.")
    } else if (booksResult.status === 403) {
      console.warn("→ Authenticated but role not permitted for this endpoint.")
    } else if (!booksResult.status) {
      console.warn("→ Network error — CORS preflight blocked or server is down.")
    }
  }
  console.groupEnd()

  // 5. GET /transactions
  console.group("🔄 GET /transactions")
  const txResult = await testTransactionsEndpoint()
  if (txResult.ok) {
    const count = Array.isArray((txResult.body as any)?.data)
      ? (txResult.body as any).data.length
      : "?"
    console.log(`✅ HTTP ${txResult.status} — ${count} transactions returned`)
  } else {
    console.error(`❌ HTTP ${txResult.status ?? "network error"}`)
    console.log("Response body:", txResult.body ?? txResult.error)
    if (txResult.status === 403) {
      console.warn(
        "→ /transactions requires ADMIN or LIBRARIAN role.",
        "USER role will always 403 here — this is expected."
      )
    }
  }
  console.groupEnd()

  console.groupEnd() // root group

  return {
    token: tokenCheck,
    cookie: cookieCheck,
    ping,
    books: booksResult,
    transactions: txResult,
  }
}

// ─── Auto-register on window in development ───────────────────────────────────

if (
  typeof window !== "undefined" &&
  process.env.NODE_ENV === "development"
) {
  ;(window as any).__libraryDebug = { run: runDiagnostics }
  console.info(
    "%c[LibraFlow] Debug helper ready — run window.__libraryDebug.run() in the console",
    "color:#6366f1;font-size:11px"
  )
}
