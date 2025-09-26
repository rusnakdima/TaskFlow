/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Todo } from "@models/todo";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";

interface SharedProject {
  id: string;
  title: string;
  description: string;
  owner: string;
  members: Array<{ id: string; name: string; role: string; avatar?: string }>;
  tasks: Array<Todo>;
  progress: number;
  createdAt: string;
  updatedAt: string;
  status: "active" | "completed" | "paused";
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  tasksCompleted: number;
  tasksAssigned: number;
}

@Component({
  selector: "app-shared-tasks",
  standalone: true,
  providers: [MainService],
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./shared-tasks.view.html",
})
export class SharedTasksView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  activeTab: string = "projects";
  selectedProject: SharedProject | null = null;

  sharedProjects: SharedProject[] = [];
  teamMembers: TeamMember[] = [];

  sampleProjects: SharedProject[] = [
    {
      id: "1",
      title: "Website Redesign",
      description: "Complete redesign of the company website with modern UI/UX",
      owner: "John Doe",
      members: [
        { id: "1", name: "John Doe", role: "Project Manager" },
        { id: "2", name: "Jane Smith", role: "Designer" },
        { id: "3", name: "Mike Johnson", role: "Developer" },
      ],
      tasks: [],
      progress: 65,
      createdAt: "2024-01-15",
      updatedAt: "2024-01-20",
      status: "active",
    },
    {
      id: "2",
      title: "Mobile App Development",
      description: "Cross-platform mobile application for task management",
      owner: "Jane Smith",
      members: [
        { id: "2", name: "Jane Smith", role: "Lead Developer" },
        { id: "4", name: "Alex Wilson", role: "UI Designer" },
        { id: "5", name: "Sarah Brown", role: "QA Tester" },
      ],
      tasks: [],
      progress: 35,
      createdAt: "2024-01-10",
      updatedAt: "2024-01-22",
      status: "active",
    },
    {
      id: "3",
      title: "Marketing Campaign",
      description: "Q1 2024 product launch marketing campaign",
      owner: "Mike Johnson",
      members: [
        { id: "3", name: "Mike Johnson", role: "Marketing Lead" },
        { id: "6", name: "Emily Davis", role: "Content Creator" },
        { id: "7", name: "Chris Lee", role: "Social Media Manager" },
      ],
      tasks: [],
      progress: 90,
      createdAt: "2024-01-05",
      updatedAt: "2024-01-23",
      status: "completed",
    },
  ];

  sampleTeamMembers: TeamMember[] = [
    {
      id: "1",
      name: "John Doe",
      email: "john.doe@company.com",
      role: "Project Manager",
      tasksCompleted: 25,
      tasksAssigned: 30,
    },
    {
      id: "2",
      name: "Jane Smith",
      email: "jane.smith@company.com",
      role: "Lead Developer",
      tasksCompleted: 18,
      tasksAssigned: 22,
    },
    {
      id: "3",
      name: "Mike Johnson",
      email: "mike.johnson@company.com",
      role: "Marketing Lead",
      tasksCompleted: 12,
      tasksAssigned: 15,
    },
    {
      id: "4",
      name: "Alex Wilson",
      email: "alex.wilson@company.com",
      role: "UI Designer",
      tasksCompleted: 8,
      tasksAssigned: 10,
    },
  ];

  ngOnInit(): void {
    this.loadSharedProjects();
    this.loadTeamMembers();
  }

  loadSharedProjects(): void {
    this.sharedProjects = this.sampleProjects;
  }

  loadTeamMembers(): void {
    this.teamMembers = this.sampleTeamMembers;
  }

  changeTab(tab: string): void {
    this.activeTab = tab;
    this.selectedProject = null;
  }

  selectProject(project: SharedProject): void {
    this.selectedProject = project;
  }

  backToProjects(): void {
    this.selectedProject = null;
  }

  getStatusColor(status: string): string {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "completed":
        return "bg-blue-500";
      case "paused":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  }

  getProgressColor(progress: number): string {
    if (progress >= 80) return "bg-green-500";
    if (progress >= 50) return "bg-blue-500";
    if (progress >= 25) return "bg-yellow-500";
    return "bg-red-500";
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  getCompletionRate(member: TeamMember): number {
    if (member.tasksAssigned === 0) return 0;
    return Math.round((member.tasksCompleted / member.tasksAssigned) * 100);
  }

  getMemberInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }

  inviteMember(): void {
    this.notifyService.showSuccess("Invite functionality would be implemented here");
  }

  createProject(): void {
    this.notifyService.showInfo("Project creation form would open here");
  }
}
