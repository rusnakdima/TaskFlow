import { CommonModule } from "@angular/common";
import { Component, EventEmitter, HostListener, OnInit, Output, signal, ViewChild, ElementRef } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  category: "page" | "project" | "action" | "category";
  route?: string;
  action?: () => void;
}

@Component({
  selector: "app-command-palette",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./command-palette.component.html",
})
export class CommandPaletteComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @ViewChild("searchInput") searchInputRef!: ElementRef<HTMLInputElement>;

  isOpen = signal(false);
  searchQuery = signal("");
  selectedIndex = signal(0);

  filteredItems = signal<CommandItem[]>([]);
  private allItems: CommandItem[] = [];

  private pages: CommandItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      description: "Go to Dashboard",
      icon: "dashboard",
      category: "page",
      route: "/dashboard",
    },
    {
      id: "projects",
      label: "Projects",
      description: "View all projects",
      icon: "list_alt",
      category: "page",
      route: "/todos",
    },
    {
      id: "tasks",
      label: "Tasks",
      description: "View tasks",
      icon: "assignment",
      category: "page",
      route: "/todos",
    },
    {
      id: "calendar",
      label: "Calendar",
      description: "View Calendar",
      icon: "calendar_month",
      category: "page",
      route: "/calendar",
    },
    {
      id: "kanban",
      label: "Kanban Board",
      description: "View Kanban Board",
      icon: "view_kanban",
      category: "page",
      route: "/kanban",
    },
    {
      id: "stats",
      label: "Statistics",
      description: "View Statistics",
      icon: "bar_chart",
      category: "page",
      route: "/stats",
    },
    {
      id: "categories",
      label: "Categories",
      description: "Manage Categories",
      icon: "category",
      category: "page",
      route: "/categories",
    },
    {
      id: "shared",
      label: "Shared Tasks",
      description: "View Shared Tasks",
      icon: "group_work",
      category: "page",
      route: "/shared-tasks",
    },
    {
      id: "profile",
      label: "Profile",
      description: "View Profile",
      icon: "person",
      category: "page",
      route: "/profile",
    },
    {
      id: "settings",
      label: "Settings",
      description: "App Settings",
      icon: "settings",
      category: "page",
      route: "/profile",
    },
    {
      id: "about",
      label: "About",
      description: "About TaskFlow",
      icon: "info",
      category: "page",
      route: "/about",
    },
    {
      id: "sync",
      label: "Sync",
      description: "Data Synchronization",
      icon: "sync",
      category: "page",
      route: "/sync",
    },
  ];

  private actions: CommandItem[] = [
    {
      id: "new-project",
      label: "New Project",
      description: "Create a new project",
      icon: "add_circle",
      category: "action",
      route: "/todos/create_todo",
    },
    {
      id: "toggle-theme",
      label: "Toggle Theme",
      description: "Switch between light and dark mode",
      icon: "brightness_6",
      category: "action",
      action: () => this.toggleTheme(),
    },
    {
      id: "refresh",
      label: "Refresh",
      description: "Refresh the current page",
      icon: "refresh",
      category: "action",
      action: () => window.location.reload(),
    },
  ];

  constructor(private router: Router) {}

  ngOnInit() {
    this.allItems = [...this.pages, ...this.actions];
    this.filteredItems.set(this.allItems);
  }

  @HostListener("window:keydown", ["$event"])
  handleKeydown(event: KeyboardEvent) {
    if (!this.isOpen()) return;

    if (event.key === "Escape") {
      this.closePalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.selectedIndex.update((i) => (i < this.filteredItems().length - 1 ? i + 1 : 0));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.selectedIndex.update((i) => (i > 0 ? i - 1 : this.filteredItems().length - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.selectItem(this.filteredItems()[this.selectedIndex()]);
      return;
    }
  }

  open() {
    this.isOpen.set(true);
    this.searchQuery.set("");
    this.selectedIndex.set(0);
    this.filteredItems.set(this.allItems);
    setTimeout(() => {
      this.searchInputRef?.nativeElement?.focus();
    }, 50);
  }

  closePalette() {
    this.isOpen.set(false);
    this.close.emit();
  }

  onSearch() {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      this.filteredItems.set(this.allItems);
      this.selectedIndex.set(0);
      return;
    }

    const filtered = this.allItems.filter((item) => {
      const labelMatch = this.fuzzyMatch(item.label.toLowerCase(), query);
      const descMatch = item.description && this.fuzzyMatch(item.description.toLowerCase(), query);
      return labelMatch || descMatch;
    });

    this.filteredItems.set(filtered);
    this.selectedIndex.set(0);
  }

  private fuzzyMatch(text: string, pattern: string): boolean {
    if (pattern.length === 0) return true;
    if (pattern.length > text.length) return false;

    const patternChars = pattern.split("");
    let patternIdx = 0;

    for (let i = 0; i < text.length && patternIdx < patternChars.length; i++) {
      if (text[i] === patternChars[patternIdx]) {
        patternIdx++;
      }
    }

    return patternIdx === patternChars.length;
  }

  selectItem(item: CommandItem) {
    if (item.route) {
      this.router.navigate([item.route]);
    } else if (item.action) {
      item.action();
    }
    this.closePalette();
  }

  getGroupedItems(): { category: string; items: CommandItem[] }[] {
    const groups: { [key: string]: CommandItem[] } = {};
    const items = this.filteredItems();

    items.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    });

    const categoryLabels: { [key: string]: string } = {
      page: "Pages",
      project: "Projects",
      category: "Categories",
      action: "Actions",
    };

    return Object.entries(groups).map(([category, items]) => ({
      category: categoryLabels[category] || category,
      items,
    }));
  }

  private toggleTheme() {
    const html = document.querySelector("html");
    const currentTheme = html?.getAttribute("class") || "";
    const newTheme = currentTheme === "dark" ? "" : "dark";
    html?.setAttribute("class", newTheme);
    localStorage.setItem("theme", newTheme);
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains("command-palette-backdrop")) {
      this.closePalette();
    }
  }
}
