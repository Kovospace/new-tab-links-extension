import { readFileSync } from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.resolve(__dirname, "..", "..", "src", "i18n", "locales");

/** Translates a key the way the extension's own `t()` does. */
export type Translate = (key: string, values?: Record<string, string>) => string;

/**
 *  The extension's own wording, read from the same JSON it is built from.
 *
 *  A scene finds a button by what it says - "Settings", "Nastavenia" - because that is how
 *  Playwright's locators are meant to be used, and asking by key keeps one scene working in
 *  every language. `settings.categories.background` is `categories.background` in
 *  `<lang>/settings.json`, as in `src/i18n`.
 */
export function translator(language: string): Translate {
    const files = new Map<string, unknown>();
    return (key, values = {}) => {
        const [file, ...rest] = key.split(".");
        if (!files.has(file)) {
            files.set(file, JSON.parse(readFileSync(path.join(LOCALES_DIR, language, `${file}.json`), "utf8")));
        }
        const found = rest.reduce<unknown>(
            (node, part) => (node as Record<string, unknown> | undefined)?.[part], files.get(file));
        if (typeof found !== "string") {
            throw new Error(`No string "${key}" in ${language}`);
        }
        return found.replace(/\{(\w+)\}/g, (whole, name) => values[name] ?? whole);
    };
}
