import { App as SlackApp } from "@slack/bolt";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

export const getSlackChannels = async (slackApp: SlackApp) => {
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

export const getPrChannels = (channels: Channel[]) => {
  return channels.filter((channel) =>
    channel.name.slice(0, 3) === "pr-" ? true : false
  );
};

export const createPullChannel = async (
  slackApp: SlackApp,
  pull
): Promise<Channel> => {
  const newChannel = await slackApp.client.conversations.create({
    name: `pr-${pull.number}`,
  });

  if (pull.body) {
    await slackApp.client.chat.postMessage({
      channel: newChannel.channel.id,
      text: pull.body,
    });
  }

  return newChannel.channel;
};
