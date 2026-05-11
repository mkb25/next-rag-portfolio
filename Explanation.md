# Next RAG Portfolio — How It Works

A Next.js 15 (App Router) app that turns a single resume PDF into an interactive
"agentic terminal" portfolio. The user types a question, the server retrieves
the most relevant passages from the resume using vector similarity, an LLM
composes an answer in a chosen persona's voice, and a guardrail keeps off-topic
questions short and on-brand.

---

## 1. High-Level Architecture

```
            ┌─────────────────────────┐
            │  Browser (Client)       │
            │  components/Terminal... │
            └──────────┬──────────────┘
                       │ POST /api/rag { question, persona }
                       ▼
            ┌─────────────────────────┐
            │  Next.js Route Handler  │
            │  app/api/rag/route.js   │
            └──────────┬──────────────┘
                       │ answerQuestion(question, persona)
                       ▼
            ┌─────────────────────────┐
            │  RAG Orchestrator       │
            │  lib/rag/store.js       │
            └──────────┬──────────────┘
       ┌───────────────┼─────────────────────┐
       ▼               ▼                     ▼
  PDF Loader      Embedder (HF)         LLM (Groq)
  pdfLoader.js    embedder.js           llm.js
       │               │                     ▲
       ▼               ▼                     │
   Chunker      VectorStore (in-mem)         │
   chunker.js   vectorStore.js  ─────────────┘
                                top-k chunks + persona
```

Two external services are used:

- **Hugging Face Inference API** — `sentence-transformers/all-MiniLM-L6-v2`
  embeddings (`HUGGINGFACEHUB_API_TOKEN`).
- **Groq** — `openai/gpt-oss-120b` chat completions (`GROQ_API_KEY`).

Everything else (PDF parsing, chunking, vector search) runs in-process inside
the Next.js Node runtime.

---

## 2. Project Layout

```
app/
  layout.js              Root layout
  page.js                Renders <TerminalPortfolio />
  globals.css            Terminal UI styling
  api/rag/route.js       POST handler that calls answerQuestion()

components/
  TerminalPortfolio.js   Client UI: chat log, persona selector, input form

lib/rag/
  pdfLoader.js           Reads the PDF from disk and extracts plain text
  chunker.js             Splits text into overlapping word chunks
  embedder.js            Calls HF to embed text (single + batch)
  vectorStore.js         In-memory cosine-similarity vector index
  store.js               Builds the index once and answers questions
  llm.js                 Builds the system prompt + calls Groq
  personas.js            Three assistant voices (default / medieval / pirate)

content/
  Resume.pdf             The single source of truth for retrieval
```

---

## 3. End-to-End Request Flow

### 3.1 First request (cold start)

1. Browser submits `{ question, persona }` to `POST /api/rag`
   (`app/api/rag/route.js`).
2. The route handler validates the body and calls
   `answerQuestion(question, persona)` from `lib/rag/store.js`.
3. `getRagStore()` sees no cached store, so it triggers `buildStore()`:
   - `loadPdf("content/Resume.pdf")` reads the PDF and returns its text using
     `pdf-parse`.
   - `chunkText(text, 500, 50)` splits the text into ~500-word chunks with a
     50-word overlap (sliding window) so context is not lost at boundaries.
   - Chunks are embedded in batches of 10 via `embedBatch()` →
     Hugging Face inference (`all-MiniLM-L6-v2`, 384-dim vectors).
   - A `VectorStore` is created and populated with `(text, embedding)` pairs.
   - The resolved store is cached on the module-level `storePromise`.
4. The user's question is embedded with `embedText()`.
5. `store.search(queryEmbedding, 5)` ranks all chunks by cosine similarity and
   returns the top 5.
6. `generateAnswer(question, topChunks, persona)` builds a system prompt
   (persona + intent rules + retrieved context) and asks Groq for a completion.
7. The route handler returns `{ answer }` as JSON.

### 3.2 Subsequent requests (warm)

`storePromise` is already resolved, so steps 3a–3d are skipped. Only the
question embedding, vector search, and LLM call happen — typically the only
network calls per request.

---

## 4. Module-by-Module Walkthrough

### 4.1 `app/api/rag/route.js`

- Declares `export const runtime = "nodejs"` because PDF parsing and the
  Hugging Face/Groq SDKs need Node APIs (not Edge).
