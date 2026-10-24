/**
 *  Whether every word of a typed query appears somewhere in the texts given.
 *
 *  Every word, in any order and in any of the texts: "github pull" finds a page titled "Pull
 *  requests" at github.com. Case and accents are ignored, because nobody types the háček they
 *  are looking for - "kosice" has to find "Košice".
 *
 *  @param query what was typed; blank matches everything
 *  @param texts what to look in - a title, an address; missing ones are skipped
 */
export function matchesQuery(query: string, ...texts: Array<string | undefined>): boolean {
    const words = foldForSearch(query).split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) {
        return true;
    }
    const haystack = texts.filter(text => text !== undefined).map(foldForSearch).join("\n");
    return words.every(word => haystack.includes(word));
}

/** Lower case, with the accents taken off: what both sides of a comparison are reduced to. */
function foldForSearch(text: string): string {
    return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}
