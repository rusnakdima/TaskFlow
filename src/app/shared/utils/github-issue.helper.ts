import { Injectable, inject } from "@angular/core";
import { GithubService } from "@services/github/github.service";
import { ApiService } from "@services/api.service";
import { NotifyService } from "@services/notifications/notify.service";
import { Task, Todo } from "@entities/generated/api.types";
@Injectable({
  providedIn: "root",
})
export class GithubIssueHelper {
  private githubService = inject(GithubService);
  private requestService = inject(ApiService);
  private notifyService = inject(NotifyService);
  createOrUpdateGithubIssue(task: Task, currentTodo: Todo | null): void {
    if (!currentTodo?.github_repo_name) {
      this.notifyService.showError("Project is not linked to a GitHub repository");
      return;
    }
    const [owner, repo] = currentTodo.github_repo_name.split("/");
    if (!owner || !repo) {
      this.notifyService.showError("Invalid GitHub repository configuration");
      return;
    }
    const issueBody = `**Task Details**
**Description:** ${task.description || "N/A"}
**Priority:** ${task.priority || "medium"}
**Due Date:** ${task.end_date || "N/A"}
**Created in:** TaskFlow
---
[View in TaskFlow](taskflow://tasks/${task.id})`;
    if (task.github_issue_id) {
      this.githubService
        .updateIssue(owner, repo, task.github_issue_number!, task.title, issueBody)
        .subscribe({
          next: (result) => {
            this.notifyService.showSuccess("GitHub issue updated");
            this.requestService
              .update<Task>("tasks", task.id, {
                github_issue_url: result.html_url,
              })
              .subscribe();
          },
          error: (err) => {
            this.notifyService.showError("Failed to update GitHub issue: " + (err.message || err));
          },
        });
    } else if (task.publish_to_github) {
      this.githubService.createIssue(owner, repo, task.title, issueBody).subscribe({
        next: (result) => {
          this.notifyService.showSuccess(`GitHub issue created: ${result.html_url}`);
          this.requestService
            .update<Task>("tasks", task.id, {
              github_issue_id: String(result.id),
              github_issue_number: result.number,
              github_issue_url: result.html_url,
            })
            .subscribe();
        },
        error: (err) => {
          this.notifyService.showError("Failed to create GitHub issue: " + (err.message || err));
        },
      });
    }
  }
}
