const AUTH_STORAGE_KEY = "pos_auth_v1";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export class HttpClient {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, auth = true } = options;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (auth) {
      const token = getStoredToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      const message =
        (data as { message?: string } | undefined)?.message ??
        `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status);
    }

    return data as T;
  }
}

export const httpClient = new HttpClient();
