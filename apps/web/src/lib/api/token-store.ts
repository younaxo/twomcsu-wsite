/// Access-token хранится только в памяти (как и в старом проекте, см.
/// docs/technical/09-AUTHENTICATION.md): не в localStorage и не в cookie —
/// XSS не сможет его украсть из хранилища, а refresh-token живёт в httpOnly
/// cookie и браузеру из JS недоступен вовсе.
type Listener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },
  set(token: string | null): void {
    if (accessToken === token) {
      return;
    }
    accessToken = token;
    for (const listener of listeners) {
      listener(token);
    }
  },
  clear(): void {
    tokenStore.set(null);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
