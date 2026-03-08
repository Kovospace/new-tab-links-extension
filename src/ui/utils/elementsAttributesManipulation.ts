export function toggleActiveClassOnSpecificAttribute<ELEMENT_TYPE>(attribute: string, value: string | number, elementsCollectionCommonClass: string) {
    Array.from(document.getElementsByClassName(elementsCollectionCommonClass))
        .forEach((element: ELEMENT_TYPE) => {
            element.classList.remove("active");
            if (element[attribute] === value) {
                element.classList.add("active");
            }
        });
}