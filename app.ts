import { App as GithubApp } from "octokit";
import { App as SlackApp, ExpressReceiver as SlackExpressReceiver } from "@slack/bolt";
import dotenv from "dotenv";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import express from 'express';

dotenv.config({ path: "./.env.local" });

const repo = process.env.GITHUB_REPO;
const owner = process.env.GITHUB_OWNER;

const MAX_SLACK_CHANNEL_LENGTH = 80;

/// SETUP GITHUB WEBHOOKS
const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
import { Webhooks, createNodeMiddleware } from '@octokit/webhooks';
const webhooks = new Webhooks({
  secret: githubWebhookSecret,
});

webhooks.onAny(({ id, name, payload }) => {
  console.log(id, name, "event received");
});

const expressApp = express();

const receiver = new SlackExpressReceiver({ signingSecret: process.env.SLACK_SIGNING_SECRET });

const slackApp = new SlackApp({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
});

expressApp.use('api/github/webhooks', createNodeMiddleware(webhooks));
expressApp.use('/', receiver.router);

// require("http").createServer(createNodeMiddleware(webhooks)).listen(3000);
/// END WEBHOOKS

const githubApp = new GithubApp({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_PRIVATE_KEY,
});

const GithubUserToEmail = Object.freeze({
  ming1in: "ming@wellsheet.com",
  gnaratil2017: "greg@wellsheet.com",
});

const getPrChannelNumbers = (channels: Channel[]) =>
  channels.map((channel) => parseInt(channel.name.slice(3)));

const getSlackChannels = async () => {
  let allChannels: Channel[] = [];

  const initChannels = await slackApp.client.conversations.list();

  allChannels = initChannels.channels;

  let nextCursor = initChannels.response_metadata.next_cursor;

  while (nextCursor) {
    const moreChannels = await slackApp.client.conversations.list({
      cursor: nextCursor,
    });

    allChannels = [...allChannels, ...moreChannels.channels];
    nextCursor = moreChannels.response_metadata.next_cursor;
  }

  return allChannels;
};

const getPrChannels = (channels: Channel[]) => {
  return channels.filter((channel) =>
    channel.name.slice(0, 3) === "pr-" ? true : false
  );
};

(async () => {
  const port = process.env.PORT || '3000';
  expressApp.listen(parseInt(port));

  const octokit = await githubApp.getInstallationOctokit(
    parseInt(process.env.GITHUB_INSTALLATION_ID)
  );

  const allChannels = await getSlackChannels(); // fetch every channel

  const pulls = await octokit.rest.pulls.list({ owner, repo });
  const prChannels = getPrChannels(allChannels); // filter to get only channels for PRs

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
  await pullsWithoutChannel.map(async (pull) => {
    try {
      const newChannel = await slackApp.client.conversations.create({ name: `pr-${pull.number}` });
      await slackApp.client.chat.postMessage({
        channel: newChannel.channel.id,
        text: pull.body
      })

      console.log(`Successfully created channel for PR#${pull.number}`)
    } catch (_) {
      console.log(`Failed to create channel for PR#${pull.number}`)
    }
  });

  console.log(prChannelsNumber);
  console.log(pullsWithoutChannel.map((pull) => pull.number));
})();
