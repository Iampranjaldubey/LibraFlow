"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import { navigation } from "@/lib/navigation"
import { MobileToggle } from "@/components/dashboard/sidebar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Sun, Moon, Bell, Search } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb() {
  const pathname = usePathname()
  const page = navigation.find((n) => n.href === pathname)
  const label = page?.name ?? "Dashboard"

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-2 text-sm select-none"
      >
        {/* Desktop: full breadcrumb with "LibraFlow /" prefix */}
        <span className="hidden lg:inline text-muted-foreground/60 font-medium">LibraFlow</span>
        <span className="hidden lg:inline text-muted-foreground/30">/</span>

        {/* Both mobile + desktop: current page name */}
        <span className="font-semibold text-foreground text-sm sm:text-base lg:text-sm">
          {label}
        </span>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const isDark = resolvedTheme === "dark"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
            className={cn(
              // 44×44 touch target on mobile, 36×36 on desktop
              "relative h-11 w-11 sm:h-9 sm:w-9 rounded-xl sm:rounded-lg",
              "text-muted-foreground hover:text-foreground hover:bg-accent",
              "overflow-hidden transition-colors duration-150",
            )}
          >
            {/* Sun */}
            <motion.span
              className="absolute flex items-center justify-center"
              animate={mounted
                ? { opacity: isDark ? 0 : 1, rotate: isDark ? -90 : 0, scale: isDark ? 0.5 : 1 }
                : {}}
              transition={{ duration: 0.25 }}
            >
              <Sun className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
            </motion.span>
            {/* Moon */}
            <motion.span
              className="absolute flex items-center justify-center"
              animate={mounted
                ? { opacity: isDark ? 1 : 0, rotate: isDark ? 0 : 90, scale: isDark ? 1 : 0.5 }
                : {}}
              transition={{ duration: 0.25 }}
            >
              <Moon className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
            </motion.span>
          </Button>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent>{isDark ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  )
}

// ─── NavAction button ─────────────────────────────────────────────────────────

interface NavActionProps {
  icon: React.ReactNode
  label: string
  badge?: boolean
  onClick?: () => void
}

function NavAction({ icon, label, badge = false, onClick }: NavActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            aria-label={label}
            className={cn(
              // 44×44 touch target on mobile, 36×36 on desktop
              "relative h-11 w-11 sm:h-9 sm:w-9 rounded-xl sm:rounded-lg",
              "text-muted-foreground hover:text-foreground hover:bg-accent",
              "transition-colors duration-150",
            )}
          >
            {/* Scale icon up slightly on mobile for easier tapping */}
            <span className="flex items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px] sm:[&_svg]:h-4 sm:[&_svg]:w-4">
              {icon}
            </span>
            {badge && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.6 }}
                className="absolute top-2 right-2 sm:top-0.5 sm:right-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background"
              />
            )}
          </Button>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// ─── TopNavbar ────────────────────────────────────────────────────────────────

export function TopNavbar() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        // Height: 56px on mobile (comfortable touch), 56px on desktop
        "sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between",
        "border-b border-border/60 bg-background/80 backdrop-blur-md",
        // Tighter horizontal padding on mobile
        "px-3 sm:px-4 lg:px-6",
      )}
    >
      {/* Left: hamburger + page title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <MobileToggle />
        <Breadcrumb />
      </div>

      {/* Right: action icons */}
      <TooltipProvider delayDuration={300}>
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          // Tighter gap on mobile — icons are already large enough
          className="flex items-center gap-0 sm:gap-0.5"
        >
          <NavAction
            icon={<Search />}
            label="Search (⌘K)"
          />
          <NavAction
            icon={<Bell />}
            label="Notifications"
            badge
          />
          <ThemeToggle />
        </motion.div>
      </TooltipProvider>
    </motion.header>
  )
}
