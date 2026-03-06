/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, ChangeDetectorRef } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

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
import { SearchComponent } from "@components/fields/search/search.component";
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TaskInformationComponent } from "@components/task-information/task-information.component";

@Component({
  selector: "app-subtasks",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    SearchComponent,
    SubtaskComponent,
    TaskInformationComponent,
    DragDropModule,
  ],
  templateUrl: "./subtasks.view.html",
})
export class SubtasksView implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider,
    private cdr: ChangeDetectorRef,
    private filterService: FilterService,
    private sortService: SortService,
    private storageService: StorageService
  ) {}

  // Use storage signals directly for source data
  subtasks = this.storageService.subtasks;
  
  // Separate signals for filtered/sorted display list
  listSubtasks = signal<Array<Subtask>>([]);
  tempListSubtasks = signal<Array<Subtask>>([]);

  todoId = signal("");
  todo = signal<Todo | null>(null);
  task = signal<Task | null>(null);
  projectTitle = signal("");

  private isUpdatingOrder: boolean = false;

  userId: string = "";
  isOwner: boolean = true;
  isPrivate: boolean = true;
  fromKanban = signal(false);

  activeFilter = signal("all");
  showFilter = signal(false);

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
      if (queryParams.isPrivate !== undefined) {
        this.isPrivate = queryParams.isPrivate === "true";
      }
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
        this.loadSubtasksByTaskId(todoData.id);
      }
      if (dataResolve?.["task"]) {
        const taskData = dataResolve["task"];
        this.task.set(taskData);
        this.cdr.detectChanges();
        this.loadSubtasksByTaskId(taskData.id);
      }
    }
  }

  trackBySubtaskId(index: number, subtask: Subtask): string {
    return subtask.id;
  }

  loadSubtasksByTaskId(taskId: string) {
    // Read subtasks directly from storage - filtered by taskId
    const filteredSubtasks = this.subtasks().filter(st => st.taskId === taskId);
    
    if (filteredSubtasks && filteredSubtasks.length > 0) {
      this.tempListSubtasks.set(filteredSubtasks);
      this.applyFilter();
    }
  }

  searchFunc(data: Array<any>) {
    const sortedData = [...data].sort((a, b) => {
      if (a.status === b.status) {
        return 0;
      } else if (a.status === TaskStatus.COMPLETED || a.status === TaskStatus.SKIPPED) {
        return 1;
      } else {
        return -1;
      }
    });
    this.listSubtasks.set(sortedData);
  }

  toggleFilter() {
    this.showFilter.update((val) => !val);
  }

  changeFilter(filter: string) {
    this.activeFilter.set(filter);
    this.applyFilter();
  }

  applyFilter() {
    let filtered = [...this.tempListSubtasks()];

    // Use FilterService for status filtering
    const filter = this.activeFilter();
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

    // Use SortService for ordering
    filtered = this.sortService.sortByOrder(filtered, "desc");
    this.listSubtasks.set(filtered);
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    let newStatus: TaskStatus;
    let message = "";
    switch (subtask.status) {
      case TaskStatus.PENDING:
        newStatus = TaskStatus.COMPLETED;
        message = "Subtask reopened";
        break;
      case TaskStatus.COMPLETED:
        newStatus = TaskStatus.SKIPPED;
        message = "Subtask completed";
        break;
      case TaskStatus.SKIPPED:
        newStatus = TaskStatus.FAILED;
        message = "Subtask skipped";
        break;
      case TaskStatus.FAILED:
      default:
        newStatus = TaskStatus.PENDING;
        message = "Subtask marked as failed";
        break;
    }

    const updatedSubtask = { ...subtask, status: newStatus };

    this.dataSyncProvider
      .update<Subtask>(
        "subtasks",
        subtask.id,
        updatedSubtask,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todoId()
      )
      .subscribe({
        next: (result) => {
          subtask.status = newStatus;

          const index = this.tempListSubtasks().findIndex((s) => s.id === subtask.id);
          if (index !== -1) {
            this.tempListSubtasks.update((arr) => {
              const newArr = [...arr];
              newArr[index] = { ...subtask };
              return newArr;
            });
          }

          this.applyFilter();

          this.notifyService.showSuccess(message);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  updateSubtaskInline(event: { subtask: Subtask; field: string; value: string }) {
    let updatedSubtask: Subtask;

    if (event.field === "status") {
      updatedSubtask = {
        ...event.subtask,
        status: event.value as TaskStatus,
      };
    } else {
      updatedSubtask = {
        ...event.subtask,
        [event.field]: event.value,
      };
    }

    this.dataSyncProvider
      .update<Subtask>(
        "subtasks",
        event.subtask.id,
        updatedSubtask,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todoId()
      )
      .subscribe({
        next: (result) => {
          if (event.field === "title") {
            event.subtask.title = event.value;
          } else if (event.field === "description") {
            event.subtask.description = event.value;
          } else if (event.field === "status") {
            event.subtask.status = event.value as TaskStatus;
          }
          this.notifyService.showSuccess("Subtask updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  deleteSubtask(id: string) {
    this.dataSyncProvider
      .delete("subtasks", id, { isOwner: this.isOwner, isPrivate: this.isPrivate }, this.todoId())
      .subscribe({
        next: (result) => {
          this.listSubtasks.set(
            this.listSubtasks().filter((subtask: Subtask) => subtask.id !== id)
          );
          this.notifyService.showSuccess("Subtask deleted successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete subtask");
        },
      });
  }

  onSubtaskDrop(event: CdkDragDrop<Subtask[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    moveItemInArray(this.listSubtasks(), event.previousIndex, event.currentIndex);
    this.updateSubtaskOrder();
  }

  updateSubtaskOrder(): void {
    this.isUpdatingOrder = true;

    this.listSubtasks().forEach((subtask, index) => {
      subtask.order = this.listSubtasks().length - 1 - index;
    });

    const transformedSubtasks = this.listSubtasks().map((subtask) => ({
      _id: subtask._id,
      id: subtask.id,
      taskId: subtask.taskId || "",
      title: subtask.title,
      description: subtask.description,
      status: subtask.status,
      priority: subtask.priority,
      order: subtask.order,
      isDeleted: subtask.isDeleted,
      createdAt: subtask.createdAt,
      updatedAt: new Date().toISOString().split(".")[0],
    }));

    this.dataSyncProvider
      .updateAll<string>(
        "subtasks",
        transformedSubtasks,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todoId()
      )
      .subscribe({
        next: (result) => {
          this.notifyService.showSuccess("Subtask order updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update subtask order");
          // No need to reload - storage auto-updates
        },
        complete: () => {
          this.isUpdatingOrder = false;
        },
      });
  }
}
