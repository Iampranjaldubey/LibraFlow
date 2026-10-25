"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { navigation } from "@/lib/navigation"
import { useAuth } from "@/context/auth-context"
import { RoleBadge } from "@/components/auth/role-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Library,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { staggerContainer, staggerItem } from "@/lib/animations"
import type { Role } from "@/lib/auth"

// ─── Sidebar width constants ──────────────────────────────────────────────────

export const SIDEBAR_EXPANDED_W  = 256 // px  (w-64)
export const SIDEBAR_COLLAPSED_W = 64  // px  (w-16)

// ─── Shared sidebar state (module-level singleton) ────────────────────────────
// Using a simple pub/sub so every consumer re-renders on change without
// needing a context provider in the tree.

interface SidebarState {
  isCollapsed: boolean
  isMobileOpen: boolean
}

let _state: SidebarState = { isCollapsed: false, isMobileOpen: false }
const _listeners = new Set<() => void>()

function _setState(patch: Partial<SidebarState>) {
  _state = { ..._state, ...patch }
  _listeners.forEach((fn) => fn())
}

export function useSidebarState(): [SidebarState, (patch: Partial<SidebarState>) => void] {
  const [, rerender] = useState(0)

  useEffect(() => {
    const notify = () => rerender((n) => n + 1)
    _listeners.add(notify)
    return () => { _listeners.delete(notify) }
  }, [])

  return [_state, _setState]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useVisibleNav() {
  const { user } = useAuth()
  return navigation.filter((item) => {
    if (!item.allowedRoles) return true
    return user?.role && item.allowedRoles.includes(user.role as Role)
  })
}

function useInitials() {
  const { user } = useAuth()
  return user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "LO"
}

// ─── NavItem ──────────────────────────────────────────────────────────────────

interface NavItemProps {
  item: (typeof navigation)[number]
  isActive: boolean
  isCollapsed: boolean
  onClick?: () => void
  layoutId: string
}

function NavItem({ item, isActive, isCollapsed, onClick, layoutId }: NavItemProps) {
  return (
    <motion.div variants={staggerItem} whileTap={{ scale: 0.97 }}>
      <Link
        href={item.href}
        onClick={onClick}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-3 lg:py-2.5 text-sm font-medium",
          "transition-colors duration-150 overflow-hidden",
          isCollapsed && "justify-center",
          isActive
            ? "text-primary"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
        )}
      >
        {/* Animated active background */}
        {isActive && (
          <motion.span
            layoutId={layoutId}
            className="absolute inset-0 rounded-xl bg-primary/10"
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}

        {/* Left accent bar */}
        {isActive && (
          <motion.span
            layoutId={`${layoutId}-bar`}
            className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-primary"
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}

        {/* Icon */}
        <motion.span
          className="relative z-10 shrink-0"
          whileHover={{ scale: 1.15, rotate: 4 }}
          transition={{ type: "spring", stiffness: 400, damping: 12 }}
        >
          <item.icon
            className={cn(
              "h-[18px] w-[18px] transition-colors duration-150",
              isActive
                ? "text-primary"
                : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground",
            )}
          />
        </motion.span>

        {/* Label */}
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.span
              key="label"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              className="relative z-10 flex-1 truncate"
            >
              {item.name}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Trailing chevron */}
        <AnimatePresence initial={false}>
          {isActive && !isCollapsed && (
            <motion.span
              key="chevron"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
              className="relative z-10"
            >
              <ChevronRight className="h-3 w-3 text-primary/50" />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Tooltip when collapsed */}
        {isCollapsed && (
          <span
            className={cn(
              "pointer-events-none absolute left-full ml-3 z-50",
              "rounded-lg border border-border bg-popover px-2.5 py-1.5",
              "text-xs font-medium text-popover-foreground shadow-md",
              "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
              "whitespace-nowrap",
            )}
          >
            {item.name}
          </span>
        )}
      </Link>
    </motion.div>
  )
}

// ─── UserFooter ───────────────────────────────────────────────────────────────

interface UserFooterProps {
  isCollapsed: boolean
  onLogout: () => void
}

function UserFooter({ isCollapsed, onLogout }: UserFooterProps) {
  const { user } = useAuth()
  const initials = useInitials()

  return (
    <div className="border-t border-sidebar-border/50 p-3 space-y-1">
      {user && (
        <Link
          href="/dashboard/profile"
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5",
            "transition-colors hover:bg-sidebar-accent/60",
            isCollapsed && "justify-center",
          )}
        >
          <Avatar className="h-8 w-8 shrink-0 ring-2 ring-primary/20">
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.div
                key="user-info"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="flex-1 min-w-0"
              >
                <p className="text-sm font-medium text-sidebar-foreground truncate leading-none">
                  {user.name}
                </p>
                <div className="mt-1.5">
                  <RoleBadge role={user.role} size="sm" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tooltip when collapsed */}
          {isCollapsed && (
            <span
              className={cn(
                "pointer-events-none absolute left-full ml-3 z-50",
                "rounded-lg border border-border bg-popover px-3 py-2",
                "text-xs shadow-md",
                "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                "whitespace-nowrap space-y-1",
              )}
            >
              <p className="font-medium text-popover-foreground">{user.name}</p>
              <RoleBadge role={user.role} size="sm" />
            </span>
          )}
        </Link>
      )}

      {/* Sign out */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.97 }}
        onClick={onLogout}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5",
          "text-sm font-medium text-sidebar-foreground/55",
          "transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive",
          isCollapsed && "justify-center",
        )}
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" />

        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.span
              key="signout-label"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              Sign out
            </motion.span>
          )}
        </AnimatePresence>

        {isCollapsed && (
          <span
            className={cn(
              "pointer-events-none absolute left-full ml-3 z-50",
              "rounded-lg border border-border bg-popover px-2.5 py-1.5",
              "text-xs font-medium text-popover-foreground shadow-md",
              "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
              "whitespace-nowrap",
            )}
          >
            Sign out
          </span>
        )}
      </motion.button>
    </div>
  )
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const { logout } = useAuth()
  const [{ isCollapsed }, setState] = useSidebarState()
  const visibleNav = useVisibleNav()

  const handleLogout = useCallback(() => {
    toast.success("Logged out successfully")
    logout()
  }, [logout])

  const toggleCollapsed = useCallback(() => {
    setState({ isCollapsed: !isCollapsed })
  }, [isCollapsed, setState])

  // ⌘B / Ctrl+B keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        setState({ isCollapsed: !_state.isCollapsed })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setState])

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{ width: isCollapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col",
        "glass-sidebar",
        "transition-[width] duration-300 ease-in-out",
      )}
    >
      {/* ── Logo + collapse toggle ── */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border/50 px-3">
        <AnimatePresence mode="wait" initial={false}>
          {!isCollapsed ? (
            <motion.div
              key="full-logo"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-3 overflow-hidden"
            >
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.55, ease: "easeInOut" }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/25"
              >
                <Library className="h-5 w-5 text-primary-foreground" />
              </motion.div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-sidebar-foreground tracking-tight leading-none">
                  LibraFlow
                </p>
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/35 leading-none">
                  Management
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="icon-logo"
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: 0.18 }}
              whileHover={{ rotate: 360 }}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/25"
            >
              <Library className="h-5 w-5 text-primary-foreground" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapse toggle — always visible */}
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-8 w-8 shrink-0 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <motion.span
              animate={{ rotate: isCollapsed ? 180 : 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex"
            >
              <ChevronLeft className="h-4 w-4" />
            </motion.span>
          </Button>
        </motion.div>
      </div>

      {/* ── Navigation ── */}
      <motion.nav
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-0.5"
      >
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.p
              key="menu-label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="mb-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/30"
            >
              Menu
            </motion.p>
          )}
        </AnimatePresence>

        {visibleNav.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            isActive={pathname === item.href}
            isCollapsed={isCollapsed}
            layoutId="desktop-active-nav"
          />
        ))}
      </motion.nav>

      {/* ── User footer ── */}
      <UserFooter isCollapsed={isCollapsed} onLogout={handleLogout} />
    </motion.aside>
  )
}

