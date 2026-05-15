import "server-only";

import fs from "node:fs";
import pdf from "pdf-parse";

const RESUME_LINKS_HEADING = "RESUME CONTACT AND PROJECT LINKS:";

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

function formatProjectLinks({ live, github }) {
  return [
    live ? `[Live](${live})` : "",
    github ? `[GitHub](${github})` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildResumeLinkContext(uris) {
  const email = findUri(uris, (uri) => uri.startsWith("mailto:"));
  const linkedIn = findUri(uris, (uri) => uri.includes("linkedin.com/"));
  const githubProfile = findUri(
    uris,
    (uri) => uri === "https://github.com/mkb25",
  );
  const ragLive = findUri(uris, (uri) => uri.includes("mkb-rag-portfolio"));
  const ragGithub = findUri(uris, (uri) => uri.includes("next-rag-portfolio"));
  const crewLive = findUri(uris, (uri) => uri.includes("crewcontent.streamlit"));
  const crewGithub = findUri(uris, (uri) => uri.includes("content_crew_studio"));
  const formLive = findUri(uris, (uri) => uri.includes("form-builder.mkb1"));
  const formGithub = findUri(
    uris,
    (uri) => uri.includes("github.com/") && uri.includes("form-builder"),
  );

  const projectLinks = [
    {
      name: "Next.js RAG Portfolio",
      live: ragLive,
      github: ragGithub,
    },
    {
      name: "Content Crew Studio",
      live: crewLive,
      github: crewGithub,
    },
    {
      name: "WCAG Form Builder",
      live: formLive,
      github: formGithub,
    },
  ];

  const lines = [RESUME_LINKS_HEADING];

  if (email) lines.push(`- Email: [Email](${email})`);
  if (linkedIn) lines.push(`- LinkedIn: [LinkedIn](${linkedIn})`);
  if (githubProfile) lines.push(`- GitHub profile: [GitHub](${githubProfile})`);

  projectLinks
    .filter((project) => project.live || project.github)
    .forEach((project) => {
      lines.push(`- ${project.name}: ${formatProjectLinks(project)}`);
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

  if (!linkContext) {
    return textResult.text;
  }

  return `${textResult.text}\n\n${linkContext}`;
}
