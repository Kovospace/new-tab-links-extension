
import { InMemoryGopnikCache } from "../datasource/inMemoryGopnikCache/InMemoryGopnikCache"
import { IndexedDB } from "../datasource/indexedDB/IndexedDB"

export class FavIconRepository {

  private static GOPNIK_DB_NAMESPACE: string = "favicon";
  private static INDEXED_DB_NAMESPACE: string = "favicon";

  public static async get(pageUrl: string): Promise<string | null> {
    if (InMemoryGopnikCache.has(pageUrl, FavIconRepository.GOPNIK_DB_NAMESPACE)) {
      return InMemoryGopnikCache.get<string>(pageUrl, FavIconRepository.GOPNIK_DB_NAMESPACE);
    }

    const value = await IndexedDB.getFromDB<string>(pageUrl, FavIconRepository.INDEXED_DB_NAMESPACE);

    if (value !== null) {
      InMemoryGopnikCache.set(pageUrl, value, FavIconRepository.GOPNIK_DB_NAMESPACE);
    }

    return value;
  }

  public static async save(pageUrl: string, base64: string): Promise<void> {
    InMemoryGopnikCache.set(pageUrl, base64, FavIconRepository.GOPNIK_DB_NAMESPACE);
    await IndexedDB.storeInDB(pageUrl, base64, FavIconRepository.INDEXED_DB_NAMESPACE);
  }
}
