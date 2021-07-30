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
  getChannelHistory,
  getSlackChannels,
  gitUserToSlackId,
  slackTextFromPullRequest,
} from "./slack";
import {
  PullRequest,
  PullRequestReviewComment,
  PullRequestReviewSubmittedEvent,
} from "@octokit/webhooks-types";
import { minBy, sortBy, flatten } from "lodash";
import { addInitialComment, addComment, getApproveReview, postReviewComentReply, getReviewComments } from "./github";
import { Message } from "@slack/web-api/dist/response/ConversationsHistoryResponse";

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

const channelNameFromPull = (pull: Pick<PullRequest, 'number' | 'base'>): string => `pr-${pull.number}-${pull.base.repo.name}`

const onChangePull = async (pull: PullRequest) => {
  console.log("onChangePull() called");

  const channels = await getSlackChannels(slackApp);

  let pullChannel = channels.find(
    channel => channel.name === channelNameFromPull(pull)
  );

  if (!pullChannel) {
    console.log(`No channel for PR${pull.number}`);
    pullChannel = await createPullChannel(slackApp, pull);

    await addInitialComment(githubApp, pull, pullChannel);
  }

  if (!pullChannel.is_archived) {
    await addReviewersToChannel(slackApp, pull, pullChannel);

    const me = (await slackApp.client.auth.test()).bot_id;
    const messages: Message[] = await getChannelHistory(slackApp, pullChannel);
    const botComment: Message = minBy(
      messages.filter((message) => message.bot_id == me),
      (message: Message) => message.ts
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

const onSubmitPullRequestReview = async (
  payload: PullRequestReviewSubmittedEvent
) => {
  const { review, pull_request: pull } = payload;

  if (review.state === "approved") {
    const channels = await getSlackChannels(slackApp);

    let pullChannel = channels.find(
      (channel) => channel.name === `pr-${pull.number}-${pull.base.repo.name}`
    );

    try {
      await slackApp.client.chat.postMessage({
        channel: pullChannel.id,
        text: `✅ <!here> ${review.user.login} approved this PR!`,
      });

      console.log(
        `✅ Channel ${pullChannel.name} - Successfully sent PR approval message`
      );
    } catch (error) {
      console.log(
        `❌ Channel ${pullChannel.name} - Failed to send PR approval message`
      );
      console.log(error);
    }
  }
};

webhooks.on("pull_request_review.submitted", async (data) => {
  await onSubmitPullRequestReview(data.payload);
});

webhooks.on("pull_request_review_comment.created", async ({payload}) => {
  const { comment, pull_request } = payload;
  if (comment.body.toLowerCase().includes("take this to slack")) {
    const channelName = channelNameFromPull(pull_request);

    const channels = await getSlackChannels(slackApp);

    const pullChannel = channels.find(
      channel => channel.name === channelName
    );


    const allComments = await getReviewComments(githubApp, pull_request)
    const relevantComments = allComments.filter(c => c.in_reply_to_id === comment.in_reply_to_id || c.id === comment.id)
    const contextComments: PullRequestReviewComment[] = sortBy(relevantComments, (comment: PullRequestReviewComment) => comment.created_at).slice(-15)



    const msgContext = contextComments.map(comment => `Written By: ${comment.user.login}\n${comment.body}`).join('\n\n')
    const firstMessageText = `:sonic: We are moving to Slack!\n\n${msgContext}`;

    const contextBlocks = flatten(contextComments.map(comment => (
      [
        {
          type: "section",
          text: {
            type: "plain_text",
            text: comment.body,
            emoji: true
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Written by *${comment.user.login}* ${gitUserToSlackId[comment.user.login]}`
            }
          ]
        },
        {
          type: "divider"
        }
      ]
    )))
    contextBlocks.pop()

    const blocks = [{
          type: "section",
          text: {
            type: "mrkdwn",
            text: ":sonic: We are moving to Slack! Here is the context from Github (most recent 15 comments)",
            emoji: true
          }
        }].concat(contextBlocks);

        console.log(blocks.map(x => JSON.stringify(x)));

    const firstSlackComment = await slackApp.client.chat.postMessage({ channel: pullChannel.id, text: firstMessageText, blocks: blocks, unfurl_links: false, unfurl_media: false });

    const slackUrlResponse = await slackApp.client.chat.getPermalink({ channel: pullChannel.id, message_ts: firstSlackComment.ts })

    const githubCommentText = `We made a thread for you! Check it out here: ${slackUrlResponse.permalink}`

    await postReviewComentReply(githubApp, pull_request, comment.in_reply_to_id || comment.id, githubCommentText)
  }
});

slackApp.command("/add-pr-comment", async ({ command, ack, say, respond }) => {
  await ack();
  if (!command.channel_name.startsWith("pr"))
    await respond({
      response_type: "ephemeral",
      text: "This slash command can only be used in Pull Request Channels",
    });
  await addComment(githubApp, command, say);
});

const port = process.env.PORT || "3000";
expressApp.listen(parseInt(port));

console.log("✅ Completed all task, woohoo!!");
