// Migrate only the requested auth key. Delete plaintext only after a durable
// encrypted write succeeds. Browser development retains its normal storage.
export const authStorage = {
  async getItem(key: string) {
    const secure = window.desktopCredentials;
    if (!secure) return localStorage.getItem(key);
    const encrypted = await secure.get(key);
    if (encrypted !== null) { localStorage.removeItem(key); return encrypted; }
    const legacy = localStorage.getItem(key);
    if (legacy !== null) { await secure.set(key, legacy); localStorage.removeItem(key); }
    return legacy;
  },
  async setItem(key: string, value: string) {
    if (window.desktopCredentials) { await window.desktopCredentials.set(key, value); localStorage.removeItem(key); }
    else localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (window.desktopCredentials) await window.desktopCredentials.remove(key);
    localStorage.removeItem(key);
  },
};
