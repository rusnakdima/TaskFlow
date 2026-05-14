export type ItemDisplayType =
  | "title"
  | "description"
  | "checkbox"
  | "priority-badge"
  | "status-badge"
  | "status-toggle"
  | "progress"
  | "progress-bar"
  | "date"
  | "datetime"
  | "avatar-stack"
  | "category-pills"
  | "comments-badge"
  | "subtasks-count"
  | "expand-toggle"
  | "drag-handle"
  | "menu"
  | "actions"
  | "expand-details"
  | "html"
  | "text"
  | "chip"
  | "number"
  | "boolean"
  | "select"
  | "deleted-badge"
  | "badge-group"
  | "comment-toggle";

import { TableField } from "./table-field.model";

export interface ItemDisplayConfig {
  key: string;
  type: ItemDisplayType;
  label?: string;
  sortable?: boolean;
  width?: string;
  class?: string;
  getValue?: (item: any) => any;
  getDisplayValue?: (item: any) => string;
  getSortValue?: (item: any) => string | number;
  getClass?: (item: any) => string;
  getBadgeClass?: (item: any) => string;
  getChipColor?: (item: any) => string;
  onClick?: (item: any, event: MouseEvent) => void;
  editable?: boolean;
  toggleable?: boolean;
  showIf?: (item: any) => boolean;
  options?: Array<{ value: string; label: string }>;
  line?: 1 | 2 | 3;
  expandFields?: TableField[];
  iconConfig?:
    | ((item: any) => { icon?: string; position?: "left" | "right" })
    | {
        icon?: string;
        position?: "left" | "right";
      };
  size?: "sm" | "md" | "lg";
}

export interface ItemDisplayAction {
  id?: string;
  key?: string;
  label: string;
  icon?: string;
  template?: string;
  callback?: (item: any) => void;
  showIf?: (item: any) => boolean;
}
