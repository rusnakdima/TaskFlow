/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";

/* models */
import { TextField } from "@models/form-field.model";

/* base */
import { BaseFieldComponent } from "../base-field.component";

@Component({
  selector: "app-text",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: "./text.component.html",
})
export class TextComponent extends BaseFieldComponent {
  override field!: TextField;
}
