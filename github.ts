import { App as GithubApp } from "octokit";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { SlashCommand } from "@slack/bolt";

export const addSlackLinkComment = async (
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

    console.log("done adding slack link comment to pr");
  } catch (error) {
    console.log(error);
  }
};

export const addComment = async (
  githubApp: GithubApp,
  command: SlashCommand,
) => {
  const octokit = await githubApp.getInstallationOctokit(
    parseInt(process.env.GITHUB_INSTALLATION_ID)
  );

  const pull_number = parseInt(command.channel_name.split('-')[1])

  try {
    await octokit.rest.issues.createComment({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      issue_number: pull_number,
      body: command.text,
    });

    console.log("done adding comment to pr");
  } catch (error) {
    console.log(error);
  }
};

