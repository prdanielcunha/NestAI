import type { RouteDecision } from "../../router/src/index.js";
import type { JsonSchema } from "../../structured-output/src/index.js";

export type ProviderMessage = { role: "system" | "user" | "assistant"; content: string };
export type GenerateRequest = {
  route: RouteDecision;
  messages: ProviderMessage[];
  maxTokens?: number;
  responseSchema?: JsonSchema | undefined;
  signal?: AbortSignal | undefined;
};
export type GenerateResult = {
  text: string;
  provider: string;
  model: string;
  usage?: { inputTokens: number | undefined; outputTokens: number | undefined };
};

export type ProviderProbeState =
  | "ready"
  | "unconfigured"
  | "auth_failed"
  | "plan_blocked"
  | "quota_blocked"
  | "model_unavailable"
  | "unavailable";

export type ProviderProbeResult = {
  provider: "groq" | "gemini" | "mistral";
  state: ProviderProbeState;
  httpStatus?: number;
  modelAccess?: boolean;
  inferenceAccess?: boolean;
  code?: string;
};

function probeStateFromStatus(status: number): ProviderProbeState {
  if (status === 401) return "auth_failed";
  if (status === 402 || status === 403) return "plan_blocked";
  if (status === 429) return "quota_blocked";
  return "unavailable";
}

export async function probeGroq(apiKey: string): Promise<ProviderProbeResult> {
  if (!apiKey) return { provider: "groq", state: "unconfigured" };
  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { authorization: "Bearer " + apiKey },
    });
    if (!response.ok) {
      return {
        provider: "groq",
        state: probeStateFromStatus(response.status),
        httpStatus: response.status,
        code: "PROVIDER_GROQ_PROBE_HTTP_" + response.status,
      };
    }
    const body = await response.json() as { data?: Array<{ id?: string }> };
    const ids = new Set((body.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id)));
    const modelAccess = ids.has("openai/gpt-oss-20b") || ids.has("openai/gpt-oss-120b");
    return {
      provider: "groq",
      state: modelAccess ? "ready" : "model_unavailable",
      httpStatus: response.status,
      modelAccess,
    };
  } catch {
    return { provider: "groq", state: "unavailable", code: "PROVIDER_GROQ_PROBE_NETWORK" };
  }
}

export async function probeGemini(apiKey: string): Promise<ProviderProbeResult> {
  if (!apiKey) return { provider: "gemini", state: "unconfigured" };
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey),
    );
    if (!response.ok) {
      return {
        provider: "gemini",
        state: probeStateFromStatus(response.status),
        httpStatus: response.status,
        code: "PROVIDER_GEMINI_PROBE_HTTP_" + response.status,
      };
    }
    const body = await response.json() as { models?: Array<{ name?: string }> };
    const names = new Set((body.models ?? []).map((item) => item.name).filter((name): name is string => Boolean(name)));
    const modelAccess =
      names.has("models/gemini-3.5-flash-lite") ||
      names.has("models/gemini-3.5-flash");
    return {
      provider: "gemini",
      state: modelAccess ? "ready" : "model_unavailable",
      httpStatus: response.status,
      modelAccess,
    };
  } catch {
    return { provider: "gemini", state: "unavailable", code: "PROVIDER_GEMINI_PROBE_NETWORK" };
  }
}

export async function probeMistral(apiKey: string): Promise<ProviderProbeResult> {
  if (!apiKey) return { provider: "mistral", state: "unconfigured" };
  try {
    const modelsResponse = await fetch("https://api.mistral.ai/v1/models", {
      headers: { authorization: "Bearer " + apiKey },
    });
    if (!modelsResponse.ok) {
      return {
        provider: "mistral",
        state: probeStateFromStatus(modelsResponse.status),
        httpStatus: modelsResponse.status,
        code: "PROVIDER_MISTRAL_PROBE_HTTP_" + modelsResponse.status,
      };
    }

    const body = await modelsResponse.json() as {
      data?: Array<{ id?: string; aliases?: string[] }>;
    };
    const ids = new Set<string>();
    for (const item of body.data ?? []) {
      if (item.id) ids.add(item.id);
      for (const alias of item.aliases ?? []) ids.add(alias);
    }
    const targetModel =
      ids.has("mistral-small-2603") ? "mistral-small-2603" :
      ids.has("mistral-small-latest") ? "mistral-small-latest" :
      null;

    if (!targetModel) {
      return {
        provider: "mistral",
        state: "model_unavailable",
        httpStatus: modelsResponse.status,
        modelAccess: false,
      };
    }

    // One-token inference confirms that the key is not merely creatable but
    // actually entitled to use the API. This is cached by the Worker health
    // layer so it is not repeated on every health request.
    const inferenceResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: "user", content: "OK" }],
        max_tokens: 1,
        temperature: 0,
      }),
    });
    if (!inferenceResponse.ok) {
      return {
        provider: "mistral",
        state: probeStateFromStatus(inferenceResponse.status),
        httpStatus: inferenceResponse.status,
        modelAccess: true,
        inferenceAccess: false,
        code: "PROVIDER_MISTRAL_INFERENCE_HTTP_" + inferenceResponse.status,
      };
    }

    return {
      provider: "mistral",
      state: "ready",
      httpStatus: inferenceResponse.status,
      modelAccess: true,
      inferenceAccess: true,
    };
  } catch {
    return { provider: "mistral", state: "unavailable", code: "PROVIDER_MISTRAL_PROBE_NETWORK" };
  }
}

