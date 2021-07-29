import { App as SlackApp } from "@slack/bolt";

const slackApp = new SlackApp({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const mapGithubUserToSlackId = async () => {
  const gitUserToSlackEmail = JSON.parse(process.env.GIT_USER_TO_SLACK_EMAIL);

  const allSlackUsers = await slackApp.client.users.list();

  const emailToSlackIdMap = {};

  allSlackUsers.members.forEach((member) => {
    emailToSlackIdMap[member.profile.email] = member.id;
  });

  const gitUserToSlackId = Object.keys(gitUserToSlackEmail).map((gitUser) => {
    const email = gitUserToSlackEmail[gitUser];

    const slackId = emailToSlackIdMap[email];

    return { gitUser, slackId };
  });

  console.log(gitUserToSlackId);
};
