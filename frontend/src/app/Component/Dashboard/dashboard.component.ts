import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  input,
  signal,
  viewChild,
} from "@angular/core";
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
} from "@angular/cdk/drag-drop";
import { FormsModule } from "@angular/forms";
import { WidgetCard } from "./Widgets/widget-card/widget-card";
import { WeatherWidget } from "./Widgets/weather-widget/weather-widget";
import { SteamFriendsWidget } from "./Widgets/steam-friends-widget/steam-friends-widget";
import { SteamUpdatesWidget } from "./Widgets/steam-updates-widget/steam-updates-widget";
import { GithubNotificationsWidget } from "./Widgets/github-notifications-widget/github-notifications-widget";
import { SteamPlaytimeWidget } from "./Widgets/steam-playtime-widget/steam-playtime-widget";
import { GithubCommitsWidget } from "./Widgets/github-commits-widget/github-commits-widget";
import { Router } from "@angular/router";
import { IUser } from "../../Interface/Auth/auth.interface";
import { WidgetService } from "../../Service/Widget/widget.service";
import { IAvatars } from "../../Interface/Widget/widget.interface";
import { ProfileService } from "../../Service/Profile/profile.service";
import { TitleCasePipe } from "@angular/common";

export type WidgetType =
  | "weather"
  | "steam_friends"
  | "steam_updates"
  | "steam_playtime"
  | "github_notifications"
  | "github_commits";

export interface WidgetConfig {
  id: number;
  type: WidgetType;
  title: string;

  cols: number;
  rows: number;
  refreshRate: number;
  params: Record<string, string | number>;
}

interface WidgetDefinition {
  type: WidgetType;
  service: string;
  title: string;
  description: string;
  cols: number;
  rows: number;
  refreshRate: number;
  params: Record<string, string | number>;
  count?: { label: string; min: number; max: number };
}

export const WIDGET_CATALOG: WidgetDefinition[] = [
  {
    type: "weather",
    service: "Météo",
    title: "Météo",
    description: "Température, ressenti, humidité et vent d'une ville.",
    cols: 1,
    rows: 1,
    refreshRate: 600,
    params: { city: "Paris" },
  },
  {
    type: "steam_friends",
    service: "Steam",
    title: "Amis Steam",
    description: "Qui est en ligne et à quoi jouent vos amis.",
    cols: 1,
    rows: 2,
    refreshRate: 60,
    params: {},
  },
  {
    type: "steam_updates",
    service: "Steam",
    title: "Mises à jour Steam",
    description: "Dernières annonces des jeux auxquels vous avez joué récemment.",
    cols: 2,
    rows: 2,
    refreshRate: 900,
    params: {},
  },
  {
    type: "steam_playtime",
    service: "Steam",
    title: "Temps de jeu du mois",
    description: "Vos jeux les plus joués depuis le début du mois.",
    cols: 1,
    rows: 2,
    refreshRate: 600,
    params: { count: 3 },
    count: { label: "Nombre de jeux", min: 1, max: 10 },
  },
  {
    type: "github_notifications",
    service: "GitHub",
    title: "Notifications GitHub",
    description: "Pull requests, issues et mentions qui vous concernent.",
    cols: 2,
    rows: 1,
    refreshRate: 120,
    params: {},
  },
  {
    type: "github_commits",
    service: "GitHub",
    title: "Commits récents",
    description: "Derniers commits d'un dépôt (public, ou privé avec ton token).",
    cols: 2,
    rows: 2,
    refreshRate: 120,
    params: { repo: "", count: 5 },
    count: { label: "Nombre de commits", min: 1, max: 20 },
  },
];

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 1, type: "weather", title: "Météo", cols: 1, rows: 1, refreshRate: 600, params: { city: "Nancy" } },
  { id: 2, type: "weather", title: "Météo", cols: 1, rows: 1, refreshRate: 600, params: { city: "Paris" } },
];

