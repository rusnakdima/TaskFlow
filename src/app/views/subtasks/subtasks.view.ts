/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, ChangeDetectorRef, inject, computed } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { HostListener } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

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
import { ChatService } from "@services/chat.service";
import { DragDropOrderService } from "@services/drag-drop-order.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TaskInformationComponent } from "@components/task-information/task-information.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";

@Component({
  selector: "app-subtasks",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SubtaskComponent,
    TaskInformationComponent,
    FilterBarComponent,
    DragDropModule,
    ChatWindowComponent,
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
  public chatService = inject(ChatService);
  private dragDropService = inject(DragDropOrderService);

  // State signals
  task = signal<Task | null>(null);
  loading = signal(false);
  activeFilter = signal("all");
  showFilter = signal(false);
  showChat = signal(false);
  searchQuery = signal("");
  todoId = signal("");
  todo = signal<Todo | null>(null);
  projectTitle = signal("");
  fromKanban = signal(false);
  highlightSubtask = signal<string | null>(null);
  highlightComment = signal<string | null>(null);
  openComments = signal(false);

  // Computed signals for data flow - Always use storage as the single source of truth
  taskSubtasks = computed(() => {
    const taskFromSignal = this.task();
    const taskId = taskFromSignal?.id;
    if (!taskId) return [];
    // Always use storage data for real-time updates
    return this.storageService.getSubtasksByTaskId(taskId)();
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
      if (queryParams.highlightSubtask) {
        this.highlightSubtask.set(queryParams.highlightSubtask);
        setTimeout(() => {
          const element = document.getElementById("subtask-" + queryParams.highlightSubtask);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("ring-4", "ring-purple-500", "animate-pulse");
            setTimeout(() => {
              element.classList.remove("ring-4", "ring-purple-500", "animate-pulse");
            }, 2000);
          }
          this.highlightSubtask.set(null);
        }, 500);
      }
      if (queryParams.highlightComment) {
        this.highlightComment.set(queryParams.highlightComment);
        this.openComments.set(true);
      }
      if (queryParams.openComments) {
        this.openComments.set(true);
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
    } else {
      // Fallback: try to get task from storage
      this.loading.set(true);
      const taskId = this.route.snapshot.paramMap.get("taskId");
      if (taskId) {
        const taskFromStorage = this.storageService.getTaskById(taskId);
        if (taskFromStorage) {
          this.task.set(taskFromStorage);
          const todoFromStorage = this.storageService.getTodoById(taskFromStorage.todoId);
          if (todoFromStorage) {
            this.todo.set(todoFromStorage);
            this.isOwner = todoFromStorage.userId === this.userId;
            this.isPrivate = todoFromStorage.visibility === "private";
            this.todoId.set(todoFromStorage.id);
            this.projectTitle.set(todoFromStorage.title);
          }
        } else {
          this.notifyService.showError("Task not found. Please try again.");
        }
      } else {
        this.notifyService.showError("Invalid task ID.");
      }
      this.loading.set(false);
    }
  }

  toggleFilter() {
    this.showFilter.update((v) => !v);
  }
  toggleChat() {
    this.showChat.update((v) => !v);
  }
  getUnreadCount(): number {
    const todoId = this.todoId();
    return todoId ? this.chatService.getUnreadCount(todoId) : 0;
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

    this.dataSyncProvider
      .update<Subtask>("subtasks", subtask.id, { status: newStatus }, undefined, todoId)
      .subscribe({
        next: (result) => {
          this.storageService.updateItem("subtask", subtask.id, result);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  updateSubtaskInline(event: { subtask: Subtask; field: string; value: any }) {
    const todoId = this.todoId();
    if (!todoId) return;

    this.dataSyncProvider
      .update<Subtask>(
        "subtasks",
        event.subtask.id,
        { [event.field]: event.value },
        undefined,
        todoId
      )
      .subscribe({
        next: (result) => {
          this.storageService.updateItem("subtask", event.subtask.id, result);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  deleteSubtask(id: string) {
    const todoId = this.todoId();
    if (!todoId) return;

    if (!confirm("Are you sure?")) return;

    this.dataSyncProvider.delete("subtasks", id, undefined, todoId).subscribe({
      next: () => {
        this.storageService.removeItem("subtask", id);
        this.notifyService.showSuccess("Subtask deleted successfully");
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to delete subtask");
      },
    });
  }

  onSubtaskDrop(event: CdkDragDrop<Subtask[]>): void {
    const todoId = this.todoId();
    if (!todoId) return;

    this.dragDropService
      .handleDrop(event, this.listSubtasks(), "subtask", "subtasks", todoId, {
        isOwner: this.isOwner,
        isPrivate: this.isPrivate,
      })
      .subscribe();
  }
}
