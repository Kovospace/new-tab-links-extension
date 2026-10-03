import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { BookmarkViewModel } from "../../../src/viewModel/bookmarkViewModel";
import { BookmarkForm } from "../../../src/ui/partials/bookmarkForm";
import { environment, group, profileOf, subgroup } from "../../support/profileDataFixtures";
import { Environment } from "../../../src/backend/entity/AppStateEntity";

const PROFILE = "0199bbbb-0000-7000-8000-00000000000b";

/**
 *  Which workspace a bookmark goes into. With one workspace there is nothing to ask and the
 *  form only names it; with several it asks, starting on the open one, and the groups - and
 *  through them the subgroups - follow the answer.
 */
describe("BookmarkForm, choosing the workspace", () => {

    let appState: AppStateRepository;

    beforeEach(() => {
        document.body.innerHTML = '<main id="host"></main>';
    });

    /** Workspaces created in the order given, so the switcher's order is the same. */
    const created = (id: string, name: string, createdAt: number): Environment =>
        ({ ...environment(id, name), createdAt });

    async function seed(environments: Environment[], open: string): Promise<void> {
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());

        await profiles.upsertProfile({ id: PROFILE, name: "Test", createdAt: 0 });
        await appState.saveProfileData(PROFILE, profileOf({
            environments,
            groups: [
                group("grp-home", "Home links", "env-home"),
                group("grp-work-a", "Projects", "env-work", 0),
                group("grp-work-b", "Reading", "env-work", 1)
            ],
            subgroups: [subgroup("sub-later", "Later", "grp-work-b", "env-work")],
            activeEnvironmentId: open
        }));
        await appState.switchProfile(PROFILE);
    }

    function render(): void {
        void new BookmarkForm(
            { url: "https://example.com/", title: "Example", favIconUrl: "/icon.png" },
            new BookmarkViewModel(appState)
        ).render(document.getElementById("host")!);
    }

    const select = (id: string) => document.getElementById(id) as HTMLSelectElement | null;
    const labels = (id: string) => Array.from(select(id)!.options).map(option => option.text);
    const pick = (id: string, label: string) => {
        const target = select(id)!;
        target.value = Array.from(target.options).find(option => option.text === label)!.value;
        target.dispatchEvent(new Event("change"));
    };

    it("only names the workspace when the profile has one", async () => {
        await seed([created("env-home", "Home", 1)], "env-home");
        render();

        expect(select("bookmark-workspace")).toBeNull();
        expect(document.querySelector(".bookmark-panel__value")?.textContent).toBe("Home");
        expect(labels("bookmark-group")).toEqual(["Home links"]);
    });

    it("offers every workspace, starting on the open one, with that one's groups", async () => {
        await seed([created("env-home", "Home", 1), created("env-work", "Work", 2)], "env-work");
        render();

        expect(labels("bookmark-workspace")).toEqual(["Home", "Work"]);
        expect(select("bookmark-workspace")!.selectedOptions[0].text).toBe("Work");
        expect(labels("bookmark-group")).toEqual(["Projects", "Reading"]);
    });

    it("refills the groups, and their subgroups, for another workspace", async () => {
        await seed([created("env-home", "Home", 1), created("env-work", "Work", 2)], "env-home");
        render();
        expect(labels("bookmark-group")).toEqual(["Home links"]);

        pick("bookmark-workspace", "Work");
        expect(labels("bookmark-group")).toEqual(["Projects", "Reading"]);
        expect(select("bookmark-subgroup")!.closest(".bookmark-panel__row")!
            .hasAttribute("hidden")).toBe(true);

        pick("bookmark-group", "Reading");
        expect(select("bookmark-subgroup")!.closest(".bookmark-panel__row")!
            .hasAttribute("hidden")).toBe(false);
    });

    it("saves into the chosen workspace's group, under that workspace", async () => {
        await seed([created("env-home", "Home", 1), created("env-work", "Work", 2)], "env-home");
        render();

        pick("bookmark-workspace", "Work");
        pick("bookmark-group", "Reading");
        (document.querySelector('button[type="submit"]') as HTMLButtonElement).click();
        await new Promise(resolve => setTimeout(resolve, 0));

        const saved = Object.values(appState.state$.get().links)
            .find(one => one.url === "https://example.com/")!;
        expect(saved.groupId).toBe("grp-work-b");
        expect(saved.environmentId).toBe("env-work");
    });

    it("will not save into a workspace that has no groups", async () => {
        await seed([
            created("env-home", "Home", 1), created("env-work", "Work", 2),
            created("env-empty", "Empty", 3)
        ], "env-home");
        render();

        pick("bookmark-workspace", "Empty");

        expect(labels("bookmark-group")).toEqual([]);
        expect((document.querySelector('button[type="submit"]') as HTMLButtonElement).disabled)
            .toBe(true);
    });
});
