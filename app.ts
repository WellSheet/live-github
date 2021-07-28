import { App } from "octokit";
import { App as SlackApp } from "@slack/bolt";
import dotenv from "dotenv";

dotenv.config({ path: "./.env.local" });

const appId = process.env.GITHUB_APP_ID;
const privateKey = process.env.GITHUB_PRIVATE_KEY;
const repo = process.env.GITHUB_REPO;
const owner = process.env.GITHUB_OWNER;
const installationId = parseInt(process.env.GITHUB_INSTALLATION_ID);

const app = new App({ appId, privateKey });

const fetchGithubPullRequests = async () => {
  const octokit = await app.getInstallationOctokit(installationId);

  const pullRequests = await octokit.rest.pulls.list({ owner, repo });

  console.log(pullRequests.data.length);
  return pullRequests;
};

fetchGithubPullRequests();

const slackApp = new SlackApp({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

(async () => {
  await slackApp.start(3000);
  await slackApp.client.chat.postMessage({
    channel: 'C02927N8F1V',
    text: 'Hello live github hack team!'
  });
})();
