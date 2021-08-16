import { App as GithubApp } from 'octokit'
import { Channel } from '@slack/web-api/dist/response/ConversationsListResponse'
import { SayFn, SlashCommand } from '@slack/bolt'
import { PullRequest, PullRequestReviewComment, IssueComment } from '@octokit/webhooks-types'
import { channelNameFromPull, pathToAppUrl } from './util'

const GITHUB_COMMENT_MARKER = 'live-github-managed-comment'

export const addOrUpdateManagedComment = async (githubApp: GithubApp, pull: PullRequest): Promise<void> => {
  const octokit = await githubApp.getInstallationOctokit(parseInt(process.env.GITHUB_INSTALLATION_ID!))
  const channelName = channelNameFromPull(pull)
  const openSlackUrl = pathToAppUrl(`/app/openSlackChannel/v1/${pull.base.repo.name}/${pull.number}`)

  const hasExistingComment = pull.body
    ?.split('\n')
    .includes('<!-- Do NOT delete these comments. They are used by Live Github to track this Pull Request -->')

  console.log(pull.body?.split('\n').length)
  console.log(pull.body?.split('\n'))

  const commentBody = `
<!-- Do NOT delete these comments. They are used by Live Github to track this Pull Request -->
<!-- ${GITHUB_COMMENT_MARKER} -->

-----

LiveGithub is listening to this PR :ear:

LiveGithub can create a Slack Channel specifcally for this PR. When it's created all the reviewers will be invited to the channel, and it will be archived when the PR closes.

The channel name will be \`${channelName}\`.

[Click Here to Create and Open the channel](${openSlackUrl})
`.trim()

  if (!hasExistingComment) {
    try {
      await octokit.rest.pulls.update({
        owner: process.env.GITHUB_OWNER!,
        repo: pull.base.repo.name,
        pull_number: pull.number,
        body: pull.body + commentBody,
      })

      console.log(`✅ Channel ${channelName}: Successfully added initial comment`)
    } catch (error) {
      console.log(`❌ Channel ${channelName}: Failed to add initial comment`)
      console.log(error)
      throw error
    }
  }
}

export const addComment = async (githubApp: GithubApp, command: SlashCommand, say: SayFn): Promise<void> => {
  const octokit = await githubApp.getInstallationOctokit(parseInt(process.env.GITHUB_INSTALLATION_ID!))

  const splitName = command.channel_name.split('-')
  const repoName = splitName.slice(2).join('-')

  const pullNumber = parseInt(splitName[1])
  const githubBody = `**${command.user_name}** says:\n${command.text}`
  const slackBody = `*${command.user_name}* says:\n${command.text}\n_Comment posted to Github_`

  try {
    await octokit.rest.issues.createComment({
      owner: process.env.GITHUB_OWNER!,
      repo: repoName,
      issue_number: pullNumber,
      body: githubBody,
    })

    say(slackBody)
    console.log(`✅ Channel ${command.channel_name}: Successfully added a comment`)
  } catch (error) {
    console.log(`❌ Channel ${command.channel_name}: Failed to add a comment`)
    console.log(error)
    throw error
  }
}

export const getApproveReview = async (githubApp: GithubApp, pull: PullRequest) => {
  try {
    const octokit = await githubApp.getInstallationOctokit(parseInt(process.env.GITHUB_INSTALLATION_ID!))

    const reviewComments = await octokit.rest.pulls.get({
      owner: process.env.GITHUB_OWNER!,
      repo: pull.base.repo.name,
      pull_number: pull.number,
    })

    console.log(reviewComments.data)
    console.log(`✅ PR#${pull.number}: Successfully fetched reviews`)
    return reviewComments
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to fetch reviews`)
    console.log(error)
    throw error
  }
}

export const getReviewComments = async (githubApp: GithubApp, pull: Pick<PullRequest, 'number' | 'base'>) => {
  try {
    const octokit = await githubApp.getInstallationOctokit(parseInt(process.env.GITHUB_INSTALLATION_ID!))

    const reviewComments = await octokit.rest.pulls.listReviewComments({
      owner: process.env.GITHUB_OWNER!,
      repo: pull.base.repo.name,
      pull_number: pull.number,
    })

    console.log(`✅ PR#${pull.number}: Successfully fetched review comments`)
    return reviewComments.data
  } catch (error) {
    console.log(`❌ PR#${pull.number}: Failed to fetch review comments`)
    console.log(error)
    throw error
  }
}

export const getPullComments = async (githubApp: GithubApp, pull: Pick<PullRequest, 'number' | 'base'>) => {
  const octokit = await githubApp.getInstallationOctokit(parseInt(process.env.GITHUB_INSTALLATION_ID!))

  const response = await octokit.rest.issues.listComments({
    owner: process.env.GITHUB_OWNER!,
    repo: pull.base.repo.name,
    issue_number: pull.number,
  })

  return response.data
}

export const getPullRequest = async (githubApp: GithubApp, repoName: string, pullNumber: number) => {
  const octokit = await githubApp.getInstallationOctokit(parseInt(process.env.GITHUB_INSTALLATION_ID!))

  const response = await octokit.rest.pulls.get({
    owner: process.env.GITHUB_OWNER!,
    repo: repoName,
    pull_number: pullNumber,
  })

  return response.data
}

export const postReviewComentReply = async (
  githubApp: GithubApp,
  pull: Pick<PullRequest, 'number' | 'base'>,
  comment_id: number,
  reply: string,
) => {
  const octokit = await githubApp.getInstallationOctokit(parseInt(process.env.GITHUB_INSTALLATION_ID!))

  return octokit.rest.pulls.createReplyForReviewComment({
    owner: process.env.GITHUB_OWNER!,
    repo: pull.base.repo.name,
    pull_number: pull.number,
    comment_id,
    body: reply,
  })
}
