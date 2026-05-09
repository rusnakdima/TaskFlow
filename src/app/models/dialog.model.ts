export interface PromptDialogConfig {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  required?: boolean;
  confirmClass?: string;
  validateFn?: (value: string) => string | null;
}

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmClass?: string;
  type?: "info" | "warning" | "danger";
}
