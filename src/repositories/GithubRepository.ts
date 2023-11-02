import {BaseRepository} from "./BaseRepository";
import {getOctokit} from "@actions/github";
import * as core from "@actions/core";
import {Release} from "../github";

export class GithubRepository extends BaseRepository{
    private gh
    constructor(protected token:string) {
        super(token);
         this.gh = getOctokit(token, {
            throttle: {
                onRateLimit: (retryAfter, options) => {
                    core.warning(`Request quota exhausted for request ${options.method} ${options.url}`)
                    if (options.request.retryCount === 0) {
                        // only retries once
                        core.info(`Retrying after ${retryAfter} seconds!`)
                        return true
                    }
                },
                onAbuseLimit: (retryAfter, options) => {
                    // does not retry, only logs a warning
                    core.warning(`Abuse detected for request ${options.method} ${options.url}`)
                }
            }
        })
    }

    getReleaseByTag(params: {owner: string; repo: string; tag: string}): Promise<{ data: Release }> {
        return this.gh.rest.repos.getReleaseByTag(params)
    }

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
    }): Promise<{data: Release}>{
      return  this.gh.rest.repos.createRelease(params)
    }

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
    }): Promise<{data: Release}>{
        return this.gh.rest.repos.updateRelease(params)
    }
    allReleases(params: {owner: string; repo: string}): AsyncIterableIterator<{data: Release[]}>{
        const updatedParams = {per_page: 100, ...params}
        return this.gh.paginate.iterator(this.gh.rest.repos.listReleases.endpoint.merge(updatedParams))
    }

    async deleteReleaseAsset(params: { owner: string, repo: string, asset_id: number }):Promise<void> {
        await this.gh.rest.repos.deleteReleaseAsset({
            asset_id: params.asset_id || 1,
            owner: params.owner,
            repo: params.repo,
        })
    }

    async uploadAssets(param: { size: number; mime: string; name: string; body: Buffer; url: string }):Promise<JSON> {
        const endpoint = new URL(param.url)
        endpoint.searchParams.append('name', param.name)
        const resp = await fetch(endpoint, {
            headers: {
                'content-length': `${param.size}`,
                'content-type': param.mime,
                authorization: `token ${this.token}`
            },
            method: 'POST',
            body: param.body
        })
        const json = await resp.json()
        if (resp.status !== 201) {
            throw new Error(
                `Failed to upload release asset ${param.name}. received status code ${resp.status}\n${json.message}\n${JSON.stringify(
                    json.errors
                )}`
            )
        }

        return json.json()
    }
}