import { App as GithubApp } from "octokit";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { SayFn, SlashCommand } from "@slack/bolt";
import { PullRequest, PullRequestReviewComment } from "@octokit/webhooks-types";

export const addInitialComment = async (
  githubApp: GithubApp,
  pull: PullRequest,
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
      repo: pull.base.repo.name,
      issue_number: pull.number,
      body: commentBody,
    });

    console.log(
      `✅ Channel ${channel.name}: Successfully added initial comment`
    );
  } catch (error) {
    console.log(`❌ Channel ${channel.name}: Failed to add initial comment`);
    console.log(error);
  }
};

export const addComment = async (
  githubApp: GithubApp,
  command: SlashCommand,
  say: SayFn
) => {
  const octokit = await githubApp.getInstallationOctokit(
    parseInt(process.env.GITHUB_INSTALLATION_ID)
  );

  const splitName = command.channel_name.split("-");
  const repoName = splitName.slice(2).join("-");

  const pull_number = parseInt(splitName[1]);
  const body = `*${command.user_name}* says:\n${command.text}`;

  try {
    await octokit.rest.issues.createComment({
      owner: process.env.GITHUB_OWNER,
      repo: repoName,
      issue_number: pull_number,
      body,
    });

    say(`${body}\n_Comment posted to Github_`);
    console.log(
      `✅ Channel ${command.channel_name}: Successfully added a comment`
    );
  } catch (error) {
    console.log(`❌ Channel ${command.channel_name}: Failed to add a comment`);
    console.log(error);
  }
};

export const getApproveReview = async (
  githubApp: GithubApp,
  pull: PullRequest
) => {
  try {
    const octokit = await githubApp.getInstallationOctokit(
      parseInt(process.env.GITHUB_INSTALLATION_ID)
    );

    const reviewComments = await octokit.rest.pulls.get({
      owner: process.env.GITHUB_OWNER,
      repo: pull.base.repo.name,
      pull_number: pull.number,
    });

    console.log(reviewComments.data);
    console.log(`✅ PR#${pull.number}: Successfully fetched reviews`);
    return reviewComments;
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to fetch reviews`);
    console.log(error);
  }
};

export const getReviewComments = async (
  githubApp: GithubApp,
  pull: Pick<PullRequest, "number" | "base">,
) => {
  try {
    const octokit = await githubApp.getInstallationOctokit(
      parseInt(process.env.GITHUB_INSTALLATION_ID)
    );

    const reviewComments = await octokit.rest.pulls.listReviewComments({
      owner: process.env.GITHUB_OWNER,
      repo: pull.base.repo.name,
      pull_number: pull.number,
    });

    console.log(`✅ PR#${pull.number}: Successfully fetched review comments`);
    return reviewComments.data as PullRequestReviewComment[];
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to fetch review comments`);
    console.log(error);
  }
};

export const postReviewComentReply = async (
  githubApp: GithubApp,
  pull: Pick<PullRequest,'number' | 'base'>,
  comment_id: number,
  reply: string,
) => {
    const octokit = await githubApp.getInstallationOctokit(
      parseInt(process.env.GITHUB_INSTALLATION_ID)
    );

    return octokit.rest.pulls.createReplyForReviewComment({
      owner: process.env.GITHUB_OWNER,
      repo: pull.base.repo.name,
      pull_number: pull.number,
      comment_id,
      body: reply,
    })
}
