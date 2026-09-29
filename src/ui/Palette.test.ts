import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { KIT } from '../audio/sounds';
import type { SoundId } from '../core/model';
import Palette from './Palette.svelte';

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

  it('tells the user that the next pick sets the sound when armed', () => {
    const { rerender } = render(Palette, { sounds: KIT, onpick: () => {} });
    expect(screen.queryByText(/pick a sound for the selection/i)).toBeNull();
    rerender({ sounds: KIT, onpick: () => {}, armed: true });
    expect(screen.getByText(/pick a sound for the selection/i)).toBeInTheDocument();
  });
});
