import { App as GithubApp } from "octokit";
import {
  App as SlackApp,
  ExpressReceiver as SlackExpressReceiver,
} from "@slack/bolt";
import dotenv from "dotenv";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import express from "express";
import Raven from "raven";

dotenv.config({ path: "./.env.local" });

const repo = process.env.GITHUB_REPO;
const owner = process.env.GITHUB_OWNER;
const gitUserToSlackId = JSON.parse(process.env.GIT_USER_TO_SLACK_ID);

const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { createPullChannel, getPrChannels, getSlackChannels } from "./slack";
import { addComment } from "./github";
import { PullRequest, User } from "@octokit/webhooks-types";
const webhooks = new Webhooks({
  secret: githubWebhookSecret,
});

const expressApp = express();

if (process.env.SENTRY_DSN) {
  Raven.config(process.env.SENTRY_DSN).install();

  expressApp.use(Raven.requestHandler());
  expressApp.use(Raven.errorHandler());
}

const receiver = new SlackExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const slackApp = new SlackApp({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
});

expressApp.use("/", createNodeMiddleware(webhooks));
expressApp.use("/", receiver.router);

const githubApp = new GithubApp({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_PRIVATE_KEY,
});

const onChangePull = async (pull: PullRequest) => {
  console.log("onChangePull() called");

  const channels = await getSlackChannels(slackApp);

  console.log(channels.length);

  let pullChannel = channels.find(
    (channel) => channel.name === `pr-${pull.number}`
  );

  console.log(pullChannel);

  if (!pullChannel) {
    console.log(`No channel for PR${pull.number}`);
    pullChannel = await createPullChannel(slackApp, pull);
    await addComment(githubApp, pull.number, pullChannel);
  }

  console.log(pull.requested_reviewers.map((reviewer: User) => reviewer.login));

  const reviewersString = pull.requested_reviewers
    .map((reviewer: User) => {
      return gitUserToSlackId[reviewer.login];
    })
    .join(",");

  console.log(reviewersString);

  slackApp.client.conversations.invite({
    channel: pullChannel.id,
    emails: [],
    users: reviewersString,
  });

  if (pull.state === "closed") {
    await slackApp.client.conversations.archive({ channel: pullChannel.id });
  }
};

webhooks.on("pull_request", async ({ payload }) => {
  await onChangePull(payload.pull_request);
});

const port = process.env.PORT || "3000";
expressApp.listen(parseInt(port));

const main = async () => {
  const octokit = await githubApp.getInstallationOctokit(
    parseInt(process.env.GITHUB_INSTALLATION_ID)
  );

  const allChannels = await getSlackChannels(slackApp); // fetch every channel

  const pulls = await octokit.rest.pulls.list({ owner, repo });
  const prChannels = getPrChannels(allChannels); // filter to get only channels for PRs

  const getReviewerUsernames = async (pull_number: number) => {
    const response = await octokit.rest.pulls.listRequestedReviewers({
      owner,
      repo,
      pull_number,
    });
    return response.data.users.map((user) => user.login);
  };

  const openPrNumbers = pulls.data.map((pull) => pull.number);
  const prChannelsNumber = prChannels.map((channel) =>
    parseInt(channel.name.slice(3))
  );

  //find channels to archive
  const toArchiveChannels = prChannels.filter((channel) => {
    const channelNumber = parseInt(channel.name.slice(3)),
      hasOpenPull = openPrNumbers.includes(channelNumber);

    return !hasOpenPull && !channel.is_archived ? true : false;
  });

  //archive channels with closed PRs
  toArchiveChannels.forEach((channel) => {
    slackApp.client.conversations
      .archive({ channel: channel.id })
      .then(() => console.log(`Successfully archived channel #${channel.name}`))
      .catch(() => console.log(`Failed to archived channel #${channel.name}`));
  });

  //find PRs to open channels for
  const pullsWithoutChannel = pulls.data.filter((pull) =>
    !prChannelsNumber.includes(pull.number) ? true : false
  );

  //create channels for PRs
  pullsWithoutChannel.map(async (pull) => {
    try {
      /*
      const newChannel = await slackApp.client.conversations.create({
        name: `pr-${pull.number}`,
      });

      if(pull.body){
        await slackApp.client.chat.postMessage({
          channel: newChannel.channel.id,
          text: pull.body,
        })
      }

      //get github reviewers slack id
      const reviewerUsernames = await getReviewerUsernames(pull.number);
      const usersString = reviewerUsernames.map(reviewer => gitUserToSlackId[reviewer]).join(',')

      slackApp.client.conversations.invite({
        channel: newChannel.channel.id,
        emails: [],
        users: usersString,
      });

      // add slack link to github body
      await octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number: pull.number,
        body: `https://slack.com/app_redirect?channel=${newChannel.channel.id}`,
      });

      console.log(`Successfully created channel for PR#${pull.number}`);
      */
    } catch (_) {
      console.log(`Failed to create channel for PR#${pull.number}`);
    }
  });

  console.log(prChannelsNumber);
  console.log(pullsWithoutChannel.map((pull) => pull.number));
};

console.log("Completed all task, woohoo!!");
