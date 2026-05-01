import Link from "next/link";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  /** When true the link points to a route that has not shipped yet. */
  comingSoon?: boolean;
}

const NAV_LINKS: ReadonlyArray<NavLink> = [
  { href: "/review", label: "New review" },
  { href: "/batch", label: "Batch" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function SiteNav() {
  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-30 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6"
      >
        <Link
          href="/"
          className="text-foreground text-base font-semibold tracking-tight rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          proofLens
        </Link>
        <ul className="flex items-center gap-1 text-sm">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              {link.comingSoon ? (
                <span
                  role="link"
                  aria-disabled="true"
                  tabIndex={-1}
                  title="Coming soon"
                  data-testid={`nav-disabled-${link.href.replace(/^\//, "")}`}
                  className={cn(
                    "text-muted-foreground/60 inline-flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-2 select-none",
                  )}
                >
                  {link.label}
                  <span className="border-border/60 text-muted-foreground/80 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    Soon
                  </span>
                </span>
              ) : (
                <Link
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
