/**
 *  Groups to create in one go, with their links and subgroups: what an import hands
 *  `AppStateRepository.importGroups` (#182 - the browser's bookmarks, `viewModel/bookmarkImport.ts`).
 *  Titles and addresses are expected to fit the account's limits already.
 */

/** A link to create. */
export interface ImportedLink {
    kind: "link";
    title: string;
    url: string;
    /** When it was first saved where it comes from, so "Sort links → newest first" means something afterwards. */
    createdAt?: number;
}

/** A subgroup to create, with its links. */
export interface ImportedSubgroup {
    kind: "subgroup";
    title: string;
    links: ImportedLink[];
}

/** A group to create: its links and subgroups in one sequence, in the order they come in. */
export interface ImportedGroup {
    title: string;
    items: Array<ImportedLink | ImportedSubgroup>;
}
