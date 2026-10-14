// Runs once when the Next.js server starts: boot the simulator, then attach MongoDB persistence
// in the background (the dashboard works from memory even before, or without, the database).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getRuntime } = await import("./server/runtime");
    const { attachPersistence } = await import("./server/persistence/persistence");
    void attachPersistence(getRuntime());
  }
}
