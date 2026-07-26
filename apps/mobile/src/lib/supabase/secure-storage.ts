import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const CHUNK_SIZE = 1800;
const metaKey = (key: string) => `${key}.__chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;
const getRaw = (key: string) => Platform.OS === "web" ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
const setRaw = (key: string, value: string) => Platform.OS === "web" ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value);
const removeRaw = (key: string) => Platform.OS === "web" ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key);

async function removeChunks(key: string, count: number) {
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      removeRaw(chunkKey(key, index))
    )
  );
}

export const secureStorage = {
  async getItem(key: string) {
    const countValue = await getRaw(metaKey(key));
    if (!countValue) {
      return getRaw(key);
    }

    const count = Number(countValue);
    if (!Number.isSafeInteger(count) || count < 1) {
      return null;
    }

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        getRaw(chunkKey(key, index))
      )
    );
    return chunks.some((chunk) => chunk === null) ? null : chunks.join("");
  },

  async setItem(key: string, value: string) {
    const previousCount = Number(await getRaw(metaKey(key))) || 0;
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "gs")) ?? [""];

    await Promise.all(
      chunks.map((chunk, index) =>
        setRaw(chunkKey(key, index), chunk)
      )
    );
    await setRaw(metaKey(key), String(chunks.length));
    await removeRaw(key);

    if (previousCount > chunks.length) {
      await Promise.all(
        Array.from(
          { length: previousCount - chunks.length },
          (_, offset) => removeRaw(chunkKey(key, chunks.length + offset))
        )
      );
    }
  },

  async removeItem(key: string) {
    const count = Number(await getRaw(metaKey(key))) || 0;
    await removeChunks(key, count);
    await Promise.all([
      removeRaw(metaKey(key)),
      removeRaw(key)
    ]);
  }
};
