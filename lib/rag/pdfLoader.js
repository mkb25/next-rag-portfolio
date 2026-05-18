import "server-only";

import fs from "node:fs";
import pdf from "pdf-parse";



function decodePdfString(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, character) => {
      switch (character) {
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case "b":
          return "\b";
        case "f":
          return "\f";
        default:
          return character;
      }
    })
    .replace(/\\([0-7]{1,3})/g, (_, octal) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    );
}

function extractPdfUris(dataBuffer) {
  const pdfSource = dataBuffer.toString("latin1");
  const uriPattern = /\/URI\s*\(((?:\\.|[^\\)])*)\)/g;
  const uris = new Set();
  let match;

  while ((match = uriPattern.exec(pdfSource)) !== null) {
    const uri = decodePdfString(match[1]).trim();
    if (uri) {
      uris.add(uri);
    }
  }

  return [...uris];
}

function normalizeUri(uri) {
  return uri.trim().replace(/\/+$/, "").toLowerCase();
}

function findUri(uris, matcher) {
  return uris.find((uri) => matcher(normalizeUri(uri)));
}

function buildResumeLinkContext(uris) {
  const lines = ["EXTRACTED PDF LINKS:"];
  
  uris.forEach((uri) => {
    if (uri.startsWith("http") || uri.startsWith("mailto:")) {
      lines.push(`- ${uri}`);
    }
  });

  return lines.length > 1 ? lines.join("\n") : "";
}

export function loadResumeLinkContext(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  return buildResumeLinkContext(extractPdfUris(dataBuffer));
}

export async function loadPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const textResult = await pdf(dataBuffer);
  const linkContext = buildResumeLinkContext(extractPdfUris(dataBuffer));
  const parsedText = textResult.text;

  if (!linkContext) {
    return parsedText;
  }

  return `${parsedText}\n\n${linkContext}`;
}
