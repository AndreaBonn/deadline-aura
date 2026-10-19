const childProcess = require('child_process');
const { EventEmitter } = require('events');
const { sendSystemNotice } = require('../../core/notifier');

function fakeChild() {
  const child = new EventEmitter();
  child.unref = vi.fn();
  return child;
}

describe('notifier - sendSystemNotice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the notice through notify-send without blocking the caller', () => {
    const child = fakeChild();
    const spawn = vi.spyOn(childProcess, 'spawn').mockReturnValue(child);

    sendSystemNotice('Titolo', 'Corpo');

    expect(spawn).toHaveBeenCalledWith(
      'notify-send',
      ['--app-name=DeadlineAura', 'Titolo', 'Corpo'],
      expect.objectContaining({ stdio: 'ignore' }),
    );
    expect(child.unref).toHaveBeenCalled();
  });

  it('logs instead of crashing when notify-send is missing', () => {
    const child = fakeChild();
    vi.spyOn(childProcess, 'spawn').mockReturnValue(child);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    sendSystemNotice('Titolo', 'Corpo');
    child.emit('error', new Error('ENOENT'));

    expect(warn).toHaveBeenCalledWith('notify-send failed:', 'ENOENT');
  });

  it('logs instead of crashing when spawning throws', () => {
    vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
      throw new Error('EACCES');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => sendSystemNotice('Titolo', 'Corpo')).not.toThrow();
    expect(warn).toHaveBeenCalledWith('notify-send failed:', 'EACCES');
  });
});
