import "server-only";

import path from "node:path";
import { chunkText } from "@/lib/rag/chunker";
import { embedBatch, embedText } from "@/lib/rag/embedder";
import { generateAnswer } from "@/lib/rag/llm";
import { loadPdf } from "@/lib/rag/pdfLoader";
import { VectorStore } from "@/lib/rag/vectorStore";

let storePromise;

async function buildStore(pdfPath) {
  const rawText = await loadPdf(pdfPath);
  const chunks = chunkText(rawText, 500, 50);
  const embeddings = [];

  for (let index = 0; index < chunks.length; index += 10) {
    const batch = chunks.slice(index, index + 10);
    const batchEmbeddings = await embedBatch(batch);
    embeddings.push(...batchEmbeddings);
  }

  const store = new VectorStore();
  store.addDocuments(chunks, embeddings);
  return store;
}

export async function getRagStore() {
  if (!storePromise) {
    const pdfPath = path.join(process.cwd(), "content", "Resume.pdf");
    storePromise = buildStore(pdfPath).catch((error) => {
      storePromise = undefined;
      throw error;
    });
  }

  return storePromise;
}

export async function answerQuestion(question, persona = "default") {
  const store = await getRagStore();
  const queryEmbedding = await embedText(question);
  const relevantChunks = store.search(queryEmbedding, 5);
  return generateAnswer(question, relevantChunks, persona);
}
