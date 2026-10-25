import { Library, BookOpen, Users, ArrowLeftRight } from "lucide-react"

const features = [
  {
    icon: BookOpen,
    title: "Smart Catalogue",
    description: "Search, filter, and manage your entire book inventory in one place.",
  },
  {
    icon: Users,
    title: "Member Management",
    description: "Track members, issue books, and manage borrowing history effortlessly.",
  },
  {
    icon: ArrowLeftRight,
    title: "Transaction Tracking",
    description: "Real-time visibility into every issue, return, and overdue fine.",
  },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background">

      {/* ── Left panel — branding (lg+ only) ── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative flex-col justify-between p-12 overflow-hidden">
        {/* Layered background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px] -translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/6 blur-[100px] translate-x-1/4 translate-y-1/4" />
        </div>

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/30">
              <Library className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">LibraFlow</span>
          </div>
        </div>

        {/* Hero copy + features */}
        <div className="relative z-10 space-y-10">
          <div className="space-y-4">
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
              Your library,
              <br />
              <span className="text-primary">intelligently</span>
              <br />
              managed.
            </h1>
            <p className="text-base text-muted-foreground max-w-sm leading-relaxed">
              A modern platform for librarians and members to manage books,
              transactions, and memberships — all in one place.
            </p>
          </div>

          <div className="space-y-4">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-xs text-muted-foreground/50">
            © {new Date().getFullYear()} LibraFlow. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      {/*
        On mobile this is the full screen.
        overflow-y-auto + min-h-screen ensures the form is scrollable on
        very small viewports (e.g. register page with many fields).
      */}
      <div className="flex flex-1 flex-col min-h-screen overflow-y-auto">
        {/* Mobile top bar */}
        <div className="flex lg:hidden items-center justify-center pt-8 pb-2 px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/30">
              <Library className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-bold tracking-tight text-foreground">LibraFlow</span>
          </div>
        </div>

        {/* Form centred vertically on desktop, top-aligned on mobile */}
        <div className="flex flex-1 flex-col items-center justify-start lg:justify-center px-5 sm:px-8 py-6 sm:py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>

        {/* Mobile footer */}
        <div className="flex lg:hidden justify-center pb-6 px-6">
          <p className="text-xs text-muted-foreground/50 text-center">
            © {new Date().getFullYear()} LibraFlow. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
