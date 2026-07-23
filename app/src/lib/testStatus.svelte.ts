/**
 * Whether a speed test triggered from "Run test now" is currently in flight.
 * The root layout reads this for the document title — it needs to be visible
 * outside the dashboard component that owns the actual run state.
 */
export const testStatus = $state({ running: false });
