/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Todo } from "@models/todo";
import { Task } from "@models/task";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";

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
  providers: [MainService, NotifyService],
  imports: [CommonModule, RouterModule, MatIconModule, MatDatepickerModule, MatNativeDateModule],
  templateUrl: "./calendar.view.html",
})
export class CalendarView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService,
    private router: Router
  ) {}

  selectedDate: Date = new Date();
  currentMonth: Date = new Date();
  events: CalendarEvent[] = [];
  filteredEvents: CalendarEvent[] = [];

  viewMode: "month" | "week" | "day" = "month";

  calendarDays: Array<{
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
    events: CalendarEvent[];
  }> = [];

  weekDays: Array<{
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
    events: CalendarEvent[];
  }> = [];

  dayEvents: CalendarEvent[] = [];

  ngOnInit(): void {
    this.loadCalendarData();
    this.generateCalendarDays();
  }

  loadCalendarData(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      this.mainService
        .getAllByField<Array<Todo>>("todo", "userId", userId)
        .then((response: Response<Array<Todo>>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.processTodosData(response.data);
          } else {
            this.notifyService.showError(response.message);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
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
    this.events = [];

    tasks.forEach((task) => {
      if (task.startDate) {
        this.events.push({
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
        this.events.push({
          id: task.id!,
          title: task.isCompleted ? `Completed: ${task.title}` : `Due: ${task.title}`,
          date: new Date(task.endDate),
          type: "task",
          status: task.isCompleted ? "completed" : "due",
          description: task.description,
          todoId: task.todo.id,
        });
      }
    });

    this.filterEventsForSelectedDate();
    if (this.viewMode === "month") {
      this.generateCalendarDays();
    } else if (this.viewMode === "week") {
      this.generateWeekDays();
    } else if (this.viewMode === "day") {
      this.generateDayView();
    }
  }

  generateCalendarDays(): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    this.calendarDays = [];

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const dayEvents = this.events.filter((event) => this.isSameDay(event.date, date));

      this.calendarDays.push({
        date: new Date(date),
        isCurrentMonth: date.getMonth() === month,
        isToday: this.isSameDay(date, new Date()),
        isSelected: this.isSameDay(date, this.selectedDate),
        events: dayEvents,
      });
    }
  }

  generateWeekDays(): void {
    const startOfWeek = new Date(this.selectedDate);
    startOfWeek.setDate(this.selectedDate.getDate() - this.selectedDate.getDay());

    this.weekDays = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);

      const dayEvents = this.events.filter((event) => this.isSameDay(event.date, date));

      this.weekDays.push({
        date: new Date(date),
        isCurrentMonth: date.getMonth() === this.currentMonth.getMonth(),
        isToday: this.isSameDay(date, new Date()),
        isSelected: this.isSameDay(date, this.selectedDate),
        events: dayEvents,
      });
    }
  }

  generateDayView(): void {
    this.dayEvents = this.events.filter((event) => this.isSameDay(event.date, this.selectedDate));
  }

  selectDate(date: Date): void {
    this.selectedDate = new Date(date);
    this.filterEventsForSelectedDate();
    if (this.viewMode === "month") {
      this.generateCalendarDays();
    } else if (this.viewMode === "week") {
      this.generateWeekDays();
    } else if (this.viewMode === "day") {
      this.generateDayView();
    }
  }

  filterEventsForSelectedDate(): void {
    this.filteredEvents = this.events.filter((event) =>
      this.isSameDay(event.date, this.selectedDate)
    );
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return date1.toDateString() === date2.toDateString();
  }

  previous(): void {
    if (this.viewMode === "month") {
      this.currentMonth = new Date(
        this.currentMonth.getFullYear(),
        this.currentMonth.getMonth() - 1,
        1
      );
      this.generateCalendarDays();
    } else if (this.viewMode === "week") {
      this.selectedDate.setDate(this.selectedDate.getDate() - 7);
      this.generateWeekDays();
    } else if (this.viewMode === "day") {
      this.selectedDate.setDate(this.selectedDate.getDate() - 1);
      this.generateDayView();
    }
    this.filterEventsForSelectedDate();
  }

  next(): void {
    if (this.viewMode === "month") {
      this.currentMonth = new Date(
        this.currentMonth.getFullYear(),
        this.currentMonth.getMonth() + 1,
        1
      );
      this.generateCalendarDays();
    } else if (this.viewMode === "week") {
      this.selectedDate.setDate(this.selectedDate.getDate() + 7);
      this.generateWeekDays();
    } else if (this.viewMode === "day") {
      this.selectedDate.setDate(this.selectedDate.getDate() + 1);
      this.generateDayView();
    }
    this.filterEventsForSelectedDate();
  }

  goToToday(): void {
    this.currentMonth = new Date();
    this.selectedDate = new Date();
    if (this.viewMode === "month") {
      this.generateCalendarDays();
    } else if (this.viewMode === "week") {
      this.generateWeekDays();
    } else if (this.viewMode === "day") {
      this.generateDayView();
    }
    this.filterEventsForSelectedDate();
  }

  formatMonthYear(): string {
    return this.currentMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  formatWeekRange(): string {
    const startOfWeek = new Date(this.selectedDate);
    startOfWeek.setDate(this.selectedDate.getDate() - this.selectedDate.getDay());
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
    return this.selectedDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  getCurrentTitle(): string {
    if (this.viewMode === "month") {
      return this.formatMonthYear();
    } else if (this.viewMode === "week") {
      return this.formatWeekRange();
    } else if (this.viewMode === "day") {
      return this.formatSelectedDate();
    }
    return "";
  }

  getEventColor(event: CalendarEvent): string {
    if (event.status === "due") return "bg-red-500";
    if (event.status === "completed") return "bg-green-500";
    return "bg-blue-500";
  }

  changeViewMode(mode: "month" | "week" | "day"): void {
    this.viewMode = mode;
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
}
