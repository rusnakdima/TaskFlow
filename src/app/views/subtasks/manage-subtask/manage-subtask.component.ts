/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";

/* models */
import { FormField, parseEnumOptions, TypeField } from "@models/form-field";
import { Response, ResponseStatus } from "@models/response";
import { PriorityTask } from "@models/task";
import { Subtask } from "@models/subtask";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { FormComponent } from "@components/form/form.component";

@Component({
  selector: "app-manage-subtask",
  standalone: true,
  providers: [AuthService, MainService, NotifyService],
  imports: [CommonModule, FormComponent],
  templateUrl: "./manage-subtask.component.html",
})
export class ManageSubtaskComponent {
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
      taskId: ["", Validators.required],
      title: ["", Validators.required],
      description: ["", Validators.required],
      isCompleted: [false],
      priority: ["", Validators.required],
      createdAt: [""],
      updatedAt: [""],
    });
  }

  taskId: string = "";

  form: FormGroup;

  formFields: Array<FormField> = [
    {
      label: "Title",
      name: "title",
      type: TypeField.text,
      isShow: (param) => true,
    },
    {
      label: "Description",
      name: "description",
      type: TypeField.textarea,
      isShow: (param) => true,
    },
    {
      label: "Priority",
      name: "priority",
      type: TypeField.select,
      options: parseEnumOptions(PriorityTask),
      isShow: (param) => true,
    },
  ];

  isEdit: boolean = false;

  ngOnInit() {
    this.route.params.subscribe((params: any) => {
      if (params.taskId) {
        this.taskId = params.taskId;
        this.form.controls["taskId"].setValue(params.taskId);
      }
      if (params.subtaskId) {
        this.getSubtaskInfo(params.subtaskId);
        this.isEdit = true;
      }
    });
  }

  getSubtaskInfo(subtaskId: string) {
    this.mainService
      .getByField<Subtask>("subtask", "id", subtaskId)
      .then((response: Response<Subtask>) => {
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

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((control) => {
        control.markAsTouched();
      });
    }

    if (this.form.valid) {
      if (this.isEdit) {
        this.updateSubtask();
      } else {
        this.createSubtask();
      }
    }
  }

  createSubtask() {
    if (this.form.valid) {
      const body = this.form.value;
      this.mainService
        .create<string, Subtask>("subtask", body)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.back();
          }
        })
        .catch((err: Response<string>) => {
          console.error(err);
          this.notifyService.showError(err.message ?? err.toString());
        });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateSubtask() {
    if (this.form.valid) {
      const body = this.form.value;
      this.mainService
        .update<string, Subtask>("subtask", body.id, body)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.back();
          }
        })
        .catch((err: Response<string>) => {
          console.error(err);
          this.notifyService.showError(err.message ?? err.toString());
        });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
