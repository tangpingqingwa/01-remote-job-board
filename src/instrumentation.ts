/** Keep node-only startup dependencies out of Next's edge instrumentation bundle. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { register: registerNode } = await import("./instrumentation-node");
  registerNode();
}
