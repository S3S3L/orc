import { test, expect } from '@playwright/test';

test.describe('Graph - Canvas Interactions', () => {
  test('should add node, edit properties, delete node, and verify', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/ORC/i)).toBeVisible();

    // Open editor
    await page.getByRole('button', { name: /Workflow Editor/i }).click();
    await expect(page.getByRole('heading', { name: 'Workflow Editor' })).toBeVisible();

    // Open existing workflow (use the first one)
    const workflowButtons = page.locator('button').filter({ hasText: /workflow\.json/ });
    if (await workflowButtons.count() > 0) {
      await workflowButtons.first().click();
    } else {
      // Create new if none exists
      await page.getByRole('button', { name: /New Workflow/i }).click();
      await page.getByLabel('Workflow Name').fill('Graph Test');
      await page.getByRole('button', { name: 'Create' }).click();
    }

    await expect(page.getByRole('button', { name: 'Add Node' })).toBeVisible();

    // Add two nodes
    await page.getByRole('button', { name: 'Add Node' }).click();
    await page.getByRole('button', { name: 'Bash' }).click();
    await page.getByRole('button', { name: 'Add Node' }).click();
    await page.getByRole('button', { name: 'File' }).click();

    // Wait for nodes to render
    await page.waitForTimeout(500);

    // Verify 2 nodes on canvas
    const nodeCount = await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      return cy ? cy.nodes().length : 0;
    });
    expect(nodeCount).toBeGreaterThanOrEqual(2);

    // Click bash node to select it
    await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      if (!cy) return;
      const bashNode = cy.nodes().filter((n: any) => n.data('type') === 'bash');
      if (bashNode.length) bashNode[0].emit('tap', { target: bashNode[0] });
    });
    await page.waitForTimeout(300);

    // Verify property panel shows bash node
    await expect(page.getByText('Node Properties')).toBeVisible();
    await expect(page.getByText('bash')).toBeVisible();

    // Edit name
    const nameInput = page.getByLabel('Name');
    await nameInput.fill('Renamed Node');
    await expect(page.getByDisplayValue('Renamed Node')).toBeVisible();

    // Delete the node
    await page.getByRole('button', { name: 'Delete Node' }).click();

    // Verify node removed from canvas
    await page.waitForTimeout(500);
    const remainingCount = await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      return cy ? cy.nodes().length : 0;
    });
    expect(remainingCount).toBe(nodeCount - 1);

    // Verify property panel shows placeholder
    await expect(page.getByText('Click a node or edge to edit its properties')).toBeVisible();
  });

  test('should create edge via Add Edge mode and verify', async ({ page }) => {
    await page.goto('/');

    // Open editor
    await page.getByRole('button', { name: /Workflow Editor/i }).click();
    await expect(page.getByRole('heading', { name: 'Workflow Editor' })).toBeVisible();

    // Open existing workflow or create new
    const workflowButtons = page.locator('button').filter({ hasText: /workflow\.json/ });
    if (await workflowButtons.count() > 0) {
      await workflowButtons.first().click();
    } else {
      await page.getByRole('button', { name: /New Workflow/i }).click();
      await page.getByLabel('Workflow Name').fill('Edge Test');
      await page.getByRole('button', { name: 'Create' }).click();
    }

    await expect(page.getByRole('button', { name: 'Add Node' })).toBeVisible();

    // Add two nodes if not enough
    let initialNodeCount = await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      return cy ? cy.nodes().length : 0;
    });

    while (initialNodeCount < 2) {
      await page.getByRole('button', { name: 'Add Node' }).click();
      await page.getByRole('button', { name: 'Bash' }).click();
      await page.waitForTimeout(300);
      initialNodeCount++;
    }

    // Enter edge creation mode
    await page.getByRole('button', { name: 'Add Edge' }).click();
    await expect(page.getByRole('button', { name: /Connecting/i })).toBeVisible();

    // Click two different nodes to create edge
    await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      if (!cy) return;
      const nodes = cy.nodes();
      if (nodes.length >= 2) {
        nodes[0].emit('tap', { target: nodes[0] });
        nodes[1].emit('tap', { target: nodes[1] });
      }
    });

    // Wait for edge mode to exit
    await page.waitForTimeout(500);

    // Verify edge was created
    const edgeCount = await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      return cy ? cy.edges().length : 0;
    });
    expect(edgeCount).toBeGreaterThan(0);

    // Click edge to verify edge properties panel
    await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      if (!cy) return;
      const edges = cy.edges();
      if (edges.length > 0) edges[0].emit('tap', { target: edges[0] });
    });
    await page.waitForTimeout(300);

    await expect(page.getByText('Edge Properties')).toBeVisible();

    // Edit input label
    const inputLabel = page.getByLabel('Input Label');
    await inputLabel.fill('test-output');
    await expect(page.getByDisplayValue('test-output')).toBeVisible();

    // Save and verify edge persists
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saving...')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Saving...')).not.toBeVisible({ timeout: 5000 });

    // Reload and verify edge persists
    await page.getByRole('button', { name: /arrow_back/i }).first().click();
    await page.waitForTimeout(500);
    await workflowButtons.first().click();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    await page.waitForTimeout(500);
    const persistedEdgeCount = await page.evaluate(() => {
      const container = document.querySelector('div[style*="width: 100%; height: 100%;"]') as HTMLElement | null;
      const cy = (container?.firstChild as any)?._cyreg?.cy;
      return cy ? cy.edges().length : 0;
    });
    expect(persistedEdgeCount).toBeGreaterThan(0);
  });

  test('should show placeholder when nothing selected on canvas', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Workflow Editor/i }).click();
    await expect(page.getByRole('heading', { name: 'Workflow Editor' })).toBeVisible();

    // Open workflow
    const workflowButtons = page.locator('button').filter({ hasText: /workflow\.json/ });
    if (await workflowButtons.count() > 0) {
      await workflowButtons.first().click();
    } else {
      await page.getByRole('button', { name: /New Workflow/i }).click();
      await page.getByLabel('Workflow Name').fill('Placeholder Test');
      await page.getByRole('button', { name: 'Create' }).click();
    }

    await expect(page.getByText('Click a node or edge to edit its properties')).toBeVisible();
  });
});