- Validates that `question` is non-empty, defaults `persona` to `"default"`.
- Wraps `answerQuestion()` in try/catch and surfaces error messages with
  appropriate HTTP status codes (400 for bad input, 500 for failures).

### 4.2 `lib/rag/pdfLoader.js`

- Synchronously reads the PDF bytes (`fs.readFileSync`) and uses `pdf-parse`'s
  `PDFParse` class to extract a single concatenated text string.
- This is fine because it runs once per process (cached via `storePromise`).

### 4.3 `lib/rag/chunker.js`

- Word-based sliding window: step size = `chunkSize - overlap`.
- Defaults: 500 words per chunk, 50-word overlap.
- Skips empty chunks and stops cleanly on the last window.
- Trade-off: simple and dependency-free, good enough for a one-page resume.
  Sentence-aware chunking would be a future improvement.

### 4.4 `lib/rag/embedder.js`

- Wraps `@huggingface/inference`'s `HfInference` client.
- `embedText(text)` returns a single 384-dim `number[]`.
- `embedBatch(texts)` embeds many strings in one call and converts each
  TypedArray to a plain `Array` so they can be JSON-serialized / iterated
  cleanly later.
- Throws early if `HUGGINGFACEHUB_API_TOKEN` is missing.

### 4.5 `lib/rag/vectorStore.js`

- Pure JavaScript, in-memory vector index — no DB.
- `addDocuments(chunks, embeddings)` zips them into `{ text, embedding }`
  records.
- `search(queryEmbedding, topK)` computes cosine similarity against every
  document, sorts descending, and returns the top-K with their scores.
- O(N · D) per query. Trivial for resume-sized corpora; would need an ANN
  index (FAISS, pgvector, etc.) for larger datasets.

### 4.6 `lib/rag/store.js`

- The orchestrator. Holds the singleton `storePromise` so the PDF is parsed
  and embedded **once per server process**.
- If `buildStore()` throws, the cached promise is cleared so the next request
  retries instead of permanently failing.
- `answerQuestion(question, persona)` is the single entry point used by the
  API route.

### 4.7 `lib/rag/personas.js`

Three personas, each with a `name` and a `systemPrompt`:

- **default → "Alex"** — friendly, professional, third-person narrator.
- **medieval → "Sir Advisor"** — Olde English, addresses user as "my liege".
- **pirate → "Captain Codebeard"** — high-seas slang, "Ahoy!" / "Avast!".

Each prompt enforces shared rules: greet as the persona, handle meta-questions
("who are you?") as the persona, and otherwise speak in the third person about
Mohana.

### 4.8 `lib/rag/llm.js` — Prompt assembly + guardrails

This is the brain of response shaping. `getSystemPrompt(query, persona, context)`
starts from `persona.systemPrompt` and conditionally appends extra
instructions based on intent detection on the lowercased query:

1. **Greeting** (`hi`, `hello`, `hey`, `greetings`, `sup`) →
   reply as the persona, not as Mohana.
2. **"about Mohana / Bhat / the candidate"** →
   produce a professional summary from context.
3. **Meta-question** (`who are you`, `about you`, `about alex`, etc.) →
   introduce the assistant first, do not impersonate Mohana.
4. **Off-topic guardrail** (see §5) →
   answer briefly, then pivot back to Mohana's skills in persona voice.

Finally the retrieved chunks are joined with `\n\n---\n\n` separators and
appended under a `CONTEXT FROM RESUME:` header.

`generateAnswer()` then calls Groq:

- model: `openai/gpt-oss-120b`
- `temperature: 0.3` for consistent, grounded answers
- `max_tokens: 1024`
- messages: `[{system: composedPrompt}, {user: query}]`

The first choice's content is returned, with a fallback string if empty.

---

## 5. The Off-Topic Guardrail

Implemented in `lib/rag/llm.js` via `isOffTopic(lowerQuery)` plus a dedicated
prompt branch. It catches questions that have nothing to do with the
portfolio, such as `2+2` or `what is RAG`.

Detection rules:

- **Pure math** — strings made entirely of digits and math operators
  (`/^[\d\s+\-*/x×÷=().]+$/`), or phrased as "what is 7-3", "calculate ...",
  "solve ...".
