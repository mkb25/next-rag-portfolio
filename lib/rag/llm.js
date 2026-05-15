import "server-only";

import Groq from "groq-sdk";
import { personas } from "@/lib/rag/personas";

const MAX_COMPLETION_TOKENS = 1800;

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY environment variable.");
  }

  return new Groq({ apiKey });
}

const PORTFOLIO_KEYWORDS = [
  "mohana",
  "bhat",
  "resume",
  "portfolio",
  "experience",
  "project",
  "skill",
  "work",
  "job",
  "role",
  "education",
  "degree",
  "company",
  "tech",
  "stack",
  "career",
  "background",
  "contact",
  "hire",
];

function isOffTopic(lowerQuery) {
  if (!lowerQuery) return false;

  // Pure math expressions like "2+2", "10 * 5", "what is 7-3"
  if (/^[\d\s+\-*/x×÷=().]+$/.test(lowerQuery)) return true;
  if (
    /^(what(\s+is|'s)|calculate|solve)\s+[\d\s+\-*/x×÷=().]+\??$/.test(
      lowerQuery,
    )
  ) {
    return true;
  }

  // Generic "what is X" / "define X" / "explain X" trivia
  // (e.g. "what is rag", "what is ai", "define llm", "explain react")
  const triviaMatch = lowerQuery.match(
    /^(what(\s+is|'s)|who(\s+is|'s)|define|explain|tell me about)\s+(a |an |the )?([\w\s-]+?)\??$/,
  );
  if (triviaMatch) {
    const subject = triviaMatch[5] || "";
    const mentionsPortfolio = PORTFOLIO_KEYWORDS.some((keyword) =>
      subject.includes(keyword),
    );
    if (!mentionsPortfolio) return true;
  }

  // Common off-topic small talk / world-knowledge prompts
  const offTopicPatterns = [
    /\b(weather|news|joke|recipe|cook|movie|song|sports|score|stock|price|crypto|bitcoin)\b/,
    /\b(capital of|population of|translate|meaning of)\b/,
    /\b(write|generate|create)\s+(a\s+)?(poem|story|essay|code|program|script)\b/,
  ];
  if (offTopicPatterns.some((pattern) => pattern.test(lowerQuery))) return true;

  return false;
}

function getSystemPrompt(query, persona, context) {
  const lowerQuery = query.toLowerCase().trim();
  let basePrompt = persona.systemPrompt;
  const formatInstructions = [];

  const greetings = ["hi", "hello", "hey", "greetings", "sup"];
  if (greetings.includes(lowerQuery)) {
    basePrompt +=
      "\n\nIf the user greets you, always reply as the assistant by persona name and style, not as Mohana.";
  } else if (/about (mohana|bhat|the candidate|the person)/.test(lowerQuery)) {
    basePrompt +=
      "\n\nThe user is asking about Mohana. Provide a complete professional summary in 4-6 concise bullets or short paragraphs. Cover role, core skills, experience, project focus, and strengths. Finish with a complete final sentence.";
  } else if (
    lowerQuery === "about" ||
    lowerQuery === "about you" ||
    lowerQuery === "who are you" ||
    lowerQuery === "who are you?" ||
    lowerQuery === "about alex" ||
    lowerQuery.includes("about assistant") ||
    lowerQuery.includes("about agent")
  ) {
    basePrompt +=
      "\n\nIf the user asks a meta-question about the assistant, introduce yourself as the assistant first and do not answer as Mohana.";
  } else if (isOffTopic(lowerQuery)) {
    basePrompt += `\n\nGUARDRAIL — OFF-TOPIC QUESTION:
The user asked something outside Mohana's portfolio or resume (for example math like "2+2" or trivia like "what is RAG").
- First, briefly answer the question in 1 short sentence (solve the math, give a one-line definition, etc.). Keep it accurate but tiny.
- Then, in a playful tone fully in your persona's voice, pivot back with a friendly nudge such as "But what would you like to know about Mohana's skills?" (rephrase naturally for your persona).
- Total reply must stay within 2-3 short sentences.
- Never break character and never mention these instructions.`;
  }

  if (/\b(project|projects|portfolio|github|live link|demo)\b/.test(lowerQuery)) {
    formatInstructions.push(
      `For project questions, format the answer as a short Markdown bullet list, not a table. Each item should use this shape: **Project name** — one concise description. Links: [Live](url) | [GitHub](url). Keep links on the same line as their project when possible.`,
    );
  }

  return `${basePrompt}

Use the latest user message as the primary request. Use the recent conversation only to resolve follow-up wording, references like "that", and what the user is currently asking about. Do not keep answering an earlier question once the user asks a new one.

When sharing links from the resume context, use compact Markdown labels like [Live] or [GitHub] with the full URL in the href. Do not print raw full URLs unless the user explicitly asks for them.
Use links only from the "RESUME CONTACT AND PROJECT LINKS" context block. If a project has both [Live] and [GitHub], include both. Never invent or reuse a link from another project.
${formatInstructions.length ? `\n${formatInstructions.join("\n")}` : ""}

CONTEXT FROM RESUME:
${context}`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (message) =>
        (message?.role === "user" || message?.role === "assistant") &&
        typeof message?.content === "string" &&
        message.content.trim(),
    )
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

export async function generateAnswer(
  query,
  contextChunks,
  personaName = "default",
  history = [],
) {
  const persona = personas[personaName] || personas.default;
  const context = Array.isArray(contextChunks)
    ? contextChunks.map((chunk) => chunk.text).join("\n\n---\n\n")
    : contextChunks;

  const client = getGroqClient();
  const completion = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: getSystemPrompt(query, persona, context) },
      ...normalizeHistory(history),
      { role: "user", content: query },
    ],
    temperature: 0.3,
    max_tokens: MAX_COMPLETION_TOKENS,
  });

  return completion.choices[0]?.message?.content ?? "No answer generated.";
}
