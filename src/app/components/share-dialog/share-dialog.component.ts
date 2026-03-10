/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Inject, OnInit, signal } from "@angular/core";
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { firstValueFrom } from "rxjs";
import { ActivatedRoute } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatRadioModule } from "@angular/material/radio";
import { MatMenuModule } from "@angular/material/menu";
import { MatDividerModule } from "@angular/material/divider";
import { MatButtonModule } from "@angular/material/button";

/* models */
import { Todo } from "@models/todo.model";
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { StorageService } from "@services/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

@Component({
  selector: "app-share-dialog",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatMenuModule,
    MatDividerModule,
    MatButtonModule,
  ],
  templateUrl: "./share-dialog.component.html",
})
export class ShareDialogComponent implements OnInit {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private authService: AuthService,
    private notifyService: NotifyService,
    private storageService: StorageService,
    private dataSyncProvider: DataSyncProvider,
    private dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { todo: Todo }
  ) {
    this.form = fb.group({
      visibility: ["private"],
      assignees: [[]],
    });
  }

  form: FormGroup;
  userId = signal("");

  availableProfiles = signal<Profile[]>([]);
  userSearchQuery = signal("");

  isPrivate: boolean = true;

  ngOnInit() {
    // Initialize visibility from todo data
    this.isPrivate = this.data.todo?.visibility === "private";
    this.form.patchValue({ visibility: this.isPrivate ? "private" : "team" });

    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.isPrivate !== undefined) {
        this.isPrivate = queryParams.isPrivate === "true";
      }
    });

    this.userId.set(this.authService.getValueByKey("id"));

    if (this.userId() && this.userId() != "") {
      this.fetchProfiles();
    }

    if (this.data.todo) {
      this.form.patchValue({
        visibility: this.data.todo.visibility || "private",
        assignees: this.data.todo.assignees || [],
      });
    }
  }

  async fetchProfiles(): Promise<void> {
    // Fetch ALL profiles, not just current user's profile
    this.dataSyncProvider.getAll<Profile>("profiles", {}).subscribe({
      next: (profiles) => {
        // Filter out current user from the list (can't share with yourself)
        const currentUserId = this.authService.getValueByKey("id");
        const otherProfiles = profiles.filter((p) => p.id !== currentUserId);
        this.availableProfiles.set(otherProfiles);
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to load profiles");
      },
    });
  }

  getFilteredUsers() {
    if (!this.userSearchQuery()) return this.availableProfiles();
    return this.availableProfiles().filter(
      (p) =>
        p.user &&
        `${p.name} ${p.lastName} ${p.user.email}`
          .toLowerCase()
          .includes(this.userSearchQuery().toLowerCase())
    );
  }

  addProfile(profile: Profile) {
    const currentAssignees = this.form.get("assignees")?.value || [];
    const exists = currentAssignees.some((p: Profile) => p.id === profile.id);
    if (!exists) {
      this.form.patchValue({
        assignees: [...currentAssignees, profile],
      });
    }
  }

  removeProfile(profile: Profile) {
    const currentAssignees = this.form.get("assignees")?.value || [];
    this.form.patchValue({
      assignees: currentAssignees.filter((p: Profile) => p.id !== profile.id),
    });
  }

  getMemberInitialsFromProfile(profile: Profile): string {
    return (profile.name.charAt(0) + profile.lastName.charAt(0)).toUpperCase();
  }

  getSelectedUsersText(): string {
    const assignees = this.form.get("assignees")?.value || [];
    return assignees.map((p: Profile) => `${p.name} ${p.lastName}`).join(", ");
  }

  onCancel() {
    this.dialogRef.close();
  }

  async onShare() {
    if (this.form.valid) {
      const formValue = this.form.value;
      const body = {
        id: this.data.todo.id,
        visibility: formValue.visibility,
        assignees: formValue.assignees.map((p: Profile) => p.userId), // Send user ID, not profile ID
        updatedAt: new Date().toISOString(),
      };

      const currentVisibility = this.data.todo.visibility;
      const newVisibility = formValue.visibility;
      const visibilityChanged = currentVisibility !== newVisibility;

      // Determine sync metadata based on new visibility
      const isPrivate = newVisibility === "private";
      const syncMetadata = { isOwner: true, isPrivate };

      try {
        const result = await firstValueFrom(
          this.dataSyncProvider.update<Todo>("todos", this.data.todo.id, body, syncMetadata)
        );

        // Update cache with full result data
        this.storageService.updateItem("todo", body.id, result);

        if (visibilityChanged) {
          try {
            await this.dataSyncProvider.syncAfterVisibilityChange(newVisibility);
            // Reload data to ensure consistency after visibility change
            this.storageService.loadAllData(true).subscribe();
          } catch (syncError) {
            this.notifyService.showWarning("Todo updated, but sync may not have completed.");
          }
        }

        this.isPrivate = newVisibility === "private";
        this.notifyService.showSuccess("Todo sharing updated successfully");

        // Close dialog with updated todo data
        this.dialogRef.close(result);
      } catch (err: any) {
        this.notifyService.showError(err.message || "Failed to update todo sharing");
      }
    }
  }
}
