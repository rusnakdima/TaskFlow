/* angular */
import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
/* env */
import { environment } from "@env/environment";
/* app */
import { Response } from "@tauri-front/shared";
import { InvokeWrapperService } from "@tauri-front/shared";
import {
  AboutService as LibraryAboutService,
  UpdateService,
  type UpdateInfo,
} from "@tauri-front/shared";

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

@Injectable({
  providedIn: "root",
})
export class AboutService extends LibraryAboutService {
  private updateService: UpdateService;

  constructor(
    private http: HttpClient,
    private invoke: InvokeWrapperService
  ) {
    const appName = environment.gitRepoName;
    const owner = environment.githubUser;
    const repo = environment.gitRepoName;
    super(appName, owner, repo);
    this.updateService = new UpdateService();
  }

  gitRepoName: string = environment.gitRepoName;
  githubUser: string = environment.githubUser;

  getDate(version: string) {
    return this.http.get(
      `https://api.github.com/repos/${this.githubUser}/${this.gitRepoName}/releases/tags/v${version}`
    );
  }

  async getBinaryNameFile<R>(version: string): Promise<Response<R>> {
    return await this.invoke.invoke<Response<R>>("getBinaryNameFile", { version });
  }

  /**
   * Override checkUpdate to maintain API for existing consumers.
   * Uses GitHub API directly for version comparison.
   */
  checkUpdate() {
    return this.http.get(
      `https://api.github.com/repos/${this.githubUser}/${this.gitRepoName}/releases/latest`
    );
  }

  /**
   * Download and install the latest update using the shared UpdateService.
   */
  async downloadAndInstall(
    onProgress?: (p: {
      bytes_downloaded: number;
      total_bytes: number;
      progress_pct: number;
    }) => void
  ): Promise<void> {
    const release = (await firstValueFrom(this.checkUpdate() as any)) as GitHubRelease;

    const latestVersion = release.tag_name.startsWith("v")
      ? release.tag_name.slice(1)
      : release.tag_name;

    const currentVersion = await this.updateService.getCurrentVersion();

    if (!this.isNewerVersion(latestVersion, currentVersion)) {
      throw new Error("No update available");
    }

    const asset = release.assets.find(
      (a: any) => !a.name.endsWith(".tar.gz") && !a.name.endsWith(".zip")
    );
    const downloadUrl =
      asset?.browser_download_url ??
      `https://github.com/${this.githubUser}/${this.gitRepoName}/releases/download/${release.tag_name}/${asset?.name ?? ""}`;
    const assetSize = asset?.size ?? 0;

    const updateInfo: UpdateInfo = {
      current_version: currentVersion,
      latest_version: latestVersion,
      download_url: downloadUrl,
      asset_name: asset?.name ?? "",
      asset_size: assetSize,
      release_notes: release.body ?? undefined,
    };

    const path = await this.updateService.downloadUpdate(updateInfo, onProgress);
    await this.updateService.installUpdate(path);
  }

  private isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split(".").map(Number);
    const currentParts = current.split(".").map(Number);

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const l = latestParts[i] ?? 0;
      const c = currentParts[i] ?? 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }
}
