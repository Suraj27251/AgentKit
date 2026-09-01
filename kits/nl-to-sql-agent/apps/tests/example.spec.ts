import { test, expect } from '@playwright/test';

test.describe('Queryline E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Start from login page
    await page.goto('/login');
  });

  test('should login with configured demo credentials', async ({ page }) => {
    // Use environment variables for demo credentials
    const demoUsername = process.env.DEMO_USERNAME || 'demo-user';
    const demoPassword = process.env.DEMO_PASSWORD || 'demo-pass';

    // Fill in the login form with configured credentials
    await page.fill('input[name="username"]', demoUsername);
    await page.fill('input[name="password"]', demoPassword);

    // Submit the form
    await page.click('button[type="submit"]');

    // Should redirect to home page and show the main NL-to-SQL UI
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Ask your database a question')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Fill in the login form with wrong credentials
    await page.fill('input[name="username"]', 'wrong');
    await page.fill('input[name="password"]', 'wrong');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should show the invalid credentials error
    await expect(page.locator('text=Invalid username or password')).toBeVisible();
  });

  test('should allow asking a question after login', async ({ page }) => {
    // Login first with configured credentials
    const demoUsername = process.env.DEMO_USERNAME || 'demo-user';
    const demoPassword = process.env.DEMO_PASSWORD || 'demo-pass';

    await page.fill('input[name="username"]', demoUsername);
    await page.fill('input[name="password"]', demoPassword);
    await page.click('button[type="submit"]');

    // Wait for the main NL-to-SQL UI
    await expect(page.locator('text=Ask your database a question')).toBeVisible();

    // Fill in a question
    await page.fill('textarea[placeholder="Enter your question about the database..."]', 'Show me all users');

    // Submit the question
    await page.click('button:has-text("Ask Question")');

    // Submitting must invoke the flow: the entry controls enter a loading state
    // while the request is dispatched to the Lamatic flow.
    await expect(page.locator('button:has-text("Ask Question")')).toBeDisabled();
  });

  test('should persist theme preference', async ({ page }) => {
    // Login first with configured credentials
    const demoUsername = process.env.DEMO_USERNAME || 'demo-user';
    const demoPassword = process.env.DEMO_PASSWORD || 'demo-pass';

    await page.fill('input[name="username"]', demoUsername);
    await page.fill('input[name="password"]', demoPassword);
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Ask your database a question')).toBeVisible();

    // Click the theme toggle (shown as a dark-mode toggle button)
    await page.click('button[aria-label="Switch to dark mode"]');

    // Reload the page
    await page.reload();

    await expect(page.locator('text=Ask your database a question')).toBeVisible();

    // Should still be in dark mode (dark class on html element)
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');
  });
});
