# Next RAG Portfolio

An interactive "agentic terminal" portfolio built with Next.js 15. It turns a
single resume PDF into a chat experience: ask anything about the candidate and
a Retrieval-Augmented Generation (RAG) pipeline answers in the persona you
pick (Friendly Assistant, Medieval Scribe, or Pirate First Mate).

For a deep dive into how every module works, see [Explanation.md](Explanation.md).

---

## Features

- **RAG over a resume PDF** — text extraction, sliding-window chunking,
  Hugging Face embeddings, and either in-memory or Upstash Vector search.
- **Groq LLM responses** — fast `openai/gpt-oss-120b` completions grounded in
  the retrieved context.
- **Three personas** — `default` (Alex), `medieval` (Sir Advisor),
  `pirate` (Captain Codebeard).
- **Intent-aware prompts** — special handling for greetings, meta-questions,
  and a playful **off-topic guardrail** that briefly answers things like
  `2+2` or `what is RAG`, then steers the conversation back to the portfolio.
- **Terminal-style UI** — single-page client component with ASCII banner,
  persona dropdown, and a typing animation.
- **Slash commands** — local terminal commands such as `/clear`, `/help`,
  `/download`, `/history`, `/persona medieval`, and `/theme dark`.

---

## Tech Stack

- [Next.js 15](https://nextjs.org/) (App Router, Node runtime)
- [React 19](https://react.dev/)
- [Groq SDK](https://www.npmjs.com/package/groq-sdk) — chat completions
- [@huggingface/inference](https://www.npmjs.com/package/@huggingface/inference) —
  `sentence-transformers/all-MiniLM-L6-v2` embeddings
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) — PDF text extraction
- [Upstash Vector](https://upstash.com/vector) — optional cloud vector database

---

## Project Structure

```
app/
  layout.js
  page.js                 Renders <TerminalPortfolio />
  globals.css
  api/rag/route.js        POST /api/rag handler
components/
  TerminalPortfolio.js    Client UI (chat log, persona picker, input)
lib/rag/
  pdfLoader.js            Read + extract text from the resume PDF
  chunker.js              Word-based sliding-window chunking
  embedder.js             Hugging Face embeddings (single + batch)
  vectorStore.js          In-memory cosine-similarity index
  upstashVectorStore.js   Optional Upstash Vector REST index
  store.js                Builds the index once; answers questions
  llm.js                  Prompt assembly, intent detection, Groq call
  personas.js             Three assistant voices
content/
  Resume.pdf              Source document (you provide this)
Explanation.md            Detailed architecture write-up
```

---

## Getting Started

### 1. Prerequisites

- Node.js 18.18+ (Node 20 LTS recommended)
- An account / API key for:
  - [Groq](https://console.groq.com/) → `GROQ_API_KEY`
  - [Hugging Face](https://huggingface.co/settings/tokens) →
    `HUGGINGFACEHUB_API_TOKEN`

### 2. Install

```bash
npm install
```

### 3. Add your resume

Place your PDF at:

```
content/Resume.pdf
```

The path is hard-coded in `lib/rag/store.js`. Rename or repath there if needed.

### 4. Configure environment

Create a `.env.local` file in the project root:

```bash
GROQ_API_KEY=your_groq_key_here
HUGGINGFACEHUB_API_TOKEN=your_hf_token_here
```

`.env*` files are gitignored.

To use Upstash Vector instead of the in-memory store, create an Upstash Vector
index with 384 dimensions for `sentence-transformers/all-MiniLM-L6-v2`, then add:

```bash
RAG_VECTOR_STORE=upstash
UPSTASH_VECTOR_REST_URL=your_upstash_vector_rest_url
UPSTASH_VECTOR_REST_TOKEN=your_upstash_vector_rest_token
UPSTASH_VECTOR_NAMESPACE=resume
```

The first request will parse the PDF, embed the chunks, and upsert them to
Upstash. After the index is populated, you can set this to skip re-upserting on
cold starts:

```bash
RAG_SKIP_INDEX_BUILD=true
```

### 5. Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
```

The first request after a cold start will parse the PDF and embed all chunks
once. In memory mode, subsequent requests reuse the process-local index. In
Upstash mode, chunks are searched from the cloud vector index.

---

## API

### `POST /api/rag`

**Request body**

```json
{
  "question": "What is Mohana's experience with Next.js?",
  "persona": "default"
}
```

- `question` _(string, required)_ — the user's question.
- `persona` _(string, optional)_ — one of `default`, `medieval`, `pirate`.
  Defaults to `default`.

**Response**

```json
{ "answer": "Mohana has worked with ..." }
```

**Errors**

- `400` — missing `question`
- `500` — upstream failure (PDF, embeddings, or LLM)

---

## How the Guardrail Works

If a user asks something off-topic — pure math (`2+2`), generic trivia
(`what is RAG`), small talk (`tell me a joke`, `weather`, `stock price`), or
"write a poem/code" requests — the assistant:

1. Answers briefly in **one short sentence**.
2. Pivots back in the active persona's voice with a friendly nudge such as
   _"But what would you like to know about Mohana's skills?"_
3. Stays within 2–3 short sentences total and never breaks character.

Detection lives in `isOffTopic()` in [lib/rag/llm.js](lib/rag/llm.js).

---

## Scripts

| Script          | Purpose                      |
| --------------- | ---------------------------- |
| `npm run dev`   | Start the Next.js dev server |
| `npm run build` | Production build             |
| `npm run start` | Serve the production build   |

---

## License

Private / personal portfolio project. Adapt freely for your own use.