const VALID_TYPES = new Set<string>(WIDGET_CATALOG.map((d) => d.type));

@Component({
  selector: "app-homepage",
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    FormsModule,
    WidgetCard,
    WeatherWidget,
    SteamFriendsWidget,
    SteamUpdatesWidget,
    GithubNotificationsWidget,
    SteamPlaytimeWidget,
    GithubCommitsWidget,
    TitleCasePipe,
  ],
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.css",
})
export class DashboardComponent implements OnInit {
  user = input<IUser | null>(null);

  /** Pseudo et photo à jour (le resolver ne connaît que le pseudo du chargement). */
  private profiles = inject(ProfileService);
  username = computed(() => this.profiles.profile()?.info.username ?? this.user()?.username ?? "");
  pfp = computed(() => this.profiles.profile()?.perso.pfp ?? null);

  readonly catalog = WIDGET_CATALOG;
  readonly refreshChoices = [
    { value: 30, label: "Toutes les 30 secondes" },
    { value: 60, label: "Toutes les minutes" },
    { value: 120, label: "Toutes les 2 minutes" },
    { value: 300, label: "Toutes les 5 minutes" },
    { value: 600, label: "Toutes les 10 minutes" },
    { value: 900, label: "Toutes les 15 minutes" },
    { value: 1800, label: "Toutes les 30 minutes" },
  ];

  constructor(
    private router: Router,
    private widgetService: WidgetService,
  ) {}

  widgets = signal<WidgetConfig[]>([]);
  layoutLoaded = signal(false);

  lastUpdates = signal<Record<number, Date>>({});
  reloadKeys = signal<Record<number, number>>({});
  /** Widgets en cours de chargement (icône Actualiser qui tourne). */
  busy = signal<Record<number, boolean>>({});

  private storedSettings: Record<string, unknown> = {};

  /** Photos de profil Steam et GitHub. */
  avatars = signal<IAvatars | null>(null);
  /** Météo actuelle de chaque widget météo, pour l'illustration de la carte. */
  weatherScenes = signal<Record<number, string>>({});

  ngOnInit(): void {
    this.widgetService.avatars().subscribe({
      next: (a) => this.avatars.set(a),
      error: () => this.avatars.set(null),
    });

    this.widgetService.loadSettings().subscribe({
      next: (settings) => {
        this.storedSettings = settings ?? {};
        const layout = this.parseLayout(this.storedSettings["layout"]);
        this.widgets.set(layout ?? DEFAULT_LAYOUT);
        this.layoutLoaded.set(true);
      },
      error: () => {
        this.widgets.set(DEFAULT_LAYOUT);
        this.layoutLoaded.set(true);
      },
    });
  }

  /* Sauvegarde */

  private parseLayout(value: unknown): WidgetConfig[] | null {
    if (!Array.isArray(value)) return null;
    const list = value.filter(
      (w): w is WidgetConfig =>
        !!w && typeof w === "object" && typeof w.id === "number" && VALID_TYPES.has(w.type),
    );
    return list.map((w) => ({
      ...w,
      cols: Math.min(this.MAX_COLS, Math.max(1, Number(w.cols) || 1)),
      rows: Math.min(this.MAX_ROWS, Math.max(1, Number(w.rows) || 1)),
      refreshRate: Math.max(15, Number(w.refreshRate) || 300),
      params: w.params ?? {},
    }));
  }

  private save(): void {
    if (!this.layoutLoaded()) return;
    this.storedSettings = { ...this.storedSettings, layout: this.widgets() };
    this.widgetService.saveSettings(this.storedSettings).subscribe({
      error: (err) => console.error("Sauvegarde du dashboard impossible", err),
    });
  }

  /* Ajout et modification d'un widget (même fenêtre) */

