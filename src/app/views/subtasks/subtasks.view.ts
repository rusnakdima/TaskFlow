/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, ChangeDetectorRef, inject, computed } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import { HostListener } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { FilterService } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { StorageService } from "@services/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TaskInformationComponent } from "@components/task-information/task-information.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";

@Component({
  selector: "app-subtasks",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    SubtaskComponent,
    TaskInformationComponent,
    FilterBarComponent,
    DragDropModule,
  ],
  templateUrl: "./subtasks.view.html",
})
export class SubtasksView implements OnInit {
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private cdr = inject(ChangeDetectorRef);
  private filterService = inject(FilterService);
  private sortService = inject(SortService);
  private storageService = inject(StorageService);

  // State signals
  task = signal<Task | null>(null);
  activeFilter = signal("all");
  showFilter = signal(false);
  searchQuery = signal("");
  todoId = signal("");
  todo = signal<Todo | null>(null);
  projectTitle = signal("");
  fromKanban = signal(false);

  // Computed signals for data flow
  taskSubtasks = computed(() => {
    const taskId = this.task()?.id;
    return taskId ? this.storageService.getSubtasksByTaskId(taskId)() : [];
  });

  listSubtasks = computed(() => {
    let filtered = this.taskSubtasks();
    const filter = this.activeFilter();
    const query = this.searchQuery().toLowerCase().trim();

    if (filter !== "all") {
      switch (filter) {
        case "active":
          filtered = this.filterService.filterByStatus(filtered, "pending");
          break;
        case "completed":
          filtered = this.filterService.filterByStatus(filtered, "completed");
          break;
        case "skipped":
          filtered = this.filterService.filterByStatus(filtered, "skipped");
          break;
        case "failed":
          filtered = this.filterService.filterByStatus(filtered, "failed");
          break;
        case "done":
          filtered = filtered.filter(
            (s) =>
              s.status === TaskStatus.COMPLETED ||
              s.status === TaskStatus.SKIPPED ||
              s.status === TaskStatus.FAILED
          );
          break;
        case "high":
          filtered = filtered.filter((s) => s.priority === "high");
          break;
      }
    }

    if (query) {
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          (s.description && s.description.toLowerCase().includes(query))
      );
    }

    return this.sortService.sortByOrder(filtered, "desc");
  });

  userId: string = "";
  isOwner: boolean = true;
  isPrivate: boolean = true;
  private isUpdatingOrder: boolean = false;

  @HostListener("window:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "f") {
      event.preventDefault();
      this.toggleFilter();
    }
  }

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "done", label: "Done" },
    { key: "high", label: "High Priority" },
  ];

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.fromKanban !== undefined) {
        this.fromKanban.set(queryParams.fromKanban === "true");
      }
    });

    const routeData = this.route.snapshot.data;
    if (routeData?.["task"]) {
      const dataResolve = routeData["task"];
      if (dataResolve?.["todo"]) {
        const todoData = dataResolve["todo"];
        this.todo.set(todoData);
        this.isOwner = todoData.userId === this.userId;
        this.isPrivate = todoData.visibility === "private";
        this.todoId.set(todoData.id);
        this.projectTitle.set(todoData.title);
      }
      if (dataResolve?.["task"]) {
        this.task.set(dataResolve["task"]);
        this.cdr.detectChanges();
      }
    }
  }

  toggleFilter() {
    this.showFilter.update((v) => !v);
  }
  changeFilter(filter: string) {
    this.activeFilter.set(filter);
  }
  onSearchChange(query: string) {
    this.searchQuery.set(query);
  }
  onSearchResults(results: any[]) {
    /* Logic handled by computed listSubtasks */
  }
  clearFilters() {
    this.activeFilter.set("all");
    this.searchQuery.set("");
  }
  applyFilter() {
    /* Purely reactive via computed listSubtasks */
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    const todoId = this.todoId();
    if (!todoId) return;

    let newStatus: TaskStatus;
    switch (subtask.status) {
      case TaskStatus.PENDING:
        newStatus = TaskStatus.COMPLETED;
        break;
      case TaskStatus.COMPLETED:
        newStatus = TaskStatus.SKIPPED;
        break;
      case TaskStatus.SKIPPED:
        newStatus = TaskStatus.FAILED;
        break;
      default:
        newStatus = TaskStatus.PENDING;
        break;
    }

    const previousStatus = subtask.status;
    this.storageService.updateSubtask(subtask.id, { status: newStatus });

    this.dataSyncProvider
      .update<Subtask>("subtasks", subtask.id, { ...subtask, status: newStatus }, undefined, todoId)
      .subscribe({
        next: (result: Subtask) => {
          // Manually update storage
          this.storageService.updateSubtask(result.id, result);
          this.notifyService.showSuccess("Status updated");
        },
        error: (err: any) => {
          this.storageService.updateSubtask(subtask.id, { status: previousStatus });
          this.notifyService.showError(err.message || "Failed to update status");
        },
      });
  }

  updateSubtaskInline(event: { subtask: Subtask; field: string; value: any }) {
    const todoId = this.todoId();
    if (!todoId) return;

    const previousValue = (event.subtask as any)[event.field];
    this.storageService.updateSubtask(event.subtask.id, { [event.field]: event.value });

    this.dataSyncProvider
      .update<Subtask>(
        "subtasks",
        event.subtask.id,
        { ...event.subtask, [event.field]: event.value },
        undefined,
        todoId
      )
      .subscribe({
        next: (result: Subtask) => {
          // Manually update storage
          this.storageService.updateSubtask(result.id, result);
          this.notifyService.showSuccess("Subtask updated successfully");
        },
        error: (err: any) => {
          this.storageService.updateSubtask(event.subtask.id, { [event.field]: previousValue });
          this.notifyService.showError(err.message || "Update failed");
        },
      });
  }

  deleteSubtask(id: string) {
    const todoId = this.todoId();
    if (!todoId) return;

    if (!confirm("Are you sure?")) return;
    const subtaskToDelete = this.storageService.getSubtaskById(id);
    this.storageService.removeSubtask(id);

    this.dataSyncProvider.delete("subtasks", id, undefined, todoId).subscribe({
      error: (err: any) => {
        if (subtaskToDelete) this.storageService.addSubtask(subtaskToDelete);
        this.notifyService.showError(err.message || "Delete failed");
      },
    });
  }

  onSubtaskDrop(event: CdkDragDrop<Subtask[]>): void {
    const todoId = this.todoId();
    if (!todoId) return;

    if (this.isUpdatingOrder) return;
    if (event.previousIndex === event.currentIndex) return;

    const subtasks = [...this.listSubtasks()];
    moveItemInArray(subtasks, event.previousIndex, event.currentIndex);

    this.isUpdatingOrder = true;
    subtasks.forEach((s, i) => (s.order = subtasks.length - 1 - i));

    this.dataSyncProvider.updateAll<string>("subtasks", subtasks, undefined, todoId).subscribe({
      next: (results: any) => {
        this.isUpdatingOrder = false;
        this.notifyService.showSuccess("Order updated");
      },
      error: (err: any) => {
        this.isUpdatingOrder = false;
        this.notifyService.showError("Failed to update order");
        this.storageService.loadAllData(true).subscribe();
      },
    });
  }
}
