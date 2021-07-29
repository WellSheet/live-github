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

  const commentBody = `A Slack Channel was created for discussion of this PR :tada:

The channel name is \`${channel.name}\`. All the reviewers have been invited to the channel, and it will be archived when the PR closes.

[Click Here to open the channel](https://slack.com/app_redirect?channel=${channel.id})`;

  try {
    await octokit.rest.issues.createComment({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      issue_number,
      body: commentBody,
    });

    console.log(`✅ Channel ${channel.name}: Successfully added initial comment`);
  } catch (error) {
    console.log(
      `❌ Channel ${channel.name}: Failed to added initial comment`
    );
    console.log(error)
  }
};
