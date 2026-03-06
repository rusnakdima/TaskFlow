/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { StorageService } from "@services/storage.service";
import { CalendarGeneratorService, CalendarDay } from "@services/calendar-generator.service";
import {
  CalendarEvent,
  getEventColor,
  getCurrentTitle,
  getTaskEventTitle,
} from "@services/calendar-helpers.service";

@Component({
  selector: "app-calendar",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatDatepickerModule, MatNativeDateModule],
  templateUrl: "./calendar.view.html",
})
export class CalendarView implements OnInit {
  router: Router;

  constructor(
    private authService: AuthService,
    private notifyService: NotifyService,
    router: Router,
    private storageService: StorageService,
    private calendarGenerator: CalendarGeneratorService
  ) {
    this.router = router;
  }

  selectedDate = signal<Date>(new Date());
  currentMonth = signal<Date>(new Date());
  events = signal<CalendarEvent[]>([]);
  filteredEvents = signal<CalendarEvent[]>([]);

  viewMode = signal<"month" | "week" | "day">("month");

  calendarDays = signal<CalendarDay[]>([]);
  weekDays = signal<CalendarDay[]>([]);
  dayEvents = signal<CalendarEvent[]>([]);

  ngOnInit(): void {
    this.loadCalendarData();
    this.generateCalendarDays();
  }

  loadCalendarData(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      // Use storage service to load data (cached or from backend)
      this.storageService.loadAllData().subscribe({
        next: (result) => {
          this.processTodosData(result.todos);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to load calendar data");
        },
      });
    }
  }

  processTodosData(todos: Array<Todo>): void {
    // Get tasks from storage service
    const tasks = this.storageService.tasks();

    // Associate todos with tasks
    tasks.forEach((task) => {
      const todo = todos.find((t) => t.id === task.todoId);
      if (todo) {
        (task as any).todo = todo;
      }
    });

    this.processCalendarEvents(tasks);
  }

  processCalendarEvents(tasks: Array<Task>): void {
    const newEvents: CalendarEvent[] = [];
    const userId: string = this.authService.getValueByKey("id");

    tasks.forEach((task) => {
      const isPrivate = task.todo.visibility === "private";
      const isOwner = task.todo.userId === userId;

      if (task.startDate) {
        newEvents.push({
          id: task.id!,
          title: `Start: ${task.title}`,
          date: new Date(task.startDate),
          type: "task",
          status: "start",
          description: task.description,
          todoId: task.todo.id,
          isPrivate,
          isOwner,
        });
      }

      if (task.endDate) {
        const statusText = getTaskEventTitle(task.status, task.title);
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
          date: new Date(task.endDate),
          type: "task",
          status,
          description: task.description,
          todoId: task.todo.id,
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
    if (this.viewMode() === "month") {
      this.generateCalendarDays();
    } else if (this.viewMode() === "week") {
      this.generateWeekDays();
    } else if (this.viewMode() === "day") {
      this.generateDayView();
    }
  }

  generateCalendarDays(): void {
    const days = this.calendarGenerator.generateCalendarDays(
      this.currentMonth(),
      this.selectedDate(),
      this.events()
    );
    this.calendarDays.set(days);
  }

  generateWeekDays(): void {
    const days = this.calendarGenerator.generateWeekDays(
      this.selectedDate(),
      this.currentMonth(),
      this.events()
    );
    this.weekDays.set(days);
  }

  generateDayView(): void {
    this.dayEvents.set(this.calendarGenerator.generateDayView(this.selectedDate(), this.events()));
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
    return date1.toDateString() === date2.toDateString();
  }

  previous(): void {
    if (this.viewMode() === "month") {
      this.currentMonth.set(
        new Date(this.currentMonth().getFullYear(), this.currentMonth().getMonth() - 1, 1)
      );
      this.generateCalendarDays();
    } else if (this.viewMode() === "week") {
      this.selectedDate.update((date) => {
        date.setDate(date.getDate() - 7);
        return date;
      });
      this.generateWeekDays();
    } else if (this.viewMode() === "day") {
      this.selectedDate.update((date) => {
        date.setDate(date.getDate() - 1);
        return date;
      });
      this.generateDayView();
    }
    this.filterEventsForSelectedDate();
  }

  next(): void {
    if (this.viewMode() === "month") {
      this.currentMonth.set(
        new Date(this.currentMonth().getFullYear(), this.currentMonth().getMonth() + 1, 1)
      );
      this.generateCalendarDays();
    } else if (this.viewMode() === "week") {
      this.selectedDate.update((date) => {
        date.setDate(date.getDate() + 7);
        return date;
      });
      this.generateWeekDays();
    } else if (this.viewMode() === "day") {
      this.selectedDate.update((date) => {
        date.setDate(date.getDate() + 1);
        return date;
      });
      this.generateDayView();
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
    return getCurrentTitle("month", this.currentMonth(), this.selectedDate());
  }

  formatWeekRange(): string {
    return getCurrentTitle("week", this.currentMonth(), this.selectedDate());
  }

  formatSelectedDate(): string {
    return getCurrentTitle("day", this.currentMonth(), this.selectedDate());
  }

  getCurrentTitle(): string {
    return getCurrentTitle(this.viewMode(), this.currentMonth(), this.selectedDate());
  }

  getEventColor(event: CalendarEvent): string {
    return getEventColor(event);
  }

  changeViewMode(mode: "month" | "week" | "day"): void {
    this.viewMode.set(mode);
    this.regenerateView();
  }

  navigateToTasks(event: CalendarEvent): void {
    this.router.navigate(["/todos", event.todoId, "tasks"], {
      queryParams: {
        highlightTaskId: event.id,
        isPrivate: event.isPrivate,
        isOwner: event.isOwner,
      },
    });
  }

  getWeeksForMobile(): CalendarDay[][] {
    return this.calendarGenerator.getWeeksForMobile(this.calendarDays());
  }

  getDayName(date: Date): string {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
}
