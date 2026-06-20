/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  ChangeDetectionStrategy,
  TemplateRef,
  inject,
  ChangeDetectorRef,
} from "@angular/core";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { CommentsComponent } from "@components/comments/comments.component";
import { SubtaskCommentGroup } from "@entities/comment-ext.model";
import { ItemRowBaseComponent, ItemType } from "@components/item-row-base/item-row-base.component";
/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";
/* services */
import { StorageService } from "@services/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { PermissionService, TodoPermission } from "@core/services/permission.service";
/* components */
import { StatusToggleComponent } from "@components/status-toggle/status-toggle.component";
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";
import { CommentsToggleComponent } from "@components/comments-toggle/comments-toggle.component";
/* models */
import { TableFieldActionButton, TableField } from "@entities/table-field.model";
import { ItemDisplayAction, ItemDisplayConfig } from "@entities/item-display.model";
import { Comment, TaskStatus } from "@entities/generated/api.types";
/* constants */
import { TableFieldColors, TableFieldIcons, ActionColors } from "@shared/utils/constants";
@Component({
  selector: "app-table-view",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    CheckboxComponent,
    DragDropModule,
    CommentsComponent,
    StatusToggleComponent,
    ProgressBarComponent,
    CommentsToggleComponent,
  ],
  templateUrl: "./table-view.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableViewComponent extends ItemRowBaseComponent {
  private tableCdr = inject(ChangeDetectorRef);
  private storageService = inject(StorageService);
  private authServiceLocal = inject(AuthService);
  private permissionService = inject(PermissionService);
  @Input() data: any[] = [];
  @Input() fields: (TableField | ItemDisplayConfig)[] = [];
  @Input() selectedIds = new Set<string>();
  @Input() showSelection = true;
  @Input() showActionsColumn = true;
  @Input() emptyMessage = "No data available";
  @Input() actions: TableFieldActionButton[] = [
    { key: "edit", icon: "edit", label: "Edit" },
    { key: "delete", icon: "delete", label: "Delete" },
  ];
  @Input() expandColumn = false;
  @Input() dragEnabled = false;
  @Input() expandable = false;
  @Input() expandTemplate: TemplateRef<any> | null = null;
  @Input() showCommentToggle = false;
  @Input() showStatusToggle = false;
  @Input() statusKey = "status";
  @Input() itemType: ItemType = "task";
  @Input() highlightedId: string | null = null;
  @Input() highlightIdPrefix: string = "";
  @Input() userPermission: TodoPermission = TodoPermission.VIEWER;
  @Input() itemPermissionResolver: ((item: any) => TodoPermission) | null = null;
  @Output() rowClick = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() selectAll = new EventEmitter<boolean>();
  @Output() rangeSelect = new EventEmitter<{ anchorId: string; targetId: string }>();
  @Output() additiveSelect = new EventEmitter<string>();
  @Output() sortChange = new EventEmitter<{ field: string; direction: "asc" | "desc" }>();
  @Output() actionClick = new EventEmitter<{ action: string; item: any; newStatus?: TaskStatus }>();
  @Output() dropped = new EventEmitter<CdkDragDrop<any[]>>();
  @Output() addComment = new EventEmitter<{ content: string; itemId: string }>();
  @Output() deleteComment = new EventEmitter<string>();
  @Output() markAsRead = new EventEmitter<string[]>();
  @Output() addSubtaskComment = new EventEmitter<{
    content: string;
    subtask_id: string;
    itemId: string;
  }>();
  @Output() deleteItemEvent = new EventEmitter<string>();
  @Output() toggleCommentsEvent = new EventEmitter<string>();
  currentItem = signal<any>(null);
  override get item(): any {
    return this.currentItem();
  }
  override get type(): ItemType {
    return this.itemType;
  }
  get itemId(): string {
    return this.currentItem()?.id || "";
  }
  get itemTitle(): string {
    return this.currentItem()?.title || "";
  }
  get itemDescription(): string | null {
    return this.currentItem()?.description || null;
  }
  get itemStatus(): string {
    return this.currentItem()?.status || "";
  }
  get itemPriority(): string {
    return this.currentItem()?.priority || "";
  }
  get itemComments(): Comment[] {
    const item = this.currentItem();
    if (!item?.comments) return [];
    return item.comments.filter((c: Comment) => !c.deleted_at);
  }
  get itemSubtasks(): any[] {
    return this.currentItem()?.subtasks || [];
  }
  get subtaskCount(): number {
    return this.itemSubtasks.length;
  }
  get commentsTitle(): string {
    return "Comments";
  }
  get deleteItemTitle(): string {
    return this.itemType === "subtask" ? "Delete subtask" : "Delete item";
  }
  get itemDeleteEvent(): EventEmitter<string> {
    return this.deleteItemEvent;
  }
  get addCommentEvent(): EventEmitter<
    { content: string; task_id: string } | { content: string; subtask_id: string }
  > {
    return new EventEmitter<
      { content: string; task_id: string } | { content: string; subtask_id: string }
    >();
  }
  override toggleComments(): void {
    this.showComments.update((v) => !v);
    this.tableCdr.markForCheck();
  }
  override onSelectionChange(checked: boolean): void {
    this.selectionChange.emit({ id: this.itemId, selected: checked });
  }
  override onAddComment(content: string): void {
    this.addComment.emit({ content, itemId: this.itemId });
  }
  override onDeleteComment(commentId: string): void {
    this.deleteComment.emit(commentId);
  }
  override onMarkAsRead(commentIds: string[]): void {
    this.markAsRead.emit(commentIds);
  }
  override deleteItem(): void {
    this.deleteItemEvent.emit(this.itemId);
  }
  override onActionClick(action: string): void {
    this.actionClick.emit({ action, item: this.item });
  }
  sortField = signal<string>("");
  sortDirection = signal<"asc" | "desc">("asc");
  expandedRows = signal<Set<string>>(new Set());
  expandedComments = signal<Set<string>>(new Set());
  setCurrentItem(item: any): void {
    this.currentItem.set(item);
  }
  toggleSort(field: TableField | ItemDisplayConfig): void {
    if (!field.sortable) return;
    if (this.sortField() === field.key) {
      this.sortDirection.set(this.sortDirection() === "asc" ? "desc" : "asc");
    } else {
      this.sortField.set(field.key);
      this.sortDirection.set("asc");
    }
    this.sortChange.emit({
      field: field.key,
      direction: this.sortDirection(),
    });
  }
  getSortedData(): any[] {
    const field = this.sortField();
    if (!field) return this.data;
    const fieldConfig = this.fields.find((f) => f.key === field);
    const direction = this.sortDirection();
    return [...this.data].sort((a, b) => {
      const aVal = fieldConfig?.getSortValue ? fieldConfig.getSortValue(a) : a[field];
      const bVal = fieldConfig?.getSortValue ? fieldConfig.getSortValue(b) : b[field];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      return direction === "asc" ? comparison : -comparison;
    });
  }
  isExpanded(id: string): boolean {
    return this.expandedRows().has(id);
  }
  toggleExpanded(id: string): void {
    this.expandedRows.update((expanded) => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  }
  isItemSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }
  isHighlighted(id: string): boolean {
    return this.highlightedId === id;
  }
  getRowId(id: string): string {
    return this.highlightIdPrefix ? this.highlightIdPrefix + id : id;
  }
  onSelectAll(checked: boolean): void {
    this.selectAll.emit(checked);
  }
  formatValue(item: any, field: TableField | ItemDisplayConfig): any {
    if (field.getValue) {
      return field.getValue(item);
    }
    return item[field.key];
  }
  formatDate = DateHelper.formatDateShort;
  formatDateTime = DateHelper.formatDateTime;
  getFieldClass(field: TableField | ItemDisplayConfig): string {
    return field.width ? `w-${field.width}` : "";
  }
  onDropped(event: CdkDragDrop<any[]>): void {
    if (!this.dragEnabled) return;
    this.dropped.emit(event);
  }
  isCommentExpandedById(id: string): boolean {
    return this.expandedComments().has(id);
  }
  toggleCommentsById(id: string): void {
    this.toggleCommentsEvent.emit(id);
    const item = this.data.find((d) => d.id === id);
    if (item) this.setCurrentItem(item);
    this.expandedComments.update((expanded) => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  }
  getCommentsForItem(item: any): any[] {
    const comments =
      this.itemType === "subtask"
        ? this.storageService.getCommentsBySubtaskId(item.id)
        : this.storageService.getCommentsByTaskId(item.id);
    return comments;
  }
  getSubtaskCommentGroupsForItem(item: any): SubtaskCommentGroup[] {
    if (this.itemType === "subtask") {
      return [];
    }
    if (!item.subtasks) return [];
    return item.subtasks.map((s: any) => ({
      subtask_id: s.id,
      title: s.title || "Untitled subtask",
      comments: this.storageService.getCommentsBySubtaskId(s.id).filter((c) => !c.deleted_at),
    }));
  }
  getPriorityClass = BaseItemHelper.getPriorityBadgeClass;
  getStatusClass = BaseItemHelper.getStatusBadgeClass;
  getIconColor(field: TableField | ItemDisplayConfig, value: any): string {
    const iconDefault = this.getIconDefault(field);
    if (iconDefault) return iconDefault;
    if (field.type === "boolean") {
      return value ? TableFieldIcons.boolean.true : TableFieldIcons.boolean.false;
    }
    if (field.type === "change") {
      if (value > 0) return TableFieldIcons.change.positive;
      if (value < 0) return TableFieldIcons.change.negative;
      return TableFieldIcons.change.neutral;
    }
    return "";
  }
  getChipOrBadgeColor(field: TableField | ItemDisplayConfig, value: any): string {
    const colorDefault = this.getColorConfigDefault(field);
    if (colorDefault) return colorDefault;
    if (field.type === "change") {
      if (value > 0) return TableFieldColors.change.positive;
      if (value < 0) return TableFieldColors.change.negative;
      return TableFieldColors.change.neutral;
    }
    if (field.type === "boolean") {
      return value ? TableFieldColors.boolean.true : TableFieldColors.boolean.false;
    }
    return "";
  }
  getActionColor(action: TableFieldActionButton): string {
    const colorKey = action.key as keyof typeof ActionColors;
    const baseClass =
      "flex items-center justify-center rounded-lg transition-all duration-200 hover:scale-110 text-2xl!";
    const actionColor = ActionColors[colorKey] || ActionColors.default;
    return `${baseClass} ${actionColor}`;
  }
  hasActionTemplate(action: TableFieldActionButton): boolean {
    return !!action.template;
  }
  onCommentAdd(content: string, item: any): void {
    queueMicrotask(() => this.setCurrentItem(item));
    this.addComment.emit({ content, itemId: item.id });
  }
  onCommentDelete(commentId: string): void {
    this.deleteComment.emit(commentId);
  }
  onCommentMarkAsRead(commentIds: string[]): void {
    this.markAsRead.emit(commentIds);
  }
  onSubtaskCommentAdd(event: { content: string; subtask_id: string }, item: any): void {
    queueMicrotask(() => this.setCurrentItem(item));
    this.addSubtaskComment.emit({ ...event, itemId: item.id });
  }
  onCheckboxTdClick(event: MouseEvent, id: string): void {
    event.stopPropagation();
    const anchorId = this.lastSelectedId();
    if (event.shiftKey && anchorId) {
      this.rangeSelect.emit({ anchorId, targetId: id });
    } else if (event.ctrlKey || event.metaKey) {
      this.additiveSelect.emit(id);
    }
  }
  onCheckboxChange(result: { checked: boolean; event?: MouseEvent }, id: string): void {
    const item = this.data.find((d) => d.id === id);
    if (item) queueMicrotask(() => this.setCurrentItem(item));
    this.selectionChange.emit({ id, selected: result.checked });
  }
  onRowClick(event: MouseEvent, item: any): void {
    queueMicrotask(() => this.setCurrentItem(item));
    this.rowClick.emit({ event, item });
  }
  onActionClickHandler(action: string, item: any): void {
    queueMicrotask(() => this.setCurrentItem(item));
    this.actionClick.emit({ action, item });
  }
  onStatusToggle(item: any, newStatus?: TaskStatus): void {
    queueMicrotask(() => this.setCurrentItem(item));
    this.actionClick.emit({ action: "toggle_status", item, newStatus });
  }
  onSelectionChangeById(id: string, checked: boolean): void {
    const item = this.data.find((d) => d.id === id);
    if (item) queueMicrotask(() => this.setCurrentItem(item));
    this.selectionChange.emit({ id, selected: checked });
  }
  lastSelectedId = signal<string | null>(null);
  readonly isViewerPermission = TodoPermission.VIEWER;
  readonly isAdminPermission = [TodoPermission.MODERATOR, TodoPermission.OWNER];
  isActionDisabledForItem(item: any): boolean {
    const currentUserId = this.authServiceLocal.getValueByKey("id");
    console.debug("isActionDisabledForItem", {
      itemType: this.itemType,
      userId: currentUserId,
      userPermission: this.userPermission,
      hasItemPermissionResolver: !!this.itemPermissionResolver,
    });
    if (!currentUserId) return false;
    if (this.itemType === "category") {
      return item.user_id !== currentUserId;
    }
    const permission = this.itemPermissionResolver
      ? this.itemPermissionResolver(item)
      : this.userPermission;
    console.debug("isActionDisabledForItem computed", {
      permission,
      isViewer: permission === TodoPermission.VIEWER,
    });
    if (permission === TodoPermission.VIEWER) {
      return true;
    }
    if (this.isAdminPermission.includes(permission)) {
      return false;
    }
    return true;
  }
  isStatusToggleDisabledForItem(_item: any): boolean {
    if (this.userPermission === TodoPermission.VIEWER) {
      return true;
    }
    if (this.isAdminPermission.includes(this.userPermission)) {
      return false;
    }
    return true;
  }
  getActionColorForItem(action: ItemDisplayAction, item: any): string {
    const colorKey = action.key as keyof typeof ActionColors;
    const disabledKey = (action.key + "_disabled") as keyof typeof ActionColors;
    if (action.permission && this.isActionDisabledByPermissionForItem(action, item)) {
      return ActionColors[disabledKey] || ActionColors.default_disabled;
    }
    return ActionColors[colorKey] || ActionColors.default;
  }
  isActionDisabledByPermissionForItem(action: ItemDisplayAction, item: any): boolean {
    if (!action.permission) {
      return this.isActionDisabledForItem(item);
    }
    const currentUserId = this.authServiceLocal.getValueByKey("id");
    if (!currentUserId) return false;
    const permission = this.itemPermissionResolver
      ? this.itemPermissionResolver(item)
      : this.userPermission;
    const key = action.key?.toLowerCase() || "";
    if (key === "edit") {
      return !this.canEditItem(item, permission, currentUserId);
    }
    if (key === "archive" || key === "restore") {
      return !this.canArchiveItem(item, permission, currentUserId);
    }
    const required = action.permission;
    if (permission === TodoPermission.VIEWER) {
      return true;
    }
    if (required === TodoPermission.EDITOR) {
      if (permission === TodoPermission.EDITOR) {
        return item.user_id !== currentUserId;
      }
      return false;
    }
    if (required === TodoPermission.MODERATOR) {
      if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
        return false;
      }
      if (permission === TodoPermission.EDITOR) {
        return item.user_id !== currentUserId;
      }
      return true;
    }
    return permission !== required;
  }
  canEditItem(item: any, permission: TodoPermission, userId: string): boolean {
    if (this.itemType === "todo") {
      return this.permissionService.canEditTodoFields(permission);
    }
    if (this.itemType === "task") {
      return this.permissionService.canEditTask(item, permission, userId);
    }
    if (this.itemType === "subtask") {
      return this.permissionService.canEditSubtask(item, permission, userId);
    }
    if (this.itemType === "category") {
      return item.user_id === userId;
    }
    return false;
  }
  canArchiveItem(item: any, permission: TodoPermission, userId: string): boolean {
    if (this.itemType === "todo") {
      return this.permissionService.canArchiveTodo(permission);
    }
    if (this.itemType === "task") {
      return this.permissionService.canArchiveTask(item, permission, userId);
    }
    if (this.itemType === "subtask") {
      return this.permissionService.canArchiveSubtask(item, permission, userId);
    }
    if (this.itemType === "category") {
      return item.user_id === userId;
    }
    return false;
  }
  private isTableField(field: TableField | ItemDisplayConfig): field is TableField {
    return "getChipText" in field || "colorConfig" in field;
  }
  hasGetChipText(field: TableField | ItemDisplayConfig): boolean {
    return this.isTableField(field) && !!field.getChipText;
  }
  getIconDefault(field: TableField | ItemDisplayConfig): string | undefined {
    if (this.isTableField(field) && field.iconConfig?.default) {
      return field.iconConfig.default;
    }
    return undefined;
  }
  private getColorConfigDefault(field: TableField | ItemDisplayConfig): string | undefined {
    if (this.isTableField(field) && field.colorConfig?.default) {
      return field.colorConfig.default;
    }
    return undefined;
  }
  getProgressItemsForTable(item: any): Array<{ status: string }> {
    if (this.itemType === "todo") {
      return item.tasks || [];
    }
    if (this.itemType === "task") {
      return item.subtasks || [];
    }
    return [];
  }
  getProgressSizeForTable(field: TableField | ItemDisplayConfig): "sm" | "md" | "lg" {
    return (field as any).size || "sm";
  }
  onCommentsToggleClick(itemId: string): void {
    this.toggleCommentsEvent.emit(itemId);
    const item = this.data.find((d) => d.id === itemId);
    if (item) queueMicrotask(() => this.setCurrentItem(item));
    queueMicrotask(() => {
      this.expandedComments.update((expanded) => {
        const newExpanded = new Set(expanded);
        if (newExpanded.has(itemId)) {
          newExpanded.delete(itemId);
        } else {
          newExpanded.add(itemId);
        }
        return newExpanded;
      });
    });
  }
  getUnreadCountForItem(item: any): number {
    const comments = this.getCommentsForItem(item);
    const userId = this.authServiceLocal.getValueByKey("id");
    if (!userId) return 0;
    return comments.filter(
      (c: Comment) =>
        !c.deleted_at && c.user_id !== userId && !(c.read_by && c.read_by.includes(userId))
    ).length;
  }
  getTotalCommentsCount(item: any): number {
    return this.getCommentsForItem(item).length;
  }
}
