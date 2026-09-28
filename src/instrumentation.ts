// Runs once when the Next.js server starts: boot the simulator before the first request.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getRuntime } = await import("./server/sim/runtime");
    getRuntime();
  }
}
