import pkg from "@/package.json";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-static";

export const metadata = {
  title: "About proofLens",
  description:
    "AI-powered alcohol-label verification for TTB compliance reviewers.",
};

export default function AboutPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <article className="space-y-6">
          <header className="space-y-2">
            <p className="text-muted-foreground text-sm tracking-wider uppercase">
              About
            </p>
            <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
              proofLens
            </h1>
            <p className="text-muted-foreground text-lg">
              AI-powered alcohol-label verification for TTB compliance
              reviewers.
            </p>
          </header>

          <section className="text-foreground/90 space-y-4 text-base leading-7">
            <p>
              proofLens helps compliance reviewers verify that uploaded
              alcohol-label artwork matches the expected application data.
              Labels are extracted, compared against TTB rules
              (27 CFR Parts 4, 5, and 7), flagged with explanations and
              confidence, and surfaced for human override and final decision.
            </p>
            <p>
              All review history lives in your browser via IndexedDB. No
              originals are retained server-side.
            </p>
          </section>

          <dl className="text-muted-foreground border-border/60 grid grid-cols-1 gap-3 border-t pt-6 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <dt className="font-medium">Project</dt>
              <dd>{pkg.name}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="font-medium">Version</dt>
              <dd>
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  v{pkg.version}
                </code>
              </dd>
            </div>
          </dl>
        </article>
      </main>
    </>
  );
}
