/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, EventEmitter, Output } from "@angular/core";
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
import { Todo } from "@models/todo";
import { Task } from "@models/task";

interface Breadcrumb {
  label: string;
  url: string;
}

@Component({
  selector: "app-header",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./header.component.html",
})
export class HeaderComponent {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location
  ) {}

  @Output() isShowNavEvent: EventEmitter<boolean> = new EventEmitter();

  themeVal: string = "";
  title: string = "";
  iconUrl: string = "";

  todo: Todo | null = null;
  task: Task | null = null;

  typeInfoMenu: "todo" | "task" = "todo";
  isBack: boolean = false;
  isShowInfoMenu: boolean = false;

  breadcrumbs: Breadcrumb[] = [];

  ngOnInit(): void {
    this.themeVal = localStorage.getItem("theme") ?? "";

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        distinctUntilChanged(),
        map(async () => await this.createBreadcrumbs(this.route.root))
      )
      .subscribe(async (breadcrumbs) => {
        this.breadcrumbs = await breadcrumbs;
        this.isBack = this.breadcrumbs.length > 1;
        this.title =
          this.breadcrumbs.length > 0
            ? this.breadcrumbs[this.breadcrumbs.length - 1].label
            : "Home";
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
        const breadcrumbData = child.snapshot.data["breadcrumb"];
        if (typeof breadcrumbData === "function") {
          const data = await breadcrumbData(child.snapshot as ActivatedRouteSnapshot);
          console.log(data);
          if (data.task) {
            const task = data.task as Task;
            console.log(task)
            if (task) {
              this.task = task;
              label = task.title;
              this.typeInfoMenu = "task";
            }
          } else if (data.todo) {
            const todo = data.todo as Todo;
            if (todo) {
              this.todo = todo;
              label = todo.title;
              this.typeInfoMenu = "todo";
            }
          } else {
            label = breadcrumbData;
          }
        } else {
          label = breadcrumbData;
        }

        breadcrumbs.push({
          label: label,
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
    this.themeVal = theme;
  }
}
