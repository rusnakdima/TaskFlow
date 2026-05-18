import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  HostListener,
  OnInit,
  Output,
  signal,
  ViewChild,
  ElementRef,
  inject,
  computed,
  QueryList,
  ViewChildren,
  AfterViewInit,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { ThemeService } from "@services/ui/theme.service";
import { SearchService } from "@services/core/search.service";

type CommandCategory =
  | "page"
  | "project"
  | "task"
  | "subtask"
  | "category"
  | "user"
  | "action"
  | "chat";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  category: CommandCategory;
  route?: string;
  action?: () => void;
}

@Component({
  selector: "app-command-palette",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./command-palette.component.html",
})
export class CommandPaletteComponent implements OnInit, AfterViewInit {
  @Output() close = new EventEmitter<void>();
  @ViewChild("searchInput") searchInputRef!: ElementRef<HTMLInputElement>;
  @ViewChildren("itemBtn") itemButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  private searchService = inject(SearchService);
  private router = inject(Router);
  private themeService = inject(ThemeService);

  isOpen = signal(false);
  searchQuery = signal("");
  selectedIndex = signal(0);

  private allItems: CommandItem[] = [];

  allFlatItems = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const results = this.searchService.globalSearchResults();
    const items: CommandItem[] = [];

    if (!query) {
      return this.allItems;
    }

    this.pages.forEach((page) => {
      if (
        page.label.toLowerCase().includes(query) ||
        page.description?.toLowerCase().includes(query)
      ) {
        items.push({ ...page, category: "page" });
      }
    });

    this.actions.forEach((action) => {
      if (
        action.label.toLowerCase().includes(query) ||
        action.description?.toLowerCase().includes(query)
      ) {
        items.push({ ...action, category: "action" });
      }
    });

    results.projects.forEach((item) => {
      items.push({
        id: item.id,
        label: item.label,
        description: item.description,
        icon: item.icon || "list_alt",
        category: "project",
        route: item.route,
      });
    });

    results.tasks.forEach((item) => {
      items.push({
        id: item.id,
        label: item.label,
        description: item.description,
        icon: item.icon || "assignment",
        category: "task",
        route: item.route,
      });
    });

    results.categories.forEach((item) => {
      items.push({
        id: item.id,
        label: item.label,
        icon: item.icon || "category",
        category: "category",
        route: item.route,
      });
    });

    results.users.forEach((item) => {
      items.push({
        id: item.id,
        label: item.label,
        description: item.description,
        icon: item.icon || "person",
        category: "user",
        route: item.route,
      });
    });

    results.subtasks.forEach((item) => {
      items.push({
        id: item.id,
        label: item.label,
        description: item.description,
        icon: item.icon || "subdirectory_arrow_right",
        category: "subtask",
        route: item.route,
      });
    });

    results.chats.forEach((item) => {
      items.push({
        id: item.id,
        label: item.label,
        description: item.description,
        icon: item.icon || "chat",
        category: "chat",
        route: item.route,
      });
    });

    return items;
  });

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
      action: () => this.themeService.toggleMode(),
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

  ngOnInit() {
    this.allItems = [...this.pages, ...this.actions];
  }

  ngAfterViewInit() {}

  private scrollToSelectedItem(): void {
    setTimeout(() => {
      const buttons = this.itemButtons?.toArray();
      if (buttons && buttons.length > 0) {
        const currentIndex = this.selectedIndex();
        if (currentIndex >= 0 && currentIndex < buttons.length) {
          buttons[currentIndex]?.nativeElement?.scrollIntoView({ block: "nearest" });
        }
      }
    }, 0);
  }

  @HostListener("window:keydown", ["$event"])
  handleKeydown(event: KeyboardEvent) {
    if (!this.isOpen()) return;

    if (event.key === "Escape") {
      this.closePalette();
      return;
    }

    const items = this.allFlatItems();
    const maxIndex = items.length > 0 ? items.length - 1 : 0;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.selectedIndex.update((i) => (i < maxIndex ? i + 1 : 0));
      this.scrollToSelectedItem();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.selectedIndex.update((i) => (i > 0 ? i - 1 : maxIndex));
      this.scrollToSelectedItem();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[this.selectedIndex()];
      if (item) {
        this.selectItem(item);
      }
      return;
    }
  }

  open() {
    this.isOpen.set(true);
    this.searchQuery.set("");
    this.selectedIndex.set(0);
    this.searchService.clearGlobalSearch();
    setTimeout(() => {
      this.searchInputRef?.nativeElement?.focus();
    }, 50);
  }

  closePalette() {
    this.isOpen.set(false);
    this.searchService.clearGlobalSearch();
    this.close.emit();
  }

  onSearch() {
    const query = this.searchQuery().trim();
    if (!query) {
      this.searchService.clearGlobalSearch();
      this.selectedIndex.set(0);
      return;
    }
    this.searchService.searchAllEntities(query);
  }

  getGroupedItems(): { category: string; items: CommandItem[] }[] {
    const items = this.allFlatItems();
    if (items.length === 0) {
      return [];
    }
    return this.groupItems(items);
  }

  private groupItems(items: CommandItem[]): { category: string; items: CommandItem[] }[] {
    const groups: { [key: string]: CommandItem[] } = {};

    items.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    });

    const categoryLabels: { [key: string]: string } = {
      page: "Pages",
      project: "Projects",
      task: "Tasks",
      subtask: "Subtasks",
      category: "Categories",
      user: "Users",
      action: "Actions",
      chat: "Chats",
    };

    return Object.entries(groups).map(([category, items]) => ({
      category: categoryLabels[category] || category,
      items,
    }));
  }

  selectItem(item: CommandItem) {
    if (item.route) {
      const [path, queryString] = item.route.split("?");
      const queryParams: Record<string, string> = {};
      if (queryString) {
        queryString.split("&").forEach((param) => {
          const [key, value] = param.split("=");
          if (key) {
            queryParams[decodeURIComponent(key)] = decodeURIComponent(value || "");
          }
        });
      }
      this.router.navigate([path], { queryParams });
    } else if (item.action) {
      item.action();
    }
    this.closePalette();
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains("command-palette-backdrop")) {
      this.closePalette();
    }
  }
}
