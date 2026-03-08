export function toggleActiveClassOnSpecificAttribute<
    ELEMENT_TYPE extends HTMLElement,
    KEY extends keyof ELEMENT_TYPE
>(
    attribute: KEY,
    value: ELEMENT_TYPE[KEY],
    elementsCollectionCommonClass: string
): void {

    const elements = Array.from(
        document.getElementsByClassName(elementsCollectionCommonClass)
    ) as ELEMENT_TYPE[];

    elements.forEach((element) => {
        element.classList.remove("active");
        if (element[attribute] === value) {
            element.classList.add("active");
        }
    });
}