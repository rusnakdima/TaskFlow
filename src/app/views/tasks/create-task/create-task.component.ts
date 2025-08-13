/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";

/* models */
import { FormField, parseEnumOptions, TypeField } from "@models/form-field";
import { Response, ResponseStatus } from "@models/response";
import { PriorityTask, Task } from "@models/task";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { FormComponent } from "@components/form/form.component";

@Component({
  selector: "app-create-task",
  standalone: true,
  providers: [AuthService, MainService, NotifyService],
  imports: [CommonModule, FormComponent],
  templateUrl: "./create-task.component.html",
})
export class CreateTaskComponent {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
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
      priority: ["", Validators.required],
    });
  }

  todoId: string = "";

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

  ngOnInit() {
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.todoId = params.todoId;
        this.form.controls["todoId"].setValue(params.todoId);
      }
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
      const body = this.form.value;
      this.mainService
        .create<string, Task>("task", body)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.router.navigate(["/todos/" + this.todoId + "/tasks"]);
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
