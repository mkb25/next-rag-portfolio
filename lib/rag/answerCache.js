import "server-only";

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 100;
const DEFAULT_SIMILARITY_THRESHOLD = 0.94;

// Process-local cache: fast and simple, but it resets when the server restarts.
// Hybrid strategy:
// - exact repeated question + persona -> return the generated answer directly;
// - semantic/similar question -> reuse retrieved chunks, then generate fresh text.
const cacheEntries = new Map();

function getNumberEnv(name, fallback, { min, max } = {}) {
  const parsed = Number.parseFloat(process.env[name] || "");

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (typeof min === "number" && parsed < min) {
    return fallback;
  }

  if (typeof max === "number" && parsed > max) {
    return fallback;
  }

  return parsed;
}

function getCacheConfig() {
  // Read env values lazily so tuning cache behavior does not require code edits.
  return {
    ttlMs: getNumberEnv(
      "RAG_CONTEXT_CACHE_TTL_MS",
      getNumberEnv("RAG_ANSWER_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS, {
        min: 1000,
      }),
      { min: 1000 },
    ),
    maxEntries: getNumberEnv(
      "RAG_CONTEXT_CACHE_MAX_ENTRIES",
      getNumberEnv("RAG_ANSWER_CACHE_MAX_ENTRIES", DEFAULT_MAX_CACHE_ENTRIES, {
        min: 1,
      }),
      { min: 1 },
    ),
    similarityThreshold: getNumberEnv(
      "RAG_CONTEXT_CACHE_SIMILARITY_THRESHOLD",
      getNumberEnv(
        "RAG_ANSWER_CACHE_SIMILARITY_THRESHOLD",
        DEFAULT_SIMILARITY_THRESHOLD,
        { min: 0, max: 1 },
      ),
      { min: 0, max: 1 },
    ),
  };
}

function normalizeQuestion(question) {
  // Normalize wording enough for exact repeats like "Skills?" and "skills" to match.
  return question
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getQuestionCache() {
  const cacheKey = "retrieved-context";

  if (!cacheEntries.has(cacheKey)) {
    cacheEntries.set(cacheKey, []);
  }

  return cacheEntries.get(cacheKey);
}

function getAnswerCache(persona) {
  const cacheKey = `answers:${persona || "default"}`;

  if (!cacheEntries.has(cacheKey)) {
    cacheEntries.set(cacheKey, []);
  }

  return cacheEntries.get(cacheKey);
}

function cosineSimilarity(first, second) {
  if (!first?.length || !second?.length || first.length !== second.length) {
    return 0;
  }

  let dotProduct = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;

  for (let index = 0; index < first.length; index += 1) {
    dotProduct += first[index] * second[index];
    firstMagnitude += first[index] * first[index];
    secondMagnitude += second[index] * second[index];
  }

  if (!firstMagnitude || !secondMagnitude) {
    return 0;
  }

  return dotProduct / (Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude));
}

function isLikelyFollowUp(question) {
  // Follow-ups depend heavily on chat history, so reusing a previous answer is risky.
  return /^(and|also|but|what about|how about|tell me more|more|that|those|these|they|them|it|he|she|his|her|their|compare|elaborate|explain more)\b/i.test(
    question.trim(),
  );
}

function canUseContextCache(question) {
  return Boolean(normalizeQuestion(question)) && !isLikelyFollowUp(question);
}

function pruneExpiredEntries(entries, now) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].expiresAt <= now) {
      entries.splice(index, 1);
    }
  }
}

function pruneLeastRecentlyUsed(entries, maxEntries) {
  if (entries.length <= maxEntries) {
    return;
  }

  // Keep the most recently used context sets when the bounded cache gets full.
  entries.sort((left, right) => right.lastAccessedAt - left.lastAccessedAt);
  entries.splice(maxEntries);
}

function cloneChunks(chunks) {
  return chunks.map((chunk) => ({
    ...chunk,
    metadata: chunk.metadata ? { ...chunk.metadata } : chunk.metadata,
  }));
}

