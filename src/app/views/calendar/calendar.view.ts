/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { Router, RouterModule } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { DataService } from "@services/data/data.service";

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
  private dataService = inject(DataService);

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

  private userId = "";
  private todos = signal<Todo[]>([]);
  private allEvents = signal<CalendarEvent[]>([]);

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
    this.userId = this.authService.getValueByKey("id");

    this.dataService.todos$.pipe(takeUntilDestroyed()).subscribe((todos) => {
      this.todos.set(todos);
      this.loadEventsForTodos(todos);
    });

    this.dataService.getTodos().subscribe({
      next: (todos) => {
        this.todos.set(todos);
        this.loadEventsForTodos(todos);
      },
      error: (err) => this.handleError(err),
    });
  }

  private loadEventsForTodos(todos: Todo[]): void {
    const events: CalendarEvent[] = [];
    let completed = 0;
    const total = todos.filter((t) => !t.deleted_at).length;

    if (total === 0) {
      this.allEvents.set([]);
      return;
    }

    todos.forEach((todo) => {
      if (todo.deleted_at) return;

      const isPrivate = todo.visibility === "private";
      const isOwner = todo.user_id === this.userId;

      this.subscriptions.add(
        this.dataService.getTasks(todo.id).subscribe({
          next: (tasks) => {
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
                  todo_id: todo.id,
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

                events.push({
                  id: task.id!,
                  title: statusText,
                  date: new Date(task.end_date),
                  type: "task",
                  status,
                  description: task.description,
                  todo_id: todo.id,
                  isPrivate,
                  isOwner,
                });
              }
            });

            completed++;
            if (completed === total) {
              this.allEvents.set([...events]);
            }
          },
          error: (err) => {
            this.handleError(err);
            completed++;
            if (completed === total) {
              this.allEvents.set([...events]);
            }
          },
        })
      );
    });
  }

  selectDate(date: Date): void {
    this.selectedDate.set(new Date(date));
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return DateHelper.isSameDay(date1, date2);
  }

  previous(): void {
    if (this.displayMode() === "month") {
      this.currentMonth.set(
        new Date(this.currentMonth().getFullYear(), this.currentMonth().getMonth() - 1, 1)
      );
    } else if (this.displayMode() === "week") {
      this.selectedDate.update((date) => {
        date.setDate(date.getDate() - 7);
        return date;
      });
    }
  }

  next(): void {
    if (this.displayMode() === "month") {
      this.currentMonth.set(
        new Date(this.currentMonth().getFullYear(), this.currentMonth().getMonth() + 1, 1)
      );
    } else if (this.displayMode() === "week") {
      this.selectedDate.update((date) => {
        date.setDate(date.getDate() + 7);
        return date;
      });
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
