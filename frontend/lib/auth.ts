/**
 * Auth service — all authentication API calls live here.
 * Keeps the API layer clean and gives us a single place to
 * update if the backend contract changes.
 */

// Same-origin: auth calls go to /api/* on this Next app and are proxied to the
// backend (see next.config rewrites), so the HttpOnly refresh cookie is first-party.
const BASE_URL = ""

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = "ADMIN" | "LIBRARIAN" | "USER"

export interface AuthUser {
  id: number
  name: string
  email: string
  role: Role
  token: string
  /** No longer returned by the API — the refresh token lives in an HttpOnly cookie. */
  refreshToken?: string
  type: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

/** Field-level validation errors returned by Spring's @Valid */
export type FieldErrors = Record<string, string>

export class AuthError extends Error {
  /** HTTP status code */
  status: number
  /** Field-level validation errors (only present on 400 validation failures) */
  fieldErrors?: FieldErrors

  constructor(message: string, status: number, fieldErrors?: FieldErrors) {
    super(message)
    this.name = "AuthError"
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function parseAuthError(res: Response): Promise<AuthError> {
  let message = `Request failed (${res.status})`
  let fieldErrors: FieldErrors | undefined

  try {
    const body = await res.json()
    // Backend wraps everything in ApiResponse<T>
    if (body?.message) message = body.message
    // Validation errors come back as data: { field: "message", ... }
    if (res.status === 400 && body?.data && typeof body.data === "object") {
      fieldErrors = body.data as FieldErrors
      message = "Please fix the errors below"
    }
  } catch {
    // response body wasn't JSON — keep default message
  }

  return new AuthError(message, res.status, fieldErrors)
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authService = {
  /**
   * Which sign-in methods this deployment supports. Google is optional on the
   * backend; the UI hides its button when it isn't configured. Fails closed
   * (password-only) if the call errors.
   */
  async getProviders(): Promise<{ password: boolean; google: boolean }> {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/auth/providers`, { cache: "no-store" })
      if (!res.ok) return { password: true, google: false }
      const body = await res.json()
      return { password: true, google: body?.data?.google === true }
    } catch {
      return { password: true, google: false }
    }
  },
  async login(payload: LoginPayload): Promise<AuthUser> {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // accept the Set-Cookie refresh token
      body: JSON.stringify(payload),
    })

    if (!res.ok) throw await parseAuthError(res)

    const body = await res.json()
    if (!body?.data?.token) {
      throw new AuthError("No token received from server", 500)
    }
    return body.data as AuthUser
  },

  async register(payload: RegisterPayload): Promise<AuthUser> {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // accept the Set-Cookie refresh token
      body: JSON.stringify(payload),
    })

    if (!res.ok) throw await parseAuthError(res)

    const body = await res.json()
    if (!body?.data?.token) {
      throw new AuthError("Registration succeeded but no token received", 500)
    }
    return body.data as AuthUser
  },

  async refresh(): Promise<AuthUser> {
    // The refresh token rides in the HttpOnly cookie, so there's nothing to send
    // in the body; credentials:"include" makes the browser attach the cookie.
    const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })

    if (!res.ok) throw await parseAuthError(res)

    const body = await res.json()
    if (!body?.data?.token) {
      throw new AuthError("Refresh succeeded but no token received", 500)
    }
    return body.data as AuthUser
  },

  async logout(): Promise<void> {
    // Best-effort: revokes the refresh token server-side and expires the HttpOnly
    // cookie (JavaScript can't clear it). The local session is cleared regardless.
    try {
      await fetch(`${BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      /* ignore network errors on logout */
    }
  },

  async forgotPassword(email: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) throw await parseAuthError(res)

    const body = await res.json()
    return body?.message || "If an account exists with this email, a reset link has been sent."
  },

  async resetPassword(token: string, newPassword: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/v1/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    })

    if (!res.ok) throw await parseAuthError(res)

    const body = await res.json()
    return body?.message || "Password reset successful."
  },

  async verifyEmail(token: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`, {
      method: "GET",
    })

    if (!res.ok) throw await parseAuthError(res)

    const body = await res.json()
    return body?.message || "Email verified successfully."
  },

  async resendVerification(email: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/v1/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) throw await parseAuthError(res)

    const body = await res.json()
    return body?.message || "Verification email sent."
  },
}


