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

/**
 *  Listeners registered through chrome.storage.onChanged.
 *
 *  The real API tells every page of the extension about a write, which is how a new tab page
 *  hears about a link the bookmarking window stored. A test creating two repositories over
 *  this one map is those two pages, so the notification has to be here too - and it is
 *  delivered in a later microtask, as the real one is delivered in a later task, so that
 *  nothing accidentally depends on it having happened before `set` returns.
 */
type StorageChange = { oldValue?: unknown; newValue?: unknown };
type ChangeListener = (changes: Record<string, StorageChange>, areaName: string) => void;

const changeListeners = new Set<ChangeListener>();

/** The session storage area, which is emptied between tests along with the rest. */
const sessionValues = new Map<string, unknown>();

/** Empties the fake storage and forgets the listeners; called automatically before each test. */
export function clearFakeStorage(): void {
    storedValues.clear();
    sessionValues.clear();
    changeListeners.clear();
}

/** Lets a test wait for the notifications a write set off. */
export function flushStorageNotifications(): Promise<void> {
    return new Promise(resolve => queueMicrotask(() => queueMicrotask(() => resolve())));
}

/** Puts a value in place before a test runs, as though a previous session had written it. */
export function seedFakeStorage(key: string, value: unknown): void {
    storedValues.set(key, value);
}

/** Reads what the code under test left behind. */
export function readFakeStorage<VALUE>(key: string): VALUE | null {
    return (storedValues.get(key) as VALUE | undefined) ?? null;
}

/** An event nothing fires: listeners can be added and taken off, and are never called. */
function silentEvent(): { addListener: () => void; removeListener: () => void } {
    return { addListener: () => undefined, removeListener: () => undefined };
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
                const changes: Record<string, StorageChange> = {};
                for (const [key, value] of Object.entries(values)) {
                    changes[key] = { oldValue: storedValues.get(key), newValue: value };
                    storedValues.set(key, value);
                }
                callback();
                queueMicrotask(() => changeListeners
                    .forEach(listener => listener(changes, "local")));
            }
        },
        onChanged: {
            addListener(listener: ChangeListener): void {
                changeListeners.add(listener);
            }
        },
        /**
         *  The session area, which the real API keeps for the length of a browser session
         *  and answers with promises rather than callbacks. The bookmarking popup and the
         *  service worker hand a request over through it.
         */
        session: {
            async get(key: string): Promise<Record<string, unknown>> {
                return sessionValues.has(key) ? { [key]: sessionValues.get(key) } : {};
            },
            async set(values: Record<string, unknown>): Promise<void> {
                for (const [key, value] of Object.entries(values)) {
                    sessionValues.set(key, value);
                }
            },
            async remove(key: string): Promise<void> {
                sessionValues.delete(key);
            }
        }
    },
    tabs: {
        create: vi.fn(),
        // Answers with no tabs unless a test says otherwise; the bookmarking popup asks
        // which tab it is standing on.
        query: vi.fn(async (_query: unknown) => [] as unknown[]),
        // What the open tabs card of the side panel reaches for. Nothing is open and nothing
        // happens unless a test says otherwise.
        getCurrent: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        onCreated: silentEvent(),
        onUpdated: silentEvent(),
        onRemoved: silentEvent(),
        onMoved: silentEvent(),
        onAttached: silentEvent(),
        onDetached: silentEvent()
    },
    windows: {
        update: vi.fn(async () => undefined)
    },
    runtime: {
        // Only the address of a page inside the extension; the bookmarking window is opened
        // by one, and building it is worth a test of its own.
        getURL: (path: string) => `chrome-extension://newtabgroupedlinks/${path}`
    }
};

// The extension talks to `chrome` as a global, the way the browser provides it.
(globalThis as unknown as { chrome: typeof chromeStub }).chrome = chromeStub;

beforeEach(() => clearFakeStorage());
