import { CommonModule, Location } from "@angular/common";
import { Component, OnInit, signal, inject, computed, DestroyRef } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Subscription, firstValueFrom } from "rxjs";

import { MatIconModule } from "@angular/material/icon";

import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { ApiService } from "@services/api.service";
import { bindSaveShortcut } from "@helpers/keyboard.helper";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { BasicInfoSectionComponent } from "@components/form/basic-info-section.component";
import { PrioritySectionComponent } from "@components/form/priority-section.component";
import { TimelineSectionComponent } from "@components/form/timeline-section.component";
import { AppButtonComponent } from "@components/shared/button/button.component";

@Component({
  selector: "app-manage-subtask",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    BasicInfoSectionComponent,
    PrioritySectionComponent,
    TimelineSectionComponent,
    AppButtonComponent,
  ],
  templateUrl: "./manage-subtask.view.html",
})
export class ManageSubtaskPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private jwtTokenService = inject(JwtTokenService);
  private notifyService = inject(NotifyService);
  private shortcutService = inject(ShortcutService);
  private destroyRef = inject(DestroyRef);
  private apiService = inject(ApiService);

  form!: FormGroup;
  basicInfoGroup!: FormGroup;
  timelineGroup!: FormGroup;

  isEdit = signal(false);
  isSubmitting = signal(false);

  pageTitle = computed(() => {
    return this.isEdit() ? "Edit Subtask" : "Create Subtask";
  });

  ngOnInit(): void {
    this.initForm();
    this.subscribeToRoute();
    bindSaveShortcut(this.shortcutService, () => this.onSubmit())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  private initForm(): void {
    this.basicInfoGroup = this.fb.group({
      title: ["", Validators.required],
      description: [""],
    });

    this.timelineGroup = this.fb.group({
      startDate: [null as Date | null],
      endDate: [null as Date | null],
      repeat: ["none"],
    });

    this.form = this.fb.group({
      _id: [""],
      id: [""],
      basicInfo: this.basicInfoGroup,
      status: ["pending"],
      priority: ["medium"],
      timeline: this.timelineGroup,
      order: [0],
      deleted_at: [false],
      task_id: ["", Validators.required],
    });
  }

  private subscribeToRoute(): void {
    this.subscriptions.add(
      this.route.params.subscribe(async (params) => {
        await this.loadData(params);
      })
    );
  }

  private async loadData(params: any): Promise<void> {
    const taskId = params.taskId;
    const subtaskId = params.subtaskId;

    if (taskId) {
      this.form.patchValue({ task_id: taskId });
    }

    if (subtaskId) {
      this.isEdit.set(true);
      await this.loadExistingSubtask(subtaskId);
    }
  }

  private async loadExistingSubtask(subtaskId: string): Promise<void> {
    const visibility = this.route.snapshot.queryParamMap.get("visibility") || undefined;

    try {
      const item = await firstValueFrom(this.apiService.subtasks.get(subtaskId, visibility));
      if (item) {
        this.applyItemToForm(item);
      }
    } catch (err) {
      this.notifyService.showError("Failed to load subtask");
    }
  }

  private applyItemToForm(item: any): void {
    this.basicInfoGroup.patchValue({
      title: item.title || "",
      description: item.description || "",
    });

    this.form.patchValue({
      _id: item._id || "",
      id: item.id || "",
      status: item.status || "pending",
      priority: item.priority || "medium",
      task_id: item.task_id || "",
      order: item.order ?? 0,
    });

    this.timelineGroup.patchValue({
      startDate: item.start_date || null,
      endDate: item.end_date || null,
      repeat: item.repeat || "none",
    });
  }

  back(): void {
    this.location.back();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.notifyService.showError("Please fill in required fields");
      return;
    }

    this.isSubmitting.set(true);

    try {
      const formValue = this.form.value;
      const basicInfo = this.basicInfoGroup.value;
      const timeline = this.timelineGroup.value;
      const payload = this.buildPayload(formValue, basicInfo, timeline);

      const visibility = this.route.snapshot.queryParamMap.get("visibility") || "private";

      if (this.isEdit()) {
        const id = formValue._id || formValue.id;
        await firstValueFrom(this.apiService.subtasks.update(id, payload, visibility));
      } else {
        await firstValueFrom(this.apiService.subtasks.create(payload, visibility));
      }

      this.notifyService.showSuccess(
        `Subtask ${this.isEdit() ? "updated" : "created"} successfully`
      );
      this.location.back();
    } catch (err: any) {
      this.notifyService.showError(err.message || "Failed to save");
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private buildPayload(formValue: any, basicInfo: any, timeline: any): any {
    const token = this.jwtTokenService.getToken();
    const userId = this.jwtTokenService.getUserId(token);

    return {
      id: formValue.id || undefined,
      title: basicInfo.title,
      description: basicInfo.description || "",
      status: formValue.status || "pending",
      priority: formValue.priority,
      start_date: timeline.startDate || "",
      end_date: timeline.endDate || "",
      order: formValue.order || 0,
      deleted_at: null,
      user_id: userId,
      task_id: formValue.task_id,
    };
  }

  private subscriptions = new Subscription();
}
