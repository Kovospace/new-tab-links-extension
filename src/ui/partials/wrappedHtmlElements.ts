
/**
 *  UTF-8 icons used in UI
 */
export const ICON = {
    EDIT: "✎",       // edit / rename
    ADD: "+",        // add
    DELETE: "×",     // delete
    CLOSE: "✕",      // close
    MOVE: "⇅",       // move (up/down)
    MOVE_UP: "▴",    // move up
    MOVE_DOWN: "▾",  // move down
    EXPAND: "▸",     // expand / open
    COLLAPSE: "▾",   // collapse / close
    MORE: "⋮",
    OPEN_GROUPED: "⇉"
} as const;

/**
 *  Toggles black and blur overlay over whole page when opening context menu over some component
 */
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

/**
 *  Renders DIV container
 *
 *  <div class="[[ classList[0], ..., classList[n] ]]"></div>
 */
export function renderContainer(
    classList: string[]
): HTMLElement {
    const containerElem: HTMLElement = document.createElement("div");
    containerElem.classList.add(...classList);
    return containerElem;
}

/**
 *  Renders clickable button
 *
 *  <button class="[[ classList[0], ..., classList[n] ]]" title="[[ tooltipText ]] value="[[ value ]]">
 *      [[ text ]]
 *  </button>
 */
export function renderButton(
    text: string,
    value?: string | number,
    classList?: string[],
    tooltipText?: string,
    onClickListener?: (event: MouseEvent) => void
): HTMLButtonElement {

    // create button
    const buttonElement: HTMLButtonElement = document.createElement("button");
    if (tooltipText || tooltipText === "") {
        buttonElement.title = tooltipText ? tooltipText : text;
    }
    if (classList) {
        buttonElement.classList.add(...classList);
    }
    if (value) {
        if (typeof value === "string") {
            buttonElement.value = value;
        } else {
            buttonElement.value = value.toString();
        }
    }
    buttonElement.textContent = text;

    // register listener
    if (onClickListener) {
        buttonElement.addEventListener("click", onClickListener);
    }

    return buttonElement;
}

/**
 *  Renders text containing element (span, heading, paragraph)
 *
 *  <[[ containerTag ]] class="[[ classList[0], ..., classList[n] ]]">
 *      [[ text ]]
 *  </[[ containerTag ]]>
 */
type TextElement =
    | HTMLSpanElement
    | HTMLHeadingElement
    | HTMLParagraphElement;

export function renderTextContainer<ELEMENT_TYPE extends TextElement>(
    text: string,
    containerTag: string,
    tooltipText?: string,
    classList?: string[]
): ELEMENT_TYPE {
    const elem: ELEMENT_TYPE = document.createElement(containerTag) as ELEMENT_TYPE;
    if (tooltipText || tooltipText === "") {
        elem.title = tooltipText ? tooltipText : text;
    }
    elem.textContent = text;
    if (classList) {
        elem.classList.add(...classList);
    }
    return elem;
}


