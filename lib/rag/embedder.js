import "server-only";

import { HfInference } from "@huggingface/inference";

const MODEL = "sentence-transformers/all-MiniLM-L6-v2";

let localExtractorPromise = null;

async function getLocalExtractor() {
  if (!localExtractorPromise) {
    const { pipeline } = await import("@xenova/transformers");
    localExtractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return localExtractorPromise;
}

async function embedLocal(text) {
  const extractor = await getLocalExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

async function embedBatchLocal(texts) {
  const extractor = await getLocalExtractor();
  const results = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data));
  }
  return results;
}

function getInferenceClient() {
  const apiToken = process.env.HUGGINGFACEHUB_API_TOKEN;

  if (!apiToken) {
    return null;
  }

  return new HfInference(apiToken);
}

let isHfDisabled = false;

export async function embedText(text) {
  const client = !isHfDisabled ? getInferenceClient() : null;
  if (client) {
    try {
      const result = await client.featureExtraction({
        model: MODEL,
        inputs: text,
      });
      return Array.from(result);
    } catch (error) {
      isHfDisabled = true;
      console.warn(
        `HuggingFace featureExtraction failed (${error.message}). Switching to local embedding model.`,
      );
    }
  }

  return embedLocal(text);
}

export async function embedBatch(texts) {
  const client = !isHfDisabled ? getInferenceClient() : null;
  if (client) {
    try {
      const result = await client.featureExtraction({
        model: MODEL,
        inputs: texts,
      });
      return result.map((vector) => Array.from(vector));
    } catch (error) {
      isHfDisabled = true;
      console.warn(
        `HuggingFace batch featureExtraction failed (${error.message}). Switching to local embedding model.`,
      );
    }
  }

  return embedBatchLocal(texts);
}
