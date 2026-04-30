import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center sm:px-6"
      >
        <p className="text-muted-foreground text-sm tracking-wider uppercase">
          alcohol label verification
        </p>
        <h1 className="text-foreground text-4xl font-semibold tracking-tight sm:text-5xl">
          proofLens
        </h1>
        <p className="text-muted-foreground max-w-xl text-balance text-base sm:text-lg">
          Upload a label, verify it against expected application data, and ship
          decisions faster — without losing the human in the loop.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/review" className={buttonVariants({ size: "lg" })}>
            Start a review
          </Link>
          <Link
            href="/history"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            View history
          </Link>
        </div>
      </main>
    </>
  );
}
