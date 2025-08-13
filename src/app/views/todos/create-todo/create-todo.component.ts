/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { Router } from "@angular/router";

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
  selector: "app-create-todo",
  standalone: true,
  providers: [AuthService, MainService, NotifyService],
  imports: [CommonModule, FormComponent],
  templateUrl: "./create-todo.component.html",
})
export class CreateTodoComponent {
  constructor(
    private fb: FormBuilder,
    private router: Router,
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
      categories: [[]],
      assignees: [[]],
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

  ngOnInit() {
    const userId = this.authService.getValueByKey("id");
    if (userId && userId != "") {
      this.form.controls["userId"].setValue(userId);
    }
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
      const body = this.form.value;
      this.mainService
        .create<string, Todo>("todo", body)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.router.navigate(["/todos"]);
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
