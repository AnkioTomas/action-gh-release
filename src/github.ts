import * as core from '@actions/core'
import {Config, isTag, releaseBody} from './util'
import {statSync, readFileSync} from 'fs'
import {getType} from 'mime'
import {basename} from 'path'
import {BaseRepository} from './repositories/BaseRepository'

export interface ReleaseAsset {
  name: string
  mime: string
  size: number
  data: Buffer
}

export interface Release {
  id: number
  upload_url: string
  html_url: string
  tag_name: string
  name: string | null
  body?: string | null | undefined
  target_commitish: string
  draft: boolean
  prerelease: boolean
  assets: {id: number; name: string}[]
}

export interface Releaser {
  getReleaseByTag(params: {owner: string; repo: string; tag: string}): Promise<{data: Release}>

  createRelease(params: {
    owner: string
    repo: string
    tag_name: string
    name: string
    body: string | undefined
    draft: boolean | undefined
    prerelease: boolean | undefined
    target_commitish: string | undefined
    discussion_category_name: string | undefined
    generate_release_notes: boolean | undefined
  }): Promise<{data: Release}>

  updateRelease(params: {
    owner: string
    repo: string
    release_id: number
    tag_name: string
    target_commitish: string
    name: string
    body: string | undefined
    draft: boolean | undefined
    prerelease: boolean | undefined
    discussion_category_name: string | undefined
    generate_release_notes: boolean | undefined
  }): Promise<{data: Release}>

  allReleases(params: {owner: string; repo: string}): AsyncIterableIterator<{data: Release[]}>
}

export class GitHubReleaser implements Releaser {
  constructor(private repository: BaseRepository) {}

  async getReleaseByTag(params: {owner: string; repo: string; tag: string}): Promise<{data: Release}> {
    return this.repository.getReleaseByTag(params)
  }

  async createRelease(params: {
    owner: string
    repo: string
    tag_name: string
    name: string
    body: string | undefined
    draft: boolean | undefined
    prerelease: boolean | undefined
    target_commitish: string | undefined
    discussion_category_name: string | undefined
    generate_release_notes: boolean | undefined
  }): Promise<{data: Release}> {
    return this.repository.createRelease(params)
  }

  async updateRelease(params: {
    owner: string
    repo: string
    release_id: number
    tag_name: string
    target_commitish: string
    name: string
    body: string | undefined
    draft: boolean | undefined
    prerelease: boolean | undefined
    discussion_category_name: string | undefined
    generate_release_notes: boolean | undefined
  }): Promise<{data: Release}> {
    return this.repository.updateRelease(params)
  }

  allReleases(params: {owner: string; repo: string}): AsyncIterableIterator<{data: Release[]}> {
    return this.repository.allReleases(params)
  }
}

export const asset = (path: string): ReleaseAsset => {
  return {
    name: basename(path),
    mime: mimeOrDefault(path),
    size: statSync(path).size,
    data: readFileSync(path)
  }
}

export const mimeOrDefault = (path: string): string => {
  return getType(path) || 'application/octet-stream'
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const upload = async (
  config: Config,
  repository: BaseRepository,
  url: string,
  path: string,
  currentAssets: {id: number; name: string}[],
  id: number
): Promise<any> => {
  const [owner, repo] = config.github_repository.split('/')
  const {name, size, mime, data: body} = asset(path)
  const currentAsset = currentAssets.find(({name: currentName}) => currentName === name)
  if (currentAsset) {
    core.info(`♻️ Deleting previously uploaded asset ${name}...`)
    await repository.deleteReleaseAsset({
      asset_id: currentAsset.id || 1,
      owner,
      repo,
      id
    })
  }
  core.info(`⬆️ Uploading ${name}...`)

  return repository.uploadAssets({
    url,
    name,
    mime,
    size,
    body,
    owner,
    repo,
    id
  })
}

export const release = async (config: Config, releaser: Releaser, maxRetries = 3): Promise<Release> => {
  if (maxRetries <= 0) {
    core.error(`❌ Too many retries. Aborting...`)
    throw new Error('Too many retries.')
  }

  const [owner, repo] = config.github_repository.split('/')
  const tag = config.input_tag_name || (isTag(config.github_ref) ? config.github_ref.replace('refs/tags/', '') : '')

  const discussion_category_name = config.input_discussion_category_name
  const generate_release_notes = config.input_generate_release_notes
  try {
    let existingRelease: Release = {} as Release

    if (config.input_draft) {
      // you can't get a an existing draft by tag
      // so we must find one in the list of all releases
      for await (const response of releaser.allReleases({
        owner,
        repo
      })) {
        const rel = response.data.find(r => r.tag_name === tag)
        if (rel) {
          existingRelease = rel
          break
        }
      }
    } else {
      existingRelease = (
        await releaser.getReleaseByTag({
          owner,
          repo,
          tag
        })
      ).data
    }

    const release_id = existingRelease.id
    let target_commitish: string
    if (config.input_target_commitish && config.input_target_commitish !== existingRelease.target_commitish) {
      core.info(`Updating commit from "${existingRelease.target_commitish}" to "${config.input_target_commitish}"`)
      target_commitish = config.input_target_commitish
    } else {
      target_commitish = existingRelease.target_commitish
    }

    const tag_name = tag
    const name = config.input_name || existingRelease.name || tag
    // revisit: support a new body-concat-strategy input for accumulating
    // body parts as a release gets updated. some users will likely want this while
    // others won't previously this was duplicating content for most which
    // no one wants
    const workflowBody = releaseBody(config) || ''
    const existingReleaseBody = existingRelease.body || ''
    let body: string
    if (config.input_append_body && workflowBody && existingReleaseBody) {
      body = `${existingReleaseBody}\n${workflowBody}`
    } else {
      body = workflowBody || existingReleaseBody
    }

    const draft = config.input_draft !== undefined ? config.input_draft : existingRelease.draft
    const prerelease = config.input_prerelease !== undefined ? config.input_prerelease : existingRelease.prerelease

    const rel = await releaser.updateRelease({
      owner,
      repo,
      release_id,
      tag_name,
      target_commitish,
      name,
      body,
      draft,
      prerelease,
      discussion_category_name,
      generate_release_notes
    })
    return rel.data
  } catch (error: any) {
    if (error.status === 404) {
      const tag_name = tag
      const name = config.input_name || tag
      const body = releaseBody(config)
      const draft = config.input_draft
      const prerelease = config.input_prerelease
      const target_commitish = config.input_target_commitish
      let commitMessage = ''
      if (target_commitish) {
        commitMessage = ` using commit "${target_commitish}"`
      }
      core.info(`👩‍🏭 Creating new GitHub release for tag ${tag_name}${commitMessage}...`)
      try {
        const newRelease = await releaser.createRelease({
          owner,
          repo,
          tag_name,
          name,
          body,
          draft,
          prerelease,
          target_commitish,
          discussion_category_name,
          generate_release_notes
        })
        return newRelease.data
      } catch (newError) {
        // presume a race with competing metrix runs
        core.warning(
          `⚠️ GitHub release failed with status: \n${JSON.stringify(newError || '')}\nretrying... (${
            maxRetries - 1
          } retries remaining)`
        )

        return release(config, releaser, maxRetries - 1)
      }
    } else {
      core.warning(`⚠️ Unexpected error fetching GitHub release for tag ${config.github_ref}: ${error}`)
      throw error
    }
  }
}
