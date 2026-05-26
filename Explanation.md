# Next RAG Portfolio - Detailed Explanation

This project is a Next.js portfolio chatbot built around Retrieval-Augmented
Generation (RAG). Instead of asking an LLM to answer from memory, the app first
retrieves relevant information from `content/Resume.pdf`, adds supplemental
project/link context, and then asks the LLM to answer using that context and a
selected persona.

At a high level:

1. The browser shows a terminal-style chat UI.
2. The user asks a question about Mohana's resume, work, skills, or projects.
3. The server embeds the question into a vector.
4. The server searches for resume chunks with similar vectors.
5. The server builds a prompt from persona instructions, guardrails, retrieved
   context, supplemental GitHub/link context, and recent chat history.
6. Groq generates the final answer.
7. The UI renders the answer as Markdown inside the terminal.

---

## 1. Main Pieces

```txt
Browser
  components/TerminalPortfolio.js
      |
      | POST /api/rag
      v
Next.js Route Handler
  app/api/rag/route.js
      |
      | answerQuestion(question, persona, history)
      v
RAG Orchestrator
  lib/rag/store.js
      |
      |-- loadPdf() / loadResumeLinkContext()
      |     lib/rag/pdfLoader.js
      |
      |-- chunkText()
      |     lib/rag/chunker.js
      |
      |-- embedText() / embedBatch()
      |     lib/rag/embedder.js
      |
      |-- VectorStore or UpstashVectorStore
      |     lib/rag/vectorStore.js
      |     lib/rag/upstashVectorStore.js
      |
      |-- getOtherGithubProjectsContext()
      |     lib/github/projects.js
      |
      |-- generateAnswer()
            lib/rag/llm.js
```

Important files:

- `components/TerminalPortfolio.js` - client-side terminal UI.
- `app/api/rag/route.js` - API endpoint that receives chat questions.
- `lib/rag/store.js` - main RAG orchestration layer.
- `lib/rag/pdfLoader.js` - loads PDF text and extracts PDF links.
- `lib/rag/chunker.js` - splits PDF text into overlapping chunks.
- `lib/rag/embedder.js` - calls Hugging Face for embeddings.
- `lib/rag/vectorStore.js` - local in-memory vector search.
- `lib/rag/upstashVectorStore.js` - optional Upstash Vector backend.
- `lib/rag/llm.js` - builds the final prompt and calls Groq.
- `lib/rag/personas.js` - assistant personalities and model choices.
- `lib/rag/answerCache.js` - process-local context-cache implementation.
- `lib/github/projects.js` - fetches supplemental GitHub repo context.
- `app/api/resume/route.js` - downloads `content/Resume.pdf`.

External services:

- Hugging Face Inference API for embeddings:
  `sentence-transformers/all-MiniLM-L6-v2`.
- Groq for chat completions.
- Upstash Vector optionally, when `RAG_VECTOR_STORE=upstash`.
- GitHub REST API for supplemental public repository context.

---

## 2. What Happens In The Browser

The main page is `app/page.js`, which renders:

```js
<TerminalPortfolio />
```

`TerminalPortfolio.js` is a client component. It owns the visible chat state:

- `messages` - terminal log containing system, user, and assistant messages.
- `inputValue` - current text input value.
- `persona` - selected assistant voice: `default`, `medieval`, or `pirate`.
- `theme` - selected UI theme: `system`, `dark`, or `light`.
- `commandHistory` - previous terminal inputs for up/down navigation.
- `isLoading` - whether a request is currently in progress.
- `errorMessage` - user-facing request failure message.

When the user submits text, `handleSubmit()` runs.

If the input starts with `/`, it is handled locally as a terminal command:

- `/help` shows command help.
- `/clear` clears the terminal output.
- `/download` downloads the resume through `/api/resume`.
- `/history` shows recent commands/questions.
- `/persona [default|medieval|pirate]` switches assistant persona.
- `/theme [system|dark|light]` switches UI theme.

If the input is a normal question, the component sends:

```json
{
  "question": "What projects has Mohana built?",
  "persona": "default",
  "history": [...]
}
```

to:

```txt
POST /api/rag
```

