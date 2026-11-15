import { MAX_NAME_LENGTH, MAX_TITLE_LENGTH, MAX_URL_LENGTH } from "../backend/sync/SyncContracts";
import { validateField } from "../ui/partials/fieldValidation";
import { ImportedGroup, ImportedLink } from "../backend/entity/ImportedGroups";

/**
 *  Importing the browser's own bookmarks into a workspace (#182).
 *
 *  Pure: the tree goes in as `chrome.bookmarks.getTree()` gives it, and what to create comes
 *  out. The permission, the dialog and the writing are elsewhere (`utils/browserBookmarks.ts`,
 *  `ui/partials/bookmarkImportDialog.ts`, `AppStateRepository.importGroups`).
 *
 *  **What becomes what.** The tree's roots are the browser's own: Bookmarks bar, Other
 *  bookmarks, Mobile bookmarks in Chrome, and Firefox's toolbar, menu and unfiled. Every
 *  folder directly inside a root is offered as a group, and the user ticks which. A root's
 *  loose bookmarks - not in any folder - are offered as one more group under the root's name.
 *  Inside a chosen folder its bookmarks are the group's own links, each subfolder becomes a
 *  subgroup, and anything deeper than that goes into that subgroup, flattened. The page has
 *  two levels, so the third and below cannot have a level of their own.
 *
 *  **Only what a link may be.** Addresses go through the add-link dialog's own rules
 *  (`validateField`): no `javascript:` bookmarklets, which would run inside the new tab page,
 *  no `data:` and nothing too long for the account. Titles are cut to what the account takes,
 *  because one over-long title fails a whole push.
 */

/** A node of the browser's bookmark tree - the fields of `chrome.bookmarks.BookmarkTreeNode` read here. */
export interface BookmarkNode {
    id: string;
    title: string;
    url?: string;
    dateAdded?: number;
    children?: BookmarkNode[];
}

/** One folder the user may tick. */
export interface BookmarkFolderChoice {
    /** The folder's identifier, or the root's for its loose bookmarks. */
    id: string;
    /** What the group will be called. */
    title: string;
    /** The browser's root it is in, which is how the dialog heads it. */
    rootTitle: string;
    /** How many links it would bring, subfolders included. */
    linkCount: number;
    /** The root's own bookmarks that are in no folder, rather than a folder. */
    loose: boolean;
}

/** The browser's roots: the children of the tree's single top node. */
function rootsOf(tree: ReadonlyArray<BookmarkNode>): BookmarkNode[] {
    return tree.flatMap(top => top.children ?? []);
}

function isFolder(node: BookmarkNode): boolean {
    return node.url === undefined && Array.isArray(node.children);
}

/** A bookmark as a link, or null when it is not one this page may keep. */
function asLink(node: BookmarkNode): ImportedLink | null {
    const url = node.url?.trim();
    if (!url || validateField("", url, { type: "url", maxLength: MAX_URL_LENGTH }) !== null) {
        return null;
    }
    const title = (node.title ?? "").trim() || url;
    return {
        kind: "link",
        title: title.slice(0, MAX_TITLE_LENGTH),
        url,
        createdAt: node.dateAdded
    };
}

/** Every bookmark at any depth under a folder, in the order the browser shows them. */
function linksBelow(folder: BookmarkNode): ImportedLink[] {
    return (folder.children ?? []).flatMap(child => {
        if (isFolder(child)) return linksBelow(child);
        const link = asLink(child);
        return link ? [link] : [];
    });
}

/** The bookmarks directly in a folder, not in any of its subfolders. */
function ownLinks(folder: BookmarkNode): ImportedLink[] {
    return (folder.children ?? [])
        .filter(child => !isFolder(child))
        .map(asLink)
        .filter((link): link is ImportedLink => link !== null);
}

function nameOf(node: BookmarkNode, fallback: string): string {
    return ((node.title ?? "").trim() || fallback).slice(0, MAX_NAME_LENGTH);
}

/**
 *  The folders offered in the dialog: every folder directly inside a root, and each root's
 *  loose bookmarks. Anything that would bring no link is left out, so an empty folder is
 *  never offered.
 *
 *  @param tree     what `chrome.bookmarks.getTree()` resolved to
 *  @param untitled what to call a folder with no name
 */
export function bookmarkFolderChoices(
    tree: ReadonlyArray<BookmarkNode>, untitled: string
): BookmarkFolderChoice[] {
    return rootsOf(tree).flatMap(root => {
        const rootTitle = nameOf(root, untitled);
        const choices: BookmarkFolderChoice[] = [];
        const loose = ownLinks(root).length;
        if (loose > 0) {
            choices.push({ id: root.id, title: rootTitle, rootTitle, linkCount: loose, loose: true });
        }
        for (const folder of (root.children ?? []).filter(isFolder)) {
            const linkCount = linksBelow(folder).length;
            if (linkCount > 0) {
                choices.push({
                    id: folder.id, title: nameOf(folder, untitled), rootTitle, linkCount, loose: false
                });
            }
        }
        return choices;
    });
}

/**
 *  What to create for the ticked folders, in the order they are offered.
 *
 *  @param tree     what `chrome.bookmarks.getTree()` resolved to
 *  @param chosen   the identifiers of the ticked choices (`BookmarkFolderChoice.id`)
 *  @param untitled what to call a folder with no name
 */
export function groupsToImport(
    tree: ReadonlyArray<BookmarkNode>, chosen: ReadonlySet<string>, untitled: string
): ImportedGroup[] {
    const groups: ImportedGroup[] = [];
    for (const root of rootsOf(tree)) {
        if (chosen.has(root.id)) {
            const links = ownLinks(root);
            if (links.length > 0) groups.push({ title: nameOf(root, untitled), items: links });
        }
        for (const folder of (root.children ?? []).filter(isFolder)) {
            if (!chosen.has(folder.id)) continue;
            const group = groupOf(folder, untitled);
            if (group.items.length > 0) groups.push(group);
        }
    }
    return groups;
}

/** A chosen folder as a group: its bookmarks, and its subfolders flattened into subgroups. */
function groupOf(folder: BookmarkNode, untitled: string): ImportedGroup {
    const items: ImportedGroup["items"] = [];
    for (const child of folder.children ?? []) {
        if (isFolder(child)) {
            const links = linksBelow(child);
            if (links.length > 0) {
                items.push({ kind: "subgroup", title: nameOf(child, untitled), links });
            }
        } else {
            const link = asLink(child);
            if (link) items.push(link);
        }
    }
    return { title: nameOf(folder, untitled), items };
}
