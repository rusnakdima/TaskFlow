/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-not-found",
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: "./not-found.view.html",
})
export class NotFoundView {}
