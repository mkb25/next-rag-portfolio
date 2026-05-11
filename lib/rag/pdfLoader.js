import "server-only";

import fs from "node:fs";
import pdf from "pdf-parse";

export async function loadPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const textResult = await pdf(dataBuffer);
  return textResult.text;
}