export type MarkdownConversionResult = {
  id?: string;
  name?: string;
  format: "markdown" | "text" | "error";
  mimeType?: string;
  mimetype?: string;
  tokens?: number;
  data?: string;
  error?: string;
};

export interface WorkersAiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  toMarkdown?(
    files: { name: string; blob: Blob } | Array<{ name: string; blob: Blob }>,
    options?: unknown,
  ): Promise<MarkdownConversionResult | MarkdownConversionResult[]>;
}

function groqResponseFormat(schema: JsonSchema | undefined): unknown {
  if (!schema) return undefined;
  return {
    type: "json_schema",
    json_schema: {
      name: "nestai_output",
      strict: true,
      schema,
    },
  };
}

export async function generateWithCloudflare(ai: WorkersAiBinding, request: GenerateRequest): Promise<GenerateResult> {
  const response = await ai.run(
    request.route.providerModelId,
    {
      messages: request.messages,
      max_tokens: request.maxTokens ?? 1024,
    },
    { gateway: { id: "default", collectLog: false } },
  ) as {
    response?: string;
    result?: { response?: string };
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = response.response ?? response.result?.response;
  if (!text) throw new Error("PROVIDER_EMPTY_RESPONSE");
  return {
    text,
    provider: "cloudflare",
    model: request.route.providerModelId,
    usage: { inputTokens: response.usage?.prompt_tokens, outputTokens: response.usage?.completion_tokens },
  };
}

export async function generateWithGroq(apiKey: string, request: GenerateRequest): Promise<GenerateResult> {
  if (!apiKey) throw new Error("PROVIDER_GROQ_KEY_MISSING");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    ...(request.signal ? { signal: request.signal } : {}),
    body: JSON.stringify({
      model: request.route.providerModelId,
      messages: request.messages,
      max_completion_tokens: request.maxTokens ?? 1024,
      temperature: 0.2,
      response_format: groqResponseFormat(request.responseSchema),
    }),
  });
  if (!response.ok) throw new Error("PROVIDER_GROQ_HTTP_" + response.status);
  const body = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("PROVIDER_EMPTY_RESPONSE");
  return {
    text,
    provider: "groq",
    model: request.route.providerModelId,
    usage: { inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens },
  };
}

function geminiContents(messages: ProviderMessage[]): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
}

function geminiSystem(messages: ProviderMessage[]): { parts: Array<{ text: string }> } | undefined {
  const text = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  return text ? { parts: [{ text }] } : undefined;
}

export async function generateWithGemini(apiKey: string, request: GenerateRequest): Promise<GenerateResult> {
  if (!apiKey) throw new Error("PROVIDER_GEMINI_KEY_MISSING");
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(request.route.providerModelId) + ":generateContent?key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(request.signal ? { signal: request.signal } : {}),
      body: JSON.stringify({
        systemInstruction: geminiSystem(request.messages),
        contents: geminiContents(request.messages),
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 1024,
          temperature: 0.2,
          ...(request.responseSchema ? { responseMimeType: "application/json", responseJsonSchema: request.responseSchema } : {}),
        },
      }),
    },
  );
  if (!response.ok) throw new Error("PROVIDER_GEMINI_HTTP_" + response.status);
  const body = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text) throw new Error("PROVIDER_EMPTY_RESPONSE");
  return {
    text,
    provider: "gemini",
    model: request.route.providerModelId,
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount,
      outputTokens: body.usageMetadata?.candidatesTokenCount,
    },
  };
}

