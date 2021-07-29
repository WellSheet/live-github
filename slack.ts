import { PullRequest, User } from "@octokit/webhooks-types";
import { App as SlackApp } from "@slack/bolt";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

const gitUserToSlackId = JSON.parse(process.env.GIT_USER_TO_SLACK_ID);

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

export const slackTextFromPullRequest = (pull: PullRequest): string => {
return `
PR Opened! <${pull.url}|#${pull.number}>

PR Title: \`${pull.title}\`
PR Description:
\`\`\`
${pull.body}
\`\`\`
`;
}

export const createPullChannel = async (
  slackApp: SlackApp,
  pull: PullRequest
): Promise<Channel> => {
  const newChannel = await slackApp.client.conversations.create({
    name: `pr-${pull.number}`,
  });

  // send the body as the first message
  if (pull.body) {
    const text = slackTextFromPullRequest(pull);

    await slackApp.client.chat.postMessage({
      channel: newChannel.channel.id,
      text,
    });
  }

  // add a topic to the channel
  await slackApp.client.conversations.setTopic({
    channel: newChannel.channel.id,
    topic: pull.title,
  });

  return newChannel.channel;
};

export const addReviewersToChannel = async (
  slackApp: SlackApp,
  pull: PullRequest,
  channel: Channel
) => {
  const reviewersString = pull.requested_reviewers
    .map((reviewer: User) => {
      return gitUserToSlackId[reviewer.login];
    })
    .concat(gitUserToSlackId[pull.user.login])
    .join(",");

  try {
    await slackApp.client.conversations.invite({
      channel: channel.id,
      emails: [],
      users: reviewersString,
    });
    console.log(`PR#${pull.number}: Successfully added ${reviewersString}`);
  } catch (_) {
    console.log(`PR#${pull.number}: Failed to add ${reviewersString}`);
  }
};
