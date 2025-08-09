/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { filter } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { BottomNavLink } from "@models/bottome-nav";

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
      url: "/home",
      icon: "home",
    },
    {
      url: "/tasks",
      icon: "list_alt",
    },
    {
      url: "/create",
      icon: "add",
    },
    {
      url: "/stats",
      icon: "bar_chart",
    },
    {
      url: "/profile",
      icon: "person",
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