export async function generateWithMistral(apiKey: string, request: GenerateRequest): Promise<GenerateResult> {
  if (!apiKey) throw new Error("PROVIDER_MISTRAL_KEY_MISSING");
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    ...(request.signal ? { signal: request.signal } : {}),
    body: JSON.stringify({
      model: request.route.providerModelId,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 1024,
      temperature: 0.2,
      ...(request.responseSchema ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!response.ok) throw new Error("PROVIDER_MISTRAL_HTTP_" + response.status);
  const body = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("PROVIDER_EMPTY_RESPONSE");
  return {
    text,
    provider: "mistral",
    model: request.route.providerModelId,
    usage: { inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens },
  };
}

async function* parseOpenAiCompatibleSse(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error("PROVIDER_STREAM_BODY_MISSING");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

export async function streamWithGroq(apiKey: string, request: GenerateRequest): Promise<AsyncIterable<string>> {
  if (!apiKey) throw new Error("PROVIDER_GROQ_KEY_MISSING");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    ...(request.signal ? { signal: request.signal } : {}),
    body: JSON.stringify({
      model: request.route.providerModelId,
      messages: request.messages,
      max_completion_tokens: request.maxTokens ?? 1024,
      temperature: 0.2,
      stream: true,
    }),
  });
  if (!response.ok) throw new Error("PROVIDER_GROQ_HTTP_" + response.status);
  return parseOpenAiCompatibleSse(response);
}

async function* parseCloudflareSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const parsed = JSON.parse(data) as {
        response?: string;
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const delta = parsed.response ?? parsed.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

export async function streamWithCloudflare(ai: WorkersAiBinding, request: GenerateRequest): Promise<AsyncIterable<string>> {
  const response = await ai.run(
    request.route.providerModelId,
    {
      messages: request.messages,
      max_tokens: request.maxTokens ?? 1024,
      stream: true,
    },
    { gateway: { id: "default", collectLog: false } },
  );
  if (!(response instanceof ReadableStream)) throw new Error("PROVIDER_STREAM_UNSUPPORTED");
  return parseCloudflareSse(response);
}

export async function streamWithGemini(apiKey: string, request: GenerateRequest): Promise<AsyncIterable<string>> {
  if (!apiKey) throw new Error("PROVIDER_GEMINI_KEY_MISSING");
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(request.route.providerModelId) + ":streamGenerateContent?alt=sse&key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(request.signal ? { signal: request.signal } : {}),
      body: JSON.stringify({
        systemInstruction: geminiSystem(request.messages),
        contents: geminiContents(request.messages),
        generationConfig: { maxOutputTokens: request.maxTokens ?? 1024, temperature: 0.2 },
      }),
    },
  );
  if (!response.ok) throw new Error("PROVIDER_GEMINI_HTTP_" + response.status);
  if (!response.body) throw new Error("PROVIDER_STREAM_BODY_MISSING");

  async function* iterator(): AsyncGenerator<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        const parsed = JSON.parse(data) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const delta = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
        if (delta) yield delta;
      }
    }
  }
  return iterator();
}

export async function streamWithMistral(apiKey: string, request: GenerateRequest): Promise<AsyncIterable<string>> {
  if (!apiKey) throw new Error("PROVIDER_MISTRAL_KEY_MISSING");
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    ...(request.signal ? { signal: request.signal } : {}),
    body: JSON.stringify({
      model: request.route.providerModelId,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 1024,
      temperature: 0.2,
      stream: true,
    }),
  });
  if (!response.ok) throw new Error("PROVIDER_MISTRAL_HTTP_" + response.status);
  return parseOpenAiCompatibleSse(response);
}


function base64Bytes(value:string):Uint8Array {
  const binary=atob(value);
  return Uint8Array.from(binary,(char)=>char.charCodeAt(0));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function transcribeWithCloudflare(
  ai:WorkersAiBinding,
  model:string,
  audioBase64:string,
  language?:string,
):Promise<{text:string;vtt?:string;wordCount?:number}> {
  const response=await ai.run(model,{
    audio:audioBase64,
    task:"transcribe",
    ...(language?{language}:{}),
    vad_filter:true,
    condition_on_previous_text:false,
  },{gateway:{id:"default",collectLog:false},rejectIfBusy:true}) as {
    text?:string;vtt?:string;word_count?:number;
  };
  if(!response.text) throw new Error("PROVIDER_EMPTY_TRANSCRIPTION");
  return { text: response.text, ...(response.vtt ? { vtt: response.vtt } : {}), ...(response.word_count !== undefined ? { wordCount: response.word_count } : {}) };
}

export async function transcribeWithGroq(
  apiKey:string,
  model:string,
  args:{audioBase64:string;mimeType:string;fileName?:string;language?:string;signal?:AbortSignal},
):Promise<{text:string}> {
  if(!apiKey) throw new Error("PROVIDER_GROQ_KEY_MISSING");
  const form=new FormData();
  const bytes=base64Bytes(args.audioBase64);
  form.set("file",new Blob([bytesToArrayBuffer(bytes)],{type:args.mimeType}),args.fileName??"audio.webm");
  form.set("model",model);
  if(args.language) form.set("language",args.language);
  form.set("response_format","json");
  const response=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{
    method:"POST",
    headers:{authorization:"Bearer "+apiKey},
    ...(args.signal?{signal:args.signal}:{}),
    body:form,
  });
  if(!response.ok) throw new Error("PROVIDER_GROQ_HTTP_"+response.status);
  const body=await response.json() as {text?:string};
  if(!body.text) throw new Error("PROVIDER_EMPTY_TRANSCRIPTION");
  return {text:body.text};
}

