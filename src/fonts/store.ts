// Persistance des polices importées dans IndexedDB (binaire brut, pas de quota localStorage).

const DB_NAME = 'breloq';
const STORE = 'fonts';

export interface StoredFont {
  name: string;
  data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponible'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => { db.close(); resolve(req.result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
      }),
  );
}

export function saveStoredFont(font: StoredFont): Promise<void> {
  return run('readwrite', (s) => s.put(font)).then(() => undefined);
}

export function listStoredFonts(): Promise<StoredFont[]> {
  return run('readonly', (s) => s.getAll() as IDBRequest<StoredFont[]>);
}
