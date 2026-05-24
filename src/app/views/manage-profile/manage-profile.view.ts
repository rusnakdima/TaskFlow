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
import { TemplateFormComponent } from "@components/form/template-form/template-form.component";

/* models */
import { FormField, TypeField } from "@models/form-field.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiService } from "@services/api.service";
import { UnifiedStorageService } from "@services/core/unified-storage.service";
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
    TemplateFormComponent,
  ],
  templateUrl: "./manage-profile.view.html",
})
export class ManageProfileView implements OnInit {
  isEditMode: boolean = false;
  isProfileRequired: boolean = false;
  private userId: string = "";
  private destroyRef = inject(DestroyRef);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private apiService = inject(ApiService);
  private storage = inject(UnifiedStorageService);
  private profileRequiredService = inject(ProfileRequiredService);

  form: FormGroup = this.fb.group({
    _id: [""],
    id: [""],
    name: ["", Validators.required],
    last_name: ["", Validators.required],
    bio: [""],
    image_url: ["/assets/images/avatars/avatar-1.svg"],
    original_image_url: [""],
    user_id: ["", Validators.required],
    created_at: [""],
    updated_at: [""],
  });

  formFields: Array<FormField> = [
    {
      label: "Name",
      name: "name",
      type: TypeField.text,
      isShow: () => true,
    },
    {
      label: "Last Name",
      name: "last_name",
      type: TypeField.text,
      isShow: () => true,
    },
    {
      label: "Biography",
      name: "bio",
      type: TypeField.text,
      isShow: () => true,
    },
    {
      label: "Image Profile",
      name: "image_url",
      type: TypeField.image,
      isShow: () => true,
      avatarsOnly: true,
    },
  ];

  ngOnInit() {
    this.userId = this.authService.getValueByKey("id") || "";
    if (!this.userId) {
      this.notifyService.showError("You are not logged in");
      this.router.navigate(["/login"]);
      return;
    }

    this.form.controls["user_id"].setValue(this.userId);
    this.isProfileRequired = this.profileRequiredService.profileRequiredMode();

    let profile = this.storage.profiles().find((p) => p.user_id === this.userId);

    if (!profile) {
      let attempts = 0;
      const maxAttempts = 10;
      const checkProfile = setInterval(() => {
        attempts++;
        profile = this.storage.profiles().find((p) => p.user_id === this.userId);
        if (profile || attempts >= maxAttempts) {
          clearInterval(checkProfile);
          if (profile && profile.user_id === this.userId) {
            this.isEditMode = true;
            this.form.patchValue(profile);
          }
        }
      }, 100);
    } else if (profile.user_id === this.userId) {
      this.isEditMode = true;
      this.form.patchValue(profile);
    }
  }

  onCancel() {
    if (this.isProfileRequired) {
      this.profileRequiredService.setProfileRequiredMode(false);
      this.router.navigate(["/dashboard"]);
    } else {
      this.router.navigate(["/profile"]);
    }
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
        const currentProfile = this.storage.profiles().find((p) => p.user_id === this.userId);
        if (currentProfile) {
          const { _id, ...updateData } = body;
          const sub = this.apiService.profiles.update(currentProfile.id, updateData).subscribe({
            next: (updatedProfile) => {
              this.storage.updateEntitySignal("profiles", updatedProfile.id, updatedProfile);
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
        }
      } else {
        const sub = this.apiService.profiles.create(body).subscribe({
          next: (newProfile) => {
            this.storage.addEntity("profiles", newProfile);
            this.notifyService.showSuccess("Profile created successfully");
            this.profileRequiredService.setProfileRequiredMode(false);
            this.router.navigate(["/"]);
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
