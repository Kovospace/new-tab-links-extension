import {AppStateRepository} from "../backend/repository/AppStateRepository";
import {ProfileDataTransfer} from "../backend/repository/ProfileDataTransfer";
import {buildExampleProfileData} from "../backend/datasource/init/AppStateInit";
import { t } from "../i18n/i18n";
import { showNotice } from "../ui/partials/confirmations";
import { refusedUnderFairUse } from "./fairUseNoticeViewModel";
import { markedAsExample } from "../backend/entity/ExampleData";
import { profileRepository } from "../backend/repository/ProfileRepository";

export class FirstRunViewModel {

    private REPOSITORY!: AppStateRepository;

    constructor(repository: AppStateRepository) {
        this.REPOSITORY = repository;
    }

    public addWorkspace(title: string | null | undefined, description?: string): void {
        if (!title) {
            // A backstop: the dialog will not submit an empty name. This used to tell the user
            // and then create the workspace anyway, untitled.
            void showNotice(t("workspace.addDialog.title"), t("firstRun.titleMandatory"));
            return;
        }
        this.REPOSITORY
            .addWorkspace(title!, description)
            .then(() => {
                window.location.reload();
            });
    }

    public async importProfile(): Promise<void> {
        const data = await ProfileDataTransfer.importFromFile();
        if (!data) return;
        if (refusedUnderFairUse(data)) return;
        await this.REPOSITORY.replaceCurrentProfileData(data);
        window.location.reload();
    }

    public async loadDefaults(): Promise<void> {
        // Flagged as example data: shown as such, never synchronised, and removed at sign-in
        // unless the user makes it their own first (`ExampleData.ts`).
        await this.REPOSITORY.replaceCurrentProfileData(markedAsExample(buildExampleProfileData()));
        await profileRepository.markExample(this.REPOSITORY.getActiveProfileId());
        window.location.reload();
    }

}