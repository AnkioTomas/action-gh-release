import {BaseRepository} from "./BaseRepository";
import {Release} from "../github";
import {Api, CreateReleaseOption, giteaApi} from 'gitea-js'
import fetch from 'cross-fetch'
import {env} from "process";
import {HttpResponse,Release as GiteRelease} from "gitea-js/dist";
class GiteaRepository extends BaseRepository{
    private api: Api<unknown>;
    constructor(protected token:string) {
        super(token);
        this.api = giteaApi(env.INPUR_BASEURL || "https://gitea.com", {
            token,
            customFetch: fetch
        })
    }

    async * allReleases(params: { owner: string; repo: string }): AsyncIterableIterator<{ data: Release[] }> {
        let count = 1;
        let api = this.api;
        let countBreak = false;


        while (!countBreak) {
            let releasesData: Release[] = [];
            await new Promise<void>(resolve => {
                (async function () {
                    const releases = await api.repos.repoListReleases(params.owner, params.repo, {
                        per_page: 100, page: count
                    });

                    if (releases.error == null && releases.data.length === 0) {
                        countBreak = true;
                    }

                    for (const datum of releases.data) {
                        let assets: { id: number; name: string }[] = [];

                        if (datum.assets) {
                            for (const datumElement of datum.assets) {
                                assets.push({
                                    id: datumElement.id || 0,
                                    name: datumElement.name || ""
                                });
                            }
                        }

                        releasesData.push({
                            assets: assets,
                            body: datum.body,
                            draft: !!datum.draft,
                            html_url: datum.html_url || "",
                            id: datum.id || 0,
                            name: datum.name || "",
                            prerelease: !!datum.prerelease,
                            tag_name: datum.tag_name || "",
                            target_commitish: datum.target_commitish || "",
                            upload_url: datum.zipball_url ||datum.tarball_url || ""
                        });
                    }

                    resolve();
                })();
            });

            yield {
                data: releasesData
            };

            count++;
        }
    }

    async createRelease(params: {
        owner: string;
        repo: string;
        tag_name: string;
        name: string;
        body: string | undefined;
        draft: boolean | undefined;
        prerelease: boolean | undefined;
        target_commitish: string | undefined;
        discussion_category_name: string | undefined;
        generate_release_notes: boolean | undefined
    }): Promise<{ data: Release }> {

        let option: CreateReleaseOption = {
            body: params.body,
            draft: !!params.draft,
            name: params.name,
            prerelease: !!params.prerelease,
            tag_name: params.tag_name,
            target_commitish: params.target_commitish
        }

        let result = await this.api.repos.repoCreateRelease(params.owner, params.repo, option)



        return this.convertRelease(result)
    }

    async deleteReleaseAsset(params: { owner: string; repo: string; asset_id: number, id: number }): Promise<void> {

        await this.api.repos.repoDeleteReleaseAttachment(params.owner, params.repo, params.id, params.asset_id)

    }

    private convertRelease(result:HttpResponse<GiteRelease, any>){
        if (result.error !== null) {
            throw new Error("release error : " + result.error.message)
        }
        let assets: { id: number; name: string }[] = [];

        if (result.data.assets) {
            for (const datumElement of result.data.assets) {
                assets.push({
                    id: datumElement.id || 0,
                    name: datumElement.name || ""
                });
            }
        }

        let release: Release = {
            assets: assets,
            body: result.data.body,
            draft: !!result.data.draft,
            html_url: result.data.html_url || "",
            id: result.data.id || 0,
            name: result.data.name || "",
            prerelease: !!result.data.prerelease,
            tag_name: result.data.tag_name || "",
            target_commitish: result.data.target_commitish || "",
            upload_url: result.data.zipball_url || result.data.tarball_url || ""

        }
        return {data:release}
    }

    async getReleaseByTag(params: { owner: string; repo: string; tag: string }): Promise<{ data: Release }> {
        let result = await this.api.repos.repoGetReleaseByTag(params.owner, params.repo, params.tag)
        return this.convertRelease(result)

    }

    async updateRelease(params: {
        owner: string;
        repo: string;
        release_id: number;
        tag_name: string;
        target_commitish: string;
        name: string;
        body: string | undefined;
        draft: boolean | undefined;
        prerelease: boolean | undefined;
        discussion_category_name: string | undefined;
        generate_release_notes: boolean | undefined
    }): Promise<{ data: Release }> {
        let option: CreateReleaseOption = {
            body: params.body,
            draft: !!params.draft,
            name: params.name,
            prerelease: !!params.prerelease,
            tag_name: params.tag_name,
            target_commitish: params.target_commitish
        }
        let result = await this.api.repos.repoEditRelease(params.owner, params.repo, params.release_id, option)

        return this.convertRelease(result);
    }

    async uploadAssets(params: {
        owner: string,
        repo: string,
        size: number;
        mime: string;
        name: string;
        body: Buffer;
        url: string,
        id: number
    }): Promise<JSON> {
        function bufferToArrayBuffer(buffer: Buffer): Promise<ArrayBuffer> {
            return Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        }

        let data: File = {
            arrayBuffer(): Promise<ArrayBuffer> {
                return bufferToArrayBuffer(params.body);
            },
            lastModified: 0,
            name: params.name,
            size: params.size,
            slice(start?: number | undefined, end?: number | undefined, contentType?: string | undefined): Blob {
                return new Blob([params.body]).slice(start, end, contentType);
            },
            stream(): ReadableStream<Uint8Array> {
                return new ReadableStream();
            },
            text(): Promise<string> {
                return Promise.resolve("");
            },
            type: params.mime,
            webkitRelativePath: ""

        }

        let result = await this.api.repos.repoCreateReleaseAttachment(params.owner, params.repo, params.id, {attachment: data})
        if (result.error !== null) {
            throw new Error("release error : " + result.error.message)
        }


        return JSON.parse(JSON.stringify(result.data))
    }

}