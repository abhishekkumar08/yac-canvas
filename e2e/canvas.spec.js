import { test, expect } from "@playwright/test";

const canvas = (page) => page.getByTestId("canvas");

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function newBoard(page) {
  await page.goto("/");
  await page.getByTestId("new-board").click();
  await expect(canvas(page)).toBeVisible();
  await page.waitForFunction(() => globalThis.__yacEditor);
  await page.waitForTimeout(100);
}

const shapeCount = (page) => page.locator("svg[aria-label='Canvas'] g[data-id]").count();

test("draw, connect, move, undo, export", async ({ page }) => {
  await newBoard(page);

  await page.keyboard.press("r");
  await drag(page, { x: 450, y: 300 }, { x: 600, y: 380 });
  await page.keyboard.press("o");
  await drag(page, { x: 850, y: 300 }, { x: 980, y: 400 });
  expect(await shapeCount(page)).toBe(2);

  await page.keyboard.press("a");
  await drag(page, { x: 560, y: 340 }, { x: 920, y: 350 });
  expect(await shapeCount(page)).toBe(3);

  const arrow = page.locator("svg[aria-label='Canvas'] g[data-id]").nth(2);
  const before = await arrow.boundingBox();

  await page.keyboard.press("v");
  await drag(page, { x: 915, y: 330 }, { x: 915, y: 530 });
  const after = await arrow.boundingBox();
  expect(after.height).toBeGreaterThan(before.height + 100);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect.poll(async () => (await arrow.boundingBox()).height).toBeLessThan(after.height - 100);

  await page.keyboard.press("Escape");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+e" : "Control+Shift+e");
  await expect(page.getByTestId("export-preview")).toBeVisible();
  const src = await page.getByTestId("export-preview").getAttribute("src");
  expect(decodeURIComponent(src)).toContain("<svg");
  expect((decodeURIComponent(src).match(/data-id=/g) || []).length).toBe(3);
});

test("boards persist after reload", async ({ page }) => {
  await newBoard(page);
  await page.keyboard.press("s");
  await page.mouse.click(700, 450);
  await page.keyboard.type("Remember me");
  await page.mouse.click(300, 700);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator("svg[aria-label='Canvas'] text")).toContainText("Remember me");
});

test("diagram and design layouts, and text to diagram", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-diagram").click();
  await page.waitForFunction(() => globalThis.__yacEditor);
  await expect(page.locator("[data-mode='diagram']")).toBeVisible();
  await expect(page.getByTestId("left-panel")).toBeVisible();
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("menuitem", { name: /Diagram from text/ }).click();
  await page.getByTestId("mermaid-insert").click();
  await expect.poll(() => page.evaluate(() => globalThis.__yacEditor.elements.length)).toBeGreaterThan(8);
  await page.getByRole("radio", { name: "Design" }).click();
  await expect(page.locator("[data-mode='design']")).toBeVisible();
  await expect(page.getByTestId("toolbar")).toBeVisible();
});
