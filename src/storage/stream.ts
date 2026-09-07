export function streamWithCleanup(
  source: ReadableStream<Uint8Array>,
  cleanup: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  let cleanedUp = false

  function cleanupOnce() {
    if (cleanedUp) return
    cleanedUp = true
    cleanup()
  }

  return new ReadableStream<Uint8Array>({
    async cancel(reason: unknown) {
      try {
        await reader.cancel(reason)
      } finally {
        cleanupOnce()
      }
    },
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          cleanupOnce()
          controller.close()
          return
        }
        controller.enqueue(result.value)
      } catch (error: unknown) {
        cleanupOnce()
        controller.error(error)
      }
    },
  })
}
