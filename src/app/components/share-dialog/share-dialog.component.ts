/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Inject, OnInit, signal } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { firstValueFrom } from "rxjs";

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
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Profile } from "@models/profile.model";
import { Response, ResponseStatus } from "@models/response.model";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { DataSyncProvider } from "@services/data-sync.provider";
import { SyncService } from "@services/sync.service";

@Component({
  selector: "app-share-dialog",
  standalone: true,
  providers: [AuthService, MainService, DataSyncProvider, SyncService],
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
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider,
    private syncService: SyncService,
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

  ngOnInit() {
    this.userId.set(this.authService.getValueByKey("id"));
    if (this.userId() && this.userId() != "") {
      this.fetchProfiles();
    }

    // Set current visibility and assignees from the todo
    if (this.data.todo) {
      this.form.patchValue({
        visibility: this.data.todo.visibility || "private",
        assignees: this.data.todo.assignees || [],
      });
    }
  }

  async fetchProfiles(): Promise<void> {
    return this.mainService
      .getAll<Profile[]>("profile")
      .then((response: Response<Profile[]>) => {
        if (response.status == ResponseStatus.SUCCESS) {
          this.availableProfiles.set(response.data);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
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
        assignees: formValue.assignees.map((p: Profile) => p.id),
        updatedAt: new Date().toISOString(),
      };

      const currentVisibility = this.data.todo.visibility;
      const newVisibility = formValue.visibility;
      const visibilityChanged = currentVisibility !== newVisibility;

      try {
        if (visibilityChanged) {
          // When visibility changes, we need to update the todo in both databases
          const oldIsPrivate = currentVisibility === "private";
          const newIsPrivate = newVisibility === "private";

          // First, update in the old database (where it currently exists)
          try {
            await firstValueFrom(
              this.dataSyncProvider.update<Todo>("todo", this.data.todo.id, body, {
                isOwner: true,
                isPrivate: oldIsPrivate,
              })
            );
          } catch (error) {
            console.log("Could not update in old database (might not exist there):", error);
          }

          // Then, update/create in the new database (where it should exist after change)
          const result = await firstValueFrom(
            this.dataSyncProvider.update<Todo>("todo", this.data.todo.id, body, {
              isOwner: true,
              isPrivate: newIsPrivate,
            })
          );

          // Update tasks and subtasks for the visibility change
          await this.updateTasksAndSubtasksForTodo(this.data.todo.id, newVisibility);

          this.notifyService.showSuccess("Todo sharing updated successfully");
          this.dialogRef.close(result);
        } else {
          // No visibility change, just update the todo normally
          const isPrivate = newVisibility === "private";
          const result = await firstValueFrom(
            this.dataSyncProvider.update<Todo>("todo", this.data.todo.id, body, {
              isOwner: true,
              isPrivate: isPrivate,
            })
          );

          this.notifyService.showSuccess("Todo sharing updated successfully");
          this.dialogRef.close(result);
        }
      } catch (err: any) {
        this.notifyService.showError(err.message || "Failed to update todo sharing");
      }
    }
  }

  private async updateTasksAndSubtasksForTodo(todoId: string, visibility: string) {
    const isPrivate = visibility === "private";
    const ownerParams = { isOwner: true, isPrivate };

    try {
      const tasks = await firstValueFrom(
        this.dataSyncProvider.getAll<Task>(
          "task",
          { todoId },
          { isOwner: true, isPrivate: !isPrivate },
          todoId
        )
      );

      // Filter out any tasks that might have invalid data
      const validTasks = tasks?.filter((task) => task && task.id) || [];

      console.log(`Processing ${validTasks.length} valid tasks for todo visibility change`);

      if (validTasks.length === 0) {
        // No valid tasks to update, but still trigger sync if needed
        console.log("No valid tasks to update, proceeding with sync");
        await this.triggerSync(isPrivate);
        return;
      }

      const taskUpdatePromises = validTasks.map((task) => {
        const updatedTask = { ...task, updatedAt: new Date().toISOString().split(".")[0] };
        return firstValueFrom(
          this.dataSyncProvider.update<Task>("task", task.id, updatedTask, ownerParams)
        ).catch(async (error) => {
          // If task not found, try to create it
          if (error?.message?.includes("Task not found") || error?.status === "Error") {
            console.log(`Task ${task.id} not found, attempting to create it`);
            try {
              const createResult = await firstValueFrom(
                this.dataSyncProvider.create<Task>("task", updatedTask, ownerParams, todoId)
              );
              console.log(`Successfully created task ${task.id}`);
              return createResult;
            } catch (createError) {
              console.error(`Failed to create task ${task.id}:`, createError);
              return null;
            }
          } else {
            console.error(`Failed to update task ${task.id}:`, error);
            return null;
          }
        });
      });

      const subtaskPromises = validTasks.map((task) =>
        firstValueFrom(
          this.dataSyncProvider.getAll<Subtask>(
            "subtask",
            { taskId: task.id },
            { isOwner: true, isPrivate: !isPrivate },
            todoId
          )
        )
      );

      const subtasksArrays = await Promise.all(subtaskPromises);
      const allSubtasks = subtasksArrays.flat();

      const subtaskUpdatePromises = allSubtasks.map((subtask) => {
        const updatedSubtask = {
          ...subtask,
          updatedAt: new Date().toISOString().split(".")[0],
        };
        return firstValueFrom(
          this.dataSyncProvider.update<Subtask>("subtask", subtask!.id, updatedSubtask, ownerParams)
        ).catch(async (error) => {
          // If subtask not found, try to create it
          if (error?.message?.includes("Subtask not found") || error?.status === "Error") {
            console.log(`Subtask ${subtask!.id} not found, attempting to create it`);
            try {
              const createResult = await firstValueFrom(
                this.dataSyncProvider.create<Subtask>(
                  "subtask",
                  updatedSubtask,
                  ownerParams,
                  todoId
                )
              );
              console.log(`Successfully created subtask ${subtask!.id}`);
              return createResult;
            } catch (createError) {
              console.error(`Failed to create subtask ${subtask!.id}:`, createError);
              return null;
            }
          } else {
            console.error(`Failed to update subtask ${subtask!.id}:`, error);
            return null;
          }
        });
      });

      // Wait for all updates to complete (filter out null results from failed updates)
      const allResults = await Promise.all([...taskUpdatePromises, ...subtaskUpdatePromises]);
      const successfulUpdates = allResults.filter((result) => result !== null);

      console.log(
        `Visibility change: ${successfulUpdates.length}/${allResults.length} items processed successfully`
      );

      await this.triggerSync(isPrivate);
    } catch (err) {
      console.error("Failed to update tasks and subtasks for todo:", err);
      this.notifyService.showError("Failed to update related tasks and subtasks");
    }
  }

  private async triggerSync(isPrivate: boolean) {
    try {
      let syncResult;

      if (!isPrivate) {
        // Changing to team/shared - export local data to cloud
        console.log("Exporting data to cloud for shared todo");
        syncResult = await this.syncService.exportToCloud();
      } else {
        // Changing to private - import shared data from cloud to local
        console.log("Importing data from cloud for private todo");
        syncResult = await this.syncService.importToLocal();
      }

      if (syncResult.status === "Success") {
        console.log(
          `Sync completed successfully after visibility change to ${isPrivate ? "private" : "team"}`
        );
      } else {
        console.warn("Sync failed after visibility change:", syncResult.message);
      }
    } catch (error) {
      console.error("Sync error after visibility change:", error);
    }
  }
}
