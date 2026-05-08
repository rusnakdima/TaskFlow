export interface Statistics {
  total_tasks: number;
  completion_rate: number;
  average_task_time: number;
  productivity_score: number;
  previous_total_tasks: number;
  previous_completion_rate: number;
  previous_average_time: number;
  previous_productivity_score: number;
}

export interface StatisticsResponse {
  statistics: Statistics;
  chart_data: ChartData;
  achievements: Achievement[];
  detailed_metrics: DetailedMetric[];
}

export interface ChartData {
  completion_trend: Array<{ label: string; value: number }>;
  categories: Array<CategoryChart>;
  daily_activity: Array<{ day_name: string; activity: number }>;
}

export interface CategoryChart {
  name: string;
  count: number;
  percentage: number;
  color: string;
}

export interface Achievement {
  title: string;
  description: string;
  icon: string;
  color: string;
  date: string;
}

export interface DetailedMetric {
  name: string;
  current: string;
  previous: string;
  change: number;
}
