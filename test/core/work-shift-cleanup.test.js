'use strict';

const { cleanupWorkShiftConfig } = require('../../core/work-shift');

describe('cleanupWorkShiftConfig', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 19, 12));
  });
  afterEach(() => vi.useRealTimers());

  it('removes past holidays and months without mutating the argument', () => {
    const workShift = {
      enabled: true,
      regular: { holidays: ['2026-10-18', '2026-10-19', '2026-12-25'], slots: [] },
      variable: { months: { '2026-09': { 1: [] }, '2026-10': {}, '2026-11': {} } },
    };
    const copy = JSON.parse(JSON.stringify(workShift));
    expect(cleanupWorkShiftConfig(workShift)).toEqual({
      changed: true,
      workShift: {
        enabled: true,
        regular: { holidays: ['2026-10-19', '2026-12-25'], slots: [] },
        variable: { months: { '2026-10': {}, '2026-11': {} } },
      },
    });
    expect(workShift).toEqual(copy);
  });

  it.each([
    undefined,
    null,
    {},
    { regular: {}, variable: {} },
    { regular: { holidays: [] }, variable: { months: {} } },
    { regular: { holidays: ['2026-10-19'] }, variable: { months: { '2026-10': {} } } },
  ])('returns unchanged config when nothing expires: %j', (workShift) => {
    expect(cleanupWorkShiftConfig(workShift)).toEqual({ workShift, changed: false });
  });

  it('cleans holidays when variable shifts are absent', () => {
    const workShift = { regular: { holidays: ['2026-10-18'] } };
    expect(cleanupWorkShiftConfig(workShift)).toEqual({
      workShift: { regular: { holidays: [] } },
      changed: true,
    });
    expect(workShift.regular.holidays).toEqual(['2026-10-18']);
  });

  it('cleans months when regular shifts are absent', () => {
    const workShift = { variable: { months: { '2026-09': {} } } };
    expect(cleanupWorkShiftConfig(workShift)).toEqual({
      workShift: { variable: { months: {} } },
      changed: true,
    });
    expect(workShift.variable.months).toEqual({ '2026-09': {} });
  });
});
