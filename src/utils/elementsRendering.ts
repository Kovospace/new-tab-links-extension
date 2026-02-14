
export const ICON = {
    EDIT: "✎",      // edit / rename
    ADD: "+",       // add
    DELETE: "×",    // delete
    CLOSE: "✕",     // close
    MOVE: "⇅",      // move
    EXPAND: "▸",    // expand / open
    COLLAPSE: "▾",  // collapse / close
    MORE: "⋮",
} as const;

export function renderContainer(
    classList: string[]
): HTMLElement {
    const containerElem: HTMLElement = document.createElement("div");
    containerElem.classList.add(...classList);
    return containerElem;
}

/**
 *  <button class="[[ className ]]" title="[[ tooltipText ]] value="[[ value ]]">
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
        buttonElement.value = value;
    }
    buttonElement.textContent = text;

    // register listener
    if (onClickListener) {
        buttonElement.addEventListener("click", onClickListener);
    }

    return buttonElement;
}

/**
 *
 *
 */
export function renderH1(
    text: string,
    tooltipText?: string,
    classList?: string[]
): HTMLHeadingElement {
    const titleElem: HTMLHeadingElement = document.createElement("h1");
    if (tooltipText || tooltipText === "") {
        titleElem.title = tooltipText ? tooltipText : text;
    }
    titleElem.textContent = text;
    if (classList) {
        titleElem.classList.add(...classList);
    }
    return titleElem
}

/**
 *
 *
 */
export function renderSpan(
    text: string,
    tooltipText?: string,
    classList?: string[]
): HTMLSpanElement {
    const spanElem: HTMLHeadingElement = document.createElement("span");
    if (tooltipText || tooltipText === "") {
        spanElem.title = tooltipText ? tooltipText : text;
    }
    spanElem.textContent = text;
    if (classList) {
        spanElem.classList.add(...classList);
    }
    return spanElem
}

export function renderTextContainer<ELEMENT_TYPE>(
    text: string,
    containerTag: string,
    tooltipText?: string,
    classList?: string[]
): ELEMENT_TYPE {
    const elem: ELEMENT_TYPE = document.createElement(containerTag);
    if (tooltipText || tooltipText === "") {
        elem.title = tooltipText ? tooltipText : text;
    }
    elem.textContent = text;
    if (classList) {
        elem.classList.add(...classList);
    }
    return elem
}


