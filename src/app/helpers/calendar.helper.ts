/* models */
import { TaskStatus } from "@models/task.model";

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: "todo" | "task";
  status: string;
  description?: string;
  todoId: string;
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

/**
 * Generate calendar days for month view
 */
export function generateCalendarDays(
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

    const dayEvents = events.filter((event) => isSameDay(event.date, date));

    newCalendarDays.push({
      date: new Date(date),
      isCurrentMonth: date.getMonth() === month,
      isToday: isSameDay(date, new Date()),
      isSelected: isSameDay(date, selectedDate),
      events: dayEvents,
    });
  }

  return newCalendarDays;
}

/**
 * Generate week days for week view
 */
export function generateWeekDays(
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

    const dayEvents = events.filter((event) => isSameDay(event.date, date));

    newWeekDays.push({
      date: new Date(date),
      isCurrentMonth: date.getMonth() === currentMonth.getMonth(),
      isToday: isSameDay(date, new Date()),
      isSelected: isSameDay(date, selectedDate),
      events: dayEvents,
    });
  }

  return newWeekDays;
}

/**
 * Get weeks for mobile view
 */
export function getWeeksForMobile(calendarDays: CalendarDay[]): CalendarDay[][] {
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }
  return weeks;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString();
}

/**
 * Get event color based on status
 */
export function getEventColor(event: CalendarEvent): string {
  if (event.status === "due") return "bg-red-500";
  if (event.status === "completed") return "bg-green-500";
  if (event.status === "skipped") return "bg-orange-500";
  if (event.status === "failed") return "bg-gray-500";
  return "bg-blue-500";
}

/**
 * Format month year
 */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Format week range
 */
export function formatWeekRange(selectedDate: Date): string {
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

/**
 * Get current title based on view mode
 */
export function getCurrentTitle(
  viewMode: "month" | "week",
  currentMonth: Date,
  selectedDate: Date
): string {
  if (viewMode === "month") {
    return formatMonthYear(currentMonth);
  } else if (viewMode === "week") {
    return formatWeekRange(selectedDate);
  }
  return "";
}

/**
 * Get task status text
 */
export function getTaskStatusText(status: TaskStatus): string {
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

/**
 * Get task event title
 */
export function getTaskEventTitle(status: TaskStatus, taskTitle: string): string {
  const statusText = getTaskStatusText(status);
  return `${statusText.charAt(0).toUpperCase() + statusText.slice(1)}: ${taskTitle}`;
}
