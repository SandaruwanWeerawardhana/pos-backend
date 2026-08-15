import type { ApiClient } from "./client";
import { mockApi } from "./mock";
import { realApi } from "./real";

/**
 * Defaults to the mock backend; set NEXT_PUBLIC_USE_MOCK_API=false to switch
 * to the real Go backend once it's ready - a one-line config change.
 */
const useMock = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";

export const apiClient: ApiClient = useMock ? mockApi : realApi;

export type { ApiClient } from "./client";
export type {
  AuthUser,
  LoginResult,
  ProfileUpdate,
  SyncOrderOutcome,
  SyncOrderResult,
  SyncOrdersResponse,
} from "./client";
