/* sys lib */
import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

/* env */
import { environment } from "@env/environment";

/* models */
import { Response } from "@models/response.model";
import { TauriApiService } from "@app/api/tauri-api.service";

@Injectable({
  providedIn: "root",
})
export class AboutService {
  constructor(private http: HttpClient) {}
  private tauriApi = inject(TauriApiService);

  gitRepoName: string = environment.gitRepoName;
  githubUser: string = environment.githubUser;

  getDate(version: string): Observable<any> {
    return this.http.get<any>(
      `https://api.github.com/repos/${this.githubUser}/${this.gitRepoName}/releases/tags/v${version}`
    );
  }

  async getBinaryNameFile<R>(version: string): Promise<Response<R>> {
    return await this.tauriApi.invoke<Response<R>>("getBinaryNameFile", { version });
  }

  checkUpdate(): Observable<any> {
    return this.http.get<any>(
      `https://api.github.com/repos/${this.githubUser}/${this.gitRepoName}/releases/latest`
    );
  }

  async downloadUpdate<R>(version: string, nameFile: string): Promise<Response<R>> {
    return await this.tauriApi.invoke<Response<R>>("downloadUpdate", {
      url: `https://github.com/${this.githubUser}/${this.gitRepoName}/releases/download/${version}/${nameFile}`,
      fileName: nameFile,
    });
  }

  async openFile<R>(path: string): Promise<Response<R>> {
    return await this.tauriApi.invoke<Response<R>>("openFile", { path: path });
  }

  async installUpdate<R>(path: string): Promise<Response<R>> {
    return await this.tauriApi.invoke<Response<R>>("installUpdate", { installerPath: path });
  }
}
