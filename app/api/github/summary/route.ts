import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_REPOSITORY = "shivanshgupta365/GroundMesh-On-Call";
const execFileAsync = promisify(execFile);

type GitHubRepository = {
  full_name: string;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
};

type GitHubPullRequest = {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  draft: boolean;
  head: { ref: string };
  base: { ref: string };
  user: { login: string };
};

function outcomeFor(title: string) {
  const explicit = title.match(/\((READY_FOR_APPROVAL|BLOCKED_BY_POLICY|VERIFICATION_FAILED|INSUFFICIENT_EVIDENCE|REQUIRES_HUMAN_APPROVAL)\)$/)?.[1];
  if (explicit) return explicit;
  if (/correct preview config key/i.test(title)) return "READY_FOR_APPROVAL";
  return "REVIEW";
}

export async function GET() {
  const repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return Response.json({ available: false, error: "GITHUB_REPOSITORY is invalid." }, { status: 500 });
  }

  let repo: GitHubRepository;
  let pulls: GitHubPullRequest[];
  try {
    const [repositoryResult, pullsResult] = await Promise.all([
      execFileAsync("gh", ["api", `repos/${repository}`], { cwd: process.cwd(), timeout: 15_000, maxBuffer: 1_000_000 }),
      execFileAsync("gh", ["api", `repos/${repository}/pulls?state=open&per_page=30&sort=updated`], { cwd: process.cwd(), timeout: 15_000, maxBuffer: 2_000_000 }),
    ]);
    repo = JSON.parse(repositoryResult.stdout) as GitHubRepository;
    pulls = JSON.parse(pullsResult.stdout) as GitHubPullRequest[];
  } catch {
    return Response.json({
      available: false,
      error: "Authenticated GitHub sync is unavailable. Run gh auth status on the local machine.",
    }, { status: 502 });
  }
  const pullRequests = pulls.map((pull) => ({
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    updatedAt: pull.updated_at,
    draft: pull.draft,
    head: pull.head.ref,
    base: pull.base.ref,
    author: pull.user.login,
    outcome: outcomeFor(pull.title),
  }));
  const counts = pullRequests.reduce<Record<string, number>>((result, pull) => {
    result[pull.outcome] = (result[pull.outcome] || 0) + 1;
    return result;
  }, {});

  return Response.json({
    available: true,
    syncedAt: new Date().toISOString(),
    repository: {
      name: repo.full_name,
      url: repo.html_url,
      defaultBranch: repo.default_branch,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openItems: repo.open_issues_count,
      pushedAt: repo.pushed_at,
    },
    counts,
    pullRequests,
  });
}
