import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  "Manage links" shows a link's action buttons by adding `managed` to a group's or a
 *  subgroup's body; link.css does the showing. The subgroup's own rule once took a path through
 *  an element its body does not have (`link-subgroup-body.managed > div > link-container`), so
 *  it matched nothing and the action did nothing from a subgroup's menu (#121). jsdom draws
 *  nothing, but it does match selectors: the rule is tried against the structure
 *  subgroupComponent.ts builds.
 */
describe("Manage links, from a subgroup's menu", () => {

    const css = readFileSync(resolve("src/ui/styles/link.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const managedSubgroupRule = css.match(/[^{}]*link-subgroup-body\.managed[^{}]*(?=\{)/)![0]
        .split(",").map(selector => selector.trim()).find(selector => selector.startsWith("link-subgroup-body.managed"))!;

    it("shows the action buttons of the subgroup's links", () => {
        // The structure subgroupComponent.ts builds: wrapper div > head + body, links directly in
        // the body; linkComponent.ts wraps a link's parts in a div of their own.
        document.body.innerHTML = `
            <link-group-body>
              <link-subgroup><div>
                <link-subgroup-head></link-subgroup-head>
                <link-subgroup-body class="managed">
                  <link-container><div class="cls-link-wrapper">
                    <div class="cls-link-actions-container"></div>
                  </div></link-container>
                </link-subgroup-body>
              </div></link-subgroup>
            </link-group-body>`;

        expect(document.querySelector(managedSubgroupRule))
            .toBe(document.querySelector(".cls-link-actions-container"));
    });
});
