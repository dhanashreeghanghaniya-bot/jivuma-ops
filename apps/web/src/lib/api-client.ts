import type { ApiError, ApiMeta, ApiResponse, AuthUser, LoginResponse } from '@juma/shared';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * The access token lives in memory only. The long-lived refresh token is an
 * httpOnly cookie the browser never exposes to JavaScript.
 */
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
const sessionLostHandlers = new Set<() => void>();

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

export function onSessionLost(handler: () => void) {
  sessionLostHandlers.add(handler);
  return () => {
    sessionLostHandlers.delete(handler);
  };
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, error: ApiError | null) {
    super(error?.message ?? 'Something went wrong');
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = error?.code ?? 'INTERNAL_ERROR';
    this.fieldErrors = Object.fromEntries((error?.details ?? []).map((d) => [d.path, d.message]));
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /**
   * Sent verbatim instead of `body`, for endpoints that take something other
   * than JSON (the bulk importer posts raw CSV). Set `Content-Type` yourself.
   */
  rawBody?: string;
  /** Query params; `undefined` and `''` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skips the automatic refresh-and-retry (used by the auth calls themselves). */
  skipAuthRetry?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function rawRequest<T>(
  path: string,
  options: RequestOptions,
): Promise<{ data: T; meta: ApiMeta | null }> {
  const { body, rawBody, query, skipAuthRetry: _skip, headers, ...rest } = options;

  const response = await fetch(buildUrl(path, query), {
    ...rest,
    // Always send the refresh cookie; it is scoped to /api/v1/auth server-side.
    credentials: 'include',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    ...(rawBody !== undefined
      ? { body: rawBody }
      : body === undefined
        ? {}
        : { body: JSON.stringify(body) }),
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // Non-JSON response (proxy error page, network interception, ...).
  }

  if (!response.ok) throw new ApiRequestError(response.status, payload?.error ?? null);

  return { data: payload?.data as T, meta: payload?.meta ?? null };
}

/** Collapses concurrent 401s into a single refresh call. */
async function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const { data } = await rawRequest<LoginResponse>('/auth/refresh', {
        method: 'POST',
        skipAuthRetry: true,
      });
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      // Cleared on the next tick so callers queued behind this one reuse the result.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: ApiMeta | null }> {
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    const isAuthFailure =
      err instanceof ApiRequestError &&
      err.status === 401 &&
      !options.skipAuthRetry &&
      path !== '/auth/refresh';

    if (!isAuthFailure) throw err;

    const token = await refreshAccessToken();
    if (!token) {
      sessionLostHandlers.forEach((handler) => handler());
      throw err;
    }

    return rawRequest<T>(path, { ...options, skipAuthRetry: true });
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

/**
 * Fetches a file (PDF, Excel) with the session and hands it to the browser as
 * a download. Exports need the bearer token, so a plain link cannot do it.
 */
export async function downloadFile(path: string, query?: RequestOptions['query']): Promise<void> {
  const get = () =>
    fetch(buildUrl(path, query), {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  let response = await get();
  if (response.status === 401 && (await refreshAccessToken())) response = await get();
  if (!response.ok) {
    let error: ApiError | null = null;
    try {
      error = ((await response.json()) as ApiResponse<never>).error;
    } catch {
      // Not JSON.
    }
    throw new ApiRequestError(response.status, error);
  }
  const name =
    /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'download';
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// --- auth calls -------------------------------------------------------------

export async function loginRequest(phone: string, password: string): Promise<LoginResponse> {
  const { data } = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { phone, password },
    skipAuthRetry: true,
  });
  setAccessToken(data.accessToken);
  return data;
}

/**
 * `null` means the server says there is no session. `'offline'` means the
 * server could not be reached, which is not the same thing: a salesman opening
 * the app without signal is still signed in (SPEC 5.3).
 */
export async function bootstrapSession(): Promise<LoginResponse | null | 'offline'> {
  try {
    const { data } = await apiRequest<LoginResponse>('/auth/refresh', {
      method: 'POST',
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken);
    return data;
  } catch (err) {
    setAccessToken(null);
    return err instanceof ApiRequestError ? null : 'offline';
  }
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST', skipAuthRetry: true });
  } finally {
    setAccessToken(null);
  }
}

export const fetchMe = () => api.get<AuthUser & { hqTown: unknown }>('/me');
