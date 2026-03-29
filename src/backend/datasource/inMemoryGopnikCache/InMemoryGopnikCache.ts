export class InMemoryGopnikCache {
  private static store: Record<string, Record<string, unknown>> = {};

  static get<T>(key: string, namespace: string): T | null {
    return (this.store[namespace]?.[key] as T) ?? null;
  }

  static set<T>(key: string, value: T, namespace: string): void {
    if (!this.store[namespace]) {
      this.store[namespace] = {};
    }
    this.store[namespace][key] = value;
  }

  static has(key: string, namespace: string): boolean {
    return key in (this.store[namespace] ?? {});
  }
}
