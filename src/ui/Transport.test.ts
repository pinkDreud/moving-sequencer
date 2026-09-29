import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeEngine } from '../audio/engine';
import type { Timer } from '../audio/scheduler';
import { createTransport, type FrameLoop } from '../audio/transport';
import { createIdGen } from '../core/model';
import { AppState, defaultSong } from '../state.svelte';
import Transport from './Transport.svelte';

const noTimer: Timer = { setInterval: () => 0, clearInterval: () => {} };
const noFrames: FrameLoop = { request: () => 0, cancel: () => {} };

// Vitest globals are off, so Testing Library cannot register its automatic cleanup.
afterEach(() => cleanup());

function setup() {
  const nextId = createIdGen('n');
  const app = new AppState({ song: defaultSong(nextId), nextId });
  const engine = new FakeEngine();
  const transport = createTransport({ engine, state: app, timer: noTimer, frames: noFrames });
  render(Transport, { app, transport });
  return {
    app,
    engine,
    playButton: () => screen.getByRole('button', { name: /^(Play|Stop)$/ }),
    bpm: () => screen.getByRole('spinbutton', { name: 'BPM' }) as HTMLInputElement,
    slot: () => screen.getByRole('combobox', { name: 'Slot value' }) as HTMLSelectElement,
  };
}

function pressSpace(target: Element | Window = document.body, init: KeyboardEventInit = {}) {
  return fireEvent.keyDown(target, { key: ' ', code: 'Space', ...init });
}

