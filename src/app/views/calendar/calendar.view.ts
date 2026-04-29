/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, effect, inject } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";

/* helpers */
import { CalendarEvent, CalendarDay } from "@helpers/date.helper";
import { DateHelper } from "@helpers/date.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* providers */
@Component({
  selector: "app-calendar",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatDatepickerModule, MatNativeDateModule],
  templateUrl: "./calendar.view.html",
})
export class CalendarView extends BaseListView implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private storageService = inject(StorageService);

  selectedDate = signal<Date>(new Date());
  currentMonth = signal<Date>(new Date());
  events = signal<CalendarEvent[]>([]);
  filteredEvents = signal<CalendarEvent[]>([]);

  displayMode = signal<"month" | "week">("month");

  calendarDays = signal<CalendarDay[]>([]);
  weekDays = signal<CalendarDay[]>([]);

  constructor() {
    super();
    effect(() => {
      const todos = this.storageService.todos();
      if (todos.length > 0) {
        this.processTodosData(todos);
      }
    });
  }

  processTodosData(todos: Array<Todo>): void {
    const tasks: Array<Task> = [];

    todos.forEach((todo) => {
      if (todo.tasks) {
        todo.tasks.forEach((task) => {
          // Associate todo with task for event processing
          (task as any).todo = todo;
          tasks.push(task);
        });
      }
    });

    this.processCalendarEvents(tasks);
  }

  processCalendarEvents(tasks: Array<Task>): void {
    const newEvents: CalendarEvent[] = [];
    const userId: string = this.authService.getValueByKey("id");

    tasks.forEach((task) => {
      const taskTodo = task.todo;
      const isPrivate = taskTodo?.visibility === "private";
      const isOwner = taskTodo?.user_id === userId;

      if (task.start_date) {
        newEvents.push({
          id: task.id!,
          title: `Start: ${task.title}`,
          date: new Date(task.start_date),
          type: "task",
          status: "start",
          description: task.description,
          todo_id: taskTodo?.id || task.todo_id,
          isPrivate,
          isOwner,
        });
      }

      if (task.end_date) {
        const statusText = DateHelper.getTaskEventTitle(task.status, task.title);
        const status =
          task.status === TaskStatus.COMPLETED
            ? "completed"
            : task.status === TaskStatus.SKIPPED
              ? "skipped"
              : task.status === TaskStatus.FAILED
                ? "failed"
                : "due";

        newEvents.push({
          id: task.id!,
          title: statusText,
          date: new Date(task.end_date),
          type: "task",
          status,
          description: task.description,
          todo_id: taskTodo?.id || task.todo_id,
          isPrivate,
          isOwner,
        });
      }
    });

    this.events.set(newEvents);

    this.filterEventsForSelectedDate();
    this.regenerateView();
  }

  regenerateView(): void {
    if (this.displayMode() === "month") {
      this.generateCalendarDays();
    } else if (this.displayMode() === "week") {
      this.generateWeekDays();
    }
  }

  generateCalendarDays(): void {
    const days = DateHelper.generateCalendarDays(this.currentMonth(), this.selectedDate(), this.events());
    this.calendarDays.set(days);
  }

  generateWeekDays(): void {
    const days = DateHelper.generateWeekDays(this.selectedDate(), this.currentMonth(), this.events());
    this.weekDays.set(days);
  }

  selectDate(date: Date): void {
    this.selectedDate.set(new Date(date));
    this.filterEventsForSelectedDate();
    this.regenerateView();
  }

  filterEventsForSelectedDate(): void {
    this.filteredEvents.set(
      this.events().filter((event) => this.isSameDay(event.date, this.selectedDate()))
    );
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return DateHelper.isSameDay(date1, date2);
  }

  previous(): void {
    if (this.displayMode() === "month") {
      this.currentMonth.set(
        new Date(this.currentMonth().getFullYear(), this.currentMonth().getMonth() - 1, 1)
      );
      this.generateCalendarDays();
    } else if (this.displayMode() === "week") {
      this.selectedDate.update((date) => {
        date.setDate(date.getDate() - 7);
        return date;
      });
      this.generateWeekDays();
    }
    this.filterEventsForSelectedDate();
  }

  next(): void {
    if (this.displayMode() === "month") {
      this.currentMonth.set(
        new Date(this.currentMonth().getFullYear(), this.currentMonth().getMonth() + 1, 1)
      );
      this.generateCalendarDays();
    } else if (this.displayMode() === "week") {
      this.selectedDate.update((date) => {
        date.setDate(date.getDate() + 7);
        return date;
      });
      this.generateWeekDays();
    }
    this.filterEventsForSelectedDate();
  }

  goToToday(): void {
    this.currentMonth.set(new Date());
    this.selectedDate.set(new Date());
    this.regenerateView();
    this.filterEventsForSelectedDate();
  }

  formatMonthYear(): string {
    return DateHelper.getCurrentTitle("month", this.currentMonth(), this.selectedDate());
  }

  formatWeekRange(): string {
    return DateHelper.getCurrentTitle("week", this.currentMonth(), this.selectedDate());
  }

  formatSelectedDate(): string {
    return this.selectedDate().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  getCurrentTitle(): string {
    return DateHelper.getCurrentTitle(this.displayMode(), this.currentMonth(), this.selectedDate());
  }

  getEventColor(event: CalendarEvent): string {
    return DateHelper.getEventColor(event);
  }

  changeViewMode(mode: "month" | "week"): void {
    this.displayMode.set(mode);
    this.regenerateView();
  }

  navigateToTasks(event: CalendarEvent): void {
    this.router.navigate(["/todos", event.todo_id, "tasks"], {
      queryParams: {
        highlightTaskId: event.id,
      },
    });
  }

  getWeeksForMobile(): CalendarDay[][] {
    return DateHelper.getWeeksForMobile(this.calendarDays());
  }

  getDayName(date: Date): string {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
}
