import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag/store";

export const runtime = "nodejs";

const GENERIC_ERROR_MESSAGE =
  "Sorry, I couldn't generate an answer right now. Please try again in a moment.";

function getSafeErrorMessage(error) {
  if (error?.message?.includes("Missing GROQ_API_KEY")) {
    return "The AI service is not configured yet. Please add the required API key.";
  }

  if (error?.status === 401 || error?.statusCode === 401) {
    return "The AI service rejected the request. Please check the API key.";
  }

  if (error?.status === 429 || error?.statusCode === 429) {
    return "The AI service is busy or rate-limited. Please try again shortly.";
  }

  return GENERIC_ERROR_MESSAGE;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const question = body?.question?.trim();
    const persona = body?.persona || "default";
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!question) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    const answer = await answerQuestion(question, persona, history);
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("RAG answer generation failed:", error);

    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 },
    );
  }
}
