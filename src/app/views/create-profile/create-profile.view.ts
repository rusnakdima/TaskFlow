/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { FormComponent } from "@components/form/form.component";

/* models */
import { FormField, TypeField } from "@models/form-field.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { DataSyncProvider } from "@providers/data-sync.provider";

@Component({
  selector: "app-create-profile",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    FormComponent,
  ],
  templateUrl: "./create-profile.view.html",
})
export class CreateProfileView implements OnInit {
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider,
    private notifyService: NotifyService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      name: ["", Validators.required],
      lastName: ["", Validators.required],
      bio: [""],
      imageUrl: [""],
      userId: ["", Validators.required],
    });
  }

  form: FormGroup;

  formFields: Array<FormField> = [
    {
      label: "Name",
      name: "name",
      type: TypeField.text,
      isShow: (param) => true,
    },
    {
      label: "Last Name",
      name: "lastName",
      type: TypeField.text,
      isShow: (param) => true,
    },
    {
      label: "Biography",
      name: "bio",
      type: TypeField.text,
      isShow: (param) => true,
    },
    {
      label: "Image Profile",
      name: "imageUrl",
      type: TypeField.image,
      isShow: (param) => true,
    },
  ];

  ngOnInit() {
    const userId = this.authService.getValueByKey("id");
    if (userId && userId != "") {
      this.form.controls["userId"].setValue(userId);
    }
  }

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((control) => {
        control.markAsTouched();
      });
    }

    if (this.form.valid) {
      const body = this.form.value;
      this.dataSyncProvider.createProfile(body).subscribe({
        next: () => {
          this.notifyService.showSuccess("Profile created successfully");
          this.router.navigate([""]);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to create profile");
        },
      });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
