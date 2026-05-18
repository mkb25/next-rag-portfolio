import "server-only";

import fs from "node:fs";
import pdf from "pdf-parse";

const RESUME_LINKS_HEADING = "RESUME CONTACT AND PROJECT LINKS:";
const RESUME_EXPERIENCE_HEADING = "CANONICAL RESUME EXPERIENCE STRUCTURE:";
const EXPERIENCE_PARSING_NOTE =
  "Important parsing note: Apple, Macy's, and Nike were Infosys clients handled by Mohana, not separate employers. When answering employment history questions, list them as client engagements under Infosys.";
const RESUME_CONTACT_LINKS = {
  githubProfile: "https://github.com/mkb25",
};

const RESUME_PROJECT_LINKS = [
  {
    name: "Next.js RAG Portfolio",
    live: "https://next-rag-portfolio.vercel.app/",
    github: "https://github.com/mkb25/next-rag-portfolio",
  },
  {
    name: "Content Crew Studio",
    live: "https://crewcontent.streamlit.app/",
    github: "https://github.com/mkb25/content_crew_studio",
  },
  {
    name: "WCAG Form Builder",
    live: "https://form-builder.mkb1.workers.dev/",
    github: "https://github.com/mkb25/form-builder",
  },
];

const canonicalExperience = [
  {
    company: "Costrategix",
    title: "Front-End & AI Application Engineer",
    location: "Bengaluru, Karnataka",
    dates: "Jan 2026 - Present",
    bullets: [
      "Led AI-powered healthcare web applications using React 18 micro-frontends, RAG-based search, real-time chat, and HIPAA-compliant access controls.",
      "Developed a custom VS Code extension with React Webviews and Groq-powered real-time code analysis.",
      "Automated operational workflows using LangGraph-based agents with SLA monitoring and intelligent state transitions.",
    ],
  },
  {
    company: "Infosys",
    title: "Software Engineer",
    location: "Mangalore, Karnataka",
    dates: "May 2021 - Dec 2025",
    clients: [
      {
        name: "Apple",
        project: "WeChat Ecosystem",
        title: "Senior Front-End Developer",
        dates: "Jan 2024 - Dec 2025",
        bullets: [
          "Architected a React 18/Redux application, built Mini Program features with TypeScript/WXML/WXSS, modernized Node.js/npm dependencies, reviewed frontend code, and mentored junior engineers.",
        ],
      },
      {
        name: "Macy's",
        project: "CMS + Shopping Site",
        title: "Front-End Developer",
        dates: "Jan 2022 - Dec 2023",
        bullets: [
          "Built Vue.js premier/loyalty landing pages, OMS/CMS interfaces with Ant Design, reusable ES6/JSON table components, and optimized Axios usage.",
        ],
      },
      {
        name: "Nike",
        project: "Commerce Production Support",
        title: "Production Support Software Engineer",
        dates: "May 2021 - Dec 2021",
        bullets: [
          "Managed IBM Sterling OMS operations, SAP/SQL reconciliation reporting, RCA post-mortems, and ADA/WCAG 2.1 AA remediation.",
        ],
      },
    ],
  },
];

function formatExperienceEntry(entry) {
  const heading = `- ${entry.company} - ${entry.title}, ${entry.location}, ${entry.dates}.`;
  const bullets = entry.bullets?.map((item) => `  - ${item}`) || [];
  const clients =
    entry.clients?.flatMap((client) => [
      `  - Client: ${client.name}, ${client.project} - ${client.title}, ${client.dates}.`,
      ...client.bullets.map((item) => `    - ${item}`),
    ]) || [];

  return [heading, ...bullets, ...clients].join("\n");
}

function buildResumeExperienceContext() {
  return [
    RESUME_EXPERIENCE_HEADING,
    ...canonicalExperience.map(formatExperienceEntry),
    "",
    EXPERIENCE_PARSING_NOTE,
  ].join("\n");
}

const RESUME_EXPERIENCE_CONTEXT = buildResumeExperienceContext();

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

  const lines = [RESUME_LINKS_HEADING];

  if (email) lines.push(`- Email: [Email](${email})`);
  if (linkedIn) lines.push(`- LinkedIn: [LinkedIn](${linkedIn})`);
  lines.push(`- GitHub profile: [GitHub](${RESUME_CONTACT_LINKS.githubProfile})`);

  RESUME_PROJECT_LINKS
    .filter((project) => project.live || project.github)
    .forEach((project) => {
      lines.push(`- ${project.name}: ${formatProjectLinks(project)}`);
    });

  return lines.join("\n");
}

export function loadResumeLinkContext(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  return buildResumeLinkContext(extractPdfUris(dataBuffer));
}

export function loadResumeExperienceContext() {
  return RESUME_EXPERIENCE_CONTEXT;
}

export async function loadPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const textResult = await pdf(dataBuffer);
  const linkContext = buildResumeLinkContext(extractPdfUris(dataBuffer));
  const parsedText = `${RESUME_EXPERIENCE_CONTEXT}\n\n${textResult.text}`;

  if (!linkContext) {
    return parsedText;
  }

  return `${parsedText}\n\n${linkContext}`;
}
