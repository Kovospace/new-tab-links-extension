
export const toggleOverlay = (forcedState?: boolean) => {
    const overlayElement = document.getElementsByClassName("overlay")[0];
    if (forcedState === undefined || forcedState === null) {
        overlayElement.classList.toggle("hidden");
        return;
    }
    if (forcedState) {
        overlayElement.classList.remove("hidden");
        return;
    }
    overlayElement.classList.add("hidden");
};