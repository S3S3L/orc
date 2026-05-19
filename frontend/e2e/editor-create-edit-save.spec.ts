import { test, expect } from '@playwright/test';

test.describe('Workflow Editor - Create, Edit, Save', () => {
  test('should create workflow, add nodes, create edge, save, and verify persistence', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/ORC/i)).toBeVisible();

    // Open editor
    await page.getByRole('button', { name: /Workflow Editor/i }).click();
    await expect(page.getByRole('heading', { name: 'Workflow Editor' })).toBeVisible();

    // Create new workflow
    await page.getByRole('button', { name: /New Workflow/i }).click();
    await page.getByLabel('Workflow Name').fill('E2E Test Workflow');
    await page.getByRole('button', { name: 'Create' }).click();

    // Wait for editor to load
    await expect(page.getByText('E2E Test Workflow')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Node' })).toBeVisible();

    // Add bash node
    await page.getByRole('button', { name: 'Add Node' }).click();
    await page.getByRole('button', { name: 'Bash' }).click();

    // Verify node appears on canvas
    await expect(page.getByText('bash node')).toBeVisible();

    // Add python node
    await page.getByRole('button', { name: 'Add Node' }).click();
    await page.getByRole('button', { name: 'Python' }).click();
    await expect(page.getByText('python node')).toBeVisible();

    // Edit bash node name
    await page.getByLabel('Name').fill('Data Prep');
    await expect(page.getByDisplayValue('Data Prep')).toBeVisible();

    // Edit bash node script
    await page.getByLabel('Script Path').fill('./scripts/prepare.sh');
    await expect(page.getByDisplayValue('./scripts/prepare.sh')).toBeVisible();

    // Create edge: click Add Edge, then click bash node, then python node
    await page.getByRole('button', { name: 'Add Edge' }).click();
    await page.waitForTimeout(300);

    // Click nodes via cytoscape canvas
    await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      if (!cy) return;
      const bashNode = cy.nodes().filter((n: any) => n.data('type') === 'bash');
      const pythonNode = cy.nodes().filter((n: any) => n.data('type') === 'python');
      if (bashNode.length && pythonNode.length) {
        bashNode[0].emit('tap', { target: bashNode[0] });
        pythonNode[0].emit('tap', { target: pythonNode[0] });
      }
    });

    // Wait for edge to appear
    await page.waitForTimeout(500);

    // Verify edge exists
    const edgeCount = await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      return cy ? cy.edges().length : 0;
    });
    expect(edgeCount).toBeGreaterThan(0);

    // Save workflow
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saving...')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Saving...')).not.toBeVisible({ timeout: 5000 });

    // Go back and reopen to verify persistence
    await page.getByRole('button', { name: /arrow_back/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Workflow Editor' })).toBeVisible();

    // Reopen the saved workflow
    await page.getByRole('button', { name: /E2E Test Workflow/i }).first().click();
    await expect(page.getByText('E2E Test Workflow')).toBeVisible();

    // Verify bash node persisted with correct name and script
    await expect(page.getByText('Data Prep')).toBeVisible();

    // Click on the node to verify config
    await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      if (!cy) return;
      const bashNode = cy.nodes().filter((n: any) => n.data('type') === 'bash');
      if (bashNode.length) bashNode[0].emit('tap', { target: bashNode[0] });
    });
    await page.waitForTimeout(300);
    await expect(page.getByDisplayValue('Data Prep')).toBeVisible();
    await expect(page.getByDisplayValue('./scripts/prepare.sh')).toBeVisible();

    // Verify edge persisted
    const persistedEdgeCount = await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      return cy ? cy.edges().length : 0;
    });
    expect(persistedEdgeCount).toBeGreaterThan(0);
  });
});
