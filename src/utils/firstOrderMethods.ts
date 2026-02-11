import {ACT_SWITCH_WORKSPACE} from "../main";

export function uid(): string {
    return crypto.randomUUID();
}

export function qsAll<T extends Element>(selector: string, parent: Element = document.body): T[] {
    return Array.from(parent.querySelectorAll(selector)) as T[];
}

/**
 * Performs keyed, incremental rendering of child elements inside a parent container.
 *
 * This function compares the current DOM children of `parentElement` with a new
 * collection of DTOs and updates the DOM with minimal changes:
 *
 * - Reuses existing DOM elements when their key matches an incoming DTO
 * - Creates and appends new DOM elements for DTOs that are not yet rendered
 * - Removes DOM elements that no longer have a corresponding DTO
 *
 * Unlike full re-rendering (e.g. `replaceChildren()`), this approach preserves:
 * - Existing DOM nodes
 * - Event listeners
 * - Focus and user interaction state
 *
 * The function assumes that each rendered child element can be uniquely identified
 * by a stable key derived from the DTO.
 *
 * @typeParam DTO_TYPE - Type of the data objects coming from the ViewModel
 * @typeParam RESULT_ELEMENT_TYPE - Type of the rendered DOM elements (defaults to HTMLElement)
 *
 * @param parentElement
 *        The container element whose direct children represent rendered DTOs.
 *
 * @param dtos
 *        The new ordered list of DTOs that should be reflected in the DOM.
 *
 * @param getElementKeyValueFromDto
 *        Function that extracts a unique, stable key from a DTO.
 *        This key is used to match DTOs to existing DOM elements.
 *
 * @param createChildElement
 *        Factory function responsible for creating and initializing a new DOM
 *        element for a given DTO.
 *
 * @param elementKey
 *        Optional property name used to store the key on the DOM element.
 *        Defaults to `"id"` if not provided.
 *
 * @remarks
 * - This function performs an identity-based diff, not a deep content comparison.
 * - Element order is preserved based on the incoming `dtos` order only for newly
 *   created elements; existing elements are not reordered.
 * - The key stored on the DOM element must remain stable between renders.
 */
export function handleReactiveRendering<DTO_TYPE, RESULT_ELEMENT_TYPE = HTMLElement>(
    parentElement: HTMLElement,
    dtos: readonly DTO_TYPE[],
    getElementKeyValueFromDto: (dto: DTO_TYPE) => string,
    createChildElement: (dto: DTO_TYPE) => RESULT_ELEMENT_TYPE,
    elementKey?: string
) {

    // Snapshot existing elements in actual rendered HTML template
    if (elementKey === undefined || elementKey === null || elementKey === "") {
        elementKey = "id";
    }

    const existing = new Map<string, RESULT_ELEMENT_TYPE>(
        Array
            .from(parentElement.children)
            .map(el => [(el as RESULT_ELEMENT_TYPE)[elementKey], el as RESULT_ELEMENT_TYPE]));

    // Loop over data incoming from viewModel
    for (const dto of dtos) {
        const keyValueFromDto = getElementKeyValueFromDto(dto);

        // Create & render missing elements
        if (!existing.has(keyValueFromDto)) {
            const childElement: RESULT_ELEMENT_TYPE = createChildElement(dto);
            childElement[elementKey] = keyValueFromDto;
            parentElement.appendChild(childElement);
        }

        // Mark element existing in rendered HTML template as handled
        existing.delete(keyValueFromDto);
    }

    // Remove leftover elements that are not part of new incoming data from HTML template
    existing.forEach((el: RESULT_ELEMENT_TYPE) => el.remove());
}

export function toggleActiveClassOnEvent(event: Event, elementsCollectionCommonClass: string) {
    Array.from(document.getElementsByClassName(elementsCollectionCommonClass))
        .forEach((element: HTMLElement) => element.classList.remove("active"));
    (event.currentTarget as HTMLButtonElement).classList.add("active");
}

export function toggleActiveClassOnSpecificAttribute<ELEMENT_TYPE>(attribute: string, value: string | number, elementsCollectionCommonClass: string) {
    Array.from(document.getElementsByClassName(elementsCollectionCommonClass))
        .forEach((element: ELEMENT_TYPE) => {
            element.classList.remove("active");
            if (element[attribute] === value) {
                element.classList.add("active");
            }
        });

}