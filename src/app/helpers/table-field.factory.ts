import { AdminFieldConfig, AdminFieldType } from "@models/admin-table.model";
import { TableField, TableFieldType } from "@components/table-view/table-field.model";

export class TableFieldFactory {
  static fromAdminConfig(config: AdminFieldConfig): TableField {
    return {
      key: config.key,
      label: config.label,
      type: config.type as TableFieldType,
      sortable: true,
      width: config.width,
      options: config.options?.map((o) => ({ value: o, label: o })),
      getValue: config.getValue,
      getChipColor: config.getChipColor,
      getChipText: config.getChipText,
    };
  }

  static createAdminFields(): TableField[] {
    return [
      { key: "title", label: "Title", type: "text", sortable: true },
      { key: "status", label: "Status", type: "status", sortable: true },
      { key: "priority", label: "Priority", type: "priority", sortable: true },
      { key: "visibility", label: "Visibility", type: "chip", sortable: true },
      {
        key: "deleted_at",
        label: "Deleted",
        type: "chip",
        sortable: true,
        getChipColor: (item: any) => item?.deleted_at ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        getChipText: (item: any) => item?.deleted_at ? "Yes" : "No",
      },
      { key: "created_at", label: "Created", type: "datetime", sortable: true },
      { key: "expand", label: "", type: "expand" },
    ];
  }

  static createAdminExpandTemplate(item: any): Record<string, any> {
    return {
      title: item.title,
      description: item.description,
      status: item.status,
      priority: item.priority,
      visibility: item.visibility,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }
}
