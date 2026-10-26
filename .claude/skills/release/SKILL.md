---
name: release
description: Prepare a new Tabilinks version for the Chrome Web Store and the website - work out what shipped since the last release, bump the version and build the zip, update the store listing and write the release tutorial, write the website changelog, audit and propose tips, sweep the website for claims the release made untrue, then ask the developer what else to do. Use when the user says a version is ready to deploy, asks for release materials, a store update, a changelog, or a version bump.
---

# Releasing a version of Tabilinks

A release touches two repositories and one dashboard. This extension holds the package, the
listing (`store/chrome-web-store-listing.md`) and one tutorial per release
(`store/release-<version>-store-update.md`); the website (`/home/kovo/IdeaProjects/new-tab-links-frontend`)
holds the changelog, the tips, the home page highlights and the privacy policy. The developer
pastes into the Developer Dashboard, takes the screenshots and uploads the zip - everything else
is prepared here.

**Read the website's `CLAUDE.md` before touching it** - its rules apply, and its hooks do not fire
from this session: branch `feature/release-<version>` (the same name in both repos), and **commit
there only when asked**. In this repo the usual flow applies: branch, commit, push, PR.

Use `store/release-0.4.0-store-update.md` and `store/release-0.2.0-store-update.md` as the shape
of the tutorial. Do not copy their content - every number and name in them has to be re-read
from the code.

## 1. What shipped

1. The last release is the last commit that changed `"version"` in `public/manifest.json`
   (`git log -L '/"version"/,+1:public/manifest.json'`, or `git log --oneline -S'"version"' -- public/manifest.json`).
2. Pull requests merged since its date: `gh pr list --state merged --limit 100 --json number,title,mergedAt`
   filtered by `mergedAt`. Check a PR's commit is really after the release
   (`git merge-base --is-ancestor <commit> <release-commit>`) before saying it is new - a feature
   merged on a branch before the tag can still be first shipped now, and the reverse.
3. Group them into user-facing features and fixes. Ask the developer which features lead; the
   developer's own list of "most important" wins over the commit log's.
4. Version: new features → minor (0.3.0 → 0.4.0), fixes only → patch. Ask when unsure.

## 2. The package (this repo)

- [ ] `public/manifest.json` `"version"`. (`package.json`'s version is not the extension's; leave it.)
- [ ] `git diff <release-commit> -- public/manifest.json public/_locales`: a new permission or host
      permission needs a justification in the Privacy tab, and some trigger a re-consent prompt that
      disables the extension until accepted - say which in the tutorial. A changed
      `_locales` name/summary is what the store shows.
- [ ] Tip teasers in `src/ui/tips/tips.json`: every `Settings → "<section>"` path must match the
      section names in `src/i18n/locales/{en,sk}/settings.json` (`categories`) - sections get renamed
      and settings move between them. A teaser describing a removed control is a bug.
- [ ] `npm test`, then `npm run build && rm -f tabilinks.zip && (cd dist && zip -qr -X ../tabilinks.zip .)`.
      Verify: `unzip -p tabilinks.zip manifest.json | grep version`, and `manifest.json` at the
      zip's root (0.1.0's was under `dist/`, and the store refused it).
- [ ] `npx web-ext lint --source-dir dist`: 0 errors. Expected warnings are listed in CLAUDE.md
      (Commands); anything new goes into the tutorial.

## 3. The store listing and the tutorial (this repo)

Update `store/chrome-web-store-listing.md` so it is the source of truth, then write
`store/release-<version>-store-update.md`:

0. Order of work - website first (the reviewer reads the privacy policy), screenshots, merge, paste, upload.
1. Website changes, with a table of tips corrected and which **screenshots the developer must retake**.
2. Privacy tab: single purpose, permission justifications (new and changed, ready to paste), data usage.
3. Detailed descriptions, EN and SK - what changed in them and why.
4. Graphics - suggested screenshots for this release; the developer takes them.
5. Test instructions for the reviewer, covering every new feature.
6. Package - version, how it was built, lint result, expected review time.

Check in the listing, every time:
- FREE / PREMIUM lists against `src/backend/entity/PlanLimits.ts`. A feature that moved to free
  (backgrounds did, in 0.4.0) left in the premium list is a false claim in the store.
- Every `Settings → …` against the current section names, in both languages.
- Every URL exists in both languages (`/sk/...`).
- The single purpose and the `tabs` justification still describe everything `tabs` is read for.

## 4. The website

On branch `feature/release-<version>`, uncommitted until the developer says so.

- [ ] **Changelog** `public/content/changelog/{en,sk}/<version>.md`. The build refuses a file that
      does not begin `# <version>`, `*Released: YYYY-MM-DD*` (SK `*Vydané: …*`), a `##` heading and
      at least one bullet - see `scripts/build-changelog-index.mjs`. Bullets = the most important
      changes; sections after them link the matching tips. Link texts are the tips' own titles.
- [ ] **Highlights** (`public/content/home-features/{en,sk}/<n>-<slug>.md`) when the release brings
      something worth a selling point. Pictures are hand-written SVGs in
      `public/images/{en,sk}/home-features/<slug>/<slug>.svg`, in the house style: no text, a dark
      browser window (`#111` fill, `#666` strokes 3-4 wide, rx 18, title bar line, circle and
      address pill), black link tiles with a `#004fff` favicon dot, `#4a82ff` accents and dotted
      `stroke-dasharray="2 10"` connectors, `#FF2D32` and `#009d15` only for meaning. The SK copy
      differs only in `<title>`. Render it next to an existing one (headless Chromium
      `--screenshot`) and look at it before handing it over.
- [ ] **Tips audit**: for every tip under `public/content/tips/{en,sk}/`, does it describe a control
      that moved, was renamed or removed? `grep -rn "Settings\|Nastaven\|button\|tlačidl"`. Fix the
      text; list the screenshots that no longer match for the developer; delete images that show
      something gone. A tip that is only a title is a gap - write it.
- [ ] **New tips**: propose one for each shipped feature no tip explains, and write the ones the
      developer accepts. A new tip committed there is picked up by that repo's hook, which syncs it
      into this extension's `tips.json` (see its CLAUDE.md, "Tips reach the extension too").
- [ ] **Misleading claims sweep**: the privacy policy (`public/content/legal/{en,sk}/privacy.md`),
      the FAQ, the comparison (`src/app/core/comparison/`), the premium tip, `public/i18n/*.json`.
      A changed legal document moves `LEGAL_DOCUMENTS_EFFECTIVE_DATE` in
      `src/app/core/legal/legal-operator.ts` - one date for all of them; say so.
      A new network request (like downloading a built-in background) belongs in the policy.
- [ ] `npm run build` (pre-renders every page; a malformed changelog fails here), `npx ng test --watch=false`,
      `node .claude/tools/image-maintenance.mjs check` (no broken references, no orphaned images).

## 5. Hand over, and ask

Report: version, zip, PR in this repo, the website branch and what is on it, what the developer
must do by hand (screenshots, dashboard, merge order), and anything found that is not fixed.

Then **ask** - with `AskUserQuestion` where the options are clear - whether to:
- commit the website changes and open its PR;
- write any of the proposed tips;
- do something this skill does not cover. Offer what fits the release, for example: a Firefox
  submission (`web-ext lint` lists what Firefox still wants), an announcement text, a store
  marquee tile, a GitHub release with the zip, closing the released issues on the board, or a
  tip for a feature that has none.

When something worth doing every time comes up, add it to this file.
