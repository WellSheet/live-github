import { App as GithubApp } from "octokit";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

export const addComment = async (
  githubApp: GithubApp,
  issue_number: number,
  channel: Channel
) => {
  const octokit = await githubApp.getInstallationOctokit(
    parseInt(process.env.GITHUB_INSTALLATION_ID)
  );

  try {
    await octokit.rest.issues.createComment({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      issue_number,
      body: `https://slack.com/app_redirect?channel=${channel.id}`,
    });

    console.log("done adding comment to pr");
  } catch (error) {
    console.log(error);
  }
};
