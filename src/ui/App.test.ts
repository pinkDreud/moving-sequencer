import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from './App.svelte';

describe('App', () => {
  it('shows the app title', () => {
    render(App);
    expect(screen.getByRole('heading', { name: 'Moving Sequencer' })).toBeInTheDocument();
  });
});