// ─── Mobile Sidebar ───────────────────────────────────────────────────────────

export function MobileSidebar() {
  const pathname = usePathname()
  const { logout } = useAuth()
  const [{ isMobileOpen }, setState] = useSidebarState()
  const visibleNav = useVisibleNav()

  const close = useCallback(() => setState({ isMobileOpen: false }), [setState])

  const handleLogout = useCallback(() => {
    close()
    toast.success("Logged out successfully")
    logout()
  }, [close, logout])

  // Close on route change
  useEffect(() => { close() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {isMobileOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={close}
            aria-hidden
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.9 }}
            className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col glass-sidebar lg:hidden"
          >
            {/* Header */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border/50 px-3">
              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.55, ease: "easeInOut" }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/25"
                >
                  <Library className="h-5 w-5 text-primary-foreground" />
                </motion.div>
                <div>
                  <p className="text-[15px] font-semibold text-sidebar-foreground tracking-tight leading-none">
                    LibraFlow
                  </p>
                  <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/35 leading-none">
                    Management
                  </p>
                </div>
              </div>

              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={close}
                  aria-label="Close navigation"
                  className="h-8 w-8 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>

            {/* Nav */}
            <motion.nav
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="flex-1 overflow-y-auto p-3 space-y-0.5"
            >
              <motion.p
                variants={staggerItem}
                className="mb-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/30"
              >
                Menu
              </motion.p>

              {visibleNav.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  isActive={pathname === item.href}
                  isCollapsed={false}
                  onClick={close}
                  layoutId="mobile-active-nav"
                />
              ))}
            </motion.nav>

            {/* Footer */}
            <UserFooter isCollapsed={false} onLogout={handleLogout} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Mobile hamburger toggle ──────────────────────────────────────────────────

export function MobileToggle() {
  const [{ isMobileOpen }, setState] = useSidebarState()

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.93 }}
      className="lg:hidden"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setState({ isMobileOpen: !isMobileOpen })}
        aria-label="Toggle navigation menu"
        className={cn(
          // 44×44 on mobile for comfortable thumb tap, 36×36 on sm+
          "h-11 w-11 sm:h-9 sm:w-9 rounded-xl sm:rounded-lg",
          "border border-border bg-card shadow-sm hover:bg-accent",
          "transition-colors duration-150",
        )}
      >
        <motion.span
          animate={{ rotate: isMobileOpen ? 90 : 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="flex items-center justify-center"
        >
          <Menu className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
        </motion.span>
      </Button>
    </motion.div>
  )
}
