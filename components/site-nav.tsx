import Link from "next/link";

const NAV_LINKS = [
  { href: "/review", label: "New review" },
  { href: "/batch", label: "Batch" },
  { href: "/history", label: "History" },
] as const;

export function SiteNav() {
  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-30 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6"
      >
        <Link
          href="/"
          className="text-foreground text-base font-semibold tracking-tight"
        >
          proofLens
        </Link>
        <ul className="flex items-center gap-1 text-sm">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-md px-3 py-2 transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
