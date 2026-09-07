
import {Logger} from "../../utils/logger";

import { ELEM_OPTIONS_MENU, ELEM_OPTIONS_MENU_ITEM} from "../../main"
import { ICON, renderButton } from "../partials/wrappedHtmlElements"
import { toggleOverlay } from "../partials/wrappedHtmlElements";

/**
 *  A divider between groups of actions. It carries no label and nothing happens when it is
 *  clicked, which is why it is a separate shape rather than an action with empty fields: the
 *  renderer already returns early for one, and a single type with every field optional made
 *  `actionTitle` and `onClick` optional for real menu items too.
 */
export type OptionsMenuSeparator = {
    separator: true,
    noBorder?: boolean
}

/** Something the user can pick out of the menu. */
export type OptionsMenuAction = {
    actionTitle: string,
    dangerous?: boolean,
    active?: boolean,
    /**
     *  Draws the item as a checkbox, ticked while `active`.
     *
     *  For an item that is a setting rather than a command: the menu is where its current
     *  value is read, so the highlight `active` gives on its own is not enough to say
     *  whether picking it would turn the thing on or off.
     */
    checkable?: boolean,
    noBorder?: boolean,
    dangerConfirmation?: string,
    separator?: false,
    onClick: () => void
}

export type OptionsMenuItem = OptionsMenuSeparator | OptionsMenuAction

type MenuRenderData = {
    openMenuButtonId: string,
    openMenuButtonClass?: string | string[],
    openMenuButtonTooltipText?: string
    openMenuButtonContent?: string
}

export class OptionsMenu {

    private LOG!: Logger

    private parentElement!: HTMLElement;
    private openingElement!: HTMLButtonElement;
    private menuElement!: HTMLElement;

    private renderData!: MenuRenderData;
    private options!: OptionsMenuItem[];
    private metadata?: any;

    constructor(
        parentElement: HTMLElement,
        renderData: MenuRenderData,
        options?: OptionsMenuItem[],
        metadata?: any
    ) {
        this.LOG = new Logger("OptionsMenu");
        this.parentElement = parentElement;
        this.renderData = renderData;
        if (metadata) {
            this.setMetadata(metadata);
        }
        if (options) {
            this.setOptions(options);
            this.render();
        }
    }

    public setOptions(options: OptionsMenuItem[]) {
        this.options = options;
    }

    public setMetadata(metadata: any) {
        this.metadata = metadata;
    }

    /** Replace all menu items without re-creating the menu element or button. */
    public updateOptions(options: OptionsMenuItem[]) {
        this.options = options;
        this.menuElement.replaceChildren();
        this.options.forEach(option => this.appendMenuItem(option));
    }

    /** Update the label text of the opening button without disturbing the nested menu element. */
    public updateButtonContent(content: string) {
        const textNode = Array.from(this.openingElement.childNodes)
            .find(node => node.nodeType === Node.TEXT_NODE);
        if (textNode) {
            textNode.textContent = content;
        }
    }

    public render() {
        this.renderButton();
        this.renderMenu();
        this.attachListeners();
    }

    private renderButton() {
        this.openingElement = renderButton(
            this.renderData.openMenuButtonContent ? this.renderData.openMenuButtonContent : ICON.MORE,
            "",
            this.renderData.openMenuButtonClass
                ? [
                    ...(Array.isArray(this.renderData.openMenuButtonClass)
                        ? this.renderData.openMenuButtonClass
                        : [this.renderData.openMenuButtonClass])
                  ]
                : [],
            this.renderData.openMenuButtonTooltipText,
            (event) => {
                this.LOG.debug("neu open clicked");
                event.stopPropagation();
                this.toggleMenu();
            }
        );
        this.openingElement.id = this.renderData.openMenuButtonId;
        this.parentElement.appendChild(this.openingElement);
    }

    private renderMenu(openingElement?: HTMLButtonElement) {
        if (openingElement) {
            this.openingElement = openingElement;
        }

        this.menuElement = document.createElement(ELEM_OPTIONS_MENU);
        this.openingElement.appendChild(this.menuElement);

        this.options.forEach((option: OptionsMenuItem) => this.appendMenuItem(option));
    }

    private appendMenuItem(option: OptionsMenuItem) {
        const optionElem = document.createElement(ELEM_OPTIONS_MENU_ITEM);
        if (option.noBorder) {
            optionElem.classList.add("no-bordered");
        }
        if (option.separator) {
            optionElem.classList.add("separator");
            this.menuElement.appendChild(optionElem);
            return;
        }
        optionElem.textContent = option.actionTitle;
        optionElem.setAttribute('defaultText', option.actionTitle);
        if (option.dangerous) {
            optionElem.classList.add("danger");
        }
        if (option.checkable) {
            optionElem.classList.add("checkable");
        }
        if (option.active) {
            optionElem.classList.add("active");
        }

        optionElem.addEventListener('click', () => {
            this.LOG.debug(`Menu item clicked: ${option.actionTitle}`);
            this.LOG.debug("Metadata: " + this.metadata);
            toggleOverlay(false);
            if (option.dangerous) {
                let message = "Are You sure ?";
                if (option.dangerConfirmation) {
                    message += `\n\n${option.dangerConfirmation}`;
                }
                if (!confirm(message)) {
                    return;
                }
            }
            option.onClick();
        });

        this.menuElement.appendChild(optionElem);
    }

    private attachListeners() {
        document.addEventListener("mousedown", (event) => {
            if (document.querySelector('dialog[open]')) return;
            if (
                !this.menuElement.contains(event.target as Node) &&
                !this.openingElement.contains(event.target as Node)
            ) {
                this.menuElement.classList.remove("visible");
                this.openingElement.classList.remove("active");
                toggleOverlay(false);
            }
        });
    }

    private toggleMenu() {
        this.openingElement.classList.toggle("active");
        const willBeVisible = !this.menuElement.classList.contains('visible');
        if (willBeVisible) {
            const rect = this.openingElement.getBoundingClientRect();
            const isRightHalf = rect.left > window.innerWidth / 2;
            this.menuElement.classList.toggle('align-right', isRightHalf);
        }
        this.menuElement.classList.toggle('visible');
        toggleOverlay(this.menuElement.classList.contains('visible'));
    }
}