  private addDialog = viewChild<ElementRef<HTMLDialogElement>>("addDialog");
  selectedType = signal<WidgetType>("weather");
  newCity = "";
  newRepo = "";
  newCount = 5;
  newRefresh = 600;
  newTitle = "";
  addError = signal<string | null>(null);
  /** Widget en cours de modification, null en mode ajout. */
  editingId = signal<number | null>(null);

  /** Choix d'actualisation, plus la valeur actuelle si elle n'est pas dans la liste. */
  refreshOptions(): { value: number; label: string }[] {
    if (this.refreshChoices.some((r) => r.value === this.newRefresh)) return this.refreshChoices;
    return [...this.refreshChoices, { value: this.newRefresh, label: `Toutes les ${this.newRefresh} secondes` }]
      .sort((a, b) => a.value - b.value);
  }

  openAddDialog(): void {
    this.editingId.set(null);
    this.selectType("weather");
    this.newCity = "";
    this.newRepo = "";
    this.addDialog()?.nativeElement.showModal();
  }

  openEditDialog(w: WidgetConfig): void {
    const def = this.definition(w.type);
    this.editingId.set(w.id);
    this.selectedType.set(w.type);
    this.newTitle = w.title;
    this.newCity = String(w.params["city"] ?? "");
    this.newRepo = String(w.params["repo"] ?? "");
    this.newCount = Number(w.params["count"] ?? def.params["count"] ?? 5);
    this.newRefresh = w.refreshRate;
    this.addError.set(null);
    this.addDialog()?.nativeElement.showModal();
  }

  closeAddDialog(): void {
    this.addDialog()?.nativeElement.close();
  }

  onDialogClick(event: MouseEvent): void {
    if (event.target === this.addDialog()?.nativeElement) this.closeAddDialog();
  }

  selectType(type: WidgetType): void {
    const def = this.definition(type);
    this.selectedType.set(type);
    this.newRefresh = def.refreshRate;
    this.newCount = Number(def.params["count"] ?? 5);
    this.addError.set(null);
  }

  definition(type: WidgetType): WidgetDefinition {
    return WIDGET_CATALOG.find((d) => d.type === type)!;
  }

