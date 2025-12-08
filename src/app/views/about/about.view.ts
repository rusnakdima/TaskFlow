/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/* env */
import { environment } from "@env/environment";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Author } from "@models/author";

/* services */
import { AboutService } from "@services/about.service";
import { NotifyService } from "@services/notify.service";

@Component({
  selector: "app-about",
  standalone: true,
  providers: [AboutService],
  imports: [CommonModule],
  templateUrl: "./about.view.html",
})
export class AboutView {
  constructor(
    private aboutService: AboutService,
    private notifyService: NotifyService
  ) {}

  version: string = environment.version;
  nameProduct: string = environment.nameProduct;
  yearCreate: number = environment.yearCreate;
  companyName: string = environment.companyName;
  authors: Array<Author> = environment.authors;
  gitRepoName: string = environment.gitRepoName;
  dateVersion: string = localStorage["dateVersion"] || "Unknown";
  dateCheck: string = localStorage["dateCheck"] || "Unknown";

  nameFile: string = "";
  lastVersion: string = "";
  pathUpdate: string = "";

  windUpdates: boolean = false;
  downloadProgress: boolean = false;
  downloadProgressValue: number = 0;

  unlistenProgress: UnlistenFn | null = null;

  ngOnInit(): void {
    this.getDate();
  }

  matchVersion(lastVer: string) {
    const v1Components = lastVer.split(".").map(Number);
    const v2Components = this.version.split(".").map(Number);

    for (let i = 0; i < Math.max(v1Components.length, v2Components.length); i++) {
      const v1Value = v1Components[i] || 0;
      const v2Value = v2Components[i] || 0;

      if (v1Value < v2Value) {
        return false;
      } else if (v1Value > v2Value) {
        return true;
      }
    }

    return false;
  }

  formatDate(date: string) {
    return new Date(date).toISOString().split("T")[0];
  }

  getDate() {
    this.aboutService.getDate(this.version).subscribe({
      next: (res: any) => {
        if (res && res.published_at) {
          localStorage["dateVersion"] = String(this.formatDate(res.published_at));
          this.dateVersion = String(this.formatDate(res.published_at));
        } else {
          throw Error("Invalid request");
        }
      },
      error: (err: any) => {
        this.downloadProgress = false;
        this.notifyService.showError(err.message ?? err.toString());
      },
    });
  }

  checkUpdate() {
    localStorage["dateCheck"] = String(this.formatDate(new Date().toUTCString()));
    this.dateCheck = localStorage["dateCheck"];

    this.aboutService.checkUpdate().subscribe({
      next: (res: any) => {
        if (res && res.tag_name) {
          const lastVer: string = res.tag_name;
          setTimeout(() => {
            if (this.matchVersion(lastVer)) {
              this.notifyService.showWarning("A new version is available!");
              this.windUpdates = true;
              this.lastVersion = lastVer;
              this.aboutService
                .getBinaryNameFile<string>(this.lastVersion)
                .then((res) => {
                  if (res.status == ResponseStatus.SUCCESS) {
                    this.nameFile = res.data;
                  } else {
                    this.notifyService.showNotify(res.status, res.message);
                    this.windUpdates = false;
                  }
                })
                .catch((err) => {
                  this.notifyService.showError(err.message ?? err.toString());
                  this.windUpdates = false;
                });
            } else {
              this.notifyService.showSuccess("You have the latest version!");
            }
          }, 1000);
        } else {
          throw Error("Invalid request");
        }
      },
      error: (err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      },
    });
  }

  async downloadFile() {
    if (this.nameFile != "") {
      this.downloadProgress = true;
      this.downloadProgressValue = 0;

      if (!this.unlistenProgress) {
        this.unlistenProgress = await listen<number>("download-progress", (event) => {
          this.downloadProgressValue = event.payload;
        });
      }

      this.notifyService.showWarning("Wait until the program update is downloaded!");

      try {
        const data: Response<string> = await this.aboutService.downloadUpdate<string>(
          this.lastVersion,
          this.nameFile
        );
        if (data.status == ResponseStatus.SUCCESS) {
          this.notifyService.showSuccess(
            "The new version of the program has been successfully downloaded!"
          );
          this.pathUpdate = data.data;
          this.windUpdates = false;
        } else {
          this.notifyService.showNotify(data.status, data.message);
        }
      } catch (err: any) {
        this.notifyService.showError(err.message ?? err.toString());
      } finally {
        this.downloadProgress = false;
        if (this.unlistenProgress) {
          this.unlistenProgress();
          this.unlistenProgress = null;
        }
      }
    } else {
      this.notifyService.showError(
        "System definition error! It is impossible to find a file for this OS!"
      );
    }
  }

  openFile() {
    this.aboutService
      .openFile<string>(this.pathUpdate)
      .then((data: Response<string>) => {
        this.notifyService.showNotify(data.status, data.message);
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }
}
