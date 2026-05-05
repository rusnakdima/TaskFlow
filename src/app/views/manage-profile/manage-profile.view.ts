/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, DestroyRef } from "@angular/core";
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
import { ApiProvider } from "@providers/api.provider";
import { DataService } from "@services/data/data.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";

@Component({
  selector: "app-manage-profile",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    FormComponent,
  ],
  templateUrl: "./manage-profile.view.html",
})
export class ManageProfileView implements OnInit {
  isEditMode: boolean = false;
  private destroyRef = inject(DestroyRef);

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private dataSyncProvider: ApiProvider,
    private notifyService: NotifyService,
    private dataService: DataService,
    private profileRequiredService: ProfileRequiredService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      name: ["", Validators.required],
      last_name: ["", Validators.required],
      bio: [""],
      image_url: [""],
      original_image_url: [""],
      user_id: ["", Validators.required],
      created_at: [""],
      updated_at: [""],
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
      name: "last_name",
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
      name: "image_url",
      type: TypeField.image,
      isShow: (param) => true,
    },
  ];

  ngOnInit() {
    const userId = this.authService.getValueByKey("id");
    if (!userId) {
      this.notifyService.showError("You are not logged in");
      window.location.href = "/login";
      return;
    }

    this.form.controls["user_id"].setValue(userId);

    const profileSub = this.dataService.profile$.subscribe((profile) => {
      if (profile && profile.user_id === userId) {
        this.isEditMode = true;
        this.form.patchValue(profile);
      }
    });
    this.destroyRef.onDestroy(() => profileSub.unsubscribe());
  }

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((control) => {
        control.markAsTouched();
      });
      return;
    }

    if (this.form.valid) {
      const body = this.form.value;

      if (this.isEditMode) {
        const { _id, ...updateData } = body;
        const sub = this.dataService.getProfile().subscribe({
          next: () => {
            this.notifyService.showSuccess("Profile updated successfully");
            this.profileRequiredService.setProfileRequiredMode(false);
            this.router.navigate(["/profile"]);
          },
          error: (err: unknown) => {
            const message = err instanceof Error ? err.message : "Failed to update profile";
            this.notifyService.showError(message);
          },
        });
        this.destroyRef.onDestroy(() => sub.unsubscribe());
      } else {
        const sub = this.dataService.getPublicProfiles().subscribe({
          next: () => {
            this.notifyService.showSuccess("Profile created successfully");
            this.profileRequiredService.setProfileRequiredMode(false);
            window.location.href = "/";
          },
          error: (err: unknown) => {
            const message = err instanceof Error ? err.message : "Failed to create profile";
            this.notifyService.showError(message);
          },
        });
        this.destroyRef.onDestroy(() => sub.unsubscribe());
      }
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
