import { PullRequest, User } from "@octokit/webhooks-types";
import { App as SlackApp } from "@slack/bolt";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

const gitUserToSlackId = JSON.parse(process.env.GIT_USER_TO_SLACK_ID);

export const getSlackChannels = async (slackApp: SlackApp) => {
  try {
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

    console.log("✅ Success - fetched all channels");
    return allChannels;
  } catch (error) {
    console.log("❌ Error - fetched all channels");
    console.log(error);
  }
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
    channel.topic.value.split(" ")[0] === ":x: Not Approved &lt;&gt; test"
      ? true
      : false;

  console.log(`mergeStatusInTopic: ❌ ${channel.topic.value.split("<>")[0]} ❌`);

  if (mergeStatusInTopic !== pull.mergeable) {
    const topic = `${pull.mergeable ? "❌ Not" : "✅"} Approved <> ${
      pull.title
    }`;

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

    const topic = `${pull.mergeable ? "❌ Not" : "✅"} Approved <> ${
      pull.title
    }`;

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
    let allMembers: string[] = [];
    const members = await slackApp.client.conversations.members({
      channel: channel.id,
    });

    let nextCursor = members.response_metadata.next_cursor;
    while (nextCursor) {
      const moreMembers = await slackApp.client.conversations.members({
        channel: channel.id,
        cursor: nextCursor,
      });

      allMembers = [...allMembers, ...moreMembers.members];
      nextCursor = moreMembers.response_metadata.next_cursor;
    }

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
