
import { InMemoryGopnikCache } from "../datasource/inMemoryGopnikCache/InMemoryGopnikCache"
import { IndexedDB } from "../datasource/indexedDB/IndexedDB"

export class FavIconRepository {

  private static GOPNIK_DB_NAMESPACE: string = "favicon";
  private static INDEXED_DB_NAMESPACE: string = "favicon";

  public static get(pageUrl: string): Promise<any> {
    return IndexedDB.getFromDB(pageUrl, FavIconRepository.INDEXED_DB_NAMESPACE);
  }

  public static save(pageUrl: string, base64: string): void {
    IndexedDB.storeInDB(pageUrl, base64, FavIconRepository.INDEXED_DB_NAMESPACE);
  }
}