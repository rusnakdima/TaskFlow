/* sys lib */
import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, firstValueFrom } from "rxjs";

/* env */
import { environment } from "@env/environment";

/* models */
import { ResponseModel } from "@entities/response.model";
import { TauriApiService } from "@app/api/tauri-api.service";

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
}

@Injectable({
  providedIn: "root",
})
export class AboutService {
  constructor(private http: HttpClient) {}
  private tauriApi = inject(TauriApiService);

  gitRepoName: string = environment.gitRepoName;
  githubUser: string = environment.githubUser;

  getDate(version: string): Observable<GitHubRelease> {
    return this.http.get<GitHubRelease>(
      `https://api.github.com/repos/${this.githubUser}/${this.gitRepoName}/releases/tags/v${version}`
    );
  }

  async getBinaryNameFile<R>(version: string): Promise<ResponseModel<R>> {
    return await firstValueFrom(
      this.tauriApi.invoke<ResponseModel<R>>("getBinaryNameFile", { version })
    );
  }

  checkUpdate(): Observable<GitHubRelease> {
    return this.http.get<GitHubRelease>(
      `https://api.github.com/repos/${this.githubUser}/${this.gitRepoName}/releases/latest`
    );
  }

  async downloadUpdate<R>(version: string, nameFile: string): Promise<ResponseModel<R>> {
    return await firstValueFrom(
      this.tauriApi.invoke<ResponseModel<R>>("downloadUpdate", {
        url: `https://github.com/${this.githubUser}/${this.gitRepoName}/releases/download/${version}/${nameFile}`,
        fileName: nameFile,
      })
    );
  }

  async openFile<R>(path: string): Promise<ResponseModel<R>> {
    return await firstValueFrom(this.tauriApi.invoke<ResponseModel<R>>("openFile", { path: path }));
  }

  async installUpdate<R>(path: string): Promise<ResponseModel<R>> {
    return await firstValueFrom(
      this.tauriApi.invoke<ResponseModel<R>>("installUpdate", { installerPath: path })
    );
  }
}
