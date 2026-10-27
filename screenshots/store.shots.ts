import { test } from "./extensionFixture";

/** The Chrome Web Store screenshots, 1280x800, one per scene and language. */

test("home", async ({ newTab, shoot }) => {
    // Favicons arrive from the worker one by one; let them settle before the picture.
    await newTab.waitForLoadState("networkidle");
    await newTab.waitForTimeout(1500);
    // Out of the way: a pointer resting over the side panel's rail would open it.
    await newTab.mouse.move(640, 10);
    await shoot("1-home");
});