export async function extractDocumentTextWithCloudflare(
  ai:WorkersAiBinding,
  args:{base64:string;mimeType:string;fileName:string;locale:"pt-BR"|"en"|"es"},
):Promise<{text:string;tokens?:number}> {
  if(!ai.toMarkdown) throw new Error("PROVIDER_MARKDOWN_CONVERSION_UNAVAILABLE");
  const result=await ai.toMarkdown(
    {name:args.fileName,blob:new Blob([bytesToArrayBuffer(base64Bytes(args.base64))],{type:args.mimeType})},
    {
      conversionOptions:{
        output:{format:"text"},
        image:{descriptionLanguage:args.locale==="pt-BR"?"pt":args.locale},
        pdf:{metadata:false},
      },
    },
  );
  const item=Array.isArray(result)?result[0]:result;
  if(!item || item.format==="error" || !item.data) throw new Error("PROVIDER_DOCUMENT_CONVERSION_FAILED");
  return { text: item.data, ...(item.tokens !== undefined ? { tokens: item.tokens } : {}) };
}

export async function extractDocumentsTextWithCloudflare(
  ai:WorkersAiBinding,
  args:{
    files:Array<{base64:string;mimeType:string;fileName:string;label?:string}>;
    locale:"pt-BR"|"en"|"es";
  },
):Promise<Array<{fileName:string;label?:string;text:string;tokens?:number}>> {
  if(!ai.toMarkdown) throw new Error("PROVIDER_MARKDOWN_CONVERSION_UNAVAILABLE");
  if(args.files.length<1 || args.files.length>40) throw new Error("PROVIDER_DOCUMENT_BATCH_INVALID");
  const result=await ai.toMarkdown(
    args.files.map((file)=>({
      name:file.fileName,
      blob:new Blob([bytesToArrayBuffer(base64Bytes(file.base64))],{type:file.mimeType}),
    })),
    {
      conversionOptions:{
        output:{format:"text"},
        image:{descriptionLanguage:args.locale==="pt-BR"?"pt":args.locale},
        pdf:{metadata:false},
      },
    },
  );
  const items=Array.isArray(result)?result:[result];
  if(items.length!==args.files.length) throw new Error("PROVIDER_DOCUMENT_BATCH_MISMATCH");
  return items.map((item,index)=>{
    const source=args.files[index]!;
    if(!item || item.format==="error" || !item.data) throw new Error("PROVIDER_DOCUMENT_CONVERSION_FAILED");
    return {
      fileName:source.fileName,
      ...(source.label?{label:source.label}:{}),
      text:item.data,
      ...(item.tokens!==undefined?{tokens:item.tokens}:{}),
    };
  });
}

export async function embedWithCloudflare(
  ai:WorkersAiBinding,
  model:string,
  text:string|string[],
):Promise<number[][]> {
  const response=await ai.run(model,{text},{gateway:{id:"default",collectLog:false},rejectIfBusy:true}) as {
    data?:number[][];
  };
  if(!Array.isArray(response.data) || response.data.length===0) throw new Error("PROVIDER_EMPTY_EMBEDDING");
  return response.data;
}

export async function generateImageWithCloudflare(
  ai:WorkersAiBinding,
  model:string,
  args:{prompt:string;steps?:number;seed?:number},
):Promise<{imageBase64:string;mimeType:"image/jpeg"}> {
  const response=await ai.run(model,{
    prompt:args.prompt,
    steps:Math.min(8,Math.max(1,args.steps??4)),
    ...(args.seed!==undefined?{seed:args.seed}:{}),
  },{gateway:{id:"default",collectLog:false},rejectIfBusy:true}) as {image?:string};
  if(!response.image) throw new Error("PROVIDER_EMPTY_IMAGE");
  return {imageBase64:response.image,mimeType:"image/jpeg"};
}
