/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";

/* models */
import { FormField, TypeField } from "@models/form-field";
import { Todo } from "@models/todo";
import { Response, ResponseStatus } from "@models/response";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { FormComponent } from "@components/form/form.component";

@Component({
  selector: "app-manage-todo",
  standalone: true,
  providers: [AuthService, MainService, NotifyService],
  imports: [CommonModule, FormComponent],
  templateUrl: "./manage-todo.component.html",
})
export class ManageTodoComponent {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private location: Location,
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      userId: ["", Validators.required],
      title: ["", Validators.required],
      description: ["", Validators.required],
      deadline: [""],
      categories: [[]],
      assignees: [[]],
      createdAt: [""],
      updatedAt: [""],
    });
  }

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
  ];

  isEdit: boolean = false;

  ngOnInit() {
    const userId = this.authService.getValueByKey("id");
    if (userId && userId != "") {
      this.form.controls["userId"].setValue(userId);
    }
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.getTodoInfo(params.todoId);
        this.isEdit = true;
      }
    });
  }

  getTodoInfo(todoId: string) {
    this.mainService
      .getByField<Todo>("todo", "id", todoId)
      .then((response: Response<Todo>) => {
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
        this.updateTask();
      } else {
        this.createTask();
      }
    }
  }

  createTask() {
    if (this.form.valid) {
      const body = this.form.value;
      this.mainService
        .create<string, Todo>("todo", body)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.back();
          }
        })
        .catch((err: Response<string>) => {
          console.log(err);
          this.notifyService.showError(err.message ?? err.toString());
        });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateTask() {
    if (this.form.valid) {
      const body = this.form.value;
      this.mainService
        .update<string, Todo>("todo", body.id, body)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.back();
          }
        })
        .catch((err: Response<string>) => {
          console.log(err);
          this.notifyService.showError(err.message ?? err.toString());
        });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
