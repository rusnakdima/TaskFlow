/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  signal,
  effect,
  ChangeDetectorRef,
  inject,
  computed,
  OnDestroy,
  HostListener,
} from "@angular/core";
import { ActivatedRoute, RouterModule, NavigationEnd, Router } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { Subscription, firstValueFrom } from "rxjs";
import { filter, map } from "rxjs/operators";
import { toSignal } from "@angular/core/rxjs-interop";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageService } from "@services/core/storage.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { BulkActionService } from "@services/bulk-action.service";
import { DataSyncService } from "@services/data/data-sync.service";
import { ShortcutService } from "@services/ui/shortcut.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TaskInformationComponent } from "@components/task-information/task-information.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";

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
    CheckboxComponent,
    BulkActionsComponent,
  ],
  templateUrl: "./subtasks.view.html",
})
export class SubtasksView extends BaseListView implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private dataSyncService = inject(DataSyncService);
  private shortcutService = inject(ShortcutService);
  private cdr = inject(ChangeDetectorRef);
  private storageService = inject(StorageService);
  private dragDropService = inject(DragDropOrderService);
  public bulkService = inject(BulkActionService);

  // State signals
  showChat = signal(false);
  todoId = signal("");
  projectTitle = signal("");
  chats = signal<any[]>([]);

  private chatEffect = effect(() => {
    const tid = this.todoId();
    if (tid) {
      const reactiveChats = this.storageService.getChatsByTodoReactive(tid)();
      this.chats.set(reactiveChats);
    }
  });

  // Reactive route param — re-evaluates when the route changes or data refreshes
  private readonly routeTaskId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("taskId") ?? null)),
    { initialValue: this.route.snapshot.paramMap.get("taskId") ?? null }
  );

  task = computed(() => {
    const taskId = this.routeTaskId();
    if (!taskId) return null;
    return this.storageService.getTaskReactive(taskId)() || null;
  });

  todo = computed(() => {
    const t = this.task();
    if (!t?.todoId) return null;
    return this.storageService.getTodoReactive(t.todoId)() || null;
  });

  fromKanban = signal(false);
  highlightSubtask = signal<string | null>(null);
  highlightComment = signal<string | null>(null);
  /** When set, only this subtask should auto-open its comment block */
  openCommentsForSubtaskId = signal<string | null>(null);
  private routeSub?: Subscription;

  // Bulk selection state (like admin page)
  selectedSubtasks = signal<Set<string>>(new Set());

  // Computed signals for data flow - Always use storage as the single source of truth
  taskSubtasks = computed(() => {
    const taskFromSignal = this.task();
    const taskId = taskFromSignal?.id;
    if (!taskId) return [];
    // Always use storage data for real-time updates
    return this.storageService.getSubtasksByTaskId(taskId);
  });

  listSubtasks = computed(() => {
    let filtered = this.taskSubtasks();
    const filter = this.activeFilter();
    const query = this.searchQuery().toLowerCase().trim();

    if (filter !== "all") {
      switch (filter) {
        case "active":
          filtered = FilterHelper.filterByStatus(filtered, "pending");
          break;
        case "completed":
          filtered = FilterHelper.filterByStatus(filtered, "completed");
          break;
        case "skipped":
          filtered = FilterHelper.filterByStatus(filtered, "skipped");
          break;
        case "failed":
          filtered = FilterHelper.filterByStatus(filtered, "failed");
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

    const result = SortHelper.sortByOrder(filtered, "desc");
    return result;
  });

  userId: string = "";

  isOwner = computed(() => this.todo()?.userId === this.userId);
  isPrivate = computed(() => this.todo()?.visibility === "private");

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

    // Initialize bulk action service
    this.bulkService.setMode("subtasks");
    this.bulkService.updateTotalCount(0);

    // Subscribe to refresh shortcut (Ctrl+R)
    this.shortcutService.refresh$.subscribe(() => {
      this.dataSyncService.loadAllData(true).subscribe(() => {
        this.notifyService.showSuccess("Data refreshed");
      });
    });

    // Clear selection when navigating away from this view
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.clearSelection();
    });

    this.routeSub = this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.fromKanban !== undefined) {
        this.fromKanban.set(queryParams.fromKanban === "true");
      }
      if (queryParams.highlightSubtask) {
        const id = queryParams.highlightSubtask;
        this.highlightSubtask.set(id);
        if (queryParams.openComments) {
          this.openCommentsForSubtaskId.set(id);
        }
        setTimeout(() => {
          const element = document.getElementById("subtask-" + id);
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
        // Best-effort: when deep-linking to a comment, open all comment blocks
        this.openCommentsForSubtaskId.set("*");
      }
      if (
        !queryParams.openComments &&
        !queryParams.highlightSubtask &&
        !queryParams.highlightComment
      ) {
        this.openCommentsForSubtaskId.set(null);
      }
    });

    const routeData = this.route.snapshot.data;
    if (routeData?.["task"]) {
      const dataResolve = routeData["task"];
      if (dataResolve?.["todo"]) {
        const todoData = dataResolve["todo"];
        this.todoId.set(todoData.id);
        this.projectTitle.set(todoData.title);
      }
      this.cdr.detectChanges();
    } else {
      // Fallback: load data first, then resolve task from storage
      const taskId = this.route.snapshot.paramMap.get("taskId");
      if (taskId) {
        this.dataSyncService.loadAllData().subscribe(() => {
          const taskFromStorage = this.storageService.getById("tasks", taskId);
          if (taskFromStorage) {
            const todoFromStorage = this.storageService.getById("todos", taskFromStorage.todoId);
            if (todoFromStorage) {
              this.todoId.set(todoFromStorage.id);
              this.projectTitle.set(todoFromStorage.title);
            }
          } else {
            this.notifyService.showError("Task not found. Please try again.");
          }
          this.loading.set(false);
        });
      } else {
        this.notifyService.showError("Invalid task ID.");
        this.loading.set(false);
      }
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  toggleChat() {
    this.showChat.update((v) => !v);
  }

  getUnreadCount(): number {
    const todoId = this.todoId();
    if (!todoId) return 0;
    const currentUserId = this.authService.getValueByKey("id");
    const chats = this.chats();
    return chats.filter((c) => !c.readBy || !c.readBy.includes(currentUserId)).length;
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    const todoId = this.todoId();

    const newStatus = BaseItemHelper.getNextStatus(subtask.status);

    this.dataSyncProvider
      .crud<Subtask>("update", "subtasks", {
        id: subtask.id,
        data: { status: newStatus },
        parentTodoId: todoId,
      })
      .subscribe({
        next: () => {
          // Storage updated automatically by DataSyncProvider
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  updateSubtaskInline(event: { subtask: Subtask; field: string; value: any }) {
    const todoId = this.todoId();

    this.dataSyncProvider
      .crud<Subtask>("update", "subtasks", {
        id: event.subtask.id,
        data: { [event.field]: event.value },
        parentTodoId: todoId,
      })
      .subscribe({
        next: () => {
          // Storage updated automatically by DataSyncProvider
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  deleteSubtask(id: string) {
    const todoId = this.todoId();

    if (!confirm("Are you sure?")) return;

    this.dataSyncProvider.crud("delete", "subtasks", { id, parentTodoId: todoId }).subscribe({
      next: () => {
        this.notifyService.showSuccess("Subtask deleted successfully");
      },
      error: (err: any) => {
        this.notifyService.showError(err.message || "Failed to delete subtask");
      },
    });
  }

  onSubtaskDrop(event: CdkDragDrop<Subtask[]>): void {
    const taskId = this.task()?.id;
    if (!taskId) return;

    this.dragDropService
      .handleDrop(event, this.listSubtasks(), "subtasks", "subtasks", taskId, {
        isOwner: this.isOwner(),
        isPrivate: this.isPrivate(),
      })
      .subscribe();
  }

  // Bulk Actions Methods

  /**
   * Toggle selection of a single subtask
   */
  toggleSubtaskSelection(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    this.selectedSubtasks.update((subtaskIds) => {
      const newSelected = new Set(subtaskIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      // Sync with bulk service for display
      this.bulkService.setSelectionState(newSelected.size, this.isAllSelected());
      return newSelected;
    });
  }

  /**
   * Toggle select all subtasks in current view
   */
  toggleSelectAll(): void {
    const allSubtasks = this.listSubtasks();
    const allSelected = this.isAllSelected();

    this.selectedSubtasks.update((selected) => {
      const newSelected = new Set(selected);
      if (allSelected) {
        allSubtasks.forEach((subtask) => newSelected.delete(subtask.id));
      } else {
        allSubtasks.forEach((subtask) => newSelected.add(subtask.id));
      }
      // Sync with bulk service for display
      this.bulkService.setSelectionState(newSelected.size, !allSelected);
      return newSelected;
    });
  }

  /**
   * Check if all subtasks are selected
   */
  isAllSelected(): boolean {
    const currentList = this.listSubtasks();
    return (
      currentList.length > 0 &&
      currentList.every((subtask) => this.selectedSubtasks().has(subtask.id))
    );
  }

  /**
   * Bulk update status of selected subtasks
   */
  bulkUpdateStatus(status: string): void {
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const todoId = this.todoId();

    const updatePromises = Array.from(selected).map((subtaskId) => {
      return firstValueFrom(
        this.dataSyncProvider.crud<Subtask>("update", "subtasks", {
          id: subtaskId,
          data: { status: status as TaskStatus },
          parentTodoId: todoId,
        })
      );
    });

    Promise.all(updatePromises)
      .then((results) => {
        // Force storage refresh
        this.dataSyncService.loadAllData(true).subscribe();
        this.notifyService.showSuccess(`${selected.size} subtask(s) updated`);
        this.clearSelection();
      })
      .catch((err) => {
        this.notifyService.showError(err.message || "Failed to update subtasks");
      });
  }

  /**
   * Bulk delete selected subtasks
   */
  bulkDelete(): void {
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const todoId = this.todoId();

    if (confirm(`Are you sure you want to delete ${selected.size} subtask(s)?`)) {
      const deleteRequests = Array.from(selected).map((subtaskId) =>
        this.dataSyncProvider.crud("delete", "subtasks", { id: subtaskId, parentTodoId: todoId })
      );

      Promise.all(deleteRequests)
        .then(() => {
          this.notifyService.showSuccess(`${selected.size} subtask(s) deleted successfully`);
          this.clearSelection();
        })
        .catch((err) => {
          this.notifyService.showError(err.message || "Failed to delete subtasks");
        });
    }
  }

  /**
   * Bulk archive selected subtasks (move to archive)
   */
  bulkArchive(): void {
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const todoId = this.todoId();

    if (confirm(`Archive ${selected.size} subtask(s)?`)) {
      const deleteRequests = Array.from(selected).map((subtaskId) =>
        this.dataSyncProvider.crud("delete", "subtasks", { id: subtaskId, parentTodoId: todoId })
      );

      Promise.all(deleteRequests)
        .then(() => {
          this.notifyService.showSuccess(`${selected.size} subtask(s) archived successfully`);
          this.clearSelection();
        })
        .catch((err) => {
          this.notifyService.showError(err.message || "Failed to archive subtasks");
        });
    }
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedSubtasks.set(new Set());
    this.bulkService.setSelectionState(0, false);
  }
}
