import { expect, test } from '@playwright/test';

test('app loads and shows its title', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Moving Sequencer' })).toBeVisible();
});
