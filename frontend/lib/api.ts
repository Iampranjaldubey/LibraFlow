/**
 * Core API client for the LibraFlow backend.
 *
 * Design decisions:
 *  - Native fetch (no axios) — keeps the bundle small and avoids a dependency.
 *  - Token is read from localStorage on every call so it always reflects the
 *    latest value even if the AuthContext hasn't re-rendered yet.
 *  - All errors are thrown as ApiError instances so callers can branch on
 *    status codes without string-matching error messages.
 *  - Dev-mode logging prints method, URL, status, and the parsed body so
 *    failures are immediately visible in the browser console.
 *  - Request caching prevents duplicate simultaneous requests
 */

import { config, getStorageKey, isFeatureEnabled } from "./config"
import type { ApiResponse as ApiResponseType } from "@/types"

// ─── Types ────────────────────────────────────────────────────────────────────

/** Wrapper shape returned by every backend endpoint */
export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
  timestamp: string
}

/** Structured error thrown by apiFetch — always has a status code */
export class ApiError extends Error {
  status: number
  /** Raw response body (already parsed as JSON when available) */
  body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

// ─── Request Cache ────────────────────────────────────────────────────────────

/**
 * Simple request cache to prevent duplicate simultaneous requests
 * Cache entries are automatically cleared after 1 second
 */
const requestCache = new Map<string, Promise<any>>()

function getCacheKey(method: string, endpoint: string): string {
  return `${method}:${endpoint}`
}

function getCachedRequest<T>(method: string, endpoint: string): Promise<T> | undefined {
  return requestCache.get(getCacheKey(method, endpoint))
}

function setCachedRequest<T>(method: string, endpoint: string, promise: Promise<T>): void {
  const key = getCacheKey(method, endpoint)
  requestCache.set(key, promise)
  
  // Auto-clear cache entry after 1 second
  promise.finally(() => {
    setTimeout(() => requestCache.delete(key), 1000)
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(getStorageKey("TOKEN"))
}

function clearSession() {
  if (typeof window === "undefined") return
  localStorage.removeItem(getStorageKey("TOKEN"))
  localStorage.removeItem(getStorageKey("USER"))
  document.cookie = "auth-token=; path=/; max-age=0"
}

/** Log a request/response pair in development only */
function devLog(
  method: string,
  url: string,
  status: number,
  body: unknown,
  durationMs: number
) {
  if (!isFeatureEnabled("ENABLE_DEBUG_LOGS")) return
  const ok = status >= 200 && status < 300
  const style = ok ? "color: #22c55e" : "color: #ef4444"
  console.groupCollapsed(
    `%c[API] ${method} ${url} → ${status} (${durationMs}ms)`,
    style
  )
  console.log("Response body:", body)
  console.groupEnd()
}

/** Parse the backend error body and return a human-readable message */
async function parseErrorBody(res: Response): Promise<{ message: string; body: unknown }> {
  let body: unknown = null
  let message = `${res.status} ${res.statusText}`

  try {
    body = await res.json()
    if (body && typeof body === "object" && "message" in body) {
      const m = (body as { message: string }).message
      if (m) message = m
    }
  } catch {
    // Response body wasn't JSON — keep the default status message
  }

  return { message, body }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${config.apiUrl}${endpoint}`
  const method = (options.method ?? "GET").toUpperCase()

  // Check cache for GET requests
  if (method === "GET") {
    const cached = getCachedRequest<ApiResponse<T>>(method, endpoint)
    if (cached) {
      if (isFeatureEnabled("ENABLE_DEBUG_LOGS")) {
        console.log(`[API] Using cached response for ${method} ${endpoint}`)
      }
      return cached
    }
  }

  const token = getToken()

  // Warn in dev if a non-auth endpoint is called without a token
  if (config.isDevelopment && !token && !endpoint.startsWith("/auth")) {
    console.warn(`[API] No token found for ${method} ${endpoint} — request will likely 401`)
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    // Spread any caller-supplied headers last so they can override
    ...(options.headers as Record<string, string> | undefined),
  }

  const t0 = Date.now()

  const fetchPromise = (async () => {
    let response: Response
    try {
      // credentials:"include" so the HttpOnly refresh cookie rides along on
      // same-origin calls (needed for the silent-refresh flow below).
      response = await fetch(url, { ...options, credentials: "include", headers })
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : "Network error"
      if (config.isDevelopment) {
        console.error(`[API] Network failure for ${method} ${url}:`, networkErr)
      }
      throw new ApiError(
        `Cannot reach the server. Make sure the backend is running on ${config.apiUrl}`,
        0,
        { originalMessage: msg }
      )
    }

    const duration = Date.now() - t0

    // ── Parse body (always attempt, even on error responses) ──────────────────
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      // Empty body or non-JSON (e.g. 204 No Content)
    }

    devLog(method, url, response.status, body, duration)

    // ── Handle error responses ────────────────────────────────────────────────
    if (!response.ok) {
      // Extract the message from the parsed body (already done above)
      let message = `${response.status} ${response.statusText}`
      if (body && typeof body === "object" && "message" in body) {
        const m = (body as { message: string }).message
        if (m) message = m
      }

      if (config.isDevelopment) {
        console.error(
          `[API] ${method} ${url} failed with ${response.status}:`,
          message,
          "\nFull response body:",
          body
        )
      }

      // 401 — access token expired/invalid: attempt a silent, cookie-based refresh.
      if (response.status === 401) {
        const hadToken =
          typeof window !== "undefined" && !!localStorage.getItem(getStorageKey("TOKEN"))
        const isAuthCall =
          endpoint.includes("/auth/refresh") || endpoint.includes("/auth/login")

        if (hadToken && !isAuthCall) {
          try {
            if (config.isDevelopment) console.log("[API] Attempting silent token refresh")

            // The refresh token is in the HttpOnly cookie — send credentials, no body.
            // Raw fetch (not apiFetch) so a 401 here can't recurse.
            const refreshRes = await fetch(`${config.apiUrl}/api/v1/auth/refresh`, {
              method: "POST",
              credentials: "include",
            })

            if (refreshRes.ok) {
              const refreshBody = await refreshRes.json()
              const newToken: string | undefined = refreshBody?.data?.token
              if (newToken) {
                // Persist the new ACCESS token. The rotated refresh token is set
                // by the server as a fresh HttpOnly cookie automatically.
                localStorage.setItem(getStorageKey("TOKEN"), newToken)
                const storedUser = localStorage.getItem(getStorageKey("USER"))
                if (storedUser) {
                  const merged = { ...JSON.parse(storedUser), ...refreshBody.data }
                  localStorage.setItem(getStorageKey("USER"), JSON.stringify(merged))
                }
                document.cookie = `auth-token=${newToken}; path=/; SameSite=Lax; max-age=${60 * 60 * 24 * 7}`

                // Retry the original request once with the new access token.
                const retryRes = await fetch(url, {
                  ...options,
                  credentials: "include",
                  headers: { ...headers, Authorization: `Bearer ${newToken}` },
                })
                if (retryRes.ok) {
                  return (await retryRes.json()) as ApiResponse<T>
                }
              }
            }
          } catch (e) {
            if (config.isDevelopment) console.error("[API] Silent refresh failed", e)
          }
        }

        // Refresh unavailable or failed: clear the local session and bounce to login.
        if (typeof window !== "undefined") {
          clearSession()
          if (hadToken) {
            // Hard redirect so the auth context re-initialises cleanly; the flag
            // lets the login page show a friendly "your session expired" notice.
            window.location.href = "/login?expired=1"
          }
        }
        throw new ApiError("Session expired. Please sign in again.", 401, body)
      }

      // 403 — authenticated but not authorised for this action
      if (response.status === 403) {
        throw new ApiError(
          "You don't have permission to perform this action.",
          403,
          body
        )
      }

      throw new ApiError(message, response.status, body)
    }

    // ── Success ───────────────────────────────────────────────────────────────
    return body as ApiResponse<T>
  })()

  // Cache GET requests
  if (method === "GET") {
    setCachedRequest(method, endpoint, fetchPromise)
  }

  return fetchPromise
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Remove duplicate books, preferring the first occurrence.
 *  Deduplicates by `id` first, then falls back to `isbn`. */
export function dedupeBooks<T extends { id: string | number; isbn?: string }>(
  books: T[]
): T[] {
  const seenIds = new Set<string>()
  const seenIsbns = new Set<string>()
  return books.filter((book) => {
    const id = String(book.id)
    const isbn = book.isbn?.trim().toLowerCase()
    if (seenIds.has(id)) return false
    if (isbn && isbn !== "n/a" && seenIsbns.has(isbn)) return false
    seenIds.add(id)
    if (isbn && isbn !== "n/a") seenIsbns.add(isbn)
    return true
  })
}

// ─── Typed response shapes ────────────────────────────────────────────────────

export interface BookDto {
  id: number
  title: string
  author: string
  isbn: string
  category: string
  available: boolean
  totalCopies: number
  availableCopies: number
}

export interface TransactionDto {
  id: number
  userId: number
  userName: string
  bookId: number
  bookTitle: string
  /** ISO date string "YYYY-MM-DD" (LocalDate, write-dates-as-timestamps=false) */
  issueDate: string
  /** ISO date string "YYYY-MM-DD" */
  dueDate: string
  /** ISO date string "YYYY-MM-DD" or null */
  returnDate: string | null
  fine: number | null
  finePaid: boolean
  finePaymentDate: string | null
  /** Backend-computed status — use this instead of recomputing on the client */
  status: "ACTIVE" | "RETURNED" | "OVERDUE"
}

export interface AuthDto {
  token: string
  refreshToken: string
  type: string
  id: number
  name: string
  email: string
  role: string
}

export interface PagedResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export interface FinesSummaryDto {
  totalOutstanding: number
  totalCollected: number
  outstandingCount: number
  collectedCount: number
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<AuthDto>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    apiFetch<AuthDto>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  forgotPassword: (email: string) =>
    apiFetch<void>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<void>("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),

  verifyEmail: (token: string) =>
    apiFetch<void>(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`),

  resendVerification: (email: string) =>
    apiFetch<void>("/api/v1/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
}

// ─── Books API ────────────────────────────────────────────────────────────────

export const booksApi = {
  getAll: (available?: boolean) => {
    const query = available !== undefined ? `?available=${available}` : ""
    return apiFetch<BookDto[]>(`/api/v1/books${query}`)
  },

  getById: (id: number) => apiFetch<BookDto>(`/api/v1/books/${id}`),

  add: (book: { title: string; author: string; isbn: string; category: string; totalCopies?: number }) =>
    apiFetch<BookDto>("/api/v1/books", {
      method: "POST",
      body: JSON.stringify(book),
    }),

  update: (
    id: number,
    book: { title: string; author: string; isbn: string; category: string }
  ) =>
    apiFetch<BookDto>(`/api/v1/books/${id}`, {
      method: "PUT",
      body: JSON.stringify(book),
    }),

  delete: (id: number) =>
    apiFetch<void>(`/api/v1/books/${id}`, { method: "DELETE" }),

  importCsv: async (file: File) => {
    const token = localStorage.getItem(getStorageKey("TOKEN"))
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch(`${config.apiUrl}/api/v1/books/import`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    if (!res.ok) throw new ApiError("Failed to import CSV", res.status)
    return res.json()
  },
}

// ─── Transactions API ─────────────────────────────────────────────────────────

export const transactionsApi = {
  issue: (bookId: number, userId: number) =>
    apiFetch<TransactionDto>("/api/v1/issue", {
      method: "POST",
      body: JSON.stringify({ bookId, userId }),
    }),

  return: (transactionId: number) =>
    apiFetch<TransactionDto>("/api/v1/return", {
      method: "POST",
      body: JSON.stringify({ transactionId }),
    }),

  getAll: () => apiFetch<TransactionDto[]>("/api/v1/transactions"),

  getByUser: (userId: number) =>
    apiFetch<TransactionDto[]>(`/api/v1/transactions/user/${userId}`),

  collectFine: (transactionId: number) =>
    apiFetch<TransactionDto>(`/api/v1/transactions/${transactionId}/collect-fine`, {
      method: "PUT",
    }),

  getOutstandingFines: () =>
    apiFetch<FinesSummaryDto>("/api/v1/transactions/outstanding-fines"),
}

/**
 * Downloads a transaction's PDF receipt and saves it via the browser.
 * The endpoint returns binary (application/pdf), so this bypasses apiFetch
 * (which parses JSON) and streams the blob directly.
 */
export async function downloadTransactionReceipt(id: number): Promise<void> {
  if (typeof window === "undefined") return

  const token = localStorage.getItem(getStorageKey("TOKEN"))
  const res = await fetch(`${config.apiUrl}/api/v1/transactions/${id}/receipt`, {
    method: "GET",
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    throw new ApiError("Failed to download the receipt.", res.status)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `receipt-${id}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// ─── Users API ────────────────────────────────────────────────────────────────

export interface UserDto {
  id: number
  name: string
  email: string
  role: string
  memberId: string
  active: boolean
  createdAt: string
  activeLoans: number
}

export const usersApi = {
  /** The signed-in user's own profile (any role). */
  getProfile: () => apiFetch<UserDto>("/api/v1/users/profile"),

  getAll: (q?: string, page = 0, size = 20) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    params.set("page", String(page))
    params.set("size", String(size))
    return apiFetch<PagedResponse<UserDto>>(`/api/v1/admin/users?${params}`)
  },

  getById: (id: number) =>
    apiFetch<UserDto>(`/api/v1/admin/users/${id}`),

  update: (id: number, data: { name?: string; email?: string }) =>
    apiFetch<UserDto>(`/api/v1/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateRole: (id: number, role: string) =>
    apiFetch<UserDto>(`/api/v1/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),

  deactivate: (id: number) =>
    apiFetch<UserDto>(`/api/v1/admin/users/${id}/deactivate`, { method: "PUT" }),

  activate: (id: number) =>
    apiFetch<UserDto>(`/api/v1/admin/users/${id}/activate`, { method: "PUT" }),

  getTransactions: (id: number) =>
    apiFetch<TransactionDto[]>(`/api/v1/admin/users/${id}/transactions`),

  /** Validate a user exists by fetching their active transactions.
   *  Returns null if the user is not found (404). */
  validateById: async (userId: number): Promise<boolean> => {
    try {
      await apiFetch(`/api/v1/transactions/user/${userId}`)
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return false
      throw err
    }
  },
}

