import { Subscription } from "rxjs";
import { ShortcutService } from "@services/shortcut.service";
import { FormGroup } from "@angular/forms";
import { DateValidatorService } from "@services/date-validator.service";

/**
 * Base class for Manage views (ManageTodoView, ManageTaskView, ManageSubtaskView)
 * Provides common functionality for form management, subscriptions, and navigation
 */
export abstract class BaseManageView {
  protected saveSubscription: Subscription | null = null;
  isSubmitting = false;
  isPrivate = true;

  constructor(
    protected shortcutService: ShortcutService,
    protected form: FormGroup,
    protected dateValidator: DateValidatorService
  ) {}

  /**
   * Initialize common subscriptions
   */
  protected initSubscriptions(): void {
    this.saveSubscription = this.shortcutService.save$.subscribe(() => {
      this.onSubmit();
    });
  }

  /**
   * Handle query parameters for isPrivate flag
   */
  protected handleQueryParams(queryParams: any): void {
    if (queryParams.isPrivate !== undefined) {
      this.isPrivate = queryParams.isPrivate === "true";
    }
  }

  /**
   * Create date class for calendar highlighting
   */
  protected createDateClass() {
    return (date: Date): MatCalendarCellCssClasses => {
      const endDateValue = this.form.get("endDate")?.value;
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

  /**
   * Create end date filter for datepicker
   */
  protected createEndDateFilter(startDateField: string = "startDate") {
    return (date: Date | null): boolean => {
      return this.dateValidator.createEndDateFilter(startDateField, this.form)(date);
    };
  }

  /**
   * Validate dates from form
   */
  protected validateDates(): boolean {
    return this.dateValidator.validateDatesFromForm(this.form);
  }

  /**
   * Clear dates from form
   */
  protected clearDates(): void {
    this.form.get("startDate")?.setValue("");
    this.form.get("endDate")?.setValue("");
  }

  /**
   * Submit handler - to be implemented by subclasses
   */
  abstract onSubmit(): void;

  /**
   * Cleanup on destroy
   */
  ngOnDestroy(): void {
    this.saveSubscription?.unsubscribe();
  }
}
