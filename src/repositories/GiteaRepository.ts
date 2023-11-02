import {BaseRepository} from "./BaseRepository";
import {Release} from "../github";
import { Api, CreateReleaseOption, EditReactionOption, EditReleaseOption, giteaApi } from "gitea-js";
import fetch from 'cross-fetch';
import {env} from "process";
import FormData from 'form-data';
import {HttpResponse,Release as GiteRelease} from "gitea-js/dist";
export class GiteaRepository extends BaseRepository{
    private api: Api<unknown>;
    constructor(protected token:string) {
        super(token);
        this.api = giteaApi(env.INPUT_URL || "https://gitea.com", {
            token,
            customFetch: fetch
        })
    }

    async *allReleases(params: { owner: string; repo: string }): AsyncIterableIterator<{ data: Release[] }> {
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
                            upload_url: datum.url + "/assets"|| ""
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
            upload_url: result.data.url + "/assets"|| ""

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
        let option: EditReleaseOption = {
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
        const formData = new FormData();
        formData.append('attachment', params.body, {
            filename: params.name,
            contentType:params.mime
        });

        try {
            const response = await fetch(params.url, {
                method: 'POST',
                headers: {
                    ...formData.getHeaders(),
                    'accept': 'application/json',
                    authorization: `token ${this.token}`
                },
                body: formData.getBuffer()
            });

            if (response.ok) {
                return  await response.json();
            } else {
                console.log('Error uploading file:'+ response.statusText)
               throw new Error('Error uploading file:'+ response.statusText);
            }
        } catch (error) {
            console.log('Error uploading file:', error);
            throw new Error('Error uploading file');
        }

    }

}