/* sys lib */
import { CommonModule, Location } from "@angular/common";
import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  signal,
  inject,
  ChangeDetectorRef,
  computed,
} from "@angular/core";
import { Subscription } from "rxjs";
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from "@angular/router";
import { distinctUntilChanged, filter, map } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";

/* models */
import { Profile } from "@models/profile.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { ResponseStatus } from "@models/response.model";
import { NotificationAction } from "@services/notifications/notify.service";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { SyncService } from "@services/data/sync.service";
import { ApiProvider } from "@providers/api.provider";
import { StorageService } from "@services/core/storage.service";

/* helpers */
import { NetworkErrorHelper } from "@helpers/network-error.helper";

interface Breadcrumb {
  label: string;
  description: string;
  url: string;
}

@Component({
  selector: "app-header",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatMenuModule, MatButtonModule],
  templateUrl: "./header.component.html",
})
export class HeaderComponent implements OnInit, OnDestroy {
  private storageService = inject(StorageService);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private dataSyncProvider: ApiProvider,
    private notifyService: NotifyService,
    private syncService: SyncService,
    private cdr: ChangeDetectorRef,
    private location: Location
  ) {}

  @Output() isShowNavEvent: EventEmitter<boolean> = new EventEmitter();

  themeVal = signal("");
  title = signal("");
  description = signal("");
  subtitle = signal("");
  iconUrl = signal("");
  userId = signal("");
  role = signal("");

  profile = computed(() => this.storageService.profile());
  todo = signal<Todo | null>(null);
  task = signal<Task | null>(null);

  isBack = signal(false);
  isSyncing = signal(false);

  notifications = this.notifyService.notifications;
  unreadCount = this.notifyService.unreadCount;

  breadcrumbs = signal<Breadcrumb[]>([]);
  private syncSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.themeVal.set(localStorage.getItem("theme") ?? "");
    this.userId.set(this.authService.getValueByKey("id"));
    this.role.set(this.authService.getValueByKey("role"));

    this.syncSubscription = this.syncService.isSyncing$.subscribe((isSyncing) =>
      this.isSyncing.set(isSyncing)
    );

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        distinctUntilChanged(),
        map(async () => await this.createBreadcrumbs(this.route.root))
      )
      .subscribe(async (breadcrumbs) => {
        this.breadcrumbs.set(await breadcrumbs);
        const currentUrl = this.router.url.split("?")[0];
        this.isBack.set(currentUrl !== "/dashboard" && currentUrl !== "/");
        this.title.set(
          this.breadcrumbs().length > 0
            ? this.breadcrumbs()[this.breadcrumbs().length - 1].label
            : "TaskFlow"
        );
        this.description.set(
          this.breadcrumbs().length > 0
            ? this.breadcrumbs()[this.breadcrumbs().length - 1].description
            : ""
        );
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy(): void {
    this.syncSubscription?.unsubscribe();
  }

  async createBreadcrumbs(
    route: ActivatedRoute,
    url: string = "",
    breadcrumbs: Breadcrumb[] = []
  ): Promise<Breadcrumb[]> {
    const children: ActivatedRoute[] = route.children;

    if (children.length === 0) {
      return breadcrumbs;
    }

    for (const child of children) {
      const routeURL: string = child.snapshot.url.map((segment) => segment.path).join("/");

      // Skip empty path segments but still recurse into their children
      if (routeURL == "") {
        return this.createBreadcrumbs(child, url, breadcrumbs);
      }

      const breadcrumbData = child.snapshot.data["breadcrumb"];
      const newUrl = url + "/" + routeURL;

      let label: string = "";
      let description: string = "";

      if (breadcrumbData) {
        if (typeof breadcrumbData === "function") {
          // Access resolved data directly from snapshot
          const resolvedTodo = child.snapshot.data["todo"];
          const resolvedTask = child.snapshot.data["task"];

          // Subtasks route: resolvedTask = { task: Task, todo: Todo }
          if (resolvedTask) {
            const taskData = resolvedTask as { task: Task; todo: Todo };
            if (taskData?.task) {
              const task = taskData.task as Task;
              this.task.set(task);
              label = task.title || "Task";
              description = task.description || "";
              this.description.set(description);
            }
            if (taskData?.todo) {
              this.todo.set(taskData.todo);
            }
          }
          // Tasks route: resolvedTodo = Todo object
          else if (resolvedTodo) {
            const todo = resolvedTodo as Todo;
            this.todo.set(todo);
            label = todo.title;
            description = todo.description || "";
            this.description.set(description);
          }

          // Fallback if no label was set
          if (!label) {
            label = "TaskFlow";
          }
        } else {
          label = breadcrumbData;
        }
      } else {
        // No breadcrumb data, use route title as fallback
        label = child.snapshot.title?.toString() || routeURL;
      }

      breadcrumbs.push({
        label: label,
        description: description,
        url: newUrl,
      });

      return this.createBreadcrumbs(child, newUrl, breadcrumbs);
    }

    return breadcrumbs;
  }

  goBack() {
    this.location.back();
  }

  showNav() {
    this.isShowNavEvent.next(true);
  }

  setTheme(theme: string) {
    document.querySelector("html")!.setAttribute("class", theme);
    localStorage.setItem("theme", theme);
    this.themeVal.set(theme);
  }

  toggleTheme() {
    const newTheme = this.themeVal() === "dark" ? "" : "dark";
    this.setTheme(newTheme);
  }

  markAsRead(id: string) {
    this.notifyService.markAsRead(id);
  }

  markAllAsRead() {
    this.notifyService.markAllAsRead();
  }

  clearNotifications() {
    this.notifyService.clearAll();
  }

  onNotificationClick(notif: NotificationAction): void {
    // Mark as read
    this.markAsRead(notif.id);

    // Navigate based on notification type
    if (notif.type === "chat") {
      // Navigate to todo -> chat section
      if (notif.todoId) {
        this.router.navigate(["/todos", notif.todoId, "tasks"], {
          queryParams: { openChat: true, highlightChat: notif.chatId },
        });
      }
    } else if (notif.type === "comment") {
      // Navigate to the task/subtask with the comment
      if (notif.todoId && notif.taskId) {
        const queryParams: any = {
          highlightComment: notif.commentId,
          openComments: true,
        };
        this.router.navigate(["/todos", notif.todoId, "tasks", notif.taskId, "subtasks"], {
          queryParams,
        });
      } else if (notif.todoId) {
        // Comment on todo level (if applicable)
        this.router.navigate(["/todos", notif.todoId, "tasks"], {
          queryParams: { openChat: true },
        });
      }
    } else if (notif.type === "todo") {
      // Navigate to todos page and highlight
      if (notif.todoId) {
        this.router.navigate(["/todos"], {
          queryParams: { highlightTodo: notif.todoId },
        });
      }
    } else if (notif.type === "task") {
      // Navigate to tasks page and highlight
      if (notif.todoId && notif.taskId) {
        this.router.navigate(["/todos", notif.todoId, "tasks"], {
          queryParams: { highlightTaskId: notif.taskId },
        });
      } else if (notif.todoId) {
        this.router.navigate(["/todos", notif.todoId, "tasks"]);
      }
    } else if (notif.type === "subtask") {
      // Navigate to subtasks page and highlight
      if (notif.todoId && notif.taskId && notif.subtaskId) {
        this.router.navigate(["/todos", notif.todoId, "tasks", notif.taskId, "subtasks"], {
          queryParams: { highlightSubtask: notif.subtaskId },
        });
      } else if (notif.todoId && notif.taskId) {
        this.router.navigate(["/todos", notif.todoId, "tasks", notif.taskId, "subtasks"]);
      }
    }
  }

  async syncAll(silent: boolean = false) {
    if (this.isSyncing()) return;

    if (!silent) {
      this.notifyService.showInfo("Starting synchronization...");
    }

    try {
      const response = await this.syncService.syncAll();
      if (response.status === ResponseStatus.SUCCESS) {
        if (!silent) {
          this.notifyService.showSuccess("Synchronization completed successfully!");
        }
      } else {
        // Check if it's a network error using centralized helper
        if (NetworkErrorHelper.isNetworkError(response.message)) {
          // Network error - sync is optional, don't show error
          if (!silent) {
            this.notifyService.showWarning("Working offline - sync unavailable");
          }
        } else if (!silent) {
          // Other error - show it
          this.notifyService.showError(response.message || "Synchronization failed");
        }
      }
    } catch (error) {
      // Check if it's a network error using centralized helper
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (NetworkErrorHelper.isNetworkError(errorMessage)) {
        // Network error - sync is optional, don't show error
        if (!silent) {
          this.notifyService.showWarning("Working offline - sync unavailable");
        }
      } else if (!silent) {
        // Other error - show it
        this.notifyService.showError("Synchronization failed: " + errorMessage);
      }
    }
  }

  logout() {
    this.authService.logout();
  }
}
