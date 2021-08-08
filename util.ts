import { PullRequest } from '@octokit/webhooks-types'

export const channelNameFromParts = (repoName: string, pullNumber: number | string): string =>
  `pr-${pullNumber}-${repoName}`

export const channelNameFromPull = (pull: Pick<PullRequest, 'number' | 'base'>): string =>
  channelNameFromParts(pull.base.repo.name, pull.number)

export const pathToAppUrl = (path: string): string => {
  const modifiedPath = path.startsWith('/') ? path : `/${path}`

  return `${process.env.BASE_URL}${modifiedPath}`
}
