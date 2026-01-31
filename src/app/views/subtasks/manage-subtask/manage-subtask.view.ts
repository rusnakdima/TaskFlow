/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatRadioModule } from "@angular/material/radio";

/* models */
import { PriorityTask, Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Todo } from "@models/todo.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

interface PriorityOption {
  value: PriorityTask;
  label: string;
  colorClass: string;
}

@Component({
  selector: "app-manage-subtask",
  standalone: true,
  providers: [AuthService, DataSyncProvider],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
  ],
  templateUrl: "./manage-subtask.view.html",
})
export class ManageSubtaskView implements OnInit {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private notifyService: NotifyService,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      taskId: ["", Validators.required],
      title: ["", Validators.required],
      description: [""],
      status: [TaskStatus.PENDING],
      priority: ["", Validators.required],
      order: [0],
      isDeleted: [false],
      createdAt: [""],
      updatedAt: [""],
    });
  }

  taskId = signal("");
  todoId = signal("");
  form: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);

  projectInfo = signal<Todo | null>(null);
  taskInfo = signal<Task | null>(null);

  userId: string = "";
  isOwner: boolean = true;
  isPrivate: boolean = true;

  priorityOptions: PriorityOption[] = [
    {
      value: PriorityTask.LOW,
      label: "Low",
      colorClass: "bg-blue-500",
    },
    {
      value: PriorityTask.MEDIUM,
      label: "Medium",
      colorClass: "bg-yellow-500",
    },
    {
      value: PriorityTask.HIGH,
      label: "High",
      colorClass: "bg-red-500",
    },
  ];

  ngOnInit() {
    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.isPrivate !== undefined) {
        this.isPrivate = queryParams.isPrivate === "true";
      }
    });

    this.userId = this.authService.getValueByKey("id");

    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.todoId.set(params.todoId);
        this.loadProjectInfo(params.todoId);
      }
      if (params.taskId) {
        this.taskId.set(params.taskId);
        this.form.controls["taskId"].setValue(params.taskId);
        this.loadTaskInfo(params.taskId);
      }
      if (params.subtaskId) {
        this.getSubtaskInfo(params.subtaskId);
        this.isEdit.set(true);
      }
    });
  }

  getSubtaskInfo(subtaskId: string) {
    this.dataSyncProvider
      .get<Subtask>(
        "subtask",
        { id: subtaskId },
        { isOwner: this.isOwner, isPrivate: this.isPrivate }
      )
      .subscribe({
        next: (subtaskData) => {
          this.form.patchValue(subtaskData);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to load subtask");
        },
      });
  }

  back() {
    this.location.back();
  }

  loadProjectInfo(todoId: string) {
    this.dataSyncProvider
      .get<Todo>(
        "todo",
        { id: todoId },
        { isOwner: this.isPrivate ? true : false, isPrivate: this.isPrivate }
      )
      .subscribe({
        next: (todo) => {
          this.projectInfo.set(todo);

          this.isOwner = todo.userId === this.userId;
          this.isPrivate = todo.visibility === "private";
        },
        error: (err) => {
          console.error("Error loading project info:", err);
        },
      });
  }

  loadTaskInfo(taskId: string) {
    this.dataSyncProvider
      .get<Task>("task", { id: taskId }, { isOwner: this.isOwner, isPrivate: this.isPrivate })
      .subscribe({
        next: (task) => {
          this.taskInfo.set(task);
        },
        error: (err) => {
          console.error("Error loading task info:", err);
        },
      });
  }

  duplicateSubtask() {
    if (this.form.valid) {
      this.dataSyncProvider
        .getAll<Subtask>(
          "subtask",
          { taskId: this.taskId() },
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todoId()
        )
        .subscribe({
          next: (subtasks) => {
            const order = subtasks.length;
            const currentData = this.form.value;
            const duplicateData = {
              ...currentData,
              id: "",
              _id: "",
              title: `${currentData.title} (Copy)`,
              status: TaskStatus.PENDING,
              order: order,
            };

            this.dataSyncProvider
              .create<any>(
                "subtask",
                duplicateData,
                { isOwner: this.isOwner, isPrivate: this.isPrivate },
                this.todoId()
              )
              .subscribe({
                next: (result) => {
                  this.notifyService.showSuccess("Subtask duplicated successfully");
                },
                error: (err) => {
                  this.notifyService.showError(err.message || "Failed to duplicate subtask");
                },
              });
          },
          error: (err) => {
            this.notifyService.showError("Failed to get existing subtasks count");
          },
        });
    }
  }

  viewTaskDetails() {
    if (this.todoId() && this.taskId()) {
      this.router.navigate(["/todos", this.todoId(), "tasks", this.taskId(), "edit_task"]);
    }
  }

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((control) => {
        control.markAsTouched();
      });
      this.notifyService.showError("Please fill in all required fields");
      return;
    }

    if (this.form.valid) {
      this.isSubmitting.set(true);
      if (this.isEdit()) {
        this.updateSubtask();
      } else {
        this.createSubtask();
      }
    }
  }

  createSubtask() {
    if (this.form.valid) {
      this.dataSyncProvider
        .getAll<Subtask>(
          "subtask",
          { field: "taskId", value: this.taskId() },
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todoId()
        )
        .subscribe({
          next: (subtasks) => {
            const length = subtasks.length;
            const body = {
              ...this.form.value,
              order: length,
              taskId: this.taskId(),
            };

            this.dataSyncProvider
              .create<any>(
                "subtask",
                body,
                { isOwner: this.isOwner, isPrivate: this.isPrivate },
                this.projectInfo()?.id
              )
              .subscribe({
                next: (result) => {
                  this.isSubmitting.set(false);
                  this.notifyService.showSuccess("Subtask created successfully");
                  this.back();
                },
                error: (err) => {
                  this.isSubmitting.set(false);
                  this.notifyService.showError(err.message || "Failed to create subtask");
                },
              });
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.notifyService.showError("Failed to get existing subtasks count");
          },
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateSubtask() {
    if (this.form.valid) {
      const body = {
        ...this.form.value,
      };

      this.dataSyncProvider
        .update<any>(
          "subtask",
          body.id,
          body,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.projectInfo()?.id
        )
        .subscribe({
          next: (result) => {
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Subtask updated successfully");
            this.back();
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.notifyService.showError(err.message || "Failed to update subtask");
          },
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
