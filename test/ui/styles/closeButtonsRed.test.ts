import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  Every close and delete button is red (#176). The tips bar's ✕ and the side panel's ✕ were
 *  the two that were not: one drawn without `danger`, the other with it but painted grey by a
 *  heavier rule of the bar's own.
 */

/** Every TypeScript file under a directory. */
function sourcesUnder(directory: string): string[] {
    return readdirSync(directory).flatMap(name => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? sourcesUnder(path) : path.endsWith(".ts") ? [path] : [];
    });
}

/** Specificity as [classes, elements]; ids are not used in these stylesheets. */
function specificity(selector: string): [number, number] {
    const classes = (selector.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) ?? []).length;
    const elements = (selector.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
    return [classes, elements];
}

const css = (file: string) =>
    readFileSync(resolve("src/ui/styles", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("close and delete buttons", () => {

    /**
     *  A button labelled ✕ or × is a close or a delete, and says it is dangerous within the few
     *  lines that build it - as a class list, a `danger` string or `CLASS_ACTION_DANGER`.
     */
    it.each(sourcesUnder(resolve("src/ui")).map(path => [path]))("in %s carry danger", path => {
        const lines = readFileSync(path, "utf8").split("\n");
        lines.forEach((line, index) => {
            if (!/ICON\.(CLOSE|DELETE)\b/.test(line)) return;
            const building = lines.slice(Math.max(0, index - 4), index + 5).join("\n");
            expect(building, `${path}:${index + 1}`).toMatch(/['"]danger['"]|CLASS_ACTION_DANGER/);
        });
    });

    it("the tips bar's close stays red over the bar's own grey", () => {
        const grey = ".tips-bar .tips-bar__control";
        const red = ".tips-bar .tips-bar__control.danger";
        expect(css("_tipsBar.css")).toContain(`${red} {`);
        expect(specificity(red)[0]).toBeGreaterThan(specificity(grey)[0]);
    });
});
