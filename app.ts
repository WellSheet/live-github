import { App as GithubApp } from "octokit";
import {
  App as SlackApp,
  ExpressReceiver as SlackExpressReceiver,
} from "@slack/bolt";
import dotenv from "dotenv";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import express from "express";
import Raven from "raven";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { createPullChannel, getSlackChannels } from "./slack";
import { addComment } from "./github";
import { PullRequest, User } from "@octokit/webhooks-types";

dotenv.config({ path: "./.env.local" });

const repo = process.env.GITHUB_REPO;
const owner = process.env.GITHUB_OWNER;
const gitUserToSlackId = JSON.parse(process.env.GIT_USER_TO_SLACK_ID);

const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

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

  if (!pullChannel.is_archived) {
    console.log(
      pull.requested_reviewers.map((reviewer: User) => reviewer.login)
    );

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
  }

  if (pull.state === "closed") {
    await slackApp.client.conversations.archive({ channel: pullChannel.id });
  }
};

webhooks.on("pull_request", async ({ payload }) => {
  await onChangePull(payload.pull_request);
});

const port = process.env.PORT || "3000";
expressApp.listen(parseInt(port));

console.log("Completed all task, woohoo!!");
