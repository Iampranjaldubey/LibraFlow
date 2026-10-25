"use client"

import { useEffect, useState } from "react"
import { authService } from "@/lib/auth"

/**
 * "Continue with Google", rendered only when the backend has Google OAuth
 * configured (GET /api/v1/auth/providers).
 *
 * The link is a same-origin path: Next.js proxies /oauth2/** and
 * /login/oauth2/** to the API (see next.config.mjs), so the OAuth handshake
 * cookies and the final HttpOnly refresh-token cookie are all first-party.
 * The old button hard-coded http://localhost:8080, which broke every deploy.
 */
export function GoogleSignInButton() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let active = true
    authService.getProviders().then((p) => {
      if (active) setEnabled(p.google)
    })
    return () => {
      active = false
    }
  }, [])

  if (!enabled) return null

  return (
    <>
      <div className="relative pt-2 pb-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      <a
        href="/oauth2/authorization/google"
        className="w-full flex items-center justify-center gap-3 h-10 rounded-md border border-input bg-background px-8 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
        Continue with Google
      </a>
    </>
  )
}
