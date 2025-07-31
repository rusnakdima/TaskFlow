/* sys lib */
import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Observable } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

/* env */
import { environment } from "@env/environment";

/* models */
import { Response } from "@models/response";

const httpOptions = {
  headers: new HttpHeaders({
    "Content-Type": "application/json",
  }),
};

@Injectable({
  providedIn: "root",
})
export class AboutService {
  constructor(private http: HttpClient) {}

  gitRepoName: string = environment.gitRepoName;

  getDate(version: string): Observable<any> {
    return this.http.get<any>(
      `https://api.github.com/repos/rusnakdima/${this.gitRepoName}/releases/tags/v${version}`,
      httpOptions
    );
  }

  async getBinaryNameFile(): Promise<Response> {
    return await invoke<Response>("get_binary_name_file");
  }

  checkUpdate(): Observable<any> {
    return this.http.get<any>(
      `https://api.github.com/repos/rusnakdima/${this.gitRepoName}/releases/latest`,
      httpOptions
    );
  }

  async downloadUpdate(version: string, nameFile: string): Promise<Response> {
    return await invoke<Response>("download_update", {
      url: `https://github.com/rusnakdima/${this.gitRepoName}/releases/download/${version}/${nameFile}`,
      fileName: nameFile,
    });
  }

  async openFile(path: string): Promise<Response> {
    return await invoke<Response>("open_file", { path: path });
  }
}
