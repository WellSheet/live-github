import { PullRequest, User } from "@octokit/webhooks-types";
import { App as SlackApp } from "@slack/bolt";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { Message } from "@slack/web-api/dist/response/ConversationsHistoryResponse";

const gitUserToSlackId = JSON.parse(process.env.GIT_USER_TO_SLACK_ID);

const paginate = async <T>(
  slackApp: SlackApp,
  initialQuery: any,
  extractElements: (query: any) => T[]
): Promise<T[]> => {
  let collection = extractElements(initialQuery);

  let nextCursor = initialQuery.response_metadata.next_cursor;
  while (nextCursor) {
    const moreElements = await slackApp.client.conversations.list({
      cursor: nextCursor,
    });

    collection = [...collection, ...extractElements(moreElements)];
    nextCursor = moreElements.response_metadata.next_cursor;
  }

  return collection;
};

export const getSlackChannels = async (slackApp: SlackApp) => {
  try {
    const initChannels = await slackApp.client.conversations.list();
    const allChannels: Channel[] = await paginate(
      slackApp,
      initChannels,
      (x) => x.channels
    );

    console.log("✅ Success - fetched all channels");
    return allChannels;
  } catch (error) {
    console.log("❌ Error - fetched all channels");
    console.log(error);
  }
};

export const getChannelHistory = async (
  slackApp: SlackApp,
  channel: Channel
): Promise<Message[]> => {
  const botCommentResponse = await slackApp.client.conversations.history({
    channel: channel.id,
    oldest: "0",
  });

  return await paginate(slackApp, botCommentResponse, (x) => x.messages);
};

export const slackTextFromPullRequest = (pull: PullRequest): string => {
  return `
PR Opened! <${pull.html_url}|#${pull.number}>

PR Title: \`${pull.title}\`
PR Description:
\`\`\`
${pull.body}
\`\`\`
`;
};

export const updateChannelTopic = async (
  slackApp: SlackApp,
  pull: PullRequest,
  channel: Channel
) => {
  const mergeStatusInTopic =
    channel.topic.value.split(" | ")[0] === "false" ? false : true;

  console.log(`mergeStatusInTopic: ${mergeStatusInTopic}`);

  if (mergeStatusInTopic !== pull.mergeable) {
    const topic = `${pull.mergeable} | ${pull.title}`;
    console.log("mergeStatusInTopic !== pull.mergeable");

    try {
      await slackApp.client.conversations.setTopic({
        channel: channel.id,
        topic,
      });

      console.log(
        `✅ Channel ${channel.name}: Successfully updated the mergeable status in topic`
      );
    } catch (error) {
      console.log(
        `❌ Channel ${channel.name}: Failed to update the mergeable status in topic`
      );
      console.log(error);
    }
  }
};

export const createPullChannel = async (
  slackApp: SlackApp,
  pull: PullRequest
): Promise<Channel> => {
  try {
    const newChannel = await slackApp.client.conversations.create({
      name: `pr-${pull.number}-${pull.base.repo.name}`,
    });

    const text = slackTextFromPullRequest(pull);
    await slackApp.client.chat.postMessage({
      channel: newChannel.channel.id,
      text,
      unfurl_links: false,
    });

    const topic = `${pull.mergeable} | ${pull.title}`;

    // add a topic to the channel
    await slackApp.client.conversations.setTopic({
      channel: newChannel.channel.id,
      topic,
    });

    console.log(`✅ PR#${pull.number}: Successfully created channel`);
    return newChannel.channel;
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to create channel`);
    console.log(error);
  }
};

const getAllMembers = async (
  slackApp: SlackApp,
  pull: PullRequest,
  channel: Channel
) => {
  try {
    const members = await slackApp.client.conversations.members({
      channel: channel.id,
    });
    const allMembers: string[] = await paginate(
      slackApp,
      members,
      (x) => x.members
    );

    console.log(`✅ PR#${pull.number}: Successfully fetched all slack members`);
    return allMembers;
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to fetched all slack members`);
    console.log(error);
  }
};

export const addReviewersToChannel = async (
  slackApp: SlackApp,
  pull: PullRequest,
  channel: Channel
) => {
  try {
    const allMembers = await getAllMembers(slackApp, pull, channel);

    const reviewers = pull.requested_reviewers
      .map((reviewer: User) => gitUserToSlackId[reviewer.login])
      .concat(gitUserToSlackId[pull.user.login]);

    const reviewerToInvite = reviewers.some(
      (reviewer) => !allMembers.includes(reviewer)
    );

    const reviewersString = reviewers.join(",");

    if (reviewerToInvite) {
      await slackApp.client.conversations.invite({
        channel: channel.id,
        emails: [],
        users: reviewersString,
      });
    }

    console.log(`✅ PR#${pull.number}: Successfully added ${reviewersString}`);
  } catch (error) {
    console.log(
      `❌ PR#${pull.number}: Failed to add requested reviewers to slack channel`
    );
    console.log(error);
  }
};
