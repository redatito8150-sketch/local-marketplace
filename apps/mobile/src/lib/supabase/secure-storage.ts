import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800;
const metaKey = (key: string) => `${key}.__chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function removeChunks(key: string, count: number) {
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index))
    )
  );
}

export const secureStorage = {
  async getItem(key: string) {
    const countValue = await SecureStore.getItemAsync(metaKey(key));
    if (!countValue) {
      return SecureStore.getItemAsync(key);
    }

    const count = Number(countValue);
    if (!Number.isSafeInteger(count) || count < 1) {
      return null;
    }

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, index))
      )
    );
    return chunks.some((chunk) => chunk === null) ? null : chunks.join("");
  },

  async setItem(key: string, value: string) {
    const previousCount = Number(await SecureStore.getItemAsync(metaKey(key))) || 0;
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "gs")) ?? [""];

    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, index), chunk)
      )
    );
    await SecureStore.setItemAsync(metaKey(key), String(chunks.length));
    await SecureStore.deleteItemAsync(key);

    if (previousCount > chunks.length) {
      await Promise.all(
        Array.from(
          { length: previousCount - chunks.length },
          (_, offset) => SecureStore.deleteItemAsync(chunkKey(key, chunks.length + offset))
        )
      );
    }
  },

  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(metaKey(key))) || 0;
    await removeChunks(key, count);
    await Promise.all([
      SecureStore.deleteItemAsync(metaKey(key)),
      SecureStore.deleteItemAsync(key)
    ]);
  }
};
