/* sys lib */
import { CommonModule, Location } from "@angular/common";
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  EventEmitter,
  Output,
} from "@angular/core";
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterModule,
} from "@angular/router";
import { filter, map } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-header",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./header.component.html",
})
export class HeaderComponent {
  constructor(
    private router: Router,
    private location: Location,
  ) {}

  @Output() isShowNavEvent: EventEmitter<boolean> = new EventEmitter();

  themeVal: string = "";
  prevTitle: string = "";
  title: string = "";
  iconUrl: string = "";

  ngOnInit(): void {
    this.themeVal = localStorage.getItem("theme") ?? "";

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd
        ),
        map(() => {
          let route: ActivatedRoute = this.router.routerState.root;
          let prevRouteTitle: string = "";
          let routeTitle: string = "";

          while (route!.firstChild) {
            route = route.firstChild;
          }
          routeTitle = route.snapshot.data["breadcrumbs"];
          prevRouteTitle = route.parent!.snapshot.data["breadcrumbs"];

          return { prevRouteTitle, routeTitle };
        })
      )
      .subscribe(
        (data: {
          prevRouteTitle: string;
          routeTitle: string;
        }) => {
          this.title = data.routeTitle;
          this.prevTitle = data.prevRouteTitle;
        }
      );
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
