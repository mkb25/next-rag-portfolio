import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag/store";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const question = body?.question?.trim();
    const persona = body?.persona || "default";

    if (!question) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    const answer = await answerQuestion(question, persona);
    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to answer question." },
      { status: 500 },
    );
  }
}
