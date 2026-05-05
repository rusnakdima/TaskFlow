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
  Input,
  DestroyRef,
} from "@angular/core";
import { Subscription } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from "@angular/router";
import { distinctUntilChanged, filter, map } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";

/* models */
import { Profile } from "@models/profile.model";
import { User } from "@models/user.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { ResponseStatus } from "@models/response.model";
import { NotificationAction } from "@services/notifications/notify.service";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { SyncService } from "@services/data/sync.service";
import { ApiProvider } from "@providers/api.provider";
import { DataService } from "@services/data/data.service";
import { AppStateService } from "@services/core/app-state.service";
import { StorageService } from "@services/core/storage.service";
import { ShortcutEmittersService } from "@services/ui/shortcut-emitters.service";

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
  private dataService = inject(DataService);
  private destroyRef = inject(DestroyRef);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private dataSyncProvider: ApiProvider,
    private notifyService: NotifyService,
    private syncService: SyncService,
    private cdr: ChangeDetectorRef,
    private location: Location,
    private appStateService: AppStateService,
    private shortcutEmitters: ShortcutEmittersService,
    private storageService: StorageService
  ) {}

  @Output() isShowNavEvent: EventEmitter<boolean> = new EventEmitter();

  themeVal = signal("");
  title = signal("");
  description = signal("");
  subtitle = signal("");
  iconUrl = signal("");
  userId = signal("");

  profile = signal<Profile | null>(null);
  user = signal<User | null>(null);
  userEmail = signal("");
  role = signal("");
  todo = signal<Todo | null>(null);
  task = signal<Task | null>(null);

  isBack = signal(false);
  isSyncing = signal(false);

  showInfoBlock = this.appStateService.showInfoBlock;

  notifications = this.notifyService.notifications;
  unreadCount = this.notifyService.unreadCount;

  breadcrumbs = signal<Breadcrumb[]>([]);
  private syncSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.themeVal.set(localStorage.getItem("theme") ?? "");
    this.userId.set(this.authService.getValueByKey("id"));

    this.syncSubscription = this.syncService.isSyncing$.subscribe((isSyncing) =>
      this.isSyncing.set(isSyncing)
    );

    this.loadProfile();

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

  private loadProfile(): void {
    const storedProfile = this.storageService.profile();
    const storedUser = this.storageService.user();

    if (storedProfile) {
      this.profile.set(storedProfile);
      if (storedProfile.user) {
        this.user.set(storedProfile.user);
        this.userEmail.set(storedProfile.user.email || "");
        this.role.set(storedProfile.user.role || "");
      } else if (storedUser) {
        this.user.set(storedUser);
        this.userEmail.set(storedUser.email || "");
        this.role.set(storedUser.role || "");
      } else if (storedProfile.user_id) {
        this.dataService
          .getUser(storedProfile.user_id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (user) => {
              this.user.set(user);
              this.userEmail.set(user.email || "");
              this.role.set(user.role || "");
            },
            error: () => {
              this.user.set(null);
              this.userEmail.set("");
              this.role.set("");
            },
          });
      }
    } else {
      this.dataService
        .getProfile()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (profile) => {
            this.profile.set(profile);
            if (profile?.user) {
              this.user.set(profile.user);
              this.userEmail.set(profile.user.email || "");
              this.role.set(profile.user.role || "");
            } else if (profile?.user_id) {
              this.dataService
                .getUser(profile.user_id)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                  next: (user) => {
                    this.user.set(user);
                    this.userEmail.set(user.email || "");
                    this.role.set(user.role || "");
                  },
                  error: () => {
                    this.user.set(null);
                    this.userEmail.set("");
                    this.role.set("");
                  },
                });
            }
          },
          error: () => {
            this.profile.set(null);
            this.user.set(null);
            this.userEmail.set("");
            this.role.set("");
          },
        });
    }
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

      if (routeURL == "") {
        return this.createBreadcrumbs(child, url, breadcrumbs);
      }

      const breadcrumbData = child.snapshot.data["breadcrumb"];
      const newUrl = url + "/" + routeURL;

      let label: string = "";
      let description: string = "";

      if (breadcrumbData) {
        if (typeof breadcrumbData === "function") {
          const resolvedTodo = child.snapshot.data["todo"];
          const resolvedTask = child.snapshot.data["task"];

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
          } else if (resolvedTodo) {
            const todo = resolvedTodo as Todo;
            this.todo.set(todo);
            label = todo.title;
            description = todo.description || "";
            this.description.set(description);
          }

          if (!label) {
            label = "TaskFlow";
          }
        } else {
          label = breadcrumbData;
        }
      } else {
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

  toggleInfoBlock() {
    this.appStateService.toggleInfoBlock();
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
    this.markAsRead(notif.id);

    if (notif.type === "chat") {
      if (notif.todo_id) {
        this.router.navigate(["/todos", notif.todo_id, "tasks"], {
          queryParams: { openChat: true, highlightChat: notif.chat_id },
        });
      }
    } else if (notif.type === "comment") {
      if (notif.todo_id && notif.task_id) {
        const queryParams: any = {
          highlightComment: notif.comment_id,
          openComments: true,
        };
        this.router.navigate(["/todos", notif.todo_id, "tasks", notif.task_id, "subtasks"], {
          queryParams,
        });
      } else if (notif.todo_id) {
        this.router.navigate(["/todos", notif.todo_id, "tasks"], {
          queryParams: { openChat: true },
        });
      }
    } else if (notif.type === "todo") {
      if (notif.todo_id) {
        this.router.navigate(["/todos"], {
          queryParams: { highlightTodo: notif.todo_id },
        });
      }
    } else if (notif.type === "task") {
      if (notif.todo_id && notif.task_id) {
        this.router.navigate(["/todos", notif.todo_id, "tasks"], {
          queryParams: { highlightTaskId: notif.task_id },
        });
      } else if (notif.todo_id) {
        this.router.navigate(["/todos", notif.todo_id, "tasks"]);
      }
    } else if (notif.type === "subtask") {
      if (notif.todo_id && notif.task_id && notif.subtask_id) {
        this.router.navigate(["/todos", notif.todo_id, "tasks", notif.task_id, "subtasks"], {
          queryParams: { highlightSubtask: notif.subtask_id },
        });
      } else if (notif.todo_id && notif.task_id) {
        this.router.navigate(["/todos", notif.todo_id, "tasks", notif.task_id, "subtasks"]);
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
        if (NetworkErrorHelper.isNetworkError(response.message)) {
          if (!silent) {
            this.notifyService.showWarning("Working offline - sync unavailable");
          }
        } else if (!silent) {
          this.notifyService.showError(response.message || "Synchronization failed");
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (NetworkErrorHelper.isNetworkError(errorMessage)) {
        if (!silent) {
          this.notifyService.showWarning("Working offline - sync unavailable");
        }
      } else if (!silent) {
        this.notifyService.showError("Synchronization failed: " + errorMessage);
      }
    }
  }

  logout() {
    this.authService.logout();
  }

  showShortcuts() {
    this.shortcutEmitters.emitShortcuts();
  }
}
