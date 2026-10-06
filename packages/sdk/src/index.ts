export type Locale = "pt-BR" | "en" | "es";

export type NestAiClientOptions = {
  appId: string;
  organizationId?: string;
  guest?: boolean;
  guestSessionId?: string;
  locale?: Locale;
  baseUrl?: string;
  hubBaseUrl?: string;
  getFirebaseIdToken?: () => Promise<string>;
  getAppCheckToken?: () => Promise<string>;
  getToken?: () => Promise<string>;
  fetcher?: typeof fetch;
};

export type RunTaskRequest = {
  task: string;
  input: unknown;
  requestId?: string;
};

export type RunTaskResponse<TResult = unknown> = {
  requestId: string;
  task: string;
  version: number;
  result: TResult;
  meta: {
    providerClass: "free" | "paid";
    cached: boolean;
    fallbackUsed: boolean;
    retries: number;
  };
};


export type JobCreateResponse = {
  requestId: string;
  jobId: string;
  status: "queued";
  statusUrl: string;
};

export type JobStatusResponse<TResult = unknown> = {
  requestId: string;
  job: {
    id: string;
    task: string;
    status: "queued" | "running" | "succeeded" | "failed" | "dead_lettered";
    attempt: number;
    createdAt: string;
    updatedAt: string;
    result?: TResult;
  };
};

export type StreamEvent =
  | { event: "start"; data: { requestId: string; task: string; version: number } }
  | { event: "delta"; data: { text: string } }
  | { event: "usage"; data: { providerClass: string; fallbackUsed: boolean; retries: number } }
  | { event: "complete"; data: { requestId: string } }
  | { event: "error"; data: { requestId: string; error: string } };

export class NestAiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(code);
    this.name = "NestAiError";
  }
}

type TokenCache = { token: string; expiresAt: number };

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : url + "/";
}

