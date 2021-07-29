import { App as GithubApp } from "octokit";
import {
  App as SlackApp,
  ExpressReceiver as SlackExpressReceiver,
} from "@slack/bolt";
import dotenv from "dotenv";
import express from "express";
import Raven from "raven";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import {
  addReviewersToChannel,
  createPullChannel,
  getSlackChannels,
  slackTextFromPullRequest,
} from "./slack";
import { addInitialComment, addComment } from "./github";
import { PullRequest } from "@octokit/webhooks-types";

dotenv.config({ path: "./.env.local" });

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

  let pullChannel = channels.find(
    (channel) => channel.name === `pr-${pull.number}-${pull.base.repo.name}`
  );

  if (!pullChannel) {
    console.log(`No channel for PR${pull.number}`);
    pullChannel = await createPullChannel(slackApp, pull);

    await addInitialComment(githubApp, pull, pullChannel);
  }

  if (!pullChannel.is_archived) {
    await addReviewersToChannel(slackApp, pull, pullChannel);

    const me = (await slackApp.client.auth.test()).bot_id;
    const botCommentResponse = await slackApp.client.conversations.history({
      channel: pullChannel.id,
      oldest: "0",
    });
    const botComment: Message = botCommentResponse.messages.filter(
      (message) => message.bot_id == me
    );

    if (botComment) {
      const slackText = slackTextFromPullRequest(pull);
      await slackApp.client.chat.update({
        channel: pullChannel.id,
        ts: botComment.ts,
        text: slackText,
      });
    } else {
      console.error("Could not find our own comment");
    }
  }

  if (pull.state === "closed") {
    console.log(`Channel ${pullChannel.name}: About to archive`);

    try {
      await slackApp.client.conversations.archive({ channel: pullChannel.id });
      console.log(`✅ Channel ${pullChannel.name}: Successfully archived`);
    } catch (error) {
      console.log(`❌ Channel ${pullChannel.name}: Failed to archive`);
      console.log(error);
    }
  }
};

webhooks.on("pull_request", async ({ payload }) => {
  await onChangePull(payload.pull_request);
});

slackApp.command("/add-pr-comment", async ({ command, ack, say }) => {
  await ack();
  await addComment(githubApp, command, say);
});

const port = process.env.PORT || "3000";
expressApp.listen(parseInt(port));

console.log("✅ Completed all task, woohoo!!");
