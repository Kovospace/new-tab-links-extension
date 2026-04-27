export class IndexedDB {
  private static DB_VERSION = 1;

  private static openDB(namespace: string) {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(namespace, this.DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(namespace)) {
          db.createObjectStore(namespace);
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  static async getFromDB<T>(key: string, namespace: string): Promise<T | null> {
    const db = await this.openDB(namespace);

    return new Promise(resolve => {
      const tx = db.transaction(namespace, "readonly");
      const req = tx.objectStore(namespace).get(key);

      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  }

  static async storeInDB<T>(key: string, value: T, namespace: string) {
    const db = await this.openDB(namespace);

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(namespace, "readwrite");
      tx.objectStore(namespace).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  static async deleteFromDB(key: string, namespace: string): Promise<void> {
    const db = await this.openDB(namespace);

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(namespace, "readwrite");
      tx.objectStore(namespace).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
