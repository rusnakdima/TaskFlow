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
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { StorageService } from "@services/core/storage.service";

@Component({
  selector: "app-edit-profile",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    FormComponent,
  ],
  templateUrl: "./edit-profile.view.html",
})
export class EditProfileView {
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider,
    private notifyService: NotifyService,
    private storageService: StorageService // ✅ Inject StorageService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      name: ["", Validators.required],
      lastName: ["", Validators.required],
      bio: [""],
      imageUrl: [""],
      userId: ["", Validators.required],
      createdAt: [""],
      updatedAt: [""],
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

      // ✅ FIX: Check if profile is already cached in StorageService
      const cachedProfile = this.storageService.profile();

      if (cachedProfile) {
        // ✅ Use cached profile - no API call needed
        this.form.patchValue(cachedProfile);
      } else {
        // ⚠️ Profile not cached - fetch it (should rarely happen)
        this.dataSyncProvider.getProfileByUserId(userId).subscribe({
          next: (profile: Profile | null) => {
            if (profile) {
              this.form.patchValue(profile);
              // ✅ Cache it for other views
              this.storageService.setProfile(profile);
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to load profile");
            this.router.navigate(["/login"]);
          },
        });
      }
    } else {
      this.router.navigate(["/login"]);
      this.notifyService.showError("You are not logged in");
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
      this.dataSyncProvider.crud<Profile>("update", "profiles", { id: body.id, data: body }).subscribe({
        next: () => {
          this.notifyService.showSuccess("Profile updated successfully");
          this.router.navigate(["/profile"], { queryParams: { id: body.userId } });
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to update profile");
        },
      });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
