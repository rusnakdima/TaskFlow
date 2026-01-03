/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Profile } from "@models/profile.model";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";

/* components */
import { TodoComponent } from "@components/todo/todo.component";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  tasksCompleted: number;
  tasksAssigned: number;
}

@Component({
  selector: "app-shared-tasks",
  standalone: true,
  providers: [MainService],
  imports: [CommonModule, RouterModule, MatIconModule, DragDropModule, TodoComponent],
  templateUrl: "./shared-tasks.view.html",
})
export class SharedTasksView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  sharedProjects: Todo[] = [];

  ngOnInit(): void {
    this.loadSharedProjects();
  }

  async fetchProfile(userId: string): Promise<Profile | null> {
    const response: Response<Profile> = await this.mainService.getByField<Profile>(
      "profile",
      "userId",
      userId
    );

    if (response.status !== ResponseStatus.SUCCESS) return null;
    const profile = response.data;
    return profile;
  }

  async loadSharedProjects() {
    const userId = this.authService.getValueByKey("id");
    if (userId) {
      const profile: Profile | null = await this.fetchProfile(userId);
      this.mainService
        .getTodosByAssignee<Todo[]>(profile?.id ?? "")
        .then((response: Response<Todo[]>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.sharedProjects = response.data;
          } else {
            this.sharedProjects = [];
            this.notifyService.showError(response.message ?? "Failed to load shared projects");
          }
        })
        .catch((err: any) => {
          this.sharedProjects = [];
          this.notifyService.showError(err.message ?? "Error loading shared projects");
        });
    }
  }

  getProgressColor(progress: number): string {
    if (progress >= 80) return "bg-green-500";
    if (progress >= 50) return "bg-blue-500";
    if (progress >= 25) return "bg-yellow-500";
    return "bg-red-500";
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  getCompletionRate(member: TeamMember): number {
    if (member.tasksAssigned === 0) return 0;
    return Math.round((member.tasksCompleted / member.tasksAssigned) * 100);
  }

  getMemberInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }

  inviteMember(): void {
    this.notifyService.showSuccess("Invite functionality would be implemented here");
  }

  createProject(): void {
    this.notifyService.showInfo("Project creation form would open here");
  }

  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    moveItemInArray(this.sharedProjects, event.previousIndex, event.currentIndex);
    // this.updateTodoOrder();
  }
}
