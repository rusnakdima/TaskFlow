/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, signal } from "@angular/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* env */
import { environment } from "@env/environment";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Author } from "@models/author.model";

/* services */
import { AboutService } from "@services/about.service";
import { NotifyService } from "@services/notify.service";

@Component({
  selector: "app-about",
  standalone: true,
  providers: [AboutService],
  imports: [CommonModule, MatIconModule],
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
  dateVersion = signal(localStorage["dateVersion"] || "Unknown");
  dateCheck = signal(localStorage["dateCheck"] || "Unknown");

  nameFile = signal("");
  lastVersion = signal("");
  pathUpdate = signal<string>("");

  windUpdates = signal<boolean>(false);
  downloadProgress = signal<boolean>(false);
  downloadProgressValue = signal<number>(0);

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
          this.dateVersion.set(String(this.formatDate(res.published_at)));
        } else {
          throw Error("Invalid request");
        }
      },
      error: (err: any) => {
        this.downloadProgress.set(false);
        this.notifyService.showError(err.message ?? err.toString());
      },
    });
  }

  checkUpdate() {
    localStorage["dateCheck"] = String(this.formatDate(new Date().toUTCString()));
    this.dateCheck.set(localStorage["dateCheck"]);

    this.aboutService.checkUpdate().subscribe({
      next: (res: any) => {
        if (res && res.tag_name) {
          const lastVer: string = res.tag_name;
          setTimeout(() => {
            if (this.matchVersion(lastVer)) {
              this.notifyService.showWarning("A new version is available!");
              this.windUpdates.set(true);
              this.lastVersion.set(lastVer);
              this.aboutService
                .getBinaryNameFile<string>(this.lastVersion())
                .then((res) => {
                  if (res.status == ResponseStatus.SUCCESS) {
                    this.nameFile.set(res.data);
                  } else {
                    this.notifyService.showNotify(res.status, res.message);
                    this.windUpdates.set(false);
                  }
                })
                .catch((err) => {
                  this.notifyService.showError(err.message ?? err.toString());
                  this.windUpdates.set(false);
                });
            } else {
              this.notifyService.showSuccess("You have the latest version!");
            }
          }, 1000);
        } else {
          throw Error("Invalid request");
        }
      },
      error: (err: Response<any>) => {
        this.windUpdates.set(false);
        this.notifyService.showError(err.message ?? err.toString());
      },
    });
  }

  async downloadFile() {
    if (this.nameFile() != "") {
      this.downloadProgress.set(true);
      this.downloadProgressValue.set(0);

      if (!this.unlistenProgress) {
        this.unlistenProgress = await listen<number>("download-progress", (event) => {
          this.downloadProgressValue.set(event.payload);
        });
      }

      this.notifyService.showWarning("Wait until the program update is downloaded!");

      try {
        const data: Response<string> = await this.aboutService.downloadUpdate<string>(
          this.lastVersion(),
          this.nameFile()
        );
        if (data.status == ResponseStatus.SUCCESS) {
          this.notifyService.showSuccess(
            "The new version of the program has been successfully downloaded!"
          );
          this.pathUpdate.set(data.data);
          this.windUpdates.set(false);
        } else {
          this.notifyService.showNotify(data.status, data.message);
        }
      } catch (err: any) {
        this.notifyService.showError(err.message ?? err.toString());
      } finally {
        this.downloadProgress.set(false);
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
      .openFile<string>(this.pathUpdate())
      .then((data: Response<string>) => {
        this.notifyService.showNotify(data.status, data.message);
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }
}
