import "server-only";

import path from "node:path";
import { getOtherGithubProjectsContext } from "@/lib/github/projects";
import {
  findAnswerCacheHit,
  findContextCacheHit,
  setAnswerCacheEntry,
  setContextCacheEntry,
} from "@/lib/rag/answerCache";
import { chunkText } from "@/lib/rag/chunker";
import { embedBatch, embedText } from "@/lib/rag/embedder";
import { generateAnswer } from "@/lib/rag/llm";
import {
  loadPdf,
  loadResumeLinkContext,
} from "@/lib/rag/pdfLoader";
import { UpstashVectorStore } from "@/lib/rag/upstashVectorStore";
import { VectorStore } from "@/lib/rag/vectorStore";

let storePromise;

const CONTEXT_METADATA = {
  resumeLinks: { source: "Resume.pdf", type: "fresh-link-context" },
  otherGithubProjects: { source: "GitHub", type: "other-github-projects" },
};

function getResumePdfPath() {
  return path.join(process.cwd(), "content", "Resume.pdf");
}

function createVectorStore() {
  if (process.env.RAG_VECTOR_STORE === "upstash") {
    return new UpstashVectorStore();
  }

  return new VectorStore();
}

async function buildStore(pdfPath) {
  const store = createVectorStore();

  if (
    process.env.RAG_VECTOR_STORE === "upstash" &&
    process.env.RAG_SKIP_INDEX_BUILD === "true"
  ) {
    return store;
  }

  const rawText = await loadPdf(pdfPath);
  const chunks = chunkText(rawText, 500, 50);
  const embeddings = [];

  for (let index = 0; index < chunks.length; index += 10) {
    const batch = chunks.slice(index, index + 10);
    const batchEmbeddings = await embedBatch(batch);
    embeddings.push(...batchEmbeddings);
  }

  await store.addDocuments(chunks, embeddings);
  return store;
}

export async function getRagStore() {
  if (!storePromise) {
    storePromise = buildStore(getResumePdfPath()).catch((error) => {
      storePromise = undefined;
      throw error;
    });
  }

  return storePromise;
}

function createContextChunk(text, metadata) {
  return text
    ? [
        {
          text,
          score: 1,
          metadata,
        },
      ]
    : [];
}

function buildAnswerContext(
  chunks,
  { linkContext, githubProjectsContext },
) {
  return [
    ...createContextChunk(linkContext, CONTEXT_METADATA.resumeLinks),
    ...chunks,
    ...createContextChunk(
      githubProjectsContext,
      CONTEXT_METADATA.otherGithubProjects,
    ),
  ];
}

async function getSupplementalContext() {
  const resumePath = getResumePdfPath();

  return {
    linkContext: loadResumeLinkContext(resumePath),
    githubProjectsContext: await getOtherGithubProjectsContext(),
  };
}

export async function answerQuestion(question, persona = "default", history = []) {
  const answerCacheHit = findAnswerCacheHit({ question, persona });

  if (answerCacheHit) {
    return answerCacheHit.answer;
  }

  const queryEmbedding = await embedText(question);
  const contextCacheHit = findContextCacheHit({
    question,
    embedding: queryEmbedding,
  });
  let relevantChunks = contextCacheHit?.chunks;

  if (!relevantChunks) {
    const store = await getRagStore();
    relevantChunks = await store.search(queryEmbedding, 5);

    setContextCacheEntry({
      question,
      embedding: queryEmbedding,
      chunks: relevantChunks,
    });
  }

  const supplementalContext = await getSupplementalContext();

  const answer = await generateAnswer(
    question,
    buildAnswerContext(relevantChunks, supplementalContext),
    persona,
    history,
  );

  setAnswerCacheEntry({
    question,
    persona,
    answer,
  });

  return answer;
}
