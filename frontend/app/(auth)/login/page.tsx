"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { authService, AuthError } from "@/lib/auth"
import { useAuth } from "@/context/auth-context"
import { FormField } from "@/components/auth/form-field"
import { PasswordInput } from "@/components/auth/password-input"
import { LoginFormSkeleton } from "@/components/auth/auth-form-skeleton"
import { LoadingButton } from "@/components/ui/button-loader"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { motion } from "framer-motion"
import { AlertCircle } from "lucide-react"

// ─── Validation schema ────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required"),
})

type LoginForm = z.infer<typeof loginSchema>

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const { login, isAuthenticated, isLoading: authLoading } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/dashboard")
    }
  }, [isAuthenticated, authLoading, router])

  // Graceful session-expiry notice: the API layer redirects here with ?expired=1
  // when a silent refresh fails. Read it from the URL directly to avoid the
  // useSearchParams Suspense requirement (keeps this page statically rendered).
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("expired") === "1") {
      setServerError("Your session expired. Please sign in again.")
      toast.info("Session expired", { description: "Please sign in again to continue." })
    }
    const oauthError = params.get("oauth_error")
    if (oauthError) {
      setServerError(
        oauthError === "inactive"
          ? "Your account has been deactivated. Please contact the library administrator."
          : "Google sign-in failed. Please try again or use your email and password."
      )
    }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (data: LoginForm) => {
    setServerError(null)
    try {
      const user = await authService.login(data)
      login(user)
      toast.success("Welcome back!", {
        description: `Signed in as ${user.name}`,
      })
      router.replace("/dashboard")
    } catch (err) {
      if (err instanceof AuthError) {
        setServerError(err.message)
        if (err.status === 401) {
          toast.error("Invalid credentials", {
            description: "Check your email and password and try again.",
          })
        } else if (err.status === 429) {
          toast.error("Too many attempts", { description: err.message })
        }
      } else {
        setServerError("Something went wrong. Please try again.")
        toast.error("Login failed")
      }
    }
  }

  // Don't flash the form while checking stored session
  if (authLoading) return <LoginFormSkeleton />

  return (
    <div className="space-y-7">
      {/* Heading */}
      <div className="space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign in</h2>
        <p className="text-sm text-muted-foreground">
          Enter your credentials to access your account
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Server-level error banner */}
        {serverError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3"
          >
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive leading-snug">{serverError}</p>
          </motion.div>
        )}

        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            placeholder="you@library.com"
            autoComplete="email"
            autoFocus
            aria-invalid={!!errors.email}
            className="bg-white/5 border-white/10 placeholder:text-muted-foreground/40 focus-visible:border-primary/50 focus-visible:ring-primary/15"
            {...register("email")}
          />
        </FormField>

        <FormField id="password" label="Password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
        </FormField>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-primary cursor-pointer"
            />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors duration-150">
              Remember me
            </span>
          </label>
          <Link
            href="/forgot-password"
            className="text-sm text-primary/80 hover:text-primary transition-colors duration-150"
          >
            Forgot password?
          </Link>
        </div>

        <LoadingButton
          type="submit"
          isLoading={isSubmitting}
          loadingText="Signing in…"
          showProgress
          className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
        >
          Sign in
        </LoadingButton>
      </form>

      <GoogleSignInButton />

      {/* Footer */}
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}
