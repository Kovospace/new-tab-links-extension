import { beforeEach, vi } from "vitest";

/**
 *  An in-memory stand-in for the slice of chrome.storage.local this extension uses.
 *
 *  Everything persistent here goes through ChromeStorageWrapper, which is two methods over
 *  `chrome.storage.local`. Faking at that boundary rather than mocking the wrapper keeps the
 *  repositories under test as themselves - a test of ProfileRepository that stubs the wrapper
 *  proves the test's idea of storage, not the repository's use of it.
 *
 *  It is reset before every test, so no test inherits another's storage.
 */
const storedValues = new Map<string, unknown>();

/** Empties the fake storage; called automatically before each test. */
export function clearFakeStorage(): void {
    storedValues.clear();
}

/** Puts a value in place before a test runs, as though a previous session had written it. */
export function seedFakeStorage(key: string, value: unknown): void {
    storedValues.set(key, value);
}

/** Reads what the code under test left behind. */
export function readFakeStorage<VALUE>(key: string): VALUE | null {
    return (storedValues.get(key) as VALUE | undefined) ?? null;
}

const chromeStub = {
    storage: {
        local: {
            get(keys: string[], callback: (values: Record<string, unknown>) => void): void {
                const values: Record<string, unknown> = {};
                for (const key of keys) {
                    // Absent and explicitly-null are the same answer, which is what the real
                    // API does and what discardProfileData() relies on when it stores null.
                    if (storedValues.has(key)) {
                        values[key] = storedValues.get(key);
                    }
                }
                callback(values);
            },
            set(values: Record<string, unknown>, callback: () => void): void {
                for (const [key, value] of Object.entries(values)) {
                    storedValues.set(key, value);
                }
                callback();
            }
        }
    },
    tabs: {
        create: vi.fn()
    }
};

// The extension talks to `chrome` as a global, the way the browser provides it.
(globalThis as unknown as { chrome: typeof chromeStub }).chrome = chromeStub;

beforeEach(() => clearFakeStorage());
