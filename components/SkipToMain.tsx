/**
 * `<SkipToMain>` — visually-hidden anchor that becomes visible on
 * keyboard focus, allowing keyboard / screen-reader users to skip past
 * the persistent header navigation and land directly on the page's
 * `<main id="main">` region.
 *
 * Renders as the very first focusable element inside `<body>`, so a
 * single Tab keystroke from a fresh page load reveals it. Activation
 * follows the `#main` fragment which scrolls the page and shifts focus
 * to the matching landmark.
 */
export function SkipToMain() {
  return (
    <a
      href="#main"
      className={
        "sr-only focus-visible:not-sr-only " +
        "focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 " +
        "focus-visible:rounded-md focus-visible:bg-foreground focus-visible:px-3 focus-visible:py-2 " +
        "focus-visible:text-sm focus-visible:font-medium focus-visible:text-background " +
        "focus-visible:shadow-lg focus-visible:outline-none focus-visible:ring-2 " +
        "focus-visible:ring-ring"
      }
    >
      Skip to main content
    </a>
  );
}
