import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { MicError } from '../audio/recorder';
import { KIT } from '../audio/sounds';
import type { Sound, SoundId } from '../core/model';
import Palette from './Palette.svelte';
import { fakeRecordDeps } from '../record-test-helpers';

describe('Palette', () => {
  it('shows one button per sound plus "Silent"', () => {
    render(Palette, { sounds: KIT, onpick: () => {} });
    const palette = screen.getByRole('group', { name: 'Sounds' });
    const names = [...palette.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(names).toEqual([...KIT.map((s) => s.name), 'Silent']);
  });

  it('shows each sound color on its swatch', () => {
    render(Palette, { sounds: KIT, onpick: () => {} });
    const kick = screen.getByRole('button', { name: 'Kick' });
    expect(kick.style.getPropertyValue('--color')).toBe('#ff5d5d');
  });

  it('reports the picked sound id, or null for Silent', () => {
    const picks: (SoundId | null)[] = [];
    const onpick = vi.fn((id: SoundId | null) => picks.push(id));
    render(Palette, { sounds: KIT, onpick });
    fireEvent.click(screen.getByRole('button', { name: 'Snare' }));
    fireEvent.click(screen.getByRole('button', { name: 'Silent' }));
    expect(picks).toEqual(['snare', null]);
  });

  describe('recording', () => {
    const rec: Sound = { id: 'rec-a', name: 'Rec 1', color: '#9be15d', source: 'recording' };
    const settle = () => new Promise((resolve) => setTimeout(resolve));

    it('has no Record button without a record control', () => {
      render(Palette, { sounds: KIT, onpick: () => {} });
      expect(screen.queryByRole('button', { name: /record/i })).toBeNull();
    });

    it('puts a Record button at the end of the palette that starts recording', () => {
      const { control, deps } = fakeRecordDeps();
      render(Palette, { sounds: KIT, onpick: () => {}, recording: control });
      const buttons = [...screen.getByRole('group', { name: 'Sounds' }).querySelectorAll('button')];
      const record = screen.getByRole('button', { name: 'Record' });
      expect(buttons.at(-1)).toBe(record);
      fireEvent.click(record);
      expect(deps.start).toHaveBeenCalledTimes(1);
    });

    it('turns into "Stop" with the elapsed time while recording', async () => {
      const { control, fake } = fakeRecordDeps();
      render(Palette, { sounds: KIT, onpick: () => {}, recording: control });
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      await settle();
      fake.ms = 1234;
      fake.tick();
      await settle();
      const stop = screen.getByRole('button', { name: 'Stop recording' });
      expect(stop).toHaveTextContent('Stop');
      expect(stop).toHaveTextContent('1.2 s');
      fireEvent.click(stop);
      expect(fake.session().recording.stop).toHaveBeenCalledTimes(1);
    });

    it('is disabled with a "Needs HTTPS" hint outside a secure context', () => {
      const { control } = fakeRecordDeps({ availability: 'insecure' });
      render(Palette, { sounds: KIT, onpick: () => {}, recording: control });
      const record = screen.getByRole('button', { name: 'Record' });
      expect(record).toBeDisabled();
      expect(record).toHaveAccessibleDescription('Needs HTTPS');
    });

    it('shows an error message inline', async () => {
      const { control } = fakeRecordDeps({ start: () => Promise.reject(new MicError('denied')) });
      render(Palette, { sounds: KIT, onpick: () => {}, recording: control });
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      await settle();
      expect(screen.getByRole('status')).toHaveTextContent('Microphone permission denied');
    });

    it('lists recordings after the kit and Silent, then Record; they can be picked like any sound', () => {
      const onpick = vi.fn();
      render(Palette, { sounds: [...KIT, rec], onpick, recording: fakeRecordDeps().control });
      const palette = screen.getByRole('group', { name: 'Sounds' });
      const names = [...palette.querySelectorAll('button')].map(
        (b) => b.getAttribute('aria-label') ?? b.textContent?.trim(),
      );
      expect(names).toEqual([...KIT.map((s) => s.name), 'Silent', 'Rec 1', 'Delete Rec 1', 'Record']);
      fireEvent.click(screen.getByRole('button', { name: 'Rec 1' }));
      expect(onpick).toHaveBeenCalledWith('rec-a');
    });

    it('gives recordings, and only them, a delete button that needs a second press to confirm', () => {
      const { control, deps } = fakeRecordDeps();
      render(Palette, { sounds: [...KIT, rec], onpick: () => {}, recording: control });
      expect(screen.getAllByRole('button', { name: /^Delete/ })).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Delete Rec 1' }));
      expect(deps.remove).not.toHaveBeenCalled();
      const confirm = screen.getByRole('button', { name: 'Confirm delete Rec 1' });
      expect(confirm).toHaveTextContent('Delete?');
      fireEvent.pointerDown(confirm);
      fireEvent.click(confirm);
      expect(deps.remove).toHaveBeenCalledWith('rec-a');
    });

    it('disarms the delete when the user presses anywhere else', async () => {
      const { control, deps } = fakeRecordDeps();
      render(Palette, { sounds: [...KIT, rec], onpick: () => {}, recording: control });
      fireEvent.click(screen.getByRole('button', { name: 'Delete Rec 1' }));
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Kick' }));
      await settle();
      expect(screen.getByRole('button', { name: 'Delete Rec 1' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm delete Rec 1' })).toBeNull();
      expect(deps.remove).not.toHaveBeenCalled();
    });
  });

  it('tells the user that the next pick sets the sound when armed', () => {
    const { rerender } = render(Palette, { sounds: KIT, onpick: () => {} });
    expect(screen.queryByText(/pick a sound for the selection/i)).toBeNull();
    rerender({ sounds: KIT, onpick: () => {}, armed: true });
    expect(screen.getByText(/pick a sound for the selection/i)).toBeInTheDocument();
  });
});
