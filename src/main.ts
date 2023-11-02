import * as core from '@actions/core'
import {isTag, parseConfig, paths, unmatchedPatterns, uploadUrl} from './util'
import {GitHubReleaser, release, upload} from './github'

import {env} from 'process'
import {GithubRepository} from './repositories/GithubRepository'

async function run(): Promise<void> {
  const supportedPlatform = {
    github: GithubRepository
  }
  function isSupportedPlatform(type: string): type is keyof typeof supportedPlatform {
    return type in supportedPlatform
  }

  try {
    const config = parseConfig(env)

    if (!isSupportedPlatform(config.input_platform)) {
      throw new Error(`⚠️ Unsupported this platform: ${config.input_platform}`)
    }

    if (!config.input_tag_name && !isTag(config.github_ref) && !config.input_draft) {
      throw new Error(`⚠️ GitHub Releases requires a tag`)
    }

    if (config.input_files && config.input_files?.length > 0) {
      const patterns = unmatchedPatterns(config.input_files)
      for (const pattern of patterns) {
        core.warning(`🤔 Pattern '${pattern}' does not match any files.`)
      }
      if (patterns.length > 0 && config.input_fail_on_unmatched_files) {
        throw new Error(`⚠️ There were unmatched files`)
      }
    }

    // create repository
    const repository = new supportedPlatform[config.input_platform](config.github_token)

    //)
    const rel = await release(config, new GitHubReleaser(repository))

    if (config.input_files && config.input_files?.length > 0) {
      const files = paths(config.input_files)
      if (files.length === 0) {
        core.warning(`🤔 ${config.input_files} not include valid file.`)
      }
      const currentAssets = rel.assets
      const assets = await Promise.all(
        files.map(async path => {
          return await upload(config, repository, uploadUrl(rel.upload_url), path, currentAssets, rel.id)
        })
      ).catch(error => {
        throw error
      })
      core.setOutput('assets', assets)
    }

    core.info(`🎉 Release ready at ${rel.html_url}`)
    core.setOutput('url', rel.html_url)
    core.setOutput('id', rel.id.toString())
    core.setOutput('upload_url', rel.upload_url)
  } catch (error) {
    core.setFailed(`Failed to create the new release: ${error}`)
  }
}

run()
