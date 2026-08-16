export async function waitFor(
  // Async conditions are awaited: a returned Promise is always truthy, so a
  // sync-only signature would let an `async` probe fall through immediately.
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 100));
  }
}
