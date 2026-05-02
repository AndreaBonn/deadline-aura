const { hslToHex, mapScoreToColor } = require('../../core/color-mapper');

describe('hslToHex branch coverage', () => {
  it('converts h=180 (cyan) correctly', () => {
    const hex = hslToHex(180, 100, 50);
    expect(hex).toBe('#00ffff');
  });

  it('converts h=200 (blue-green range 180-240)', () => {
    const hex = hslToHex(200, 100, 50);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('converts h=240 (blue) correctly', () => {
    const hex = hslToHex(240, 100, 50);
    expect(hex).toBe('#0000ff');
  });

  it('converts h=270 (purple range 240-300)', () => {
    const hex = hslToHex(270, 100, 50);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('converts h=300 (magenta)', () => {
    const hex = hslToHex(300, 100, 50);
    expect(hex).toBe('#ff00ff');
  });

  it('converts h=330 (pink range 300-360)', () => {
    const hex = hslToHex(330, 100, 50);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('handles h=60 (yellow)', () => {
    const hex = hslToHex(60, 100, 50);
    expect(hex).toBe('#ffff00');
  });

  it('handles exact boundary h=119', () => {
    const hex = hslToHex(119, 100, 50);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('handles exact boundary h=179', () => {
    const hex = hslToHex(179, 100, 50);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('handles exact boundary h=239', () => {
    const hex = hslToHex(239, 100, 50);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('handles exact boundary h=299', () => {
    const hex = hslToHex(299, 100, 50);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('handles low saturation gray', () => {
    const hex = hslToHex(0, 0, 50);
    expect(hex).toBe('#808080');
  });
});

describe('mapScoreToColor — exact boundary 1.0', () => {
  it('score exactly 1.0 uses last band', () => {
    const result = mapScoreToColor(1.0);
    expect(result.label).toBe('critico');
  });

  it('score exactly on band boundary 0.2 uses second band', () => {
    const result = mapScoreToColor(0.2);
    expect(result.label).toBe('normale');
  });

  it('score exactly on band boundary 0.4 uses third band', () => {
    const result = mapScoreToColor(0.4);
    expect(result.label).toBe('attenzione');
  });

  it('score exactly on band boundary 0.6 uses fourth band', () => {
    const result = mapScoreToColor(0.6);
    expect(result.label).toBe('urgente');
  });

  it('score exactly on band boundary 0.8 uses fifth band', () => {
    const result = mapScoreToColor(0.8);
    expect(result.label).toBe('critico');
  });

  it('accent_hex has higher lightness than base hex', () => {
    const result = mapScoreToColor(0.5);
    // accent should be brighter
    expect(result.accent_hex).not.toBe(result.hex);
  });
});
