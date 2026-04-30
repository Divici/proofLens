/**
 * Minimal ambient declaration for the `convert-units` package — the
 * library ships no upstream types and `@types/convert-units` does not
 * exist on npm. We type only the API surface we use in `lib/verify/strict/
 * net-contents.ts`.
 */
declare module "convert-units" {
  type Unit =
    | "ml"
    | "l"
    | "cl"
    | "fl-oz"
    | "pnt"
    | "qt"
    | "gal"
    | "tsp"
    | "Tbs";

  interface Convert {
    from(unit: Unit): { to(unit: Unit): number };
  }

  function convert(value: number): Convert;

  export default convert;
}
