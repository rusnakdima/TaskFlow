/* sys lib */
import { CommonModule, Location } from "@angular/common";
import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  signal,
  ChangeDetectorRef,
} from "@angular/core";
import { Subscription } from "rxjs";
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterModule,
} from "@angular/router";
import { distinctUntilChanged, filter, map } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Profile } from "@models/profile.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { SyncService } from "@services/sync.service";
import { NotificationCenterService } from "@services/notification-center.service";

interface Breadcrumb {
  label: string;
  description: string;
  url: string;
}

@Component({
  selector: "app-header",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./header.component.html",
})
export class HeaderComponent implements OnInit, OnDestroy {
  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService,
    private syncService: SyncService,
    private notificationService: NotificationCenterService,
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

  profile = signal<Profile | null>(null);
  todo = signal<Todo | null>(null);
  task = signal<Task | null>(null);

  isBack = signal(false);
  showUserMenu = signal(false);
  showNotificationMenu = signal(false);
  isSyncing = signal(false);

  notifications = this.notificationService.notifications;
  unreadCount = this.notificationService.unreadCount;

  breadcrumbs = signal<Breadcrumb[]>([]);
  private syncSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.themeVal.set(localStorage.getItem("theme") ?? "");
    this.userId.set(this.authService.getValueByKey("id"));
    this.role.set(this.authService.getValueByKey("role"));

    this.syncSubscription = this.syncService.isSyncing$.subscribe((isSyncing) =>
      this.isSyncing.set(isSyncing)
    );

    this.getProfile();

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        distinctUntilChanged(),
        map(async () => await this.createBreadcrumbs(this.route.root))
      )
      .subscribe(async (breadcrumbs) => {
        this.breadcrumbs.set(await breadcrumbs);
        this.isBack.set(this.breadcrumbs().length > 1);
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

  getProfile() {
    this.mainService
      .get<Profile>("profile", { userId: this.userId })
      .then((response: Response<Profile>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.profile.set(response.data);
        }
      })
      .catch((err: Response<string>) => {
        if (err.status === ResponseStatus.ERROR) {
          this.notifyService.showError(err.message ?? err.toString());
        }
      });
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
      if (child.snapshot.data["breadcrumb"]) {
        const routeURL: string = child.snapshot.url.map((segment) => segment.path).join("/");
        if (routeURL == "") {
          return this.createBreadcrumbs(child, url, breadcrumbs);
        }

        const newUrl = url + "/" + routeURL;

        let label: string = "";
        let description: string = "";
        const breadcrumbData = child.snapshot.data["breadcrumb"];
        if (typeof breadcrumbData === "function") {
          const data = await breadcrumbData(child.snapshot as ActivatedRouteSnapshot);
          if (data.task) {
            const object = data.task as { task: Task; todo: Todo };
            if (object) {
              const task = object.task as Task;
              if (task) {
                this.task.set(task);
                label = (task as any).title || "Task";
                description = task.description || "";
                this.description.set(description);
              }
            }
          }
          if (data.todo) {
            const todo = data.todo as Todo;
            if (todo) {
              this.todo.set(todo);
              if (!label) {
                label = todo.title;
              }
              description = todo.description || "";
              this.description.set(description);
            }
          }
          if (!label) {
            label = breadcrumbData;
          }
        } else {
          label = breadcrumbData;
        }

        breadcrumbs.push({
          label: label,
          description: description,
          url: newUrl,
        });

        return this.createBreadcrumbs(child, newUrl, breadcrumbs);
      }
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

  toggleUserMenu() {
    this.showUserMenu.set(!this.showUserMenu());
    if (this.showUserMenu()) {
      this.showNotificationMenu.set(false);
    }
  }

  closeUserMenu() {
    this.showUserMenu.set(false);
  }

  toggleNotificationMenu() {
    this.showNotificationMenu.set(!this.showNotificationMenu());
    if (this.showNotificationMenu()) {
      this.showUserMenu.set(false);
    }
  }

  closeNotificationMenu() {
    this.showNotificationMenu.set(false);
  }

  markAsRead(id: string) {
    this.notificationService.markAsRead(id);
  }

  markAllAsRead() {
    this.notificationService.markAllAsRead();
  }

  clearNotifications() {
    this.notificationService.clearAll();
  }

  async syncAll() {
    if (this.isSyncing()) return;

    this.notifyService.showInfo("Starting synchronization...");

    try {
      const response = await this.syncService.syncAll();
      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Synchronization completed successfully!");
      } else {
        this.notifyService.showError(response.message || "Synchronization failed");
      }
    } catch (error) {
      this.notifyService.showError("Synchronization failed: " + error);
    }
  }

  logout() {
    this.closeUserMenu();
    this.authService.logout();
  }
}