- **Generic trivia** — patterns like `what is X`, `who is X`, `define X`,
  `explain X`, `tell me about X`. The captured subject `X` is checked
  against `PORTFOLIO_KEYWORDS` (mohana, bhat, resume, project, skill,
  experience, ...). Only triggers when `X` does **not** mention the portfolio.
- **Small talk / world knowledge** — keywords like `weather`, `news`, `joke`,
  `recipe`, `movie`, `stock`, `crypto`, `capital of`, `translate`, or
  "write a poem/code/story".

When triggered, the system prompt instructs the model to:

1. Briefly answer the question in **1 short sentence** (e.g. "2+2 is 4." /
   "RAG is Retrieval-Augmented Generation.").
2. Pivot back in the persona's voice with a friendly nudge such as
   _"But what would you like to know about Mohana's skills?"_
3. Stay within 2–3 short sentences total and never break character.

This keeps the assistant useful for casual questions while always steering the
conversation back to the portfolio.

---

## 6. The UI — `components/TerminalPortfolio.js`

A single client component (`"use client"`) that mimics a terminal:

- ASCII-art banner + welcome message rendered as the first system message.
- `messages` state stores the chat log (`system | user | agent`).
- `persona` state drives the dropdown selector (Friendly / Medieval / Pirate)
  and is sent with every request.
- On submit:
  1. Push the user's message to the log and clear the input.
  2. `fetch("/api/rag", { method: "POST", body: { question, persona } })`.
  3. On success, append an `agent` message with `payload.answer`.
  4. On failure, show an inline error banner and a `system` message in the log.
- A "thinking" animation is shown while `isLoading` is true.

Styling lives in `app/globals.css` (terminal frame, traffic-light dots,
message bubbles, blinking caret, etc.).

---

## 7. Configuration

Environment variables (loaded by Next.js from `.env.local`):

| Variable                   | Used by               | Required |
| -------------------------- | --------------------- | -------- |
| `HUGGINGFACEHUB_API_TOKEN` | `lib/rag/embedder.js` | Yes      |
| `GROQ_API_KEY`             | `lib/rag/llm.js`      | Yes      |

Resume content:

- Place the source PDF at `content/Resume.pdf`. The path is hard-coded in
  `getRagStore()` (`path.join(process.cwd(), "content", "Resume.pdf")`).

NPM scripts (`package.json`):

- `npm run dev` — Next.js dev server.
- `npm run build` — production build (static + serverless route).
- `npm run start` — serve the built app.

Key dependencies: `next@^15.3.2`, `react@^19`, `groq-sdk`, `pdf-parse`,
`@huggingface/inference`.

---

## 8. Performance & Caching Notes

- **One-time index build**: PDF parsing + embedding happens lazily on the
  first request and is cached in module scope (`storePromise`). All later
  requests in the same process skip it.
- **Per-request cost**: 1 embedding call (query) + 1 LLM call. Vector search
  is local and cheap.
- **Cold start after deploy / restart**: rebuilds the index; expect a
  one-time delay proportional to chunk count × embedding latency.
- **Process memory**: 384-dim float vectors × N chunks; negligible for a
  resume.

---

## 9. Extending the Project

Likely next steps if you want to grow it:

- **Multi-document corpus**: extend `buildStore()` to load every PDF/MD file
  under `content/`, tag chunks with their source, and surface citations.
- **Persistent vector store**: swap `VectorStore` for SQLite + sqlite-vss,
  pgvector, or a hosted store so you don't re-embed on every cold start.
- **Smarter chunking**: sentence- or section-aware splitting (headings,
  bullet groups) for better retrieval quality on long documents.
- **Streaming responses**: switch the route to a streaming response and
  Groq's streaming API for token-by-token UI updates.
- **Conversation memory**: send the last few messages as additional `user`/
  `assistant` turns so follow-up questions resolve naturally.
- **Eval harness**: a small JSON of in-scope and out-of-scope prompts to
  regression-test answers and the guardrail behavior.

---

## 10. TL;DR

- A resume PDF is parsed, chunked, embedded with Hugging Face, and stored in
  an in-memory cosine-similarity index — once per server process.
- Each user question is embedded, the top-5 chunks are retrieved, and Groq
  generates the answer using a persona-specific system prompt.
- An intent layer in `llm.js` handles greetings, meta-questions, and an
  off-topic guardrail that answers briefly and pivots back to Mohana's
  skills — always in the chosen persona's voice.