Only the last few relevant user/assistant messages are sent as history. History
is reset after a persona change so a medieval answer is not influenced by
conversation from a different persona.

The assistant response is rendered with `MarkdownContent`, which supports common
Markdown features such as links, bold text, lists, headings, code, and tables.

---

## 3. API Request Handling

`app/api/rag/route.js` defines the server endpoint:

```js
export async function POST(request) {
  const body = await request.json();
  const question = body?.question?.trim();
  const persona = body?.persona || "default";
  const history = Array.isArray(body?.history) ? body.history : [];

  const answer = await answerQuestion(question, persona, history);
  return NextResponse.json({ answer });
}
```

The route:

- forces the Node.js runtime with `export const runtime = "nodejs"`;
- rejects empty questions with HTTP 400;
- forwards the question, persona, and history to `answerQuestion()`;
- catches errors and returns safe user-facing messages.

The Node runtime matters because PDF parsing, filesystem access, and SDK usage
need Node APIs.

---

## 4. RAG Orchestration

The main server flow lives in `lib/rag/store.js`.

The key exported function is:

```js
answerQuestion(question, (persona = "default"), (history = []));
```

Its job is to:

1. check whether a cached result can be reused;
2. embed the user's question;
3. load or build the vector store;
4. search for relevant resume chunks;
5. gather supplemental context;
6. call the LLM;
7. return the generated answer.

`store.js` also keeps a module-level `storePromise`.

```js
let storePromise;
```

This is important. Building the vector store means reading the PDF, chunking the
text, calling the embedding API for every chunk, and adding all vectors to the
store. That work should happen once per server process, not on every question.

`getRagStore()` lazily initializes the store:

```js
if (!storePromise) {
  storePromise = buildStore(getResumePdfPath()).catch((error) => {
    storePromise = undefined;
    throw error;
  });
}
```

If building fails, the promise is cleared so a later request can retry.

---

## 5. PDF Loading And Link Extraction

The source document is:

```txt
content/Resume.pdf
```

`lib/rag/pdfLoader.js` does two related things.

First, `loadPdf(filePath)` reads the PDF and extracts plain text:

```js
const dataBuffer = fs.readFileSync(filePath);
const textResult = await pdf(dataBuffer);
const parsedText = textResult.text;
```

Second, it scans the raw PDF bytes for `/URI (...)` entries. This extracts links
that may not appear cleanly in the plain text returned by `pdf-parse`.

Those links are converted into a context block:

```txt
EXTRACTED PDF LINKS:
- https://...
- mailto:...
```

`loadPdf()` appends that link block to the parsed PDF text before chunking. The
app also calls `loadResumeLinkContext()` later so fresh link context can be added
directly to the final LLM prompt.

This is useful because project and contact questions often need exact links. The
LLM is instructed to use only links that appear in the provided context and not
invent URLs.

---

## 6. How Chunking Works

Chunking is implemented in `lib/rag/chunker.js`:

```js
chunkText(text, (chunkSize = 500), (overlap = 50));
```

The goal is to split a long document into smaller pieces that can be embedded
and retrieved independently.

The function works like this:

1. Split the full text into paragraphs using blank lines:

   ```js
   text.split(/\n\n+/);
   ```

2. Split each paragraph into sentences using a lightweight sentence regex:

   ```js
   p.match(/[^.!?]+[.!?]+/g) || [p];
   ```

   If no sentence punctuation is found, the paragraph itself becomes one unit.

3. Build a chunk by adding whole sentences one by one.

4. Count words in each sentence with:

   ```js
   sentence.trim().split(/\s+/).filter(Boolean);
   ```

5. When adding the next sentence would push the chunk over `chunkSize`, save the
   current chunk.

6. Before starting the next chunk, copy trailing sentences from the previous
   chunk until there are roughly `overlap` words.

7. Continue until all sentences are processed.

8. Emit the final partial chunk.

With the current settings:

```js
chunkText(rawText, 500, 50);
```

each chunk is about 500 words, and the next chunk starts with about 50 words of
context from the previous chunk.

The chunks are sentence-aware, not exact fixed-size word windows. This means
chunk sizes are approximate, but sentences are less likely to be split in half.
That usually gives the embedding model and the LLM cleaner context.

