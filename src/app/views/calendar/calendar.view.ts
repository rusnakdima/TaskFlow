/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { DataSyncProvider } from "@services/data-sync.provider";

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: "todo" | "task";
  status: string;
  description?: string;
  todoId: string;
}

@Component({
  selector: "app-calendar",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [CommonModule, RouterModule, MatIconModule, MatDatepickerModule, MatNativeDateModule],
  templateUrl: "./calendar.view.html",
})
export class CalendarView implements OnInit {
  constructor(
    private authService: AuthService,
    private notifyService: NotifyService,
    private router: Router,
    private dataSyncProvider: DataSyncProvider
  ) {}

  selectedDate = signal<Date>(new Date());
  currentMonth = signal<Date>(new Date());
  events = signal<CalendarEvent[]>([]);
  filteredEvents = signal<CalendarEvent[]>([]);

  viewMode = signal<"month" | "week" | "day">("month");

  calendarDays = signal<
    Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarEvent[];
    }>
  >([]);

  weekDays = signal<
    Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarEvent[];
    }>
  >([]);

  dayEvents = signal<CalendarEvent[]>([]);

  ngOnInit(): void {
    this.loadCalendarData();
    this.generateCalendarDays();
  }

  loadCalendarData(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      this.dataSyncProvider
        .getAll<Todo>("todo", { userId }, { isOwner: true, isPrivate: true })
        .subscribe({
          next: (todos) => {
            this.processTodosData(todos);
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to load calendar data");
          },
        });
    }
  }

  processTodosData(todos: Array<Todo>): void {
    const allTasks: Task[] = [];
    todos.forEach((todo) => {
      if (todo.tasks) {
        todo.tasks.forEach((task) => {
          task.todo = todo;
          allTasks.push(task);
        });
      }
    });
    this.processCalendarEvents(allTasks);
  }

  processCalendarEvents(tasks: Array<Task>): void {
    const newEvents: CalendarEvent[] = [];

    tasks.forEach((task) => {
      if (task.startDate) {
        newEvents.push({
          id: task.id!,
          title: `Start: ${task.title}`,
          date: new Date(task.startDate),
          type: "task",
          status: "start",
          description: task.description,
          todoId: task.todo.id,
        });
      }

      if (task.endDate) {
        newEvents.push({
          id: task.id!,
          title:
            task.status === TaskStatus.COMPLETED
              ? `Completed: ${task.title}`
              : task.status === TaskStatus.SKIPPED
                ? `Skipped: ${task.title}`
                : task.status === TaskStatus.FAILED
                  ? `Failed: ${task.title}`
                  : `Due: ${task.title}`,
          date: new Date(task.endDate),
          type: "task",
          status:
            task.status === TaskStatus.COMPLETED
              ? "completed"
              : task.status === TaskStatus.SKIPPED
                ? "skipped"
                : task.status === TaskStatus.FAILED
                  ? "failed"
                  : "due",
          description: task.description,
          todoId: task.todo.id,
        });
      }
    });

    this.events.set(newEvents);

    this.filterEventsForSelectedDate();
    if (this.viewMode() === "month") {
      this.generateCalendarDays();
    } else if (this.viewMode() === "week") {
      this.generateWeekDays();
    } else if (this.viewMode() === "day") {
      this.generateDayView();
    }
  }

  generateCalendarDays(): void {
    const year = this.currentMonth().getFullYear();
    const month = this.currentMonth().getMonth();

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const newCalendarDays: Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarEvent[];
    }> = [];

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const dayEvents = this.events().filter((event) => this.isSameDay(event.date, date));

      newCalendarDays.push({
        date: new Date(date),
        isCurrentMonth: date.getMonth() === month,
        isToday: this.isSameDay(date, new Date()),
        isSelected: this.isSameDay(date, this.selectedDate()),
        events: dayEvents,
      });
    }

    this.calendarDays.set(newCalendarDays);
  }

  generateWeekDays(): void {
    const startOfWeek = new Date(this.selectedDate());
    startOfWeek.setDate(this.selectedDate().getDate() - this.selectedDate().getDay());

    const newWeekDays: Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarEvent[];
    }> = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);

      const dayEvents = this.events().filter((event) => this.isSameDay(event.date, date));

      newWeekDays.push({
        date: new Date(date),
        isCurrentMonth: date.getMonth() === this.currentMonth().getMonth(),
        isToday: this.isSameDay(date, new Date()),
        isSelected: this.isSameDay(date, this.selectedDate()),
        events: dayEvents,
      });
    }

    this.weekDays.set(newWeekDays);
  }

  generateDayView(): void {
    this.dayEvents.set(
      this.events().filter((event) => this.isSameDay(event.date, this.selectedDate()))
    );
  }

  selectDate(date: Date): void {
    this.selectedDate.set(new Date(date));
    this.filterEventsForSelectedDate();
    if (this.viewMode() === "month") {
      this.generateCalendarDays();
    } else if (this.viewMode() === "week") {
      this.generateWeekDays();
    } else if (this.viewMode() === "day") {
      this.generateDayView();
    }
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
    if (this.viewMode() === "month") {
      this.generateCalendarDays();
    } else if (this.viewMode() === "week") {
      this.generateWeekDays();
    } else if (this.viewMode() === "day") {
      this.generateDayView();
    }
    this.filterEventsForSelectedDate();
  }

  formatMonthYear(): string {
    return this.currentMonth().toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  formatWeekRange(): string {
    const startOfWeek = new Date(this.selectedDate());
    startOfWeek.setDate(this.selectedDate().getDate() - this.selectedDate().getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const startMonth = startOfWeek.toLocaleDateString("en-US", { month: "short" });
    const endMonth = endOfWeek.toLocaleDateString("en-US", { month: "short" });
    const year = startOfWeek.getFullYear();

    if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
      return `${startMonth} ${startOfWeek.getDate()} - ${endOfWeek.getDate()}, ${year}`;
    } else {
      return `${startMonth} ${startOfWeek.getDate()} - ${endMonth} ${endOfWeek.getDate()}, ${year}`;
    }
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
    if (this.viewMode() === "month") {
      return this.formatMonthYear();
    } else if (this.viewMode() === "week") {
      return this.formatWeekRange();
    } else if (this.viewMode() === "day") {
      return this.formatSelectedDate();
    }
    return "";
  }

  getEventColor(event: CalendarEvent): string {
    if (event.status === "due") return "bg-red-500";
    if (event.status === "completed") return "bg-green-500";
    if (event.status === "skipped") return "bg-orange-500";
    if (event.status === "failed") return "bg-gray-500";
    return "bg-blue-500";
  }

  changeViewMode(mode: "month" | "week" | "day"): void {
    this.viewMode.set(mode);
    if (mode === "month") {
      this.generateCalendarDays();
    } else if (mode === "week") {
      this.generateWeekDays();
    } else if (mode === "day") {
      this.generateDayView();
    }
  }

  navigateToTasks(event: CalendarEvent): void {
    this.router.navigate(["/todos", event.todoId, "tasks"]);
  }

  getWeeksForMobile(): Array<
    Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarEvent[];
    }>
  > {
    const weeks: Array<
      Array<{
        date: Date;
        isCurrentMonth: boolean;
        isToday: boolean;
        isSelected: boolean;
        events: CalendarEvent[];
      }>
    > = [];
    const calendarDays = this.calendarDays();
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    return weeks;
  }

  getDayName(date: Date): string {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
}
