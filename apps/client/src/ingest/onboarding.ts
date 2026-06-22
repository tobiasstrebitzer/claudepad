import type { OS, OnboardingInfo } from './types'

// OS-aware onboarding guidance (PRD-04 §4.1, FR-7/FR-8): where Claude Code session
// files live, and a one-liner that lists the most-recently-modified ones (the latest
// session). These are display strings only - they never read or transmit file contents.

const INFO: Record<OS, OnboardingInfo> = {
  mac: {
    os: 'mac',
    label: 'macOS',
    path: '~/.claude/projects/<project-slug>/<session-id>.jsonl',
    listOneLiner: 'ls -t ~/.claude/projects/*/*.jsonl | head'
  },
  linux: {
    os: 'linux',
    label: 'Linux',
    path: '~/.claude/projects/<project-slug>/<session-id>.jsonl',
    listOneLiner: 'ls -t ~/.claude/projects/*/*.jsonl | head'
  },
  win: {
    os: 'win',
    label: 'Windows',
    path: '%USERPROFILE%\\.claude\\projects\\<project-slug>\\<session-id>.jsonl',
    listOneLiner:
      'Get-ChildItem $env:USERPROFILE\\.claude\\projects\\*\\*.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 10'
  },
  wsl: {
    os: 'wsl',
    label: 'WSL',
    path: '\\\\wsl$\\<distro>\\home\\<user>\\.claude\\projects\\<project-slug>\\<session-id>.jsonl',
    listOneLiner: 'ls -t ~/.claude/projects/*/*.jsonl | head'
  }
}

const ORDER: OS[] = ['mac', 'linux', 'win', 'wsl']

/** Guidance for one OS. */
export function onboardingPaths(os: OS): OnboardingInfo {
  return INFO[os]
}

/**
 * All four OS guides, with the detected OS first (the rest stay available behind a
 * disclosure per FR-7). `detected` defaults to a best-effort browser detection.
 */
export function allOnboarding(detected: OS = detectOS()): OnboardingInfo[] {
  return [detected, ...ORDER.filter((o) => o !== detected)].map((o) => INFO[o])
}

/**
 * Best-effort OS detection from the User-Agent (FR-7). WSL is not reliably
 * detectable from a browser UA, so a Linux UA resolves to 'linux' (WSL stays
 * visible in the disclosure). Defaults to 'mac' when nothing matches.
 */
export function detectOS(ua?: string): OS {
  const s = (ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')) || ''
  if (/windows|win32|win64/i.test(s)) return 'win'
  if (/mac os x|macintosh|mac_powerpc/i.test(s)) return 'mac'
  if (/linux|x11|cros/i.test(s)) return 'linux'
  return 'mac'
}
