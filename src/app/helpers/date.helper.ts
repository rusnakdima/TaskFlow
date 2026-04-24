/* sys lib */
import { FormGroup } from "@angular/forms";
import { MatCalendarCellCssClasses } from "@angular/material/datepicker";

/* models */
import { TaskStatus } from "@models/task.model";

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: "todo" | "task";
  status: string;
  description?: string;
  todo_id?: string;
  isPrivate: boolean;
  isOwner: boolean;
}

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
}

export class DateHelper {
  static createDateClass(form: FormGroup): (date: Date) => MatCalendarCellCssClasses {
    return (date: Date): MatCalendarCellCssClasses => {
      const endDateValue = form.get("endDate")?.value;
      if (endDateValue) {
        const endDate = new Date(endDateValue);
        return date.getDate() === endDate.getDate() &&
          date.getMonth() === endDate.getMonth() &&
          date.getFullYear() === endDate.getFullYear()
          ? "end-date-marker"
          : "";
      }
      return "";
    };
  }

  static createTodayDateClass(): (date: Date) => MatCalendarCellCssClasses {
    return (date: Date): MatCalendarCellCssClasses => {
      const today = new Date();
      return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
        ? "today-marker"
        : "";
    };
  }

  static convertLocalToUtc(date: Date | string | null | undefined): string {
    if (!date) return "";

    let d: Date;
    if (date instanceof Date) {
      d = date;
    } else if (typeof date === "string") {
      if (date.trim() === "") return "";
      d = new Date(date);
    } else {
      return "";
    }

    if (isNaN(d.getTime())) return "";

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}T00:00:00Z`;
  }

  static convertUtcToLocal(utcString: string): string {
    if (!utcString) return "";
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().replace("Z", "").split(".")[0];
  }

  static utcToLocalDate(utcString: string): Date | null {
    if (!utcString) return null;
    const date = new Date(utcString);
    return isNaN(date.getTime()) ? null : date;
  }

  static normalizeDateFields<T extends Record<string, any>>(
    formValue: T,
    dateFieldNames: string[] = ["start_date", "end_date"]
  ): T {
    const normalizedValue = { ...formValue } as Record<string, any>;

    for (const fieldName of dateFieldNames) {
      if (fieldName in normalizedValue) {
        const fieldValue = normalizedValue[fieldName];
        if (fieldValue === null || fieldValue === undefined) {
          normalizedValue[fieldName] = "";
        }
      }
    }

    return normalizedValue as T;
  }

  static convertDatesToUtc<T extends Record<string, any>>(
    formValue: T,
    dateFieldNames: string[] = ["start_date", "end_date"]
  ): T {
    const converted = { ...formValue } as Record<string, any>;

    for (const fieldName of dateFieldNames) {
      if (fieldName in converted) {
        converted[fieldName] = DateHelper.convertLocalToUtc(converted[fieldName]);
      }
    }

    return converted as T;
  }

  static convertDatesFromUtcToLocal<T extends Record<string, any>>(
    formValue: T,
    dateFieldNames: string[] = ["start_date", "end_date"]
  ): T {
    const converted = { ...formValue } as Record<string, any>;

    for (const fieldName of dateFieldNames) {
      if (fieldName in converted && converted[fieldName]) {
        converted[fieldName] = DateHelper.utcToLocalDate(converted[fieldName]);
      }
    }

    return converted as T;
  }

  static formatDateRelative(time: string): string {
    if (!time) return "";
    const dateRec = new Date(time);
    const curDate = new Date();
    const year = dateRec.getFullYear();
    const month = dateRec.getMonth();
    const day = dateRec.getDate();
    const curYear = curDate.getFullYear();
    const curMonth = curDate.getMonth();
    const curDay = curDate.getDate();

    if (day === curDay && month === curMonth && year === curYear) {
      return DateHelper.formatTime(dateRec);
    }

    const yesterday = new Date(curDate);
    yesterday.setDate(curDate.getDate() - 1);
    if (
      day === yesterday.getDate() &&
      month === yesterday.getMonth() &&
      year === yesterday.getFullYear()
    ) {
      return `Yesterday ${DateHelper.formatTime(dateRec)}`;
    }

    return DateHelper.formatLocaleDate(dateRec);
  }

  static formatTime(date: Date | string): string {
    if (typeof date === "string") {
      date = new Date(date);
    }
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  static formatLocaleDate(date: Date | string): string {
    if (typeof date === "string" && date === "") {
      date = new Date();
    }
    if (typeof date === "string") {
      date = new Date(date);
    }
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  static formatDateShort(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  static generateCalendarDays(
    currentMonth: Date,
    selectedDate: Date,
    events: CalendarEvent[]
  ): CalendarDay[] {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const newCalendarDays: CalendarDay[] = [];

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const dayEvents = events.filter((event) => DateHelper.isSameDay(event.date, date));

      newCalendarDays.push({
        date: new Date(date),
        isCurrentMonth: date.getMonth() === month,
        isToday: DateHelper.isSameDay(date, new Date()),
        isSelected: DateHelper.isSameDay(date, selectedDate),
        events: dayEvents,
      });
    }

    return newCalendarDays;
  }

  static generateWeekDays(
    selectedDate: Date,
    currentMonth: Date,
    events: CalendarEvent[]
  ): CalendarDay[] {
    const startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());

    const newWeekDays: CalendarDay[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);

      const dayEvents = events.filter((event) => DateHelper.isSameDay(event.date, date));

      newWeekDays.push({
        date: new Date(date),
        isCurrentMonth: date.getMonth() === currentMonth.getMonth(),
        isToday: DateHelper.isSameDay(date, new Date()),
        isSelected: DateHelper.isSameDay(date, selectedDate),
        events: dayEvents,
      });
    }

    return newWeekDays;
  }

  static getWeeksForMobile(calendarDays: CalendarDay[]): CalendarDay[][] {
    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    return weeks;
  }

  static isSameDay(date1: Date, date2: Date): boolean {
    return date1.toDateString() === date2.toDateString();
  }

  static getEventColor(event: CalendarEvent): string {
    if (event.status === "due") return "bg-red-500";
    if (event.status === "completed") return "bg-green-500";
    if (event.status === "skipped") return "bg-orange-500";
    if (event.status === "failed") return "bg-gray-500";
    return "bg-blue-500";
  }

  static formatMonthYear(date: Date): string {
    return date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  static formatWeekRange(selectedDate: Date): string {
    const startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
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

  static getCurrentTitle(
    viewMode: "month" | "week",
    currentMonth: Date,
    selectedDate: Date
  ): string {
    if (viewMode === "month") {
      return DateHelper.formatMonthYear(currentMonth);
    } else if (viewMode === "week") {
      return DateHelper.formatWeekRange(selectedDate);
    }
    return "";
  }

  static getTaskStatusText(status: TaskStatus): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "completed";
      case TaskStatus.SKIPPED:
        return "skipped";
      case TaskStatus.FAILED:
        return "failed";
      default:
        return "due";
    }
  }

  static getTaskEventTitle(status: TaskStatus, taskTitle: string): string {
    const statusText = DateHelper.getTaskStatusText(status);
    return `${statusText.charAt(0).toUpperCase() + statusText.slice(1)}: ${taskTitle}`;
  }

  static validateDates(form: FormGroup, notifyService: any): boolean {
    const startDate = form.get("startDate")?.value;
    const endDate = form.get("endDate")?.value;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (end < start) {
        notifyService.showError("End date cannot be earlier than start date");
        return false;
      }
    }

    if (!startDate && endDate) {
      form.get("endDate")?.setValue("");
    }

    return true;
  }

  static createEndDateFilter(startDateControl: string, form: FormGroup) {
    return (date: Date | null): boolean => {
      const startDateValue = form.get(startDateControl)?.value;
      if (!startDateValue) {
        return true;
      }

      if (!date) {
        return false;
      }

      const startDate = new Date(startDateValue);
      startDate.setHours(0, 0, 0, 0);
      return date >= startDate;
    };
  }

  static updateEndDateValidation(form: FormGroup, startDate: string): void {
    const endDateControl = form.get("endDate");
    if (!startDate) {
      endDateControl?.setValue("");
    } else {
      const currentEndDate = endDateControl?.value;
      if (startDate && currentEndDate) {
        const start = new Date(startDate);
        const end = new Date(currentEndDate);
        if (end < start) {
          endDateControl?.setValue("");
        }
      }
    }
  }
}

export const generateCalendarDays = DateHelper.generateCalendarDays;
export const generateWeekDays = DateHelper.generateWeekDays;
export const getWeeksForMobile = DateHelper.getWeeksForMobile;
export const isSameDay = DateHelper.isSameDay;
export const getEventColor = DateHelper.getEventColor;
export const formatMonthYear = DateHelper.formatMonthYear;
export const formatWeekRange = DateHelper.formatWeekRange;
export const getCurrentTitle = DateHelper.getCurrentTitle;
export const getTaskStatusText = DateHelper.getTaskStatusText;
export const getTaskEventTitle = DateHelper.getTaskEventTitle;
