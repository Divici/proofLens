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
        "sr-only focus:not-sr-only " +
        "focus:fixed focus:left-4 focus:top-4 focus:z-50 " +
        "focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 " +
        "focus:text-sm focus:font-medium focus:text-background " +
        "focus:shadow-lg focus:outline-none focus-visible:ring-2 " +
        "focus-visible:ring-ring"
      }
    >
      Skip to main content
    </a>
  );
}
