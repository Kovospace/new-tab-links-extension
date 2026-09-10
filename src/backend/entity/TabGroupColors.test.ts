import { describe, expect, it } from "vitest";

import {
    chooseTabGroupColor, isTabGroupColor, swatchOf, TAB_GROUP_COLORS
} from "./TabGroupColors";
import { MAX_COLOR_LENGTH } from "../sync/SyncContracts";

/** Picks the nth candidate deterministically, so a test can say which one it wants. */
const picks = (index: number) => () => index / TAB_GROUP_COLORS.length;

describe("chooseTabGroupColor", () => {

    it("takes a colour nothing is using yet", () => {
        // Every colour but green is taken, so green is the only candidate and the random
        // source cannot change the answer.
        const taken = TAB_GROUP_COLORS
            .map(swatch => swatch.color)
            .filter(color => color !== "green");

        expect(chooseTabGroupColor(taken, picks(0))).toBe("green");
    });

    it("never repeats a colour while unused ones remain", () => {
        // The rule matters most on a fresh profile: nine subgroups in a row should come out
        // nine different colours, whatever order the randomness offers them in.
        const chosen: string[] = [];
        for (let i = 0; i < TAB_GROUP_COLORS.length; i++) {
            chosen.push(chooseTabGroupColor(chosen, Math.random));
        }

        expect(new Set(chosen).size).toBe(TAB_GROUP_COLORS.length);
    });

    it("spreads over the least-used once every colour is taken", () => {
        // Every colour used once, and blue used twice more. Blue is then the only one that
        // cannot come back until the rest have caught up.
        const taken = [
            ...TAB_GROUP_COLORS.map(swatch => swatch.color),
            "blue", "blue"
        ];

        for (let i = 0; i < TAB_GROUP_COLORS.length; i++) {
            expect(chooseTabGroupColor(taken, picks(i))).not.toBe("blue");
        }
    });

    it("ignores anything that is not a colour it knows", () => {
        // The account may hold a colour written by a newer version of this extension. It must
        // not be counted as one of ours, or it would keep a real colour out of the running.
        const taken = TAB_GROUP_COLORS
            .map(swatch => swatch.color)
            .filter(color => color !== "pink");

        expect(chooseTabGroupColor([...taken, "chartreuse", undefined, null], picks(0)))
            .toBe("pink");
    });

    it("chooses from all nine when nothing is in use", () => {
        const chosen = new Set(
            TAB_GROUP_COLORS.map((_, index) => chooseTabGroupColor([], picks(index))));

        expect(chosen.size).toBe(TAB_GROUP_COLORS.length);
    });
});

describe("the palette itself", () => {

    it("is the nine colours chrome.tabGroups accepts, and no others", () => {
        // Chrome refuses a name outside this list, so an addition here that the browser does
        // not know would make every tab group of that colour fail to be created.
        expect(TAB_GROUP_COLORS.map(swatch => swatch.color).sort()).toEqual([
            "blue", "cyan", "green", "grey", "orange", "pink", "purple", "red", "yellow"
        ]);
    });

    it("has no name the account could not store", () => {
        // The backend takes a plain string of at most 16 characters, and an over-long one is
        // not one rejected operation but a 400 for the entire push.
        for (const swatch of TAB_GROUP_COLORS) {
            expect(swatch.color.length).toBeLessThanOrEqual(MAX_COLOR_LENGTH);
        }
    });

    it("recognises its own colours and nothing else", () => {
        expect(isTabGroupColor("blue")).toBe(true);
        expect(isTabGroupColor("chartreuse")).toBe(false);
        expect(isTabGroupColor(undefined)).toBe(false);
        expect(isTabGroupColor(null)).toBe(false);
    });

    it("draws an unknown colour as the default rather than as nothing", () => {
        // A subgroup pulled from an account that knows a colour this version does not still
        // has to be drawn, and drawn as something.
        expect(swatchOf("chartreuse").hex).toBe(swatchOf("blue").hex);
        expect(swatchOf(undefined).hex).toBe(swatchOf("blue").hex);
    });
});
