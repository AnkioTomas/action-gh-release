import {Release} from "../github";

export abstract class  BaseRepository {
    protected constructor(protected token:string) {}

    abstract getReleaseByTag(params: {owner: string; repo: string; tag: string}): Promise<{data: Release}>
    abstract createRelease(params: {
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

    abstract updateRelease(params: {
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

    abstract  allReleases(params: {owner: string; repo: string}): AsyncIterableIterator<{data: Release[]}>

    abstract deleteReleaseAsset(params:{owner: string, repo: string, asset_id: number,id:number}):Promise<void>

    abstract  uploadAssets(param: { size: number; mime: string; name: string; body: Buffer; url: string ,owner:string, repo:string,id:number}):Promise<JSON>
}