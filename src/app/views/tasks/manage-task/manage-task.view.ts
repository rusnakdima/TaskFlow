/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnInit } from "@angular/core";
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
import { MatRadioModule } from "@angular/material/radio";
import { MatInputModule } from "@angular/material/input";
import { MatDatepickerModule } from "@angular/material/datepicker";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { PriorityTask, Task } from "@models/task";
import { Todo } from "@models/todo";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

interface PriorityOption {
  value: PriorityTask;
  label: string;
  description: string;
  colorClass: string;
}

@Component({
  selector: "app-manage-task",
  standalone: true,
  providers: [AuthService, MainService],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatRadioModule,
    MatDatepickerModule,
    MatInputModule,
  ],
  templateUrl: "./manage-task.view.html",
})
export class ManageTaskView implements OnInit {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private location: Location,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      todoId: ["", Validators.required],
      title: ["", Validators.required],
      description: ["", Validators.required],
      isCompleted: [false],
      priority: ["", Validators.required],
      startDate: [""],
      endDate: [""],
      order: [0],
      isDeleted: [false],
      createdAt: [""],
      updatedAt: [""],
    });
  }

  todoId: string = "";
  form: FormGroup;
  isEdit: boolean = false;
  isSubmitting: boolean = false;

  projectInfo: Todo | null = null;
  newSubtaskTitle: string = "";

  priorityOptions: PriorityOption[] = [
    {
      value: PriorityTask.LOW,
      label: "Low Priority",
      description: "Nice to have, no rush",
      colorClass: "bg-blue-500",
    },
    {
      value: PriorityTask.MEDIUM,
      label: "Medium Priority",
      description: "Important, plan accordingly",
      colorClass: "bg-yellow-500",
    },
    {
      value: PriorityTask.HIGH,
      label: "High Priority",
      description: "Critical, needs attention",
      colorClass: "bg-red-500",
    },
  ];

  ngOnInit() {
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.todoId = params.todoId;
        this.form.controls["todoId"].setValue(params.todoId);
        this.loadProjectInfo(params.todoId);
      }
      if (params.taskId) {
        this.getTaskInfo(params.taskId);
        this.isEdit = true;
      }
    });
  }

  getTaskInfo(taskId: string) {
    this.mainService
      .getByField<Task>("task", "id", taskId)
      .then((response: Response<Task>) => {
        if (response.status == ResponseStatus.SUCCESS) {
          this.form.patchValue(response.data);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  back() {
    this.location.back();
  }

  loadProjectInfo(todoId: string) {
    this.mainService
      .getByField<Todo>("todo", "id", todoId)
      .then((response: Response<Todo>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.projectInfo = response.data;
        }
      })
      .catch((err: Response<string>) => {
        console.error("Error loading project info:", err);
      });
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
      this.isSubmitting = true;
      if (this.isEdit) {
        this.updateTask();
      } else {
        this.createTask();
      }
    }
  }

  createTask() {
    if (this.form.valid) {
      this.mainService
        .getAllByField<Task[]>("task", "todoId", this.todoId)
        .then((response: Response<Task[]>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const order = response.data.length;
            const body = {
              ...this.form.value,
              order: order,
            };

            this.mainService
              .create<string, Task>("task", body)
              .then((response: Response<string>) => {
                this.isSubmitting = false;
                this.notifyService.showNotify(response.status, response.message);
                if (response.status == ResponseStatus.SUCCESS) {
                  this.back();
                }
              })
              .catch((err: Response<string>) => {
                this.isSubmitting = false;
                this.notifyService.showError(err.message ?? err.toString());
              });
          } else {
            this.isSubmitting = false;
            this.notifyService.showError("Failed to get existing tasks count");
          }
        })
        .catch((err: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showError("Failed to get existing tasks count");
        });
    } else {
      this.isSubmitting = false;
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateTask() {
    if (this.form.valid) {
      const body = this.form.value;
      this.mainService
        .update<string, Task>("task", body.id, body)
        .then((response: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.back();
          }
        })
        .catch((err: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showError(err.message ?? err.toString());
        });
    } else {
      this.isSubmitting = false;
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
