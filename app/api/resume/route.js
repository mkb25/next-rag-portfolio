import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const resumePath = path.join(process.cwd(), "content", "Resume.pdf");
    const resume = await readFile(resumePath);

    return new NextResponse(resume, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="Resume.pdf"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Resume PDF could not be downloaded." },
      { status: 404 },
    );
  }
}
