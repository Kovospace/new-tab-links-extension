import { describe, expect, it } from "vitest";

import { resolveDeviceName } from "../../../src/backend/sync/DeviceName";

/**
 *  Three places ask this question - the header that names this device to the account, the
 *  closed tab the worker stamps, and the panel that decides whether a row happened elsewhere -
 *  and the third only works if the first two answer identically.
 */
describe("resolveDeviceName", () => {

    it("uses the name the user chose", () => {
        expect(resolveDeviceName("Work laptop")).toBe("Work laptop");
    });

    it("always answers something, even unnamed", () => {
        // A closed tab stamped with nothing cannot be told apart from one closed here, which
        // is the only question the panel asks of that field.
        expect(resolveDeviceName(null)).toBeTruthy();
        expect(resolveDeviceName(undefined)).toBeTruthy();
        expect(resolveDeviceName("")).toBeTruthy();
    });

    it("gives the same answer twice, so the two ends can compare them", () => {
        expect(resolveDeviceName(null)).toBe(resolveDeviceName(null));
    });
});
