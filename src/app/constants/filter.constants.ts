import { FilterConfig } from '@models/filter-config.model';

export const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'deletedFilter',
    label: 'Deleted Status',
    controlType: 'select',
    options: [
      { value: 'all', label: 'All Records' },
      { value: 'not_deleted', label: 'Not Deleted' },
      { value: 'deleted', label: 'Deleted' }
    ]
  },
  {
    key: 'titleFilter',
    label: 'Title',
    controlType: 'text',
    placeholder: 'Search by title...',
    dataType: ['todos', 'tasks', 'subtasks', 'categories']
  },
  {
    key: 'descriptionFilter',
    label: 'Description',
    controlType: 'text',
    placeholder: 'Search by description...',
    dataType: ['todos', 'tasks', 'comments', 'chats']
  },
  {
    key: 'priorityFilter',
    label: 'Priority',
    controlType: 'select',
    options: [
      { value: '', label: 'All' },
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'urgent', label: 'Urgent' }
    ],
    dataType: ['todos', 'tasks', 'subtasks']
  },
  {
    key: 'statusFilter',
    label: 'Status',
    controlType: 'select',
    options: [
      { value: 'all', label: 'All' },
      { value: 'active', label: 'Active' },
      { value: 'completed', label: 'Completed' }
    ],
    dataType: ['todos']
  },
  {
    key: 'isCompletedFilter',
    label: 'Completion',
    controlType: 'select',
    options: [
      { value: 'all', label: 'All' },
      { value: 'pending', label: 'Pending' },
      { value: 'in-progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'skipped', label: 'Skipped' },
      { value: 'failed', label: 'Failed' },
      { value: 'blocked', label: 'Blocked' }
    ],
    dataType: ['tasks', 'subtasks']
  },
  {
    key: 'visibilityFilter',
    label: 'Visibility',
    controlType: 'select',
    options: [
      { value: 'all', label: 'All' },
      { value: 'private', label: 'Private' },
      { value: 'team', label: 'Team' }
    ],
    dataType: ['todos']
  },
  {
    key: 'userFilter',
    label: 'User',
    controlType: 'select',
    dynamicListKey: 'userList',
    dataType: ['todos', 'tasks', 'comments', 'chats', 'categories', 'daily_activities']
  },
  {
    key: 'categoriesFilter',
    label: 'Categories',
    controlType: 'select',
    dynamicListKey: 'categoryList',
    dataType: ['todos']
  },
  {
    key: 'todoIdFilter',
    label: 'Project',
    controlType: 'select',
    dynamicListKey: 'todoList',
    dataType: ['tasks', 'chats']
  },
  {
    key: 'taskIdFilter',
    label: 'Task',
    controlType: 'select',
    dynamicListKey: 'taskList',
    dataType: ['subtasks', 'comments']
  },
  {
    key: 'subtaskIdFilter',
    label: 'Subtask',
    controlType: 'select',
    dynamicListKey: 'subtaskList',
    dataType: ['comments']
  },
  {
    key: 'startDateFilter',
    label: 'Start Date',
    controlType: 'date',
    dataType: ['todos', 'tasks', 'subtasks', 'daily_activities']
  },
  {
    key: 'endDateFilter',
    label: 'End Date',
    controlType: 'date',
    dataType: ['todos', 'tasks', 'subtasks']
  }
];