import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const login = vi.fn()
vi.mock("@/context/auth-context", () => ({ useAuth: () => ({ login }) }))

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import OAuthCallbackPage from "@/app/oauth-callback/page"

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))
  )
  vi.stubGlobal("fetch", fn)
  return fn
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

beforeEach(() => {
  replace.mockClear()
  login.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe("GoogleSignInButton", () => {
  it("renders a same-origin link when the backend reports Google enabled", async () => {
    mockFetch(() => json({ success: true, data: { password: true, google: true } }))
    render(<GoogleSignInButton />)

    const link = await screen.findByRole("link", { name: /continue with google/i })
    // Must go through the Next.js proxy, never a hard-coded backend host.
    expect(link.getAttribute("href")).toBe("/oauth2/authorization/google")
  })

  it("renders nothing when Google is disabled", async () => {
    const fetchFn = mockFetch(() => json({ success: true, data: { password: true, google: false } }))
    const { container } = render(<GoogleSignInButton />)

    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith("/api/v1/auth/providers", expect.anything()))
    expect(container).toBeEmptyDOMElement()
  })

  it("fails closed (hidden) when the providers call errors", async () => {
    mockFetch(() => new Response("boom", { status: 500 }))
    const { container } = render(<GoogleSignInButton />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe("OAuthCallbackPage", () => {
  it("exchanges the HttpOnly refresh cookie for a session (no tokens in the URL)", async () => {
    const user = { id: 7, name: "G User", email: "g@example.com", role: "USER", token: "jwt", type: "Bearer" }
    const fetchFn = mockFetch(() => json({ success: true, data: user }))

    render(<OAuthCallbackPage />)

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"))
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe("/api/v1/auth/refresh")
    expect(init).toMatchObject({ method: "POST", credentials: "include" })
    expect(login).toHaveBeenCalledWith(user)
  })

  it("returns to /login with an error flag when the exchange fails", async () => {
    mockFetch(() => json({ success: false, message: "No refresh token cookie present." }, 401))
    render(<OAuthCallbackPage />)

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?oauth_error=1"))
    expect(login).not.toHaveBeenCalled()
  })
})
