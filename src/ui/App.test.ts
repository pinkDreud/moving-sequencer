import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createIdGen } from '../core/model';
import { AppState, defaultSong } from '../state.svelte';
import App from './App.svelte';

function makeApp() {
  const nextId = createIdGen('n');
  return new AppState({ song: defaultSong(nextId), nextId });
}

describe('App', () => {
  it('shows the app title', () => {
    render(App, { app: makeApp() });
    expect(screen.getByRole('heading', { name: 'Moving Sequencer' })).toBeInTheDocument();
  });

  it('shows the editable pattern and the palette', () => {
    render(App, { app: makeApp() });
    expect(screen.getByRole('region', { name: 'Pattern' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Sounds' })).toBeInTheDocument();
  });
});
