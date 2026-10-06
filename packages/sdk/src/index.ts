export type NestAiClientOptions = {
  baseUrl: string;
  getToken: () => Promise<string>;
  organizationId: string;
};

export type RunTaskRequest = { task: string; input: unknown };
export type RunTaskResponse = {
  traceId: string;
  output: string;
  route: { provider: string; model: string };
  sensitivity: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export class NestAiClient {
  constructor(private readonly options: NestAiClientOptions) {}

  async run(request: RunTaskRequest): Promise<RunTaskResponse> {
    const token = await this.options.getToken();
    const response = await fetch(new URL("/v1/run", this.options.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        task: request.task,
        input: request.input,
        context: { organizationId: this.options.organizationId },
      }),
    });
    const body = await response.json() as RunTaskResponse & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `NESTAI_HTTP_${response.status}`);
    return body;
  }
}
