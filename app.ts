import { App as GithubApp } from "octokit";
import { App as SlackApp } from "@slack/bolt";
import dotenv from "dotenv";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

dotenv.config({ path: "./.env.local" });

const repo = process.env.GITHUB_REPO;
const owner = process.env.GITHUB_OWNER;

const MAX_SLACK_CHANNEL_LENGTH = 80;

const githubApp = new GithubApp({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_PRIVATE_KEY,
});

const slackApp = new SlackApp({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const GithubUserToEmail = Object.freeze({
  ming1in: "ming@wellsheet.com",
  gnaratil2017: "greg@wellsheet.com",
});

const getPrChannelNumbers = (channels: Channel[]) =>
  channels.map((channel) => parseInt(channel.name.slice(3)));

const getSlackChannels = async () => {
  let allChannels: Channel[] = [];

  const initChannels = await slackApp.client.conversations.list({
    exclude_archived: true,
  });

  allChannels = initChannels.channels;

  let nextCursor = initChannels.response_metadata.next_cursor;

  while (nextCursor) {
    const moreChannels = await slackApp.client.conversations.list({
      exclude_archived: true,
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
  await slackApp.start(3000);

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
    const channelNumber = parseInt(channel.name.slice(3));
    return !openPrNumbers.includes(channelNumber) ? true : false;
  });

  //find PRs to open channels for
  const pullsWithoutChannel = pulls.data.filter((pull) =>
    !prChannelsNumber.includes(pull.number) ? true : false
  );

  console.log(prChannelsNumber);
  console.log(pullsWithoutChannel.map((pull) => pull));
  console.log(toArchiveChannels);
})();
