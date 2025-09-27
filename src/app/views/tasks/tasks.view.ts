/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Task } from "@models/task";
import { Todo } from "@models/todo";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { TaskComponent } from "@components/task/task.component";
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";

@Component({
  selector: "app-tasks",
  standalone: true,
  providers: [MainService],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    RouterModule,
    SearchComponent,
    TaskComponent,
    TodoInformationComponent,
    DragDropModule,
  ],
  templateUrl: "./tasks.view.html",
})
export class TasksView implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  listTasks: Array<Task> = [];
  tempListTasks: Array<Task> = [];
  todo: Todo | null = null;

  activeFilter: string = "all";
  showFilter: boolean = false;

  editingTask: string | null = null;
  editingField: string | null = null;
  editingValue: string = "";

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "high", label: "High Priority" },
  ];

  ngOnInit(): void {
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.getTodoInfo(params.todoId);
        this.getTasksByTodoId(params.todoId);
      }
    });
  }

  getTodoInfo(id: string) {
    this.mainService
      .getByField<Todo>("todo", "id", id)
      .then((response: Response<Todo>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.todo = response.data;
        } else {
          this.notifyService.showNotify(response.status, response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  getTasksByTodoId(todoId: string) {
    this.mainService
      .getAllByField<Array<Task>>("task", "todoId", todoId)
      .then((response: Response<Array<Task>>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.tempListTasks = response.data;
          this.applyFilter();
        } else {
          this.notifyService.showError(response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
      });
  }

  searchFunc(data: Array<any>) {
    this.listTasks = data;
  }

  toggleTaskCompletion(task: Task) {
    const updatedTask = { ...task, isCompleted: !task.isCompleted };

    this.mainService
      .update<string, Task>("task", task.id, updatedTask)
      .then((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          task.isCompleted = !task.isCompleted;
          if (this.todo) {
            const todoTask = this.todo.tasks.find((t) => t.id === task.id);
            if (todoTask) {
              todoTask.isCompleted = task.isCompleted;
            }
          }
          this.notifyService.showSuccess(`Task ${task.isCompleted ? "completed" : "reopened"}`);
        } else {
          this.notifyService.showError(response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
      });
  }

  toggleFilter() {
    this.showFilter = !this.showFilter;
  }

  changeFilter(filter: string) {
    this.activeFilter = filter;
    this.applyFilter();
  }

  applyFilter() {
    let filtered = [...this.tempListTasks];

    switch (this.activeFilter) {
      case "active":
        filtered = filtered.filter((task) => !task.isCompleted);
        break;
      case "completed":
        filtered = filtered.filter((task) => task.isCompleted);
        break;
      case "high":
        filtered = filtered.filter((task) => task.priority === "high");
        break;
      default:
        break;
    }

    this.listTasks = filtered;
  }

  updateTaskInline(event: { task: Task; field: string; value: string }) {
    const updatedTask = {
      ...event.task,
      [event.field]: event.value,
    };

    this.mainService
      .update<string, Task>("task", event.task.id, updatedTask)
      .then((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          if (event.field === "title") {
            event.task.title = event.value;
          } else if (event.field === "description") {
            event.task.description = event.value;
          }
          this.notifyService.showSuccess("Task updated successfully");
        } else {
          this.notifyService.showError(response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
      });
  }

  deleteTask(id: string) {
    if (confirm("Are you sure you want to delete this task?")) {
      this.mainService
        .delete<string>("task", id)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status === ResponseStatus.SUCCESS) {
            this.getTasksByTodoId(this.todo?.id ?? "");
            if (this.todo) {
              this.todo.tasks = this.todo.tasks.filter((t) => t.id !== id);
            }
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
        });
    }
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    moveItemInArray(this.listTasks, event.previousIndex, event.currentIndex);
    this.updateTaskOrder();
  }

  updateTaskOrder(): void {
    const updates = this.listTasks.map((task, index) => ({
      id: task.id,
      order: index,
    }));

    const promises = updates.map((update) =>
      this.mainService
        .getByField<Task>("task", "id", update.id)
        .then((response: Response<Task>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const currentTask = response.data;
            const updatedTask = { ...currentTask, order: update.order };
            return this.mainService.update<string, Task>("task", update.id, updatedTask);
          } else {
            throw new Error("Failed to fetch task");
          }
        })
    );

    Promise.all(promises)
      .then(() => {
        this.notifyService.showNotify(ResponseStatus.SUCCESS, "Task order updated successfully");
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError("Failed to update task order");
        this.getTasksByTodoId(this.todo?.id ?? "");
      });
  }
}
