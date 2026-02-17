const storage = {

    async get<T>(key: string): Promise<T | null> {
        return new Promise(resolve => {
            // @ts-ignore
            chrome.storage.local.get([key], result => {
                resolve(result[key] ?? null);
            });
        });
    },

    async set<T>(key: string, value: T): Promise<void> {
        return new Promise(resolve => {
            // @ts-ignore
            chrome.storage.local.set({ [key]: value }, () => resolve());
        });
    }

};

export class ChromeStorageWrapper {

    public async save<TYP>(key: string, data: TYP) {
        await storage.set(key, data);
    }

    public async get<TYP>(key: string): Promise<TYP | null> {
        return await storage.get(key);
    }
}
