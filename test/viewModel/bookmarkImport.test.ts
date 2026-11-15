import { describe, expect, it } from "vitest";

import {
    BookmarkNode, bookmarkFolderChoices, groupsToImport
} from "../../src/viewModel/bookmarkImport";

/** #182: the browser's bookmark tree, as `chrome.bookmarks.getTree()` gives it, into groups. */
describe("bookmark import", () => {

    const mark = (id: string, title: string, url: string, dateAdded?: number): BookmarkNode =>
        ({ id, title, url, dateAdded });
    const folder = (id: string, title: string, ...children: BookmarkNode[]): BookmarkNode =>
        ({ id, title, children });

    const tree: BookmarkNode[] = [folder("0", "",
        folder("1", "Bookmarks bar",
            mark("b1", "Loose one", "https://loose.test"),
            folder("work", "Work",
                mark("w1", "Mail", "https://mail.test", 100),
                folder("tools", "Tools",
                    mark("t1", "CI", "https://ci.test"),
                    folder("deep", "Deeper",
                        mark("d1", "Logs", "https://logs.test"),
                        folder("deepest", "Deepest", mark("d2", "Traces", "https://traces.test")))),
                mark("w2", "", "https://untitled.test")),
            folder("empty", "Nothing here", folder("alsoEmpty", "Still nothing")),
            folder("bookmarklets", "Bookmarklets", mark("j1", "Run", "javascript:alert(1)"))),
        folder("2", "Other bookmarks",
            folder("music", "Music", mark("m1", "Radio", "https://radio.test"))))];

    it("offers every folder in a root, and a root's loose bookmarks, never an empty folder", () => {
        expect(bookmarkFolderChoices(tree, "Untitled")).toEqual([
            { id: "1", title: "Bookmarks bar", rootTitle: "Bookmarks bar", linkCount: 1, loose: true },
            { id: "work", title: "Work", rootTitle: "Bookmarks bar", linkCount: 5, loose: false },
            { id: "music", title: "Music", rootTitle: "Other bookmarks", linkCount: 1, loose: false }
        ]);
    });

    it("makes a folder a group, its subfolders subgroups, and flattens anything deeper into them", () => {
        const [work] = groupsToImport(tree, new Set(["work"]), "Untitled");

        expect(work.title).toBe("Work");
        expect(work.items.map(item => item.kind === "link" ? item.url : item.title))
            .toEqual(["https://mail.test", "Tools", "https://untitled.test"]);
        const tools = work.items[1];
        expect(tools.kind === "subgroup" && tools.links.map(link => link.url))
            .toEqual(["https://ci.test", "https://logs.test", "https://traces.test"]);
    });

    it("keeps when a bookmark was made, and names an untitled one by its address", () => {
        const [work] = groupsToImport(tree, new Set(["work"]), "Untitled");
        expect(work.items[0]).toMatchObject({ title: "Mail", createdAt: 100 });
        expect(work.items[2]).toMatchObject({ title: "https://untitled.test" });
    });

    it("never imports a bookmarklet - it would run inside the new tab page", () => {
        expect(groupsToImport(tree, new Set(["bookmarklets"]), "Untitled")).toEqual([]);
    });

    it("imports only what was ticked, in the order offered, the loose bookmarks as their root's group", () => {
        const groups = groupsToImport(tree, new Set(["music", "1"]), "Untitled");
        expect(groups.map(group => group.title)).toEqual(["Bookmarks bar", "Music"]);
        expect(groups[0].items).toHaveLength(1);
    });
});
