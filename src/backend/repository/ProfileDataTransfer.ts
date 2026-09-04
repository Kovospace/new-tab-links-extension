import { ProfileData } from "../entity/AppStateEntity";
import { LocalIdentifierNormalizer } from "../sync/LocalIdentifierNormalizer";

/**
 * Handles profile data import and export.
 * Operates on user-less ProfileData only — no user or session metadata is included,
 * so exported files can be imported by any user.
 */
export class ProfileDataTransfer {

    /**
     * Opens a file picker, reads the selected JSON file, and returns the parsed ProfileData.
     * Resolves with null if the user cancels or the file is not valid ProfileData JSON.
     *
     * Every identifier in the file is replaced on the way in, and every reference to one
     * repointed. An export carries the identifiers it was taken with, so importing a file
     * back alongside the profile it came from would otherwise produce two profiles whose
     * workspaces, groups and links collide exactly - one identifier naming two different
     * records. That was harmless while nothing left this machine; it is not harmless now
     * that these identifiers are what the backend keys its rows by.
     */
    static importFromFile(): Promise<ProfileData | null> {
        return new Promise(resolve => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";

            input.addEventListener("change", () => {
                const file = input.files?.[0];
                if (!file) {
                    resolve(null);
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const parsed = JSON.parse(reader.result as string) as ProfileData;
                        resolve(LocalIdentifierNormalizer.toFreshIdentifiers(parsed).data);
                    } catch {
                        resolve(null);
                    }
                };
                reader.onerror = () => resolve(null);
                reader.readAsText(file);
            });

            // Resolve null if the picker is dismissed without selecting a file
            input.addEventListener("cancel", () => resolve(null));

            input.click();
        });
    }

    /**
     * Serialises the given ProfileData to a JSON file and triggers a browser download.
     * @param data     The profile data to export (environments, groups, subgroups, links).
     * @param filename Base name for the downloaded file (without extension).
     */
    static exportToFile(data: ProfileData, filename: string): void {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${filename}.json`;
        anchor.click();

        URL.revokeObjectURL(url);
    }
}