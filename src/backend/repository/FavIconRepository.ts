
import { InMemoryGopnikCache } from "../datasource/inMemoryGopnikCache/InMemoryGopnikCache"
import { IndexedDB } from "../datasource/indexedDB/IndexedDB"

/**
 *  A lookup that found no icon, and when it gave up.
 *
 *  Stored as itself rather than as the placeholder it is drawn with. A placeholder stored in
 *  the icon's place is indistinguishable from an icon, so nothing ever asked again - which is
 *  how every link synchronised onto a browser that had never visited it kept a blank square
 *  for good.
 */
export interface FaviconMiss {
  missedAt: number;
  /** Asset path the link is drawn with meanwhile. */
  fallback: string;
}

/**
 *  What the cache holds for a page: an icon as a data URI, or a miss.
 *  A bare asset path may also come back - that is how misses were stored before they were
 *  told apart, and it is read as a miss that is already due for another attempt.
 */
export type CachedFavicon = string | FaviconMiss;

export class FavIconRepository {

  private static GOPNIK_DB_NAMESPACE: string = "favicon";
  private static INDEXED_DB_NAMESPACE: string = "favicon";

  public static async get(pageUrl: string): Promise<CachedFavicon | null> {
    if (InMemoryGopnikCache.has(pageUrl, FavIconRepository.GOPNIK_DB_NAMESPACE)) {
      return InMemoryGopnikCache.get<CachedFavicon>(pageUrl, FavIconRepository.GOPNIK_DB_NAMESPACE);
    }

    const value = await IndexedDB.getFromDB<CachedFavicon>(pageUrl, FavIconRepository.INDEXED_DB_NAMESPACE);

    if (value !== null) {
      InMemoryGopnikCache.set(pageUrl, value, FavIconRepository.GOPNIK_DB_NAMESPACE);
    }

    return value;
  }

  public static async save(pageUrl: string, value: CachedFavicon): Promise<void> {
    InMemoryGopnikCache.set(pageUrl, value, FavIconRepository.GOPNIK_DB_NAMESPACE);
    await IndexedDB.storeInDB(pageUrl, value, FavIconRepository.INDEXED_DB_NAMESPACE);
  }

  public static async delete(pageUrl: string): Promise<void> {
    InMemoryGopnikCache.delete(pageUrl, FavIconRepository.GOPNIK_DB_NAMESPACE);
    await IndexedDB.deleteFromDB(pageUrl, FavIconRepository.INDEXED_DB_NAMESPACE);
  }
}
