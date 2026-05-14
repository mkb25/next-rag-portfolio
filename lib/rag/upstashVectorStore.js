import "server-only";

const DEFAULT_SOURCE = "Resume.pdf";
const MAX_UPSERT_BATCH_SIZE = 100;

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

function buildEndpoint(baseUrl, action, namespace) {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

  if (!namespace) {
    return `${cleanBaseUrl}/${action}`;
  }

  return `${cleanBaseUrl}/${action}/${encodeURIComponent(namespace)}`;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `Upstash Vector request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

export class UpstashVectorStore {
  constructor({
    url = requiredEnv("UPSTASH_VECTOR_REST_URL"),
    token = requiredEnv("UPSTASH_VECTOR_REST_TOKEN"),
    namespace = process.env.UPSTASH_VECTOR_NAMESPACE || "",
    source = DEFAULT_SOURCE,
  } = {}) {
    this.url = url;
    this.token = token;
    this.namespace = namespace;
    this.source = source;
  }

  async request(action, body) {
    const response = await fetch(buildEndpoint(this.url, action, this.namespace), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return parseResponse(response);
  }

  async addDocuments(chunks, embeddings) {
    for (let index = 0; index < chunks.length; index += MAX_UPSERT_BATCH_SIZE) {
      const records = chunks
        .slice(index, index + MAX_UPSERT_BATCH_SIZE)
        .map((text, offset) => {
          const chunkIndex = index + offset;

          return {
            id: `${this.source}:chunk:${chunkIndex}`,
            vector: embeddings[chunkIndex],
            metadata: {
              source: this.source,
              chunkIndex,
            },
            data: text,
          };
        });

      await this.request("upsert", records);
    }
  }

  async search(queryEmbedding, topK = 5) {
    const payload = await this.request("query", {
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      includeData: true,
    });

    return (payload.result || [])
      .map((record) => ({
        text: record.data || "",
        score: record.score,
        metadata: record.metadata,
      }))
      .filter((record) => record.text);
  }
}
