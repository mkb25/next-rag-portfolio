import "server-only";

const DEFAULT_GITHUB_USERNAME = "mkb25";
const DEFAULT_REPO_LIMIT = 8;
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_REPOS_PER_PAGE = 100;
const DEFAULT_EXCLUDED_REPOS = [
  "next-rag-portfolio",
  "content_crew_studio",
  "form-builder",
  "mkb25",
];
const PLACEHOLDER_TOKEN_VALUES = new Set([
  "optional_token_for_higher_rate_limits",
  "your_github_token_optional",
  "your_github_token",
  "your_token",
]);

function getGithubConfig() {
  return {
    username: process.env.GITHUB_USERNAME || DEFAULT_GITHUB_USERNAME,
    repoLimit: getRepoLimit(),
    excludedRepos: getExcludedRepos(),
    headers: getGithubHeaders(),
  };
}

function splitCsv(value) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function getExcludedRepos() {
  return new Set([
    ...DEFAULT_EXCLUDED_REPOS,
    ...splitCsv(process.env.GITHUB_EXCLUDED_REPOS),
  ]);
}

function getRepoLimit() {
  const parsedLimit = Number.parseInt(process.env.GITHUB_REPO_LIMIT || "", 10);
  return Number.isFinite(parsedLimit) && parsedLimit > 0
    ? parsedLimit
    : DEFAULT_REPO_LIMIT;
}

function getGithubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
  const token = process.env.GITHUB_TOKEN?.trim();

  if (token && !PLACEHOLDER_TOKEN_VALUES.has(token)) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function removeAuthorization(headers) {
  const { Authorization, ...publicHeaders } = headers;
  return publicHeaders;
}

async function fetchGithubRepos(username, headers) {
  return fetch(
    `https://api.github.com/users/${encodeURIComponent(
      username,
    )}/repos?sort=updated&per_page=${GITHUB_REPOS_PER_PAGE}`,
    {
      headers,
      next: { revalidate: 3600 },
    },
  );
}

async function fetchReposWithFallback(username, headers) {
  const response = await fetchGithubRepos(username, headers);

  if (response.status === 401 && headers.Authorization) {
    return fetchGithubRepos(username, removeAuthorization(headers));
  }

  return response;
}

function formatRepoProject(repo) {
  const description = repo.description || "No description provided.";
  const language = repo.language ? ` Tech: ${repo.language}.` : "";
  const homepage = repo.homepage?.trim();
  const liveLink = homepage ? ` [Live](${homepage})` : "";

  return `- ${repo.name}: ${description}${language}${liveLink} [GitHub](${repo.html_url})`;
}

function isDisplayableRepo(repo, excludedRepos) {
  return !repo.fork && !repo.archived && !excludedRepos.has(repo.name);
}

function formatProjectsContext(projects) {
  if (!projects.length) {
    return "";
  }

  return `OTHER GITHUB PROJECTS:
${projects.join("\n")}`;
}

export async function getOtherGithubProjectsContext() {
  const { username, repoLimit, excludedRepos, headers } = getGithubConfig();

  if (!username) {
    return "";
  }

  const response = await fetchReposWithFallback(username, headers);

  if (!response.ok) {
    return "";
  }

  const repos = await response.json();
  const projects = repos
    .filter((repo) => isDisplayableRepo(repo, excludedRepos))
    .slice(0, repoLimit)
    .map(formatRepoProject);

  return formatProjectsContext(projects);
}
