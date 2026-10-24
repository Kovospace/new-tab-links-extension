import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { BookmarkViewModel } from "../../../src/viewModel/bookmarkViewModel";
import { BookmarkForm } from "../../../src/ui/partials/bookmarkForm";
import { environment, group, profileOf, subgroup } from "../../support/profileDataFixtures";
import { Environment, Group, Subgroup } from "../../../src/backend/entity/AppStateEntity";
import { MAX_NAME_LENGTH } from "../../../src/backend/sync/SyncContracts";

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

    const GROUPS: Group[] = [
        group("grp-home", "Home links", "env-home"),
        group("grp-work-a", "Projects", "env-work", 0),
        group("grp-work-b", "Reading", "env-work", 1)
    ];
    const SUBGROUPS: Subgroup[] = [subgroup("sub-later", "Later", "grp-work-b", "env-work")];

    async function seed(
        environments: Environment[], open: string | null,
        groups: Group[] = GROUPS, subgroups: Subgroup[] = SUBGROUPS
    ): Promise<void> {
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());

        await profiles.upsertProfile({ id: PROFILE, name: "Test", createdAt: 0 });
        await appState.saveProfileData(PROFILE, profileOf({
            environments,
            groups,
            subgroups,
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
    const input = (id: string) => document.getElementById(id) as HTMLInputElement;
    const rowHidden = (id: string) =>
        document.getElementById(id)!.closest(".bookmark-panel__row")!.hasAttribute("hidden");
    const submit = async () => {
        (document.querySelector('button[type="submit"]') as HTMLButtonElement).click();
        await new Promise(resolve => setTimeout(resolve, 0));
    };
    const savedLink = () => Object.values(appState.state$.get().links)
        .find(one => one.url === "https://example.com/");
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
        expect(labels("bookmark-group")).toEqual(["Home links", "New group…"]);
    });

    it("offers every workspace, starting on the open one, with that one's groups", async () => {
        await seed([created("env-home", "Home", 1), created("env-work", "Work", 2)], "env-work");
        render();

        expect(labels("bookmark-workspace")).toEqual(["Home", "Work"]);
        expect(select("bookmark-workspace")!.selectedOptions[0].text).toBe("Work");
        expect(labels("bookmark-group")).toEqual(["Projects", "Reading", "New group…"]);
    });

    it("refills the groups, and their subgroups, for another workspace", async () => {
        await seed([created("env-home", "Home", 1), created("env-work", "Work", 2)], "env-home");
        render();
        expect(labels("bookmark-group")).toEqual(["Home links", "New group…"]);

        pick("bookmark-workspace", "Work");
        expect(labels("bookmark-group")).toEqual(["Projects", "Reading", "New group…"]);
        expect(labels("bookmark-subgroup")).toEqual(["(none)", "New subgroup…"]);

        pick("bookmark-group", "Reading");
        expect(labels("bookmark-subgroup")).toEqual(["(none)", "Later", "New subgroup…"]);
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

    it("opens on a new group in a workspace that has none, and saves into it", async () => {
        await seed([
            created("env-home", "Home", 1), created("env-work", "Work", 2),
            created("env-empty", "Empty", 3)
        ], "env-home");
        render();

        pick("bookmark-workspace", "Empty");

        expect(labels("bookmark-group")).toEqual(["New group…"]);
        expect(rowHidden("bookmark-new-group")).toBe(false);
        expect(rowHidden("bookmark-subgroup")).toBe(true);
        expect(input("bookmark-new-group").value).toBe("Ungrouped");

        input("bookmark-new-group").value = "Inbox";
        input("bookmark-new-group-description").value = "Sort later";
        await submit();

        const made = Object.values(appState.state$.get().groups)
            .find(one => one.title === "Inbox")!;
        expect(made).toMatchObject({ environmentId: "env-empty", description: "Sort later" });
        expect(savedLink()).toMatchObject({ groupId: made.id, environmentId: "env-empty" });
    });

    it("makes a new subgroup in a group that exists", async () => {
        await seed([created("env-work", "Work", 2)], "env-work");
        render();

        expect(rowHidden("bookmark-new-subgroup")).toBe(true);
        pick("bookmark-group", "Reading");
        pick("bookmark-subgroup", "New subgroup…");
        expect(rowHidden("bookmark-new-subgroup")).toBe(false);

        input("bookmark-new-subgroup").value = "Articles";
        await submit();

        const made = Object.values(appState.state$.get().subgroups)
            .find(one => one.title === "Articles")!;
        expect(made.groupId).toBe("grp-work-b");
        expect(savedLink()).toMatchObject({ groupId: "grp-work-b", subGroupId: made.id });
    });

    it("makes the workspace too when the profile has none", async () => {
        await seed([], null, [], []);
        render();

        expect(select("bookmark-workspace")).toBeNull();
        expect(input("bookmark-new-workspace").value).toBe("My workspace");
        expect(labels("bookmark-group")).toEqual(["New group…"]);

        await submit();

        const [workspace] = appState.getWorkspaces();
        const [made] = appState.getGroups(workspace.id);
        expect(workspace.name).toBe("My workspace");
        expect(made.title).toBe("Ungrouped");
        expect(savedLink()).toMatchObject({ groupId: made.id, environmentId: workspace.id });
    });

    it("makes nothing while a name to make something under is missing or too long", async () => {
        await seed([created("env-empty", "Empty", 3)], "env-empty", [], []);
        render();

        input("bookmark-new-group").value = "  ";
        await submit();
        expect(document.activeElement).toBe(input("bookmark-new-group"));

        input("bookmark-new-group").value = "x".repeat(MAX_NAME_LENGTH + 1);
        await submit();

        expect(document.querySelector('[role="alert"]')!.hasAttribute("hidden")).toBe(false);
        expect(appState.state$.get().groups).toEqual({});
        expect(savedLink()).toBeUndefined();
    });
});
