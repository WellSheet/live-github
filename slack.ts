import { PullRequest } from '@octokit/webhooks-types'
import { App as SlackApp } from '@slack/bolt'
import { Channel } from '@slack/web-api/dist/response/ConversationsListResponse'
import dotenv from 'dotenv'
import { Message } from '@slack/web-api/dist/response/ConversationsHistoryResponse'
import { channelNameFromParts } from './util'
import { compact } from 'lodash'

dotenv.config({ path: './.env.local' })

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

type CreatePullChannelPullRequest = Pick<PullRequest, 'html_url' | 'number' | 'title' | 'body'>

export const slackTextFromPullRequest = (pull: CreatePullChannelPullRequest): string => {
  return `
PR Opened! <${pull.html_url}|#${pull.number}>

PR Title: \`${pull.title}\`
PR Description:
\`\`\`
${pull.body}
\`\`\`
`
}

export const createPullChannel = async (
  slackApp: SlackApp,
  repoName: string,
  pull: CreatePullChannelPullRequest,
): Promise<Channel> => {
  try {
    const newChannel = await slackApp.client.conversations.create({
      name: channelNameFromParts(repoName, pull.number),
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

const getAllMembers = async (slackApp: SlackApp, channel: Channel) => {
  if (!channel.id) return []

  const members = await slackApp.client.conversations.members({
    channel: channel.id,
  })
  const allMembers: string[] = await paginate(slackApp, members, x => x.members)

  return allMembers
}

type AddReviewersToChannelPullRequest = Pick<PullRequest, 'number'> & {
  user: { login: string } | null
  requested_reviewers?: ({ login?: string } | null)[] | null
}

export const addReviewersToChannel = async (
  slackApp: SlackApp,
  pull: AddReviewersToChannelPullRequest,
  channel: Channel,
) => {
  try {
    const allMembers = await getAllMembers(slackApp, channel)

    const reviewers =
      pull.requested_reviewers?.map(reviewer => reviewer && reviewer.login && gitUserToSlackId[reviewer.login]) || []

    const potentialInvitees = compact([pull.user && gitUserToSlackId[pull.user.login], ...reviewers])
    const invitees = potentialInvitees.filter(reviewer => !allMembers || !allMembers.includes(reviewer))

    if (invitees.length && channel.id) {
      await slackApp.client.conversations.invite({
        channel: channel.id,
        emails: [],
        users: invitees.join(','),
      })
    }

    console.log(`✅ PR#${pull.number}: Successfully added ${invitees.join(',')}`)
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to add requested reviewers to slack channel`)
    console.log(error)
    throw error
  }
}