The overlap matters because important facts often sit near chunk boundaries. If
one chunk ends with a project name and the next chunk begins with its details,
overlap helps keep those related facts together during retrieval.

Trade-off: the sentence splitter is intentionally simple. It is good enough for
resume-sized text, but it may not perfectly handle every abbreviation or unusual
punctuation pattern.

---

## 7. Embeddings

Embeddings are numeric representations of text. Similar text should produce
vectors that are close together.

`lib/rag/embedder.js` uses Hugging Face:

```js
const MODEL = "sentence-transformers/all-MiniLM-L6-v2";
```

There are two functions:

- `embedText(text)` embeds one string, used for user questions.
- `embedBatch(texts)` embeds many strings, used for resume chunks.

Both require:

```txt
HUGGINGFACEHUB_API_TOKEN
```

During index building, chunks are embedded in batches of 10:

```js
for (let index = 0; index < chunks.length; index += 10) {
  const batch = chunks.slice(index, index + 10);
  const batchEmbeddings = await embedBatch(batch);
  embeddings.push(...batchEmbeddings);
}
```

Batching avoids making one API call per chunk.

The same embedding model is used for both document chunks and user questions.
That is necessary because vector similarity only works when both sides live in
the same vector space.

---

## 8. Vector Store Options

After chunking and embedding, the app stores pairs like:

```js """
    Parses a PDF with PyMuPDF, splits each page's text into overlapping
    character-level chunks, embeds them, and upserts into ChromaDB.
  """
    Parses a PDF with PyMuPDF, splits each page's text into overlapping
    character-level chunks, embeds them, and upserts into ChromaDB.

    Args:
        file_path: Absolute path to the uploaded PDF file.
        filename:  Original filename used as the source identifier.

    Returns:
        A dict with keys ``filename``, ``chunk_count``, and ``status``.
    """
    Args:
        file_path: Absolute path to the uploaded PDF file.
        filename:  Original filename used as the source identifier.

    Returns:
        A dict with keys ``filename``, ``chunk_count``, and ``status``.
    """
{
  text: "chunk text from the resume",
  embedding: [0.01, -0.03, ...]
}
```

There are two vector backends.

### 8.1 In-Memory Vector Store

The default backend is `lib/rag/vectorStore.js`.

It keeps all documents in an array:

```js
this.documents = [];
```

Search works by:

1. computing cosine similarity between the question embedding and every stored
   chunk embedding;
2. sorting results from highest score to lowest score;
3. returning the top `K` results.

In `store.js`, the app currently asks for:

```js
store.search(queryEmbedding, 5);
```

So the final prompt receives the top 5 matching resume chunks.

This is simple and fast for a resume because there are only a small number of
chunks. For a large corpus, this O(N) scan would be replaced with a dedicated
approximate nearest-neighbor index.

### 8.2 Upstash Vector Store

If:

```txt
RAG_VECTOR_STORE=upstash
```

then `store.js` uses `UpstashVectorStore` instead.

Required environment variables:

```txt
UPSTASH_VECTOR_REST_URL
UPSTASH_VECTOR_REST_TOKEN
```

Optional namespace:

```txt
UPSTASH_VECTOR_NAMESPACE
```

During indexing, each chunk is upserted with:
"""
Parses a PDF with PyMuPDF, splits each page's text into overlapping
character-level chunks, embeds them, and upserts into ChromaDB.

    Args:
        file_path: Absolute path to the uploaded PDF file.
        filename:  Original filename used as the source identifier.

    Returns:
        A dict with keys ``filename``, ``chunk_count``, and ``status``.
    """

- stable ID: `Resume.pdf:chunk:{index}`;
- vector: the embedding;
- metadata: source and chunk index;
- data: original chunk text.

During search, Upstash receives the query vector and returns matching records
with `includeMetadata` and `includeData` enabled. The original chunk text is
then passed to the LLM.

If the Upstash index has already been populated, this can be set:

```txt
RAG_SKIP_INDEX_BUILD=true
```

That skips local PDF parsing and re-upserting on cold start. In that mode,
queries go directly to the existing Upstash index.

---

