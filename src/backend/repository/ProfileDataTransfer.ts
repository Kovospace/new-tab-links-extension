import { ProfileData } from "../entity/AppStateEntity";

/**
 * Handles profile data import and export.
 * Operates on user-less ProfileData only — no user or session metadata is included,
 * so exported files can be imported by any user.
 */
export class ProfileDataTransfer {

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