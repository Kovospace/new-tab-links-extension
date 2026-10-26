import { beforeEach, describe, expect, it } from "vitest";

import { HistoryCard } from "../../../src/ui/partials/historyCard";
import { HistoryViewModel, VisitDayDTO, VisitDTO } from "../../../src/viewModel/historyViewModel";
import { ObservableValue } from "../../../src/utils/observableValue";

const visit = (id: string): VisitDTO => ({
    id, title: id, url: `https://example.com/${id}`, when: "now", elsewhere: null, bookmarked: false
});

const DAYS: VisitDayDTO[] = [
    { key: "2026-10-11", label: "Today", visits: [visit("a"), visit("b")] },
    { key: "2026-10-10", label: "Yesterday", visits: [visit("c")] },
    { key: "2026-10-03", label: "2026-10-03", visits: [visit("d")] }
];

/** Only what the card reads: the days, whether anything is recorded, and the lifecycle. */
function fakeViewModel(days: VisitDayDTO[]) {
    return {
        observables: {
            days: new ObservableValue<VisitDayDTO[]>(days),
            recording: new ObservableValue<boolean>(true)
        },
        query: "",
        setQuery(query: string) { this.query = query; },
        initialize: async () => undefined,
        dispose: () => undefined,
        reopened: [] as Array<[string, string]>,
        reopen(id: string, where: string) { this.reopened.push([id, where]); },
        forget: async () => undefined
    };
}

/**
 *  Each day of the history folds under its heading: the newest starts open and the rest
 *  folded, and a day folded or opened by hand stays so when the history is drawn again.
 */
describe("HistoryCard, folding days", () => {

    let viewModel: ReturnType<typeof fakeViewModel>;
    let card: HistoryCard;

    beforeEach(async () => {
        viewModel = fakeViewModel(DAYS);
        card = new HistoryCard(viewModel as unknown as HistoryViewModel, () => undefined, () => undefined);
        await card.initialize();
    });

    const toggles = () =>
        Array.from(card.listEl.querySelectorAll<HTMLButtonElement>(".closed-tabs__day-toggle"));
    const openDays = () => Array.from(card.listEl.querySelectorAll(".closed-tabs__day"))
        .filter(day => !day.querySelector<HTMLElement>(".closed-tabs__day-body")!.hidden)
        .map(day => day.querySelector(".closed-tabs__day-toggle")!.textContent);

    it("heads each day with its label and how many visits it holds", () => {
        expect(toggles().map(toggle => toggle.textContent)).toEqual([
            "▾Today2", "▸Yesterday1", "▸2026-10-031"
        ]);
        expect(toggles().map(toggle => toggle.getAttribute("aria-expanded")))
            .toEqual(["true", "false", "false"]);
    });

    it("opens the newest day and folds the earlier ones", () => {
        expect(openDays()).toEqual(["▾Today2"]);
    });

    it("folds and opens a day from its heading", () => {
        toggles()[1].click();
        toggles()[0].click();

        expect(openDays()).toEqual(["▾Yesterday1"]);
    });

    it("keeps a day as it was left when the history is drawn again", () => {
        toggles()[0].click();
        toggles()[2].click();

        viewModel.observables.days.set([
            { key: "2026-10-11", label: "Today", visits: [visit("new"), visit("a"), visit("b")] },
            ...DAYS.slice(1)
        ]);

        expect(openDays()).toEqual(["▾2026-10-031"]);
    });

    it("opens every day while a search is typed, and folds them back after", () => {
        // What the view model would answer: the days holding a match.
        card.setQuery("  a ");
        viewModel.observables.days.set([DAYS[0], DAYS[2]]);

        expect(viewModel.query).toBe("a");
        expect(openDays()).toEqual(["▾Today2", "▾2026-10-031"]);

        card.setQuery("");
        viewModel.observables.days.set(DAYS);

        expect(openDays()).toEqual(["▾Today2"]);
    });

    it("says that nothing matches, rather than that nothing was visited", () => {
        card.setQuery("zzz");
        viewModel.observables.days.set([]);

        expect(card.listEl.textContent).toBe("Nothing here matches “zzz”.");
    });
});

/** A visit's row opens the page here, and its last button in a new tab. */
describe("HistoryCard, opening a visit", () => {

    it("opens a clicked row in this tab and the row's last button in a new one", async () => {
        const viewModel = fakeViewModel(DAYS);
        const card = new HistoryCard(viewModel as unknown as HistoryViewModel, () => undefined, () => undefined);
        await card.initialize();
        const row = card.listEl.querySelector(".closed-tabs__row")!;

        row.querySelector<HTMLButtonElement>(".closed-tabs__text")!.click();
        const buttons = row.querySelectorAll<HTMLButtonElement>(".closed-tabs__row-actions button");
        buttons[buttons.length - 1].click();

        expect(viewModel.reopened).toEqual([["a", "here"], ["a", "newTab"]]);
    });
});
