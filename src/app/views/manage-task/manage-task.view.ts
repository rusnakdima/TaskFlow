import { CommonModule, Location } from "@angular/common";
import { Component, OnInit, signal, inject, computed, DestroyRef } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Subscription, firstValueFrom } from "rxjs";

import { MatIconModule } from "@angular/material/icon";

import { Todo } from "@models/generated/api.types";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { UnifiedStorageService } from "@services/core/unified-storage.service";
import { GithubService } from "@services/github/github.service";
import { ApiService } from "@services/api.service";
import { bindSaveShortcut } from "@helpers/keyboard.helper";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { BasicInfoSectionComponent } from "@components/form/basic-info-section.component";
import { PrioritySectionComponent } from "@components/form/priority-section.component";
import { TimelineSectionComponent } from "@components/form/timeline-section.component";
import { GithubIssueSectionComponent } from "@components/form/github-issue-section.component";

@Component({
  selector: "app-manage-task",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    BasicInfoSectionComponent,
    PrioritySectionComponent,
    TimelineSectionComponent,
    GithubIssueSectionComponent,
  ],
  templateUrl: "./manage-task.view.html",
})
export class ManageTaskPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private jwtTokenService = inject(JwtTokenService);
  private storage = inject(UnifiedStorageService);
  private notifyService = inject(NotifyService);
  private shortcutService = inject(ShortcutService);
  private githubService = inject(GithubService);
  private destroyRef = inject(DestroyRef);
  private apiService = inject(ApiService);

  form!: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);

  todos = signal<Todo[]>([]);

  startDateForEndDate = signal<Date | null>(null);

  pageTitle = computed(() => {
    return this.isEdit() ? "Edit Task" : "Create Task";
  });

  parentTodoHasGithubRepo = computed(() => {
    const todoId = this.form.get("todo_id")?.value;
    if (!todoId) return false;
    const parentTodo = this.todos().find((t) => t.id === todoId);
    return !!parentTodo?.github_repo_id;
  });

  ngOnInit(): void {
    this.initForm();
    this.subscribeToRoute();
    bindSaveShortcut(this.shortcutService, () => this.onSubmit())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
    this.loadParentEntities();
  }

  private initForm(): void {
    this.form = this.fb.group({
      _id: [""],
      id: [""],
      title: ["", Validators.required],
      description: [""],
      status: ["pending"],
      priority: ["medium"],
      start_date: [""],
      end_date: [""],
      order: [0],
      deleted_at: [false],
      todo_id: ["", Validators.required],
      repeat: ["none"],
      github_repo_id: [""],
      publish_to_github: [false],
    });
  }

  private subscribeToRoute(): void {
    this.subscriptions.add(
      this.route.params.subscribe(async (params) => {
        await this.loadData(params);
      })
    );

    this.form.get("start_date")?.valueChanges.subscribe((startDate) => {
      this.startDateForEndDate.set(startDate || null);
    });
  }

  private async loadData(params: any): Promise<void> {
    this.todos.set(this.storage.todos());

    const todoId = params.todoId;
    const taskId = params.taskId;

    if (todoId) {
      this.form.patchValue({ todo_id: todoId });
    }

    if (taskId) {
      this.isEdit.set(true);
      await this.loadExistingTask(taskId);
    }
  }

  private async loadParentEntities(): Promise<void> {
    this.todos.set(this.storage.todos());
  }

  private async loadExistingTask(taskId: string): Promise<void> {
    const visibility = this.route.snapshot.queryParamMap.get("visibility") || undefined;

    try {
      const item = await firstValueFrom(this.apiService.tasks.get(taskId, visibility));
      if (item) {
        this.applyItemToForm(item);
      }
    } catch (err) {
      this.notifyService.showError("Failed to load task");
    }
  }

  private applyItemToForm(item: any): void {
    this.form.patchValue({
      ...item,
      start_date: item.start_date || "",
      end_date: item.end_date || "",
    });
  }

  back(): void {
    this.location.back();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.notifyService.showError("Please fill in required fields");
      return;
    }

    this.isSubmitting.set(true);

    try {
      const formValue = this.form.value;
      const payload = this.buildPayload(formValue);

      const parentTodo = this.todos().find((t) => t.id === formValue.todo_id);
      const visibility = parentTodo?.visibility || "private";

      if (this.isEdit()) {
        const id = formValue._id || formValue.id;
        await firstValueFrom(this.apiService.tasks.update(id, payload, visibility));

        if (formValue.publish_to_github && parentTodo?.github_repo_id) {
          await this.handleGithubIssueForTask(id, formValue, parentTodo);
        }
      } else {
        const result = await firstValueFrom(this.apiService.tasks.create(payload, visibility));

        if (result?.todo_id) {
          const todo = this.todos().find((t) => t.id === result.todo_id);
          if (todo) {
            this.storage.updateEntitySignal("todos", result.todo_id, {
              id: result.todo_id,
              tasks_count: (todo.tasks_count || 0) + 1,
            });
          }
        }

        if (formValue.publish_to_github && parentTodo?.github_repo_id) {
          const taskId = result?.id;
          if (taskId) {
            await this.handleGithubIssueForTask(taskId, formValue, parentTodo);
          }
        }
      }

      this.notifyService.showSuccess(`Task ${this.isEdit() ? "updated" : "created"} successfully`);
      this.location.back();
    } catch (err: any) {
      this.notifyService.showError(err.message || "Failed to save");
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private buildPayload(formValue: any): any {
    const token = this.jwtTokenService.getToken();
    const userId = this.jwtTokenService.getUserId(token);

    return {
      id: formValue.id || undefined,
      title: formValue.title,
      description: formValue.description || "",
      status: formValue.status || "pending",
      priority: formValue.priority,
      start_date: formValue.start_date || "",
      end_date: formValue.end_date || "",
      order: formValue.order || 0,
      deleted_at: null,
      user_id: userId,
      todo_id: formValue.todo_id,
      repeat: formValue.repeat || "none",
      publish_to_github: formValue.publish_to_github || false,
    };
  }

  private handleGithubIssueForTask(taskId: string, formValue: any, parentTodo: Todo): void {
    if (!parentTodo.github_repo_id || !parentTodo.github_repo_name) return;

    const [owner, repo] = parentTodo.github_repo_name.split("/");
    const issueBody = this.buildIssueBody(formValue);
    const existingTask = this.storage.tasks().find((t) => t.id === taskId);

    if (existingTask?.github_issue_id) {
      this.githubService
        .updateIssue(owner, repo, existingTask.github_issue_number!, formValue.title, issueBody)
        .subscribe();
    } else if (formValue.publish_to_github) {
      this.githubService.createIssue(owner, repo, formValue.title, issueBody).subscribe({
        next: (result) => {
          this.storage.updateEntitySignal("tasks", taskId, {
            id: taskId,
            github_issue_id: String(result.id),
            github_issue_number: result.number,
            github_issue_url: result.html_url,
          });
        },
      });
    }
  }

  private buildIssueBody(formValue: any): string {
    return `**Task Details**

**Description:** ${formValue.description || "N/A"}
**Priority:** ${formValue.priority || "medium"}
**Due Date:** ${formValue.end_date || "N/A"}
**Created in:** TaskFlow

---
[View in TaskFlow](taskflow://tasks/${formValue.id || formValue._id})`;
  }

  private subscriptions = new Subscription();
}
