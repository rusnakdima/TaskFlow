export interface Statistics {
  totalTasks: number;
  completionRate: number;
  averageTaskTime: number;
  productivityScore: number;
  previousTotalTasks: number;
  previousCompletionRate: number;
  previousAverageTime: number;
  previousProductivityScore: number;
}

export interface StatisticsResponse {
  statistics: Statistics;
  chartData: ChartData;
  achievements: Achievement[];
  detailedMetrics: DetailedMetric[];
}

export interface ChartData {
  completionTrend: Array<{ label: string; value: number }>;
  categories: Array<CategoryChart>;
  dailyActivity: Array<{ dayName: string; activity: number }>;
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
