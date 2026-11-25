/**
 * Desktop attention helpers: a system notification and a window raise, so the
 * user notices when a publisher shows a robot check or a sign-in page that only
 * a human can complete.
 */

import { execFileSync } from 'node:child_process'

/** Persistent desktop notification (critical urgency, no timeout) when supported. */
export function notify(title, body) {
  try {
    execFileSync('notify-send', ['-u', 'critical', '-a', 'CARSI 文献', '-t', '0', title, body], {
      timeout: 5000,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

/** Bring the research browser window to the front, if a window manager allows it. */
export function raiseBrowser() {
  for (const [title] of [['Google Chrome'], ['google-chrome'], ['Chromium'], ['chrome']]) {
    try {
      execFileSync('wmctrl', ['-a', title], { timeout: 4000, stdio: 'ignore' })
      return true
    } catch {
      /* try the next window title */
    }
  }
  return false
}

/** Alert the user about a page that needs their hands, and say what was done. */
export function requestHuman(action, detail) {
  const notified = notify(`${action} · 需要你操作`, detail)
  const raised = raiseBrowser()
  return { notified, raised }
}
