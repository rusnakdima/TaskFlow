/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { filter } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { BottomNavLink } from "@models/bottome-nav.model";

@Component({
  selector: "app-bottom-nav",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./bottom-nav.component.html",
})
export class BottomNavComponent implements OnInit {
  constructor(private router: Router) {}

  url: string = "";

  listNavs: Array<BottomNavLink> = [
    {
      url: "/dashboard",
      icon: "home",
      label: "Home",
      query: {},
    },
    {
      url: "/todos",
      icon: "list_alt",
      label: "Projects",
      query: {},
    },
    {
      url: "/calendar",
      icon: "calendar_month",
      label: "Calendar",
      query: {},
    },
    {
      url: "/shared-tasks",
      icon: "group",
      label: "Shared",
      query: {},
    },
    {
      url: "/Statistic",
      icon: "bar_chart",
      label: "Stats",
      query: {},
    },
  ];

  ngOnInit(): void {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((val) => {
      let lastIndex =
        this.router.url.lastIndexOf("?") > -1
          ? this.router.url.lastIndexOf("?")
          : this.router.url.length;
      this.url = this.router.url.slice(0, lastIndex);
    });
  }
}
