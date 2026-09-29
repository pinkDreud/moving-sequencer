import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import UpdateBar from './UpdateBar.svelte';

describe('UpdateBar', () => {
  it('offers a reload that calls the given function', async () => {
    const reload = vi.fn();
    render(UpdateBar, { reload });
    expect(screen.getByRole('status')).toHaveTextContent('New version available');
    await fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
