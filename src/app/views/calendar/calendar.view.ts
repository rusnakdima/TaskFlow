/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { REQUEST_SERVICE } from "@services/api.service";

/* helpers */
import { CalendarEvent, CalendarDay } from "@helpers/date.helper";
import { DateHelper } from "@helpers/date.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import {
  SegmentSelectorComponent,
  SegmentOption,
} from "@components/segment-selector/segment-selector.component";

@Component({
  selector: "app-calendar",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    SegmentSelectorComponent,
  ],
  templateUrl: "./calendar.view.html",
})
export class CalendarView extends BaseListView implements OnInit {
  private router = inject(Router);
  private requestService = inject(REQUEST_SERVICE);

  protected getItems(): { id: string }[] {
    return [];
  }

  selectedDate = signal<Date>(new Date());
  currentMonth = signal<Date>(new Date());
  displayMode = signal<"month" | "week">("month");

  displayModeOptions: SegmentOption[] = [
    { id: "month", label: "Month", icon: "calendar_view_month" },
    { id: "week", label: "Week", icon: "view_week" },
  ];

  private allEvents = computed<CalendarEvent[]>(() => {
    const tasks = this.storageService.tasks();
    return this.buildEventsFromTasks(tasks);
  });

  filteredEvents = computed(() =>
    this.allEvents().filter((event) => this.isSameDay(event.date, this.selectedDate()))
  );

  calendarDays = computed<CalendarDay[]>(() =>
    DateHelper.generateCalendarDays(this.currentMonth(), this.selectedDate(), this.allEvents())
  );

  weekDays = computed<CalendarDay[]>(() =>
    DateHelper.generateWeekDays(this.selectedDate(), this.currentMonth(), this.allEvents())
  );

  override ngOnInit(): void {
    super.ngOnInit();
    this.requestService
      .loadPage("tasks", { visibility: "private", limit: 100, skip: 0 })
      .subscribe({});
    this.requestService
      .loadPage("tasks", { visibility: "shared", limit: 100, skip: 0 })
      .subscribe({});
    this.requestService
      .loadPage("tasks", { visibility: "public", limit: 100, skip: 0 })
      .subscribe({});
  }

  private buildEventsFromTasks(tasks: Task[]): CalendarEvent[] {
    const events: CalendarEvent[] = [];

    tasks.forEach((task) => {
      if (task.deleted_at) return;

      if (task.start_date) {
        events.push({
          id: task.id!,
          title: `Start: ${task.title}`,
          date: new Date(task.start_date),
          type: "task",
          status: "start",
          description: task.description,
          todo_id: task.todo_id,
          isPrivate: false,
          isOwner: false,
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

        events.push({
          id: task.id!,
          title: statusText,
          date: new Date(task.end_date),
          type: "task",
          status,
          description: task.description,
          todo_id: task.todo_id,
          isPrivate: false,
          isOwner: false,
        });
      }
    });

    return events;
  }

  selectDate(date: Date): void {
    this.selectedDate.set(new Date(date));
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return DateHelper.isSameDay(date1, date2);
  }

  previous(): void {
    if (this.displayMode() === "month") {
      const newMonth = new Date(
        this.currentMonth().getFullYear(),
        this.currentMonth().getMonth() - 1,
        1
      );
      this.currentMonth.set(newMonth);
    } else if (this.displayMode() === "week") {
      const current = this.selectedDate();
      const newDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7);
      this.selectedDate.set(newDate);
    }
  }

  next(): void {
    if (this.displayMode() === "month") {
      const newMonth = new Date(
        this.currentMonth().getFullYear(),
        this.currentMonth().getMonth() + 1,
        1
      );
      this.currentMonth.set(newMonth);
    } else if (this.displayMode() === "week") {
      const current = this.selectedDate();
      const newDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);
      this.selectedDate.set(newDate);
    }
  }

  goToToday(): void {
    this.currentMonth.set(new Date());
    this.selectedDate.set(new Date());
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
  }

  onDisplayModeChange(id: string): void {
    if (id === "month" || id === "week") {
      this.displayMode.set(id);
    }
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
