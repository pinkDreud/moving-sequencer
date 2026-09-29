import { describe, expect, it, vi } from 'vitest';
import { MicError, type Recording } from './audio/recorder';
import { RecordControl, type RecordControlDeps } from './recordControl.svelte';
import { fakeRecordDeps } from './record-test-helpers';

/** Lets pending promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('RecordControl', () => {
  it('starts idle and enabled, with no hint and no message', () => {
    const { control } = fakeRecordDeps();
    expect(control.status).toBe('idle');
    expect(control.disabled).toBe(false);
    expect(control.hint).toBeNull();
    expect(control.message).toBeNull();
  });

  it('waits for the mic, then records and counts the elapsed time', async () => {
    const { control, fake } = fakeRecordDeps();
    void control.toggle();
    expect(control.status).toBe('starting');
    await settle();
    expect(control.status).toBe('recording');
    expect(control.disabled).toBe(false);
    expect(control.elapsed).toBe(0);
    fake.ms = 1234;
    fake.tick();
    expect(control.elapsed).toBeCloseTo(1.234, 6);
  });

  it('a press while waiting for the mic cancels: idle at once, and the late recording is stopped and dropped', async () => {
    let grant: (recording: Recording) => void = () => {};
    const start = vi.fn(() => new Promise<Recording>((resolve) => (grant = resolve)));
    const { control, deps } = fakeRecordDeps({ start });
    void control.toggle();
    expect(control.status).toBe('starting');
    expect(control.disabled).toBe(false);
    void control.toggle();
    expect(control.status).toBe('idle');
    const late = { stop: vi.fn(), result: Promise.resolve(new Blob(['x'])) };
    grant(late);
    await settle();
    expect(late.stop).toHaveBeenCalledTimes(1);
    expect(deps.save).not.toHaveBeenCalled();
    expect(control.status).toBe('idle');
  });

  it('after a cancel, the next press starts a new recording', async () => {
    const pending: ((recording: Recording) => void)[] = [];
    const start = vi.fn(() => new Promise<Recording>((resolve) => pending.push(resolve)));
    const { control } = fakeRecordDeps({ start });
    void control.toggle();
    void control.toggle();
    void control.toggle();
    expect(start).toHaveBeenCalledTimes(2);
    expect(control.status).toBe('starting');
    pending[1]?.({ stop: vi.fn(), result: new Promise(() => {}) });
    await settle();
    expect(control.status).toBe('recording');
    pending[0]?.({ stop: vi.fn(), result: new Promise(() => {}) }); // the cancelled one arrives last
    await settle();
    expect(control.status).toBe('recording');
  });

  it('pressing Stop twice stops once', async () => {
    const { control, fake } = fakeRecordDeps();
    void control.toggle();
    await settle();
    void control.toggle();
    void control.toggle();
    expect(fake.session().recording.stop).toHaveBeenCalledTimes(1);
  });

  it('never shows more than the 4 s limit', async () => {
    const { control, fake } = fakeRecordDeps();
    void control.toggle();
    await settle();
    fake.ms = 4600;
    fake.tick();
    expect(control.elapsed).toBe(4);
  });

  it('a second press stops; the blob is saved, then it is idle again', async () => {
    const { control, fake, deps } = fakeRecordDeps();
    void control.toggle();
    await settle();
    void control.toggle();
    expect(fake.session().recording.stop).toHaveBeenCalledTimes(1);
    const blob = new Blob(['a']);
    fake.session().finish(blob);
    await settle();
    expect(control.status).toBe('processing');
    expect(control.disabled).toBe(true);
    expect(deps.save).toHaveBeenCalledWith(blob);
    fake.saved();
    await settle();
    expect(control.status).toBe('idle');
    expect(control.elapsed).toBe(0);
    expect(fake.intervals.size).toBe(0);
    expect(deps.start).toHaveBeenCalledTimes(1);
  });

  it('saves a recording that stopped by itself too', async () => {
    const { control, fake, deps } = fakeRecordDeps();
    void control.toggle();
    await settle();
    fake.session().finish(new Blob(['a']));
    await settle();
    expect(deps.save).toHaveBeenCalledTimes(1);
    fake.saved();
    await settle();
    expect(control.status).toBe('idle');
  });

  it('ignores presses while saving', async () => {
    const { control, fake, deps } = fakeRecordDeps();
    void control.toggle();
    await settle();
    fake.session().finish(new Blob(['a']));
    await settle();
    void control.toggle();
    await settle();
    expect(deps.start).toHaveBeenCalledTimes(1);
    expect(control.status).toBe('processing');
  });

  it.each([
    [new MicError('denied'), 'Microphone permission denied'],
    [new MicError('no-mic'), 'No microphone found'],
    [new MicError('failed'), 'Could not start the microphone'],
    [new Error('weird'), 'Could not start the microphone'],
  ])('shows a message when the mic cannot start (%s)', async (error, message) => {
    const { control, deps } = fakeRecordDeps({ start: vi.fn(() => Promise.reject(error)) });
    await control.toggle();
    expect(control.message).toBe(message);
    expect(control.status).toBe('idle');
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('shows a message when the recording fails midway', async () => {
    const { control, fake } = fakeRecordDeps();
    const done = control.toggle();
    await settle();
    fake.session().fail(new MicError('failed'));
    await done;
    expect(control.message).toBe('Recording failed');
    expect(control.status).toBe('idle');
    expect(fake.intervals.size).toBe(0);
  });

  it('shows a message when the recording cannot be decoded', async () => {
    const { control, fake } = fakeRecordDeps({
      save: vi.fn(() => Promise.reject(new Error('EncodingError'))),
    });
    const done = control.toggle();
    await settle();
    fake.session().finish(new Blob([]));
    await done;
    expect(control.message).toBe('Could not read the recording');
    expect(control.status).toBe('idle');
  });

  it('clears the message at the next press', async () => {
    let fail = true;
    const start = vi.fn((): Promise<Recording> => {
      if (fail) return Promise.reject(new MicError('denied'));
      return new Promise(() => {});
    });
    const { control } = fakeRecordDeps({ start });
    await control.toggle();
    expect(control.message).not.toBeNull();
    fail = false;
    void control.toggle();
    expect(control.message).toBeNull();
  });

  it.each([
    ['insecure', 'Needs HTTPS'],
    ['unsupported', 'Recording not supported in this browser'],
  ] as const)('is disabled with a hint when the mic is %s', async (availability, hint) => {
    const { control, deps } = fakeRecordDeps({ availability });
    expect(control.disabled).toBe(true);
    expect(control.hint).toBe(hint);
    await control.toggle();
    expect(deps.start).not.toHaveBeenCalled();
  });

  it('remove deletes a recording through its dependency', () => {
    const { control, deps } = fakeRecordDeps();
    control.remove('rec-a');
    expect(deps.remove).toHaveBeenCalledWith('rec-a');
  });

  it('accepts its dependencies as an interface', () => {
    const deps: RecordControlDeps = fakeRecordDeps().deps;
    expect(new RecordControl(deps).status).toBe('idle');
  });
});
