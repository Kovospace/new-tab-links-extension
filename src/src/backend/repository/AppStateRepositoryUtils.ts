import {AppState, Group, Link} from "../entity/AppStateEntity";

export class AppStateRepositoryUtils {

    private state!: AppState;

    constructor(state: AppState) {
        this.state = state;
    }

}