export function uid(): string {
    return crypto.randomUUID();
}

export function qsAll<T extends Element>(selector: string, parent: Element = document.body): T[] {
    return Array.from(parent.querySelectorAll(selector)) as T[];
}

export function handleRendering<DTO_TYPE, RESULT_ELEMENT_TYPE = HTMLElement>(
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