export function findAnswerCacheHit({ question, persona }) {
  if (!canUseContextCache(question)) {
    return null;
  }

  const now = Date.now();
  const normalizedQuestion = normalizeQuestion(question);
  const entries = getAnswerCache(persona);

  pruneExpiredEntries(entries, now);

  const exactMatch = entries.find(
    (entry) => entry.normalizedQuestion === normalizedQuestion,
  );

  if (!exactMatch) {
    return null;
  }

  exactMatch.lastAccessedAt = now;

  return {
    answer: exactMatch.answer,
    cacheHit: true,
    cacheHitType: "exact",
  };
}

export function findContextCacheHit({ question, embedding }) {
  if (!canUseContextCache(question)) {
    return null;
  }

  const now = Date.now();
  const normalizedQuestion = normalizeQuestion(question);
  const entries = getQuestionCache();
  const { similarityThreshold } = getCacheConfig();

  pruneExpiredEntries(entries, now);

  // Exact lookup runs before embedding work, so repeated questions can skip retrieval.
  const exactMatch = entries.find(
    (entry) => entry.normalizedQuestion === normalizedQuestion,
  );

  if (exactMatch) {
    exactMatch.lastAccessedAt = now;
    return {
      chunks: cloneChunks(exactMatch.chunks),
      cacheHit: true,
      cacheHitType: "exact",
      similarity: 1,
    };
  }

  if (!embedding) {
    return null;
  }

  // Semantic lookup reuses retrieved context for strongly similar questions.
  let bestMatch = null;
  let bestSimilarity = 0;

  entries.forEach((entry) => {
    const similarity = cosineSimilarity(embedding, entry.embedding);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = entry;
    }
  });

  if (!bestMatch || bestSimilarity < similarityThreshold) {
    return null;
  }

  bestMatch.lastAccessedAt = now;

  return {
    chunks: cloneChunks(bestMatch.chunks),
    cacheHit: true,
    cacheHitType: "semantic",
    similarity: bestSimilarity,
  };
}

export function setContextCacheEntry({ question, embedding, chunks }) {
  if (!canUseContextCache(question) || !embedding?.length || !chunks?.length) {
    return;
  }

  const now = Date.now();
  const { ttlMs, maxEntries } = getCacheConfig();
  const entries = getQuestionCache();
  const normalizedQuestion = normalizeQuestion(question);
  const existingEntry = entries.find(
    (entry) => entry.normalizedQuestion === normalizedQuestion,
  );

  // Store retrieved chunks with the question embedding for future semantic matches.
  const nextEntry = {
    normalizedQuestion,
    embedding,
    chunks: cloneChunks(chunks),
    createdAt: now,
    expiresAt: now + ttlMs,
    lastAccessedAt: now,
  };

  if (existingEntry) {
    Object.assign(existingEntry, nextEntry);
  } else {
    entries.push(nextEntry);
  }

  pruneExpiredEntries(entries, now);
  pruneLeastRecentlyUsed(entries, maxEntries);
}

export function setAnswerCacheEntry({ question, persona, answer }) {
  if (!canUseContextCache(question) || !answer) {
    return;
  }

  const now = Date.now();
  const { ttlMs, maxEntries } = getCacheConfig();
  const entries = getAnswerCache(persona);
  const normalizedQuestion = normalizeQuestion(question);
  const existingEntry = entries.find(
    (entry) => entry.normalizedQuestion === normalizedQuestion,
  );

  const nextEntry = {
    normalizedQuestion,
    answer,
    createdAt: now,
    expiresAt: now + ttlMs,
    lastAccessedAt: now,
  };

  if (existingEntry) {
    Object.assign(existingEntry, nextEntry);
  } else {
    entries.push(nextEntry);
  }

  pruneExpiredEntries(entries, now);
  pruneLeastRecentlyUsed(entries, maxEntries);
}