## 9. Supplemental Context

The retrieved resume chunks are not the only context sent to the LLM.

`store.js` also builds extra context with:

```js
getSupplementalContext();
```

This returns:

- `linkContext` from `loadResumeLinkContext(resumePath)`;
- `githubProjectsContext` from `getOtherGithubProjectsContext()`.

`buildAnswerContext()` then combines:

1. fresh resume/PDF link context;
2. retrieved vector-search chunks;
3. supplemental GitHub project context.

The result is an array of context chunks:

```js
[
  { text: linkContext, score: 1, metadata: ... },
  ...relevantChunks,
  { text: githubProjectsContext, score: 1, metadata: ... }
]
```

This design lets the app answer both resume-specific questions and broader
portfolio questions. Resume-highlighted projects come from the PDF context.
Other public repositories come from GitHub and are labeled separately in the
prompt instructions.

GitHub context is fetched from:

```txt
https://api.github.com/users/{username}/repos
```

Defaults:

- username: `mkb25`;
- repo limit: `8`;
- excluded repos: `next-rag-portfolio`, `content_crew_studio`,
  `form-builder`, and `mkb25`.

Configurable environment variables:

```txt
GITHUB_USERNAME
GITHUB_REPO_LIMIT
GITHUB_EXCLUDED_REPOS
GITHUB_TOKEN
```

`GITHUB_TOKEN` is optional. If present, it is used for higher API limits. If the
token is invalid and GitHub returns 401, the code retries without authorization.

---

## 10. Prompt Construction And LLM Generation

The final answer is generated in `lib/rag/llm.js`.

The exported function is:

```js
generateAnswer(query, contextChunks, (personaName = "default"), (history = []));
```

It does four main things:

1. selects the requested persona;
2. converts context chunks into one text block;
3. builds the chat messages;
4. calls Groq.

Context chunks are joined with separators:

```txt
chunk 1

---

chunk 2

---

chunk 3
```

Then `getSystemPrompt()` creates the system message. It includes:

- the selected persona's base system prompt;
- optional intent-specific instruction;
- an important note about Infosys client engagements;
- context usage and link safety rules;
- optional formatting instructions;
- the retrieved/supplemental context.

The system prompt ends with:

```txt
CONTEXT FROM RESUME:
{context}
```

The final messages sent to Groq look like:

```js
[
  { role: "system", content: composedPrompt },
  ...recentHistory,
  { role: "user", content: query },
];
```

Only the last 8 valid history messages are used. History is there to resolve
follow-ups like "what about the second project?" while still making the latest
user message the primary request.

Groq settings:

```js
temperature: 0.3;
max_tokens: 1800;
```

Low temperature keeps the answer more stable and grounded. `max_tokens` limits
the maximum length of the generated response.

---

## 11. Personas

Personas live in `lib/rag/personas.js`.

Each persona has:

- `name`;
- `model`;
- `systemPrompt`.

Current personas:

- `default` - Alex, a friendly professional assistant.
- `medieval` - Sir Advisor, Olde English style.
- `pirate` - Captain Codebeard, pirate style.

Each persona prompt tells the assistant:

- introduce itself by persona name for greetings;
- answer meta-questions as the assistant, not as Mohana;
- answer portfolio questions in third person about Mohana;
- stay grounded in the provided context.

The persona also selects the Groq model. `llm.js` validates the requested model
against a supported set. If a persona references an unsupported model, the app
falls back to:

```txt
llama-3.1-8b-instant
```

---

## 12. Intent Handling And Guardrails

`llm.js` does lightweight intent detection before building the final system
prompt.

Supported intent branches:

### Greetings

Queries like:

```txt
hi
hello
hey
greetings
sup
```

trigger an instruction to answer as the selected assistant persona.

### About Mohana

Queries matching:

```txt
about Mohana
about Bhat
about the candidate
about the person
```

trigger a concise professional summary instruction.

### Meta Assistant Questions

Queries like:

```txt
who are you
about you
about alex
```

trigger an instruction to introduce the assistant and avoid giving Mohana's full
bio unless the user specifically asks for it.

### Off-Topic Questions

The app detects clearly off-topic prompts such as:

