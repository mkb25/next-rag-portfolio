import "server-only";

import fs from "node:fs";
import { PDFParse } from "pdf-parse";

export async function loadPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  const textResult = await parser.getText();
  return textResult.text;
}
