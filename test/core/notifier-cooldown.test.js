'use strict';

const childProcess = require('child_process');
const { send, sendBurnoutWarning, shouldNotify, _resetForTest } = require('../../core/notifier');

function makeConfig(overrides = {}) {
  return {
    notifications: {
      enabled: true,
      threshold_score: 0.85,
      cooldown_minutes: 30,
      ...overrides,
    },
  };
}

function makeEngineResult(overrides = {}) {
  return {
    global_score: 0.9,
    tasks: [
      { id: 't1', title: 'Urgent Task', urgency_score: 0.95, priority: 1, hours_remaining: 2 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  _resetForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('notifier — send() success path', () => {
  it('returns sent:true and task id when notify-send succeeds', () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0, error: undefined });

    const result = send(makeEngineResult(), makeConfig());

    expect(result.sent).toBe(true);
    expect(result.task).toBe('t1');
  });

  it('returns sent:false with error when notify-send exits non-zero', () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 1, error: undefined });

    const result = send(makeEngineResult(), makeConfig());

    expect(result.sent).toBe(false);
    expect(result.error).toBe('notify-send failed');
  });

  it('returns sent:false with error when spawnSync has error property set', () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({
      status: 0,
      error: new Error('ENOENT'),
    });

    const result = send(makeEngineResult(), makeConfig());

    expect(result.sent).toBe(false);
    expect(result.error).toBe('notify-send failed');
  });

  it('returns sent:false when spawnSync throws', () => {
    vi.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
      throw new Error('spawn error');
    });

    const result = send(makeEngineResult(), makeConfig());

    expect(result.sent).toBe(false);
    expect(result.error).toBe('notify-send failed');
  });
});

describe('notifier — shouldNotify cooldown', () => {
  it('returns false when within cooldown window after a sent notification', () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0, error: undefined });

    const config = makeConfig({ cooldown_minutes: 60 });
    const engineResult = makeEngineResult();

    const first = send(engineResult, config);
    expect(first.sent).toBe(true);

    const result = shouldNotify(engineResult, config);
    expect(result).toBe(false);
  });
});

describe('notifier - sendBurnoutWarning', () => {
  const warning = { severity: 'high', triggers: ['Insufficient recovery'] };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['exits unsuccessfully', () => ({ status: 1 })],
    ['returns a spawn error', () => ({ status: null, error: new Error('ENOENT') })],
    [
      'throws synchronously',
      () => {
        throw new Error('spawn failed');
      },
    ],
  ])('returns a failure result when notify-send %s', (_scenario, spawn) => {
    vi.spyOn(childProcess, 'spawnSync').mockImplementation(spawn);

    const result = sendBurnoutWarning(warning, makeConfig());

    expect(result).toEqual({ sent: false, error: 'notify-send failed' });
  });
});
