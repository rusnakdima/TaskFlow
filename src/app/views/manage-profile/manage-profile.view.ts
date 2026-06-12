/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, DestroyRef, signal } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { ProfileFormComponent } from "@components/form/profile-form/profile-form.component";
import { AppButtonComponent } from "@components/shared/button/button.component";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiService } from "@services/api.service";
import { UnifiedStorageService } from "@services/core/unified-storage.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";

interface ProfileMetadata {
  _id: string;
  id: string;
  original_image_url: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: "app-manage-profile",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    ProfileFormComponent,
    AppButtonComponent,
  ],
  templateUrl: "./manage-profile.view.html",
})
export class ManageProfileView implements OnInit {
  isEditMode = false;
  isProfileRequired = false;
  profileLoading = signal(true);
  profileError = signal<string | null>(null);
  private userId: string = "";
  private destroyRef = inject(DestroyRef);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private apiService = inject(ApiService);
  private storage = inject(UnifiedStorageService);
  private profileRequiredService = inject(ProfileRequiredService);

  uiForm!: FormGroup;
  basicInfoGroup!: FormGroup;

  metadata: ProfileMetadata = {
    _id: "",
    id: "",
    original_image_url: "",
    user_id: "",
    created_at: "",
    updated_at: "",
  };

  ngOnInit() {
    this.initForm();
    this.userId = this.authService.getValueByKey("id") || "";

    if (!this.userId) {
      this.notifyService.showError("You are not logged in");
      this.router.navigate(["/login"]);
      return;
    }

    this.metadata.user_id = this.userId;
    this.isProfileRequired = this.profileRequiredService.profileRequiredMode();

    this.storage.ensureProfileLoaded();

    let profile = this.storage.profiles().find((p) => p.user_id === this.userId);

    if (!profile) {
      let attempts = 0;
      const maxAttempts = 30;
      const checkProfile = setInterval(() => {
        attempts++;
        profile = this.storage.profiles().find((p) => p.user_id === this.userId);
        if (profile || attempts >= maxAttempts) {
          clearInterval(checkProfile);
          this.profileLoading.set(false);
          if (profile && profile.user_id === this.userId) {
            this.loadProfile(profile);
          } else {
            this.profileError.set("Failed to load profile. Please try again.");
          }
        }
      }, 200);
    } else if (profile.user_id === this.userId) {
      this.profileLoading.set(false);
      this.loadProfile(profile);
    }
  }

  private initForm(): void {
    this.basicInfoGroup = this.fb.group({
      name: ["", Validators.required],
      last_name: ["", Validators.required],
      bio: [""],
      image_url: ["/assets/images/avatars/avatar-1.svg"],
    });

    this.uiForm = this.fb.group({
      basicInfo: this.basicInfoGroup,
    });
  }

  private loadProfile(profile: any) {
    this.isEditMode = true;
    this.profileLoading.set(false);
    this.profileError.set(null);
    this.basicInfoGroup.patchValue({
      name: profile.name,
      last_name: profile.last_name,
      bio: profile.bio,
      image_url: profile.image_url,
    });
    this.metadata = {
      _id: profile._id,
      id: profile.id,
      original_image_url: profile.original_image_url,
      user_id: profile.user_id,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    };
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
    if (this.uiForm.invalid || this.basicInfoGroup.invalid) {
      Object.values(this.basicInfoGroup.controls).forEach((control) => {
        control.markAsTouched();
      });
      return;
    }

    const basicInfo = this.basicInfoGroup.value;
    const body = { ...this.metadata, ...basicInfo };

    if (this.isEditMode) {
      const currentProfile = this.storage.profiles().find((p) => p.user_id === this.userId);
      if (currentProfile) {
        const { _id, ...updateData } = body;
        const sub = this.apiService.profiles.update(currentProfile.id, updateData).subscribe({
          next: (updatedProfile) => {
            const profileId = updatedProfile?.id || currentProfile.id;
            this.storage.updateEntitySignal("profiles", profileId, updatedProfile);
            this.storage.profiles.update((profiles) =>
              profiles.map((p) => (p.id === profileId ? { ...p, ...updatedProfile } : p))
            );
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
  }
}