export class NestAiClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly hubBaseUrl: string;
  private tokenCache: TokenCache | null = null;
  private readonly generatedGuestSessionId = crypto.randomUUID().replace(/-/g, "");

  constructor(private readonly options: NestAiClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.baseUrl = ensureTrailingSlash(options.baseUrl ?? "https://ai.millionsnest.com/v1/");
    this.hubBaseUrl = ensureTrailingSlash(options.hubBaseUrl ?? "https://www.millionsnest.com/");
  }

  private organizationId(): string {
    if (this.options.organizationId) return this.options.organizationId;
    if (this.options.guest) return "public:" + this.options.appId;
    throw new NestAiError("SDK_ORGANIZATION_REQUIRED", 0);
  }

  private guestSessionId(): string {
    return this.options.guestSessionId ?? this.generatedGuestSessionId;
  }

  private async appCheckToken(): Promise<string | null> {
    if (!this.options.getAppCheckToken) return null;
    return this.options.getAppCheckToken();
  }

  private async nestAiToken(): Promise<string> {
    if (this.options.getToken) return this.options.getToken();

    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt - now > 30_000) return this.tokenCache.token;
    if (!this.options.getAppCheckToken) throw new NestAiError("SDK_APP_CHECK_PROVIDER_MISSING", 0);

    const appCheckToken = await this.options.getAppCheckToken();
    const guestMode = this.options.guest === true;
    let response: Response;

    if (guestMode) {
      response = await this.fetcher(new URL("api/v1/ai/guest-token", this.hubBaseUrl), {
        method: "POST",
        headers: {
          "x-firebase-appcheck": appCheckToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          appId: this.options.appId,
          locale: this.options.locale ?? "pt-BR",
          sessionId: this.guestSessionId(),
        }),
      });
    } else {
      if (!this.options.getFirebaseIdToken) throw new NestAiError("SDK_AUTH_PROVIDER_MISSING", 0);
      const firebaseIdToken = await this.options.getFirebaseIdToken();
      response = await this.fetcher(new URL("api/v1/ai/token", this.hubBaseUrl), {
        method: "POST",
        headers: {
          authorization: "Bearer " + firebaseIdToken,
          "x-firebase-appcheck": appCheckToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: this.organizationId(),
          appId: this.options.appId,
          locale: this.options.locale ?? "pt-BR",
        }),
      });
    }
    const body = await response.json() as { token?: string; expiresIn?: number; error?: string };
    if (!response.ok || !body.token || !body.expiresIn) {
      throw new NestAiError(body.error ?? "SDK_HUB_TOKEN_FAILED", response.status);
    }
    this.tokenCache = {
      token: body.token,
      expiresAt: now + body.expiresIn * 1000,
    };
    return body.token;
  }

  private async headers(requestId?: string): Promise<Record<string, string>> {
    const [token, appCheckToken] = await Promise.all([this.nestAiToken(), this.appCheckToken()]);
    return {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      "x-millionsnest-app": this.options.appId,
      ...(appCheckToken ? { "x-firebase-appcheck": appCheckToken } : {}),
      ...(requestId ? { "x-request-id": requestId } : {}),
    };
  }

  private body(request: RunTaskRequest): string {
    return JSON.stringify({
      task: request.task,
      input: request.input,
      context: {
        organizationId: this.organizationId(),
        locale: this.options.locale ?? "pt-BR",
      },
    });
  }

  private async postTask<TResult>(
    endpoint: string,
    request: RunTaskRequest,
  ): Promise<RunTaskResponse<TResult>> {
    const response = await this.fetcher(new URL(endpoint, this.baseUrl), {
      method: "POST",
      headers: await this.headers(request.requestId),
      body: this.body(request),
    });
    const body = await response.json() as RunTaskResponse<TResult> & { error?: string; requestId?: string };
    if (!response.ok) throw new NestAiError(body.error ?? "NESTAI_HTTP_" + response.status, response.status, body.requestId);
    return body;
  }

  async run<TResult = unknown>(request: RunTaskRequest): Promise<RunTaskResponse<TResult>> {
    return this.postTask<TResult>("run", request);
  }

  async *stream(request: RunTaskRequest): AsyncGenerator<StreamEvent> {
    const response = await this.fetcher(new URL("chat/stream", this.baseUrl), {
      method: "POST",
      headers: {
        ...(await this.headers(request.requestId)),
        accept: "text/event-stream",
      },
      body: this.body(request),
    });
    if (!response.ok) {
      const body = await response.json() as { error?: string; requestId?: string };
      throw new NestAiError(body.error ?? "NESTAI_HTTP_" + response.status, response.status, body.requestId);
    }
    if (!response.body) throw new NestAiError("SDK_STREAM_BODY_MISSING", response.status);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.replace(/\r$/, "");
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith("data:")) continue;
        const data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
        if (!["start", "delta", "usage", "complete", "error"].includes(eventName)) continue;
        yield { event: eventName, data } as StreamEvent;
        eventName = "";
      }
    }
  }

  async vision<TResult = unknown>(task: string, input: unknown): Promise<RunTaskResponse<TResult>> {
    return this.postTask<TResult>("vision", { task, input });
  }

  async transcribe<TResult = unknown>(task: string, input: unknown): Promise<RunTaskResponse<TResult>> {
    return this.postTask<TResult>("transcribe", { task, input });
  }

  async embeddings<TResult = unknown>(task: string, input: unknown): Promise<RunTaskResponse<TResult>> {
    return this.postTask<TResult>("embeddings", { task, input });
  }

  async image<TResult = unknown>(task: string, input: unknown): Promise<RunTaskResponse<TResult>> {
    return this.postTask<TResult>("image", { task, input });
  }

  async createJob(task: string, input: unknown, requestId?: string): Promise<JobCreateResponse> {
    const response = await this.fetcher(new URL("jobs", this.baseUrl), {
      method: "POST",
      headers: await this.headers(requestId),
      body: this.body({ task, input, ...(requestId ? { requestId } : {}) }),
    });
    const body = await response.json() as JobCreateResponse & { error?: string; requestId?: string };
    if (!response.ok) throw new NestAiError(body.error ?? "NESTAI_HTTP_" + response.status, response.status, body.requestId);
    return body;
  }

  async getJob<TResult = unknown>(jobId: string): Promise<JobStatusResponse<TResult>> {
    const headers = await this.headers();
    headers["x-millionsnest-org"] = this.organizationId();
    const response = await this.fetcher(new URL("jobs/" + encodeURIComponent(jobId), this.baseUrl), {
      headers,
    });
    const body = await response.json() as JobStatusResponse<TResult> & { error?: string; requestId?: string };
    if (!response.ok) throw new NestAiError(body.error ?? "NESTAI_HTTP_" + response.status, response.status, body.requestId);
    return body;
  }

  async getAccessToken(): Promise<string> {
    return this.nestAiToken();
  }

  clearTokenCache(): void {
    this.tokenCache = null;
  }
}

export function createNestAiClient(options: NestAiClientOptions): NestAiClient {
  return new NestAiClient(options);
}