- pure math: `2+2`, `what is 7-3`;
- generic trivia: `what is RAG`, `define AI`;
- world/small-talk prompts: weather, news, recipes, sports, stock prices;
- requests to write unrelated poems, stories, essays, code, or scripts.

For those, the prompt tells the LLM to:

1. answer briefly in one short sentence;
2. pivot back to Mohana's portfolio;
3. stay in persona;
4. keep the total reply to 2-3 short sentences.

This keeps the portfolio assistant useful without turning it into a general
chatbot.

### Formatting Instructions

If the question is about projects, the LLM is told to use Markdown bullets,
place resume-highlighted projects first, and put GitHub-only repos under an
`Other Projects` heading.

If the question is about experience, the LLM is told to use a simple Markdown
table for timelines or comparisons, then normal bullets for highlights.

There is also a specific employment note:

```txt
Apple, Macy's, and Nike were client engagements handled while Mohana was
employed at Infosys. They are not separate employers.
```

This prevents the assistant from misrepresenting client work as separate jobs.

---

## 13. Caching

Caching is meant to reduce repeated work.

There are two separate ideas to understand:

1. `storePromise` caches the built vector store.
2. `answerCache.js` currently implements a process-local retrieved-context
   cache API.

### 13.1 Store Cache

`storePromise` is the most important cache. It prevents this expensive cold-start
work from happening on every request:

- reading the PDF;
- extracting text and links;
- chunking the text;
- embedding every chunk;
- adding vectors to the selected vector store.

This cache is process-local. It resets when the server process restarts.

### 13.2 Context Cache

`lib/rag/answerCache.js` currently exports:

```js
findContextCacheHit({ question, embedding });
setContextCacheEntry({ question, embedding, chunks });
```

Despite the filename, this implementation stores retrieved context chunks, not
generated answers.

It normalizes questions by:

- lowercasing;
- removing punctuation;
- collapsing whitespace.

That lets questions like:

```txt
Skills?
skills
```

match as the same normalized question.

It supports:

- exact hits, where normalized question text matches;
- semantic hits, where the new question embedding is highly similar to a cached
  question embedding.

The default similarity threshold is:

```txt
0.94
```

Configurable environment variables:

```txt
RAG_CONTEXT_CACHE_TTL_MS
RAG_CONTEXT_CACHE_MAX_ENTRIES
RAG_CONTEXT_CACHE_SIMILARITY_THRESHOLD
```

For backward compatibility, the module also reads older `RAG_ANSWER_CACHE_*`
names as fallbacks.

The cache skips likely follow-up prompts such as:

```txt
tell me more
what about...
that
those
compare
```

Follow-ups depend heavily on conversation history, so blindly reusing cached
context could retrieve the wrong information.

### 13.3 Current Integration Note

As currently written, `store.js` imports:

```js
findAnswerCacheHit;
setAnswerCacheEntry;
```

but `answerCache.js` exports:

```js
findContextCacheHit;
setContextCacheEntry;
```

That means the cache integration needs to be aligned before runtime. There are
two valid designs:

1. Answer cache: cache the complete generated answer and return it directly.
   This saves the most tokens, but repeated answers are identical.
2. Context cache: cache retrieved chunks and still call the LLM. This saves
   retrieval work while allowing fresh wording every time.

The current `answerCache.js` comments and exports match option 2: context
caching.

---

## 14. Token And Cost Behavior

The expensive operations are:

- embedding calls to Hugging Face;
- LLM calls to Groq;
- optional Upstash vector queries;
- optional GitHub API calls.

Cold start in memory mode:

1. one PDF read;
2. one chunking pass;
3. multiple batch embedding calls for all chunks;
4. local vector-store population;
5. one query embedding;
6. one LLM call.

Warm request in memory mode:

1. one query embedding;
2. local vector search;
3. supplemental context gathering;
4. one LLM call.

Warm request in Upstash mode:

1. one query embedding;
2. one Upstash query request;
3. supplemental context gathering;
4. one LLM call.

If whole-answer caching is used, a cache hit can avoid nearly all token usage.
If context caching is used, a cache hit still calls the LLM, so prompt and
completion tokens are still consumed. Context caching mainly saves retrieval
work and helps keep answers fresh.

