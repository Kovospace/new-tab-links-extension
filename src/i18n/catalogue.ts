import type { CatalogueNode } from "./i18n";

import enBookmark from "./locales/en/bookmark.json";
import enClosedTabs from "./locales/en/closedTabs.json";
import enCommon from "./locales/en/common.json";
import enDates from "./locales/en/dates.json";
import enDialogs from "./locales/en/dialogs.json";
import enErrors from "./locales/en/errors.json";
import enFairUse from "./locales/en/fairUse.json";
import enFirstRun from "./locales/en/firstRun.json";
import enGroup from "./locales/en/group.json";
import enHeader from "./locales/en/header.json";
import enHistory from "./locales/en/history.json";
import enLink from "./locales/en/link.json";
import enOpenTabs from "./locales/en/openTabs.json";
import enProfiles from "./locales/en/profiles.json";
import enSearch from "./locales/en/search.json";
import enSettings from "./locales/en/settings.json";
import enSubgroup from "./locales/en/subgroup.json";
import enSync from "./locales/en/sync.json";
import enTips from "./locales/en/tips.json";
import enWorkspace from "./locales/en/workspace.json";

import skBookmark from "./locales/sk/bookmark.json";
import skClosedTabs from "./locales/sk/closedTabs.json";
import skCommon from "./locales/sk/common.json";
import skDates from "./locales/sk/dates.json";
import skDialogs from "./locales/sk/dialogs.json";
import skErrors from "./locales/sk/errors.json";
import skFairUse from "./locales/sk/fairUse.json";
import skFirstRun from "./locales/sk/firstRun.json";
import skGroup from "./locales/sk/group.json";
import skHeader from "./locales/sk/header.json";
import skHistory from "./locales/sk/history.json";
import skLink from "./locales/sk/link.json";
import skOpenTabs from "./locales/sk/openTabs.json";
import skProfiles from "./locales/sk/profiles.json";
import skSearch from "./locales/sk/search.json";
import skSettings from "./locales/sk/settings.json";
import skSubgroup from "./locales/sk/subgroup.json";
import skSync from "./locales/sk/sync.json";
import skTips from "./locales/sk/tips.json";
import skWorkspace from "./locales/sk/workspace.json";

/**
 *  Every language's wording, assembled from the files it is split across.
 *
 *  **The split follows the screens** - `group.json` holds what a group says, `link.json` what
 *  a link says - because that is how somebody looking for a sentence looks for it: they saw it
 *  somewhere. What several screens say in the same words is not duplicated into each of them;
 *  it goes to the file named after the thing it belongs to instead - `common.json` for the
 *  buttons every dialog has, `dialogs.json` for what the input dialog and its validation say,
 *  `errors.json` for what goes wrong with the account, `dates.json` for anything about time.
 *
 *  **The file's name is the first segment of every key it holds**, so a key says where its
 *  wording lives: `t("subgroup.menu.addLink")` is in `subgroup.json`, under `menu`. That is
 *  also why this file is a list of imports rather than a glob - a bundle has to be able to see
 *  what is in it, and a mistyped path here is a build error rather than a missing sentence.
 *
 *  Adding a language is adding a folder under `locales/` and a block here. Nothing else in the
 *  extension names a language; `SUPPORTED_LANGUAGES` in `languages.ts` decides what is offered,
 *  and `test/i18n/catalogue.test.ts` is what notices a key one language has and another does not.
 */
export const CATALOGUES: Record<string, Record<string, CatalogueNode>> = {

    en: {
        bookmark: enBookmark,
        closedTabs: enClosedTabs,
        common: enCommon,
        dates: enDates,
        dialogs: enDialogs,
        errors: enErrors,
        fairUse: enFairUse,
        firstRun: enFirstRun,
        group: enGroup,
        header: enHeader,
        history: enHistory,
        link: enLink,
        openTabs: enOpenTabs,
        profiles: enProfiles,
        search: enSearch,
        settings: enSettings,
        subgroup: enSubgroup,
        sync: enSync,
        tips: enTips,
        workspace: enWorkspace
    },

    sk: {
        bookmark: skBookmark,
        closedTabs: skClosedTabs,
        common: skCommon,
        dates: skDates,
        dialogs: skDialogs,
        errors: skErrors,
        fairUse: skFairUse,
        firstRun: skFirstRun,
        group: skGroup,
        header: skHeader,
        history: skHistory,
        link: skLink,
        openTabs: skOpenTabs,
        profiles: skProfiles,
        search: skSearch,
        settings: skSettings,
        subgroup: skSubgroup,
        sync: skSync,
        tips: skTips,
        workspace: skWorkspace
    }
};
