/* sys lib */
import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterOutlet } from "@angular/router";

/* components */
import { HeaderComponent } from "@components/header/header.component";
import { WindowNotifyComponent } from "@components/window-notify/window-notify.component";
import { BottomNavComponent } from "@components/bottom-nav/bottom-nav.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, WindowNotifyComponent, BottomNavComponent],
  templateUrl: "./app.component.html",
})
export class AppComponent {
  constructor(private router: Router) {}

  ngOnInit(): void {
    const theme = localStorage.getItem("theme") ?? "";
    document.querySelector("html")!.setAttribute("class", theme);

    const token = localStorage.getItem("token") ?? "";
    if (!token) {
      this.router.navigate(["/login"]);
    }
  }
}
