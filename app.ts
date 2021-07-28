import { App } from "octokit";
import dotenv from "dotenv";

dotenv.config({ path: "./.env.local" });

const appId = process.env.GITHUB_APP_ID;
const privateKey = process.env.GITHUB_PRIVATE_KEY;
const repo = process.env.GITHUB_REPO;
const owner = process.env.GITHUB_OWNER;
const installationId = parseInt(process.env.GITHUB_INSTALLATION_ID);

console.log(privateKey);

const app = new App({ appId, privateKey });

const fetchGithubPullRequests = async () => {
  const octokit = await app.getInstallationOctokit(installationId);

  const pullRequests = await octokit.rest.pulls.list({ owner, repo });

  console.log(pullRequests.data.length);
  return pullRequests;
};

fetchGithubPullRequests();
