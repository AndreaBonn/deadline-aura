'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  onboardingMarkerPath,
  isFirstRun,
  markOnboardingDone,
  isWaylandSession,
} = require('../../core/onboarding');

describe('onboarding marker', () => {
  let home;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'da-onboarding-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('places the marker in the app data directory', () => {
    expect(onboardingMarkerPath(home)).toBe(
      path.join(home, '.local', 'share', 'deadlineaura', 'onboarding-done'),
    );
  });

  it('reports a first run until the marker is written', () => {
    const marker = onboardingMarkerPath(home);

    expect(isFirstRun(marker)).toBe(true);
    markOnboardingDone(marker);
    expect(isFirstRun(marker)).toBe(false);
  });

  it('creates the missing data directory when writing the marker', () => {
    const marker = onboardingMarkerPath(home);

    markOnboardingDone(marker);

    expect(fs.existsSync(marker)).toBe(true);
  });
});

describe('isWaylandSession', () => {
  it('detects a Wayland session from XDG_SESSION_TYPE', () => {
    expect(isWaylandSession({ XDG_SESSION_TYPE: 'wayland' })).toBe(true);
  });

  it('treats X11 or an unknown session as supported', () => {
    expect(isWaylandSession({ XDG_SESSION_TYPE: 'x11' })).toBe(false);
    expect(isWaylandSession({})).toBe(false);
  });
});
