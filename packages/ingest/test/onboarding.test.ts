import { describe, it, expect } from 'vitest';
import { detectOS, onboardingPaths, allOnboarding } from '../src/onboarding';

describe('onboarding (PRD-04 FR-7/FR-8)', () => {
  it('detects OS from the user-agent', () => {
    expect(detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
    expect(detectOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('win');
    expect(detectOS('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(detectOS('totally unknown agent')).toBe('mac');
  });

  it('gives OS-correct paths and list one-liners', () => {
    expect(onboardingPaths('mac').path).toContain('~/.claude/projects');
    expect(onboardingPaths('mac').listOneLiner).toContain('ls -t');
    expect(onboardingPaths('win').path).toContain('%USERPROFILE%');
    expect(onboardingPaths('win').listOneLiner).toContain('Get-ChildItem');
    expect(onboardingPaths('wsl').path).toContain('wsl$');
  });

  it('lists all four OSes with the detected one first', () => {
    const list = allOnboarding('win');
    expect(list).toHaveLength(4);
    expect(list[0]?.os).toBe('win');
    expect(new Set(list.map((i) => i.os))).toEqual(
      new Set(['mac', 'linux', 'win', 'wsl']),
    );
  });
});
