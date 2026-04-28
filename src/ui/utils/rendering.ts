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
 * - Element order follows the incoming `dtos` array; existing elements are moved
 *   into the correct position if the order has changed.
 * - The key stored on the DOM element must remain stable between renders.
 */
export function handleReactiveRendering<
    DTO_TYPE,
    RESULT_ELEMENT_TYPE extends HTMLElement,
    KEY extends keyof RESULT_ELEMENT_TYPE
>(
    parentElement: HTMLElement,
    dtos: readonly DTO_TYPE[],
    getElementKeyValueFromDto: (dto: DTO_TYPE) => string,
    createChildElement: (dto: DTO_TYPE) => RESULT_ELEMENT_TYPE,
    elementKey: KEY = "id" as KEY
): void {

    const existing = new Map<string, RESULT_ELEMENT_TYPE>(
        Array
            .from(parentElement.children)
            .map(el => [
                (el as RESULT_ELEMENT_TYPE)[elementKey] as unknown as string,
                el as RESULT_ELEMENT_TYPE
            ])
    );

    for (const dto of dtos) {
        const keyValueFromDto = getElementKeyValueFromDto(dto);
        if (existing.has(keyValueFromDto)) {
            // Move existing element to the end to enforce DTO order
            parentElement.appendChild(existing.get(keyValueFromDto)!);
            existing.delete(keyValueFromDto);
        } else {
            const childElement = createChildElement(dto);
            (childElement[elementKey] as unknown as string) = keyValueFromDto;
            parentElement.appendChild(childElement);
        }
    }

    existing.forEach(el => el.remove());
}