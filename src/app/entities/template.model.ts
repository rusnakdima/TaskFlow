export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  categories?: string[];
  createdAt?: string;
  tasks: TemplateTask[];
}

export interface TemplateTask {
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  status?: string;
  subtasks?: Array<{ title: string; description?: string }>;
}
