"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth-context"
import { authService } from "@/lib/auth"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

/**
 * Landing page after Google sign-in.
 *
 * The backend sets the HttpOnly refresh-token cookie and redirects here with
 * NO credentials in the URL (tokens in query strings leak via history, logs and
 * Referer). We exchange that cookie for an access token with a same-origin
 * POST /api/v1/auth/refresh, then hydrate the auth context.
 */
export default function OAuthCallbackPage() {
  const router = useRouter()
  const { login } = useAuth()
  // React StrictMode runs effects twice in dev; a second /refresh would present
  // an already-rotated token and trip reuse detection, revoking the session.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    authService
      .refresh()
      .then((user) => {
        login(user)
        toast.success("Signed in with Google")
        router.replace("/dashboard")
      })
      .catch(() => {
        toast.error("Failed to complete Google sign-in")
        router.replace("/login?oauth_error=1")
      })
  }, [router, login])

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}
