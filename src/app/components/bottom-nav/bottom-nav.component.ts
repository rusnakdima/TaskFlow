/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { filter } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* services */
import { AuthService } from "@services/auth.service";

/* models */
import { BottomNavLink } from "@models/bottome-nav";

@Component({
  selector: "app-bottom-nav",
  standalone: true,
  providers: [AuthService],
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./bottom-nav.component.html",
})
export class BottomNavComponent implements OnInit {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  url: string = "";
  userId: string = "";

  listNavs: Array<BottomNavLink> = [
    {
      url: "/dashboard",
      icon: "home",
      query: {},
    },
    {
      url: "/todos",
      icon: "list_alt",
      query: {},
    },
    {
      url: "/calendar",
      icon: "calendar_month",
      query: {},
    },
    {
      url: "/stats",
      icon: "bar_chart",
      query: {},
    },
    {
      url: `/profile`,
      icon: "person",
      query: { id: this.userId },
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
    this.getUserId();
  }

  getUserId() {
    this.userId = this.authService.getValueByKey("id");
    const link = this.listNavs.find((nav: BottomNavLink) => nav.url == "/profile");
    if (link) {
      link.query = { id: this.userId };
    }
  }
}
