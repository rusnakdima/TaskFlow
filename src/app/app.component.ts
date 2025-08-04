/* sys lib */
import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterOutlet } from "@angular/router";

/* components */
import { HeaderComponent } from "@components/header/header.component";
import { WindowNotifyComponent } from "@components/window-notify/window-notify.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, WindowNotifyComponent],
  templateUrl: "./app.component.html",
})
export class AppComponent {
  constructor() {}

  ngOnInit(): void {
    const theme = localStorage.getItem("theme") ?? "";
    document.querySelector("html")!.setAttribute("class", theme);
  }
}