Prompt tokens come from:

- persona system prompt;
- intent/formatting/guardrail instructions;
- retrieved resume chunks;
- extracted PDF link context;
- supplemental GitHub project context;
- recent chat history;
- the current user question.

The biggest token levers are:

- fewer retrieved chunks;
- shorter GitHub supplemental context;
- shorter history window;
- smaller persona/instruction text;
- whole-answer caching for repeat deterministic questions.

---

## 15. Environment Variables

Required for embeddings:

```txt
HUGGINGFACEHUB_API_TOKEN
```

Required for LLM generation:

```txt
GROQ_API_KEY
```

Optional vector backend:

```txt
RAG_VECTOR_STORE=upstash
UPSTASH_VECTOR_REST_URL
UPSTASH_VECTOR_REST_TOKEN
UPSTASH_VECTOR_NAMESPACE
RAG_SKIP_INDEX_BUILD=true
```

Optional GitHub context:

```txt
GITHUB_USERNAME
GITHUB_REPO_LIMIT
GITHUB_EXCLUDED_REPOS
GITHUB_TOKEN
```

Optional context-cache tuning:

```txt
RAG_CONTEXT_CACHE_TTL_MS
RAG_CONTEXT_CACHE_MAX_ENTRIES
RAG_CONTEXT_CACHE_SIMILARITY_THRESHOLD
```

Backward-compatible cache names:

```txt
RAG_ANSWER_CACHE_TTL_MS
RAG_ANSWER_CACHE_MAX_ENTRIES
RAG_ANSWER_CACHE_SIMILARITY_THRESHOLD
```

---

## 16. End-To-End Example

Suppose the user asks:

```txt
What projects has Mohana worked on?
```

The flow is:

1. `TerminalPortfolio` sends the question, selected persona, and recent history
   to `/api/rag`.
2. `app/api/rag/route.js` validates the request and calls `answerQuestion()`.
3. `store.js` embeds the question using Hugging Face.
4. `getRagStore()` returns the existing store or builds it from `Resume.pdf`.
5. The vector store compares the question embedding against all chunk embeddings.
6. The top 5 chunks are selected.
7. Fresh PDF links and GitHub project context are added.
8. `llm.js` sees that this is a project question and adds project formatting
   instructions.
9. The selected persona prompt is added.
10. Recent conversation history is included.
11. Groq generates a Markdown answer.
12. The route returns `{ answer }`.
13. The terminal UI renders the answer with Markdown links and bullets.

The LLM does not search the PDF itself. Retrieval happens before the LLM call.
The LLM only sees the chunks and supplemental context that the server places in
the prompt.

---

## 17. Why This Is RAG

This app is RAG because it separates the answer into two phases:

1. Retrieval: find the most relevant resume/project context.
2. Generation: use the retrieved context to compose a natural answer.

That gives the assistant three advantages:

- it can answer from the actual resume instead of relying on model memory;
- it can cite/use project and contact links extracted from the PDF;
- it can change tone through personas without changing the underlying data.

The resume remains the source of truth. The model is responsible for wording,
formatting, and conversational behavior.

---

## 18. Current Limitations

- The PDF is the main knowledge source, so outdated PDF content means outdated
  answers.
- The local vector store is process memory only; it resets after restart.
- The cache is also process-local; it is not shared across server instances.
- The sentence splitter is lightweight and may not handle every punctuation edge
  case.
- The GitHub context is supplemental and limited to public repository metadata.
- The LLM can still make mistakes if the retrieved context is incomplete or the
  prompt is too crowded.
- The cache integration currently needs the `store.js` imports/calls to be
  aligned with the context-cache exports in `answerCache.js`.

---

## 19. Mental Model

Think of the app as a three-stage pipeline:

```txt
Indexing:
Resume PDF -> text -> chunks -> embeddings -> vector store

Retrieval:
User question -> embedding -> top matching chunks

Generation:
Persona + guardrails + chunks + links + history -> Groq -> final answer
```

The UI makes it feel like an agentic terminal, but the core backend is a compact
RAG pipeline: parse, chunk, embed, search, prompt, generate.
