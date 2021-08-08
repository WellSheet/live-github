import { PullRequest, User } from '@octokit/webhooks-types'
import { App as SlackApp } from '@slack/bolt'
import { Channel } from '@slack/web-api/dist/response/ConversationsListResponse'
import { Message } from '@slack/web-api/dist/response/ConversationsHistoryResponse'

export const gitUserToSlackId = JSON.parse(process.env.GIT_USER_TO_SLACK_ID!)

const paginate = async <T>(
  slackApp: SlackApp,
  initialQuery: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  extractElements: (query: any) => T[], // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> => {
  let collection = extractElements(initialQuery)

  let nextCursor = initialQuery.response_metadata.next_cursor
  while (nextCursor) {
    // TODO: Ummmm this is very broken lol
    // The method below is hard-coded. Need to fix this
    const moreElements = await slackApp.client.conversations.list({
      cursor: nextCursor,
    })

    collection = [...collection, ...extractElements(moreElements)]
    nextCursor = moreElements?.response_metadata?.next_cursor
  }

  return collection
}

export const getSlackChannels = async (slackApp: SlackApp): Promise<Channel[]> => {
  try {
    const initChannels = await slackApp.client.conversations.list()
    const allChannels: Channel[] = await paginate(slackApp, initChannels, x => x.channels)

    console.log('✅ Success - fetched all channels')
    return allChannels
  } catch (error) {
    console.log('❌ Error - fetched all channels')
    console.log(error)
    throw error
  }
}

export const getChannelHistory = async (slackApp: SlackApp, channel: Channel): Promise<Message[]> => {
  if (!channel.id) return []

  const botCommentResponse = await slackApp.client.conversations.history({
    channel: channel.id,
    oldest: '0',
  })

  return await paginate(slackApp, botCommentResponse, x => x.messages)
}

export const slackTextFromPullRequest = (pull: PullRequest): string => {
  return `
PR Opened! <${pull.html_url}|#${pull.number}>

PR Title: \`${pull.title}\`
PR Description:
\`\`\`
${pull.body}
\`\`\`
`
}

export const createPullChannel = async (slackApp: SlackApp, pull: PullRequest): Promise<Channel> => {
  try {
    const newChannel = await slackApp.client.conversations.create({
      name: `pr-${pull.number}-${pull.base.repo.name}`,
    })
    const newChannelId = newChannel.channel!.id!

    const text = slackTextFromPullRequest(pull)
    await slackApp.client.chat.postMessage({
      channel: newChannelId,
      text,
      unfurl_links: false,
    })

    // add a topic to the channel
    await slackApp.client.conversations.setTopic({
      channel: newChannelId,
      topic: pull.title,
    })

    if (!newChannel.channel) throw 'Channel was not in createChannelResponse'

    console.log(`✅ PR#${pull.number}: Successfully created channel`)
    return newChannel.channel
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to create channel`)
    console.log(error)
    throw error
  }
}

const getAllMembers = async (slackApp: SlackApp, pull: PullRequest, channel: Channel) => {
  if (!channel.id) return []

  try {
    const members = await slackApp.client.conversations.members({
      channel: channel.id,
    })
    const allMembers: string[] = await paginate(slackApp, members, x => x.members)

    console.log(`✅ PR#${pull.number}: Successfully fetched all slack members`)
    return allMembers
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to fetched all slack members`)
    console.log(error)
    throw error
  }
}

export const addReviewersToChannel = async (slackApp: SlackApp, pull: PullRequest, channel: Channel) => {
  try {
    const allMembers = await getAllMembers(slackApp, pull, channel)

    const reviewers = pull.requested_reviewers
      .map(reviewer => 'login' in reviewer && gitUserToSlackId[reviewer.login])
      .concat(gitUserToSlackId[pull.user.login])

    const reviewerToInvite = reviewers.some(reviewer => !allMembers || !allMembers.includes(reviewer))

    const reviewersString = reviewers.join(',')

    if (reviewerToInvite && channel.id) {
      await slackApp.client.conversations.invite({
        channel: channel.id,
        emails: [],
        users: reviewersString,
      })
    }

    console.log(`✅ PR#${pull.number}: Successfully added ${reviewersString}`)
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to add requested reviewers to slack channel`)
    console.log(error)
    throw error
  }
}
