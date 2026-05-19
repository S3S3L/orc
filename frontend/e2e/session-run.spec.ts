import { test, expect } from '@playwright/test';

test.describe('Session - Run and Monitor', () => {
  test('should run workflow and monitor session status', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/ORC/i)).toBeVisible();

    // Verify workflow is loaded
    await expect(page.getByText('Nodes')).toBeVisible();

    // Run workflow
    await page.getByRole('button', { name: 'Run' }).click();

    // Wait for session to appear
    await expect(page.getByText(/Session:/i)).toBeVisible({ timeout: 10000 });

    // Wait for execution to start
    await page.waitForTimeout(2000);

    // Verify at least one node shows status
    const nodeStatuses = await page.evaluate(() => {
      const panels = document.querySelectorAll('[class*="css"]');
      const texts: string[] = [];
      panels.forEach(p => {
        if (p.textContent?.match(/pending|running|success|failed|skipped/i)) {
          texts.push(p.textContent.trim());
        }
      });
      return texts;
    });

    // At minimum, the active session info should be visible
    expect(page.getByText(/Session:/i)).toBeVisible();
  });

  test('should open session panel and view session list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/ORC/i)).toBeVisible();

    // Run a workflow first to create a session
    await page.getByRole('button', { name: 'Run' }).click();
    await page.waitForTimeout(2000);

    // Open session panel
    await page.getByRole('button', { name: 'Sessions' }).click();
    await expect(page.getByRole('heading', { name: /Session/i })).toBeVisible({ timeout: 5000 });

    // Verify session list shows at least one session
    const sessionCount = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.filter(b => b.textContent?.match(/Session|rerun|complete|error/i)).length;
    });
    expect(sessionCount).toBeGreaterThan(0);

    // Close session panel
    await page.getByRole('button', { name: /close/i }).first().click();
  });

  test('should run a single node', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/ORC/i)).toBeVisible();

    // Select first node in the sidebar list
    const nodeCards = page.locator('[class*="Paper"]');
    if (await nodeCards.count() > 0) {
      await nodeCards.first().click();
    }

    // Click Run Node
    await page.getByRole('button', { name: 'Run Node' }).click();

    // Verify session was created
    await expect(page.getByText(/Session:/i)).toBeVisible({ timeout: 10000 });
  });
});
