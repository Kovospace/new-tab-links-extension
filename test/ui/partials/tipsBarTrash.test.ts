import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { TipsBar } from "../../../src/ui/partials/tipsBar";
import { TipsViewModel } from "../../../src/viewModel/tipsViewModel";
import { TrashViewModel } from "../../../src/viewModel/trashViewModel";
import {
    makeDraggable, useProfilesForDragAndDrop
} from "../../../src/ui/dragAndDrop/dragAndDrop";
import { environment, group, link, profileOf } from "../../support/profileDataFixtures";
import { flushStorageNotifications } from "../../support/chromeStorageStub";

/**
 *  Lets the drop finish.
 *
 *  A drop handler cannot be awaited - the browser does not wait for one either - so what it
 *  starts is a promise nobody holds: destroy the link, write the profile, publish the change.
 *  A turn of the event loop is what that takes.
 */
const settled = () => new Promise(resolve => setTimeout(resolve, 0));

/** A drag event jsdom will carry, with the dataTransfer a browser would provide. */
function dragEvent(type: string): DragEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true }) as DragEvent;
    const data = new Map<string, string>();
    Object.defineProperty(event, "dataTransfer", {
        value: {
            setData: (format: string, value: string) => data.set(format, value),
            getData: (format: string) => data.get(format) ?? "",
            setDragImage: () => undefined,
            effectAllowed: "", dropEffect: ""
        }
    });
    return event;
}

/**
 *  The trash half of the bar at the foot of the workspace.
 *
 *  What is worth pinning here is not the colour - jsdom loads no stylesheet and lays nothing
 *  out - but the two facts underneath it: the bar takes a link and destroys it, and it takes
 *  nothing else. A trash that quietly accepted a group would delete that group's every link on
 *  one gesture.
 */
describe("TipsBar, as the trash", () => {

    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let bar: TipsBar;

    /** The bar, as the drop target it registered itself as. */
    const barEl = () => document.querySelector('.tips-bar') as HTMLElement;

    /** Picks something up, the way the page does. */
    function pickUp(kind: "link" | "group", id: string): HTMLElement {
        const element = document.createElement('div');
        document.body.appendChild(element);
        makeDraggable(element, { kind, id });
        element.dispatchEvent(dragEvent("dragstart"));
        return element;
    }

    beforeEach(async () => {
        document.body.innerHTML = '';
        profiles = new ProfileRepository();
        await profiles.init();
        await profiles.updateSettings({ enableDragAndDrop: true });
        useProfilesForDragAndDrop(profiles);

        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment("e", "W")],
            groups: [group("g", "R", "e")],
            links: [link("l1", "Keep", "https://keep/", "g", "e"),
                    link("l2", "Destroy", "https://destroy/", "g", "e", { position: 1 })],
            activeEnvironmentId: "e"
        }));

        bar = new TipsBar(new TipsViewModel(profiles), new TrashViewModel(appState));
        bar.render(document.body);

        // The repository adopts writes made in another page, so a notification left pending
        // from the setup above would be replayed over whatever a test does next - and the
        // stored copy it carries still holds the link the test is about to destroy.
        await flushStorageNotifications();
    });

    const links = () => Object.keys(appState.state$.get().links).sort();

    it("destroys a link dropped on it, and only that link", async () => {
        pickUp("link", "l2");

        barEl().dispatchEvent(dragEvent("drop"));
        await settled();

        expect(links()).toEqual(["l1"]);
    });

    it("offers itself while a link is in the air", () => {
        pickUp("link", "l2");

        // false means preventDefault was called, which is how a target says "yes, here".
        expect(barEl().dispatchEvent(dragEvent("dragenter"))).toBe(false);
        expect(barEl().dispatchEvent(dragEvent("dragover"))).toBe(false);
    });

    it("refuses a group, which would take every link in it", async () => {
        pickUp("group", "g");

        // true means nothing cancelled it: the bar is not a target for this.
        expect(barEl().dispatchEvent(dragEvent("dragenter"))).toBe(true);

        barEl().dispatchEvent(dragEvent("drop"));
        await settled();

        expect(links()).toEqual(["l1", "l2"]);
    });

    it("wears the trash face at all times, so the stylesheet has one to show", () => {
        // Built once at render rather than when a drag starts: dragstart is the one moment in
        // a drag when the browser is measuring what is being picked up.
        expect(barEl().querySelector('.tips-bar__trash')?.textContent)
            .toContain('Drop the link here to destroy it');
    });

    it("hides the tip, not the bar, when the profile has dismissed tips", async () => {
        // The bar is still the trash for a user who pressed "hide tips" - which the stylesheet
        // can only manage if the element is still there to be drawn.
        await profiles.updateSettings({ hideTips: true });

        expect(barEl()).not.toBeNull();
        expect((barEl().querySelector('.tips-bar__tip') as HTMLElement).hidden).toBe(true);
        expect(barEl().hidden).toBe(false);
    });
});