describe('Play/Stop button', () => {
  it('starts as an unpressed "Play" button', () => {
    const s = setup();
    expect(s.playButton()).toHaveAccessibleName('Play');
    expect(s.playButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles the transport, its name and aria-pressed', async () => {
    const s = setup();
    await fireEvent.click(s.playButton());
    expect(s.app.playing).toBe(true);
    expect(s.engine.log.length).toBeGreaterThan(0);
    expect(s.playButton()).toHaveAccessibleName('Stop');
    expect(s.playButton()).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(s.playButton());
    expect(s.app.playing).toBe(false);
    expect(s.engine.stopAllCount).toBe(1);
    expect(s.playButton()).toHaveAccessibleName('Play');
    expect(s.playButton()).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('BPM input', () => {
  it('shows the song tempo and follows changes made elsewhere', () => {
    const s = setup();
    expect(s.bpm().value).toBe('110');
    s.app.setBpm(140);
    flushSync();
    expect(s.bpm().value).toBe('140');
  });

  it('does not touch the tempo while typing, and applies it on commit', async () => {
    const s = setup();
    await fireEvent.input(s.bpm(), { target: { value: '9' } });
    expect(s.app.song.bpm).toBe(110);
    expect(s.bpm().value).toBe('9');
    await fireEvent.input(s.bpm(), { target: { value: '95' } });
    await fireEvent.change(s.bpm());
    expect(s.app.song.bpm).toBe(95);
    expect(s.bpm().value).toBe('95');
  });

  it('clamps out-of-range values to 30–300 and shows the clamped value', async () => {
    const s = setup();
    await fireEvent.change(s.bpm(), { target: { value: '999' } });
    expect(s.app.song.bpm).toBe(300);
    expect(s.bpm().value).toBe('300');
    // Same stored value again: the field must still be corrected.
    await fireEvent.change(s.bpm(), { target: { value: '1000' } });
    expect(s.bpm().value).toBe('300');
    await fireEvent.change(s.bpm(), { target: { value: '5' } });
    expect(s.app.song.bpm).toBe(30);
    expect(s.bpm().value).toBe('30');
  });

  it('reverts an empty entry to the current tempo', async () => {
    const s = setup();
    await fireEvent.change(s.bpm(), { target: { value: '' } });
    expect(s.app.song.bpm).toBe(110);
    expect(s.bpm().value).toBe('110');
  });

  it('commits on blur', async () => {
    const s = setup();
    await fireEvent.input(s.bpm(), { target: { value: '128' } });
    await fireEvent.blur(s.bpm());
    expect(s.app.song.bpm).toBe(128);
  });
});

describe('slot value selector', () => {
  it('offers 1/4, 1/8 and 1/16 and shows the current value', () => {
    const s = setup();
    const options = [...s.slot().options].map((o) => [o.textContent, o.value]);
    expect(options).toEqual([
      ['1/4', '4'],
      ['1/8', '8'],
      ['1/16', '16'],
    ]);
    expect(s.slot().value).toBe('8');
  });

  it('sets the slot value', async () => {
    const s = setup();
    await fireEvent.change(s.slot(), { target: { value: '16' } });
    expect(s.app.song.slotValue).toBe(16);
    await fireEvent.change(s.slot(), { target: { value: '4' } });
    expect(s.app.song.slotValue).toBe(4);
  });
});

describe('swing slider', () => {
  const slider = () => screen.getByRole('slider', { name: 'Swing' }) as HTMLInputElement;

  it('goes from 0 to 75 % in steps of 1 and starts straight', () => {
    setup();
    expect(slider().type).toBe('range');
    expect([slider().min, slider().max, slider().step, slider().value]).toEqual(['0', '75', '1', '0']);
    expect(screen.getByText('0 %')).toBeInTheDocument();
    expect(slider()).toHaveAttribute('aria-valuetext', '0 %');
  });

  it('sets swing live while dragging and shows the value', async () => {
    const s = setup();
    await fireEvent.input(slider(), { target: { value: '33' } });
    expect(s.app.song.swing).toBe(0.33);
    expect(screen.getByText('33 %')).toBeInTheDocument();
    expect(slider()).toHaveAttribute('aria-valuetext', '33 %');
  });

  it('follows swing changes made elsewhere', () => {
    const s = setup();
    s.app.setSwing(0.5);
    flushSync();
    expect(slider().value).toBe('50');
    expect(screen.getByText('50 %')).toBeInTheDocument();
  });

  it('lets Space toggle play/stop while the slider has focus (it has no use for Space)', async () => {
    const s = setup();
    slider().focus();
    await pressSpace(slider());
    expect(s.app.playing).toBe(true);
  });
});

describe('Space', () => {
  it('offers ½×, 1× and 2× speed with 1× checked, and sets the factor', async () => {
    const { app } = setup();
    const speed = screen.getByRole('radiogroup', { name: 'Speed' });
    const radio = (name: string) => within(speed).getByRole('radio', { name }) as HTMLInputElement;
    expect(radio('1×').checked).toBe(true);
    await fireEvent.click(radio('2×'));
    expect(app.song.tempoFactor).toBe(2);
    expect(radio('2×').checked).toBe(true);
    await fireEvent.click(radio('½×'));
    expect(app.song.tempoFactor).toBe(0.5);
    expect(app.song.bpm).toBe(110);
  });

  it('toggles play/stop when focus is on the page', async () => {
    const s = setup();
    expect(await pressSpace()).toBe(false); // default prevented: the page must not scroll
    expect(s.app.playing).toBe(true);
    await pressSpace();
    expect(s.app.playing).toBe(false);
  });

  it('toggles exactly once when a button has focus (and does not press the button)', async () => {
    const s = setup();
    s.playButton().focus();
    expect(await pressSpace(s.playButton())).toBe(false);
    expect(s.app.playing).toBe(true);
  });

  it('does nothing while typing in the BPM input or on the slot selector', async () => {
    const s = setup();
    expect(await pressSpace(s.bpm())).toBe(true);
    expect(await pressSpace(s.slot())).toBe(true);
    expect(s.app.playing).toBe(false);
  });

  it('ignores key repeat and Space with Ctrl/Cmd/Alt', async () => {
    const s = setup();
    await pressSpace(document.body, { repeat: true });
    await pressSpace(document.body, { ctrlKey: true });
    await pressSpace(document.body, { metaKey: true });
    await pressSpace(document.body, { altKey: true });
    expect(s.app.playing).toBe(false);
  });

  it('ignores other keys', async () => {
    const s = setup();
    await fireEvent.keyDown(document.body, { key: 'Enter', code: 'Enter' });
    await fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK' });
    expect(s.app.playing).toBe(false);
  });
});
