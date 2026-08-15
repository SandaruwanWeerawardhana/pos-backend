import { deserialize, serialize } from "node:v8";
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

// jsdom's test environment doesn't expose Node's structuredClone global.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = <T>(value: T): T =>
    deserialize(serialize(value)) as T;
}
