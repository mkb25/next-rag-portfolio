import "server-only";

import { HfInference } from "@huggingface/inference";

const MODEL = "sentence-transformers/all-MiniLM-L6-v2";

function getInferenceClient() {
  const apiToken = process.env.HUGGINGFACEHUB_API_TOKEN;

  if (!apiToken) {
    throw new Error("Missing HUGGINGFACEHUB_API_TOKEN environment variable.");
  }

  return new HfInference(apiToken);
}

export async function embedText(text) {
  const client = getInferenceClient();
  const result = await client.featureExtraction({
    model: MODEL,
    inputs: text,
  });

  return Array.from(result);
}

export async function embedBatch(texts) {
  const client = getInferenceClient();
  const result = await client.featureExtraction({
    model: MODEL,
    inputs: texts,
  });

  return result.map((vector) => Array.from(vector));
}
