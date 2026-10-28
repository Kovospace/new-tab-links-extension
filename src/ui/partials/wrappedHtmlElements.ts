
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
    OPEN_GROUPED: "⇉",
    USER: "◉",
    EXPORT: "⇧",   // export (up/out)
    IMPORT: "⇩",   // import (down/in)
    HISTORY: "↺",   // recently closed / bring back
    CHECKED: "✓",  // ticked / confirmed / already done
    SYNC: "⟳",     // synchronisation; struck through by CSS where something does not sync
    TRASH: "🗑"     // destroy for good - the one pictorial icon here, because the
                   // trash bar has to be recognised from across the page mid-drag
} as const;

/**
 *  The crossed-out sync mark beside a profile that does not synchronise: the sync glyph,
 *  struck through by its stylesheet, saying why in its tooltip.
 *
 *  @param reason why it does not synchronise, already worded
 */
export const renderUnsyncedMark = (reason: string): HTMLElement => {
    const mark = document.createElement("span");
    mark.classList.add("cls-unsynced-mark");
    mark.textContent = ICON.SYNC;
    mark.title = reason;
    mark.setAttribute("aria-label", reason);
    return mark;
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
    if (classList) {
        containerElem.classList.add(...classList);
    }
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
    containerTag: string,
    text?: string,
    tooltipText?: string,
    classList?: string[]
): ELEMENT_TYPE {
    const elem: ELEMENT_TYPE = document.createElement(containerTag) as ELEMENT_TYPE;
    if ((tooltipText || tooltipText === "") && text) {
        elem.title = tooltipText ? tooltipText : text;
    }
    if (text) {
        elem.textContent = text;
    }
    if (classList) {
        elem.classList.add(...classList);
    }
    return elem;
}


