/**
 * Bound how long a server action waits for a dependency. The underlying
 * operation is not cancelled, so use this only for read-only or idempotent
 * work whose late completion cannot duplicate the main transaction.
 */
export function withActionDeadline<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([Promise.resolve(operation), deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