  /** Vérifie le formulaire et renvoie les paramètres du widget, ou null en cas d'erreur. */
  private buildParams(def: WidgetDefinition): Record<string, string | number> | null {
    const params = { ...def.params };
    if (def.type === "weather") {
      const city = this.newCity.trim();
      if (!city) {
        this.addError.set("La ville est requise.");
        return null;
      }
      params["city"] = city;
    }
    if (def.type === "github_commits") {
      const repo = this.newRepo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$|\/$/g, "");
      if (!REPO_RE.test(repo)) {
        this.addError.set("Le dépôt doit être au format propriétaire/nom, par exemple pierre54200/Dashboard.");
        return null;
      }
      params["repo"] = repo;
    }
    if (def.count) {
      const n = Math.round(Number(this.newCount));
      if (!(n >= def.count.min && n <= def.count.max)) {
        this.addError.set(`${def.count.label} : entre ${def.count.min} et ${def.count.max}.`);
        return null;
      }
      params["count"] = n;
    }
    return params;
  }

  submitDialog(): void {
    const def = this.definition(this.selectedType());
    const params = this.buildParams(def);
    if (!params) return;

    const editing = this.editingId();
    if (editing !== null) {
      const title = this.newTitle.trim() || def.title;
      this.widgets.update((list) =>
        list.map((w) => (w.id === editing ? { ...w, title, refreshRate: this.newRefresh, params } : w)),
      );
      this.save();
      this.closeAddDialog();
      return;
    }

    const id = Math.max(0, ...this.widgets().map((w) => w.id)) + 1;
    this.widgets.update((list) => [
      ...list,
      {
        id,
        type: def.type,
        title: def.title,
        cols: def.cols,
        rows: def.rows,
        refreshRate: this.newRefresh,
        params,
      },
    ]);
    this.save();
    this.closeAddDialog();
  }

  /* Redimensionnement */

  readonly MAX_COLS = 4;
  readonly MAX_ROWS = 3;
  private readonly ROW_HEIGHT = 240;
  private readonly GAP = 16;

  private grid = viewChild<ElementRef<HTMLElement>>("grid");
  resizingId = signal<number | null>(null);

  startResize(event: PointerEvent, w: WidgetConfig): void {
    const gridEl = this.grid()?.nativeElement;
    if (!gridEl) return;
    event.preventDefault();
    event.stopPropagation();

    const grip = event.currentTarget as HTMLElement;
    grip.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startY = event.clientY;
    const startCols = w.cols;
    const startRows = w.rows;
    const colStep =
      (gridEl.clientWidth - this.GAP * (this.MAX_COLS - 1)) / this.MAX_COLS +
      this.GAP;
    const rowStep = this.ROW_HEIGHT + this.GAP;

    this.resizingId.set(w.id);

    const onMove = (e: PointerEvent) => {
      const cols = startCols + Math.round((e.clientX - startX) / colStep);
      const rows = startRows + Math.round((e.clientY - startY) / rowStep);
      this.setSize(w.id, cols, rows);
    };

    const onUp = () => {
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      grip.removeEventListener("pointercancel", onUp);
      this.resizingId.set(null);
      this.save();
    };

    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
  }

  resizeWithKeyboard(event: KeyboardEvent, w: WidgetConfig): void {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.setSize(w.id, w.cols + move[0], w.rows + move[1]);
    this.save();
  }

  private setSize(id: number, cols: number, rows: number): void {
    const c = Math.min(this.MAX_COLS, Math.max(1, cols));
    const r = Math.min(this.MAX_ROWS, Math.max(1, rows));
    this.widgets.update((list) =>
      list.map((w) =>
        w.id === id && (w.cols !== c || w.rows !== r)
          ? { ...w, cols: c, rows: r }
          : w,
      ),
    );
  }

  /* Actions des cartes */

  drop(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.widgets.update((list) => {
      const copy = [...list];
      moveItemInArray(copy, event.previousIndex, event.currentIndex);
      return copy;
    });
    this.save();
  }

  remove(w: WidgetConfig): void {
    this.widgets.update((list) => list.filter((x) => x.id !== w.id));
    this.save();
  }

  refresh(w: WidgetConfig): void {
    this.reloadKeys.update((keys) => ({ ...keys, [w.id]: (keys[w.id] ?? 0) + 1 }));
  }

  onBusy(w: WidgetConfig, value: boolean): void {
    this.busy.update((map) => ({ ...map, [w.id]: value }));
  }

  onLoaded(w: WidgetConfig, date: Date): void {
    this.lastUpdates.update((map) => ({ ...map, [w.id]: date }));
  }

  onScene(w: WidgetConfig, scene: string): void {
    this.weatherScenes.update((map) => (map[w.id] === scene ? map : { ...map, [w.id]: scene }));
  }

  /** Image de l'en-tête : avatar Steam, photo GitHub, ou propriétaire du dépôt suivi. */
  iconOf(w: WidgetConfig): string | null {
    const a = this.avatars();
    switch (w.type) {
      case "steam_friends":
      case "steam_updates":
      case "steam_playtime":
        return a?.steam ?? null;
      case "github_notifications":
        return a?.github ?? null;
      case "github_commits": {
        const owner = String(w.params["repo"] ?? "").split("/")[0];
        return owner ? `https://github.com/${encodeURIComponent(owner)}.png?size=64` : (a?.github ?? null);
      }
      default:
        return null;
    }
  }

  serviceOf(w: WidgetConfig): string {
    return this.definition(w.type).service;
  }

  subtitleOf(w: WidgetConfig): string {
    return String(w.params["city"] ?? w.params["repo"] ?? "");
  }

  settings(): void {
    this.router.navigate(["dashboard/settings"]);
  }
}
