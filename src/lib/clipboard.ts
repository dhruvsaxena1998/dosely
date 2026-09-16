/**
 * Putting text on the clipboard, and saying whether it landed.
 *
 * The one place in the app that touches the Clipboard API. It is refused more
 * often than it is missing: Safari only grants it inside the gesture that asked
 * for it, and any browser will deny it outright over plain http. Both come back
 * as a rejected promise rather than a missing method, so there is nothing to
 * feature-detect and everything to catch.
 *
 * Never throws. A copy that did not happen has to be a face the button can
 * wear, not an error the screen has to handle.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
