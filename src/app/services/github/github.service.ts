import { Injectable, inject, signal, computed } from "@angular/core";
import { Observable, of } from "rxjs";
import { catchError, map, tap } from "rxjs/operators";

import { GithubRepo, GithubConnection } from "@models/github.model";
import { NotifyService } from "@services/notifications/notify.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { ApiService } from "@services/api.service";
import { Response } from "@models/response.model";

interface GithubOAuthResult {
  username: string;
  user_id: string;
  avatar_url: string;
}

interface GithubDeviceFlowResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
}

interface GithubDeviceFlowCheckResult {
  success: boolean;
  pending?: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  username?: string;
  user_id?: string;
  avatar_url?: string;
}

interface GithubIssueResult {
  id: number;
  number: number;
  html_url: string;
  title: string;
}

interface GithubCommentResult {
  id: number;
  html_url: string;
}

@Injectable({
  providedIn: "root",
})
export class GithubService {
  private requestService = inject(ApiService);
  private notifyService = inject(NotifyService);
  private jwtTokenService = inject(JwtTokenService);

  private readonly _repos = signal<GithubRepo[]>([]);
  private readonly _connectionStatus = signal<GithubConnection>({ connected: false });
  private readonly _loading = signal(false);

  readonly repos = this._repos.asReadonly();
  readonly connectionStatus = this._connectionStatus.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isConnected = computed(() => this._connectionStatus().connected);

  private getUserId(): string {
    const token = this.jwtTokenService.getToken();
    if (!token) return "";
    return this.jwtTokenService.getUserId(token) || "";
  }

  getOAuthUrl(): Observable<string> {
    return this.requestService.invokeCommand<string>("github_oauth_url", {}).pipe(
      map((url) => url),
      catchError((err) => {
        this.notifyService.showError("Failed to get GitHub OAuth URL: " + (err.message || err));
        throw err;
      })
    );
  }

  startDeviceFlow(): Observable<Response<GithubDeviceFlowResult>> {
    return this.requestService
      .invokeCommand<Response<GithubDeviceFlowResult>>("github_start_device_flow", {})
      .pipe(
        catchError((err) => {
          this.notifyService.showError(
            "Failed to start GitHub device flow: " + (err.message || err)
          );
          throw err;
        })
      );
  }

  checkDeviceFlow(
    deviceCode: string,
    userId: string
  ): Observable<Response<GithubDeviceFlowCheckResult>> {
    console.log(deviceCode);
    return this.requestService
      .invokeCommand<
        Response<GithubDeviceFlowCheckResult>
      >("github_check_device_flow", { deviceCode: deviceCode, userId: userId })
      .pipe(
        catchError((err) => {
          this.notifyService.showError("Failed to check device flow: " + (err.message || err));
          throw err;
        })
      );
  }

  handleOAuthCallback(code: string): Observable<GithubOAuthResult> {
    const userId = this.getUserId();
    if (!userId) {
      return new Observable((subscriber) => {
        subscriber.error(new Error("Not authenticated"));
      });
    }

    return this.requestService
      .invokeCommand<GithubOAuthResult>("github_oauth_callback", {
        userId,
        code,
      })
      .pipe(
        tap((result) => {
          this._connectionStatus.set({
            connected: true,
            username: result.username,
            user_id: result.user_id,
            avatar_url: result.avatar_url,
          });
          this.notifyService.showSuccess("GitHub connected successfully!");
        }),
        catchError((err) => {
          this.notifyService.showError("Failed to connect GitHub: " + (err.message || err));
          throw err;
        })
      );
  }

  getConnectionStatus(): Observable<GithubConnection> {
    const userId = this.getUserId();
    if (!userId) {
      return of({ connected: false });
    }

    return this.requestService
      .invokeCommand<Response<GithubConnection>>("github_get_connection_status", {
        userId,
      })
      .pipe(
        map((response) => response.data || { connected: false }),
        tap((status) => {
          this._connectionStatus.set(status);
        }),
        catchError(() => {
          this._connectionStatus.set({ connected: false });
          return of({ connected: false });
        })
      );
  }

  getRepos(): Observable<GithubRepo[]> {
    const userId = this.getUserId();
    if (!userId) {
      return of([]);
    }

    this._loading.set(true);
    return this.requestService
      .invokeCommand<Response<GithubRepo[]>>("github_get_repos", { userId })
      .pipe(
        map((response) => response.data || []),
        tap((repos) => {
          this._repos.set(repos);
          this._loading.set(false);
        }),
        catchError((err) => {
          this.notifyService.showError("Failed to load repositories: " + (err.message || err));
          this._loading.set(false);
          return of([]);
        })
      );
  }

  disconnect(userId: string): Observable<void> {
    if (!userId) {
      return new Observable((subscriber) => {
        subscriber.error(new Error("Not authenticated"));
      });
    }

    return this.requestService.invokeCommand<string>("github_disconnect", { userId }).pipe(
      tap(() => {
        this._connectionStatus.set({ connected: false });
        this._repos.set([]);
        this.notifyService.showSuccess("GitHub disconnected");
      }),
      map(() => undefined),
      catchError((err) => {
        this.notifyService.showError("Failed to disconnect GitHub: " + (err.message || err));
        throw err;
      })
    );
  }

  createIssue(
    repoOwner: string,
    repoName: string,
    title: string,
    body: string
  ): Observable<GithubIssueResult> {
    const userId = this.getUserId();
    if (!userId) {
      return new Observable((subscriber) => {
        subscriber.error(new Error("Not authenticated"));
      });
    }

    return this.requestService
      .invokeCommand<GithubIssueResult>("github_create_issue", {
        userId,
        repoOwner,
        repoName,
        title,
        body,
      })
      .pipe(
        tap((result) => {
          this.notifyService.showSuccess("GitHub issue created: " + result.html_url);
        }),
        catchError((err) => {
          this.notifyService.showError("Failed to create issue: " + (err.message || err));
          throw err;
        })
      );
  }

  createComment(
    repoOwner: string,
    repoName: string,
    issueNumber: number,
    body: string
  ): Observable<GithubCommentResult> {
    const userId = this.getUserId();
    if (!userId) {
      return new Observable((subscriber) => {
        subscriber.error(new Error("Not authenticated"));
      });
    }

    return this.requestService
      .invokeCommand<GithubCommentResult>("github_create_comment", {
        userId,
        repoOwner,
        repoName,
        issueNumber,
        body,
      })
      .pipe(
        catchError((err) => {
          this.notifyService.showError("Failed to create comment: " + (err.message || err));
          throw err;
        })
      );
  }

  updateIssue(
    repoOwner: string,
    repoName: string,
    issueNumber: number,
    title: string,
    body: string
  ): Observable<GithubIssueResult> {
    const userId = this.getUserId();
    if (!userId) {
      return new Observable((subscriber) => {
        subscriber.error(new Error("Not authenticated"));
      });
    }

    return this.requestService
      .invokeCommand<GithubIssueResult>("github_update_issue", {
        userId,
        repoOwner,
        repoName,
        issueNumber,
        title,
        body,
      })
      .pipe(
        tap((result) => {
          this.notifyService.showSuccess(`GitHub issue updated: ${result.html_url}`);
        }),
        catchError((err) => {
          this.notifyService.showError("Failed to update issue: " + (err.message || err));
          throw err;
        })
      );
  }
}
