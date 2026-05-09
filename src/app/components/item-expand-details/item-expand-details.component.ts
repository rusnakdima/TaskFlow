import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { ItemType } from "@models/base.model";

@Component({
  selector: "app-item-expand-details",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatChipsModule, MatProgressBarModule],
  templateUrl: "./item-expand-details.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemExpandDetailsComponent {
  @Input() item: any = null;
  @Input() type: ItemType = "todo";

  get completedCount(): number {
    if (this.type === "todo") return this.item?.completed_tasks_count || 0;
    if (this.type === "task") return this.item?.completed_subtasks_count || 0;
    return 0;
  }

  get totalCount(): number {
    if (this.type === "todo") return this.item?.tasks_count || 0;
    if (this.type === "task") return this.item?.subtasks_count || 0;
    return 0;
  }

  get progressPercent(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.completedCount / this.totalCount) * 100);
  }

  get isOverdue(): boolean {
    if (!this.item?.end_date) return false;
    return new Date(this.item.end_date) < new Date();
  }

  get isUpcoming(): boolean {
    if (!this.item?.end_date) return false;
    const now = new Date();
    const end = new Date(this.item.end_date);
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    return end > now && end.getTime() - now.getTime() <= threeDays;
  }

  get hasProgress(): boolean {
    return (
      (this.type === "todo" && this.item?.tasks_count > 0) ||
      (this.type === "task" && this.item?.subtasks_count > 0)
    );
  }

  get hasStartDate(): boolean {
    return !!this.item?.start_date;
  }

  get hasEndDate(): boolean {
    return !!this.item?.end_date;
  }

  get hasDescription(): boolean {
    return !!this.item?.description;
  }

  get hasAssignees(): boolean {
    return this.type === "todo" && !!this.item?.assignees_profiles?.length;
  }

  get hasCategories(): boolean {
    return this.type === "todo" && !!this.item?.categories?.length;
  }

  get hasVisibility(): boolean {
    return this.type === "todo" && !!this.item?.visibility;
  }

  get hasChatsCount(): boolean {
    return this.type === "todo" && !!this.item?.chats_count;
  }

  get hasCommentsCount(): boolean {
    return (
      (this.type === "task" || this.type === "subtask" || this.type === "comment") &&
      !!this.item?.comments_count
    );
  }

  get hasRepeat(): boolean {
    return this.type === "task" && this.item?.repeat && this.item.repeat !== "none";
  }

  get hasGithubIssue(): boolean {
    return this.type === "task" && !!this.item?.github_issue_url;
  }

  get hasDependsOn(): boolean {
    return this.type === "task" && !!this.item?.depends_on?.length;
  }

  get hasContent(): boolean {
    return (this.type === "comment" || this.type === "chat") && !!this.item?.content;
  }

  get hasUserId(): boolean {
    return this.type === "category" && !!this.item?.user_id;
  }

  get hasDailyActivity(): boolean {
    return (
      this.type === "daily_activity" &&
      (this.item?.todos_created !== undefined || this.item?.tasks_completed !== undefined)
    );
  }

  get isDeleted(): boolean {
    return !!this.item?.deleted_at;
  }

  formatFieldDate(dateStr: string): string {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr || "-";
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr || "-";
    }
  }

  getDateColor(endDate: string): string {
    if (!endDate) return "text-gray-500 dark:text-gray-400";
    const now = new Date();
    const end = new Date(endDate);
    if (end < now) return "text-red-500 dark:text-red-400";
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    if (end.getTime() - now.getTime() <= threeDays) return "text-orange-500 dark:text-orange-400";
    return "text-gray-600 dark:text-gray-400";
  }

  getProgressBarColor(): string {
    const percent = this.progressPercent;
    if (percent === 100) return "bg-green-500";
    if (percent >= 50) return "bg-blue-500";
    return "bg-gray-400";
  }
}
