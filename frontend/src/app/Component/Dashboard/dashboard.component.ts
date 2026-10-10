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
import { SteamAchievementsWidget } from "./Widgets/steam-achievements-widget/steam-achievements-widget";
import { SteamDealsWidget } from "./Widgets/steam-deals-widget/steam-deals-widget";
import { SpotifyNowPlayingWidget } from "./Widgets/spotify-now-playing-widget/spotify-now-playing-widget";
import { SpotifyTopWidget } from "./Widgets/spotify-top-widget/spotify-top-widget";
import { SpotifyPlaylistsWidget } from "./Widgets/spotify-playlists-widget/spotify-playlists-widget";
import { Router } from "@angular/router";
import { IUser } from "../../Interface/Auth/auth.interface";
import { WidgetService } from "../../Service/Widget/widget.service";
import { IAvatars } from "../../Interface/Widget/widget.interface";
import { ProfileService } from "../../Service/Profile/profile.service";
import { I18nService } from "../../I18n/i18n.service";
import { TranslatePipe } from "../../I18n/translate.pipe";
import { fr, TranslationKey } from "../../I18n/fr";
import { en } from "../../I18n/en";
import { TitleCasePipe } from "@angular/common";

export type WidgetType =
  | "weather"
  | "steam_friends"
  | "steam_updates"
  | "steam_playtime"
  | "steam_achievements"
  | "steam_deals"
  | "spotify_now_playing"
  | "spotify_top"
  | "spotify_playlists"
  | "github_notifications"
  | "github_commits";

export interface WidgetConfig {
  id: number;
  type: WidgetType;
  /** Nom choisi par l'utilisateur ; vide = nom par défaut, traduit dans la langue courante. */
  title: string;

  cols: number;
  rows: number;
  refreshRate: number;
  params: Record<string, string | number>;
}

interface ChoiceDefinition {
  param: string;
  label: TranslationKey;
  options: { value: string; label: TranslationKey }[];
}

interface WidgetDefinition {
  type: WidgetType;
  /** Clés de traduction */
  service: TranslationKey;
  title: TranslationKey;
  description: TranslationKey;
  cols: number;
  rows: number;
  refreshRate: number;
  params: Record<string, string | number>;
  /** Champ numérique. `param` vaut "count" par défaut. */
  count?: { param?: string; label: TranslationKey; min: number; max: number };
  /** Listes de choix (filtres). La première option de chaque liste est la valeur par défaut. */
  choices?: ChoiceDefinition[];
  /** Champ texte (facultatif sauf si `required`). */
  text?: { param: string; label: TranslationKey; placeholder: TranslationKey; hint: TranslationKey; required?: boolean };
  /** Widget qui n'a besoin d'aucun compte (pas de renvoi vers les paramètres). */
  noAccount?: boolean;
}

export const WIDGET_CATALOG: WidgetDefinition[] = [
  {
    type: "weather",
    service: "service.weather",
    title: "widget.weather.title",
    description: "widget.weather.desc",
    cols: 1,
    rows: 1,
    refreshRate: 600,
    params: { city: "Paris" },
  },
  {
    type: "steam_friends",
    service: "service.steam",
    title: "widget.steam_friends.title",
    description: "widget.steam_friends.desc",
    cols: 1,
    rows: 2,
    refreshRate: 60,
    params: { limit: 10, show: "all" },
    count: { param: "limit", label: "widget.count.friends", min: 1, max: 50 },
    choices: [{
      param: "show",
      label: "widget.friends.show",
      options: [
        { value: "all", label: "widget.friends.show.all" },
        { value: "online", label: "widget.friends.show.online" },
        { value: "in_game", label: "widget.friends.show.in_game" },
      ],
    }],
  },
  {
    type: "steam_updates",
    service: "service.steam",
    title: "widget.steam_updates.title",
    description: "widget.steam_updates.desc",
    cols: 2,
    rows: 2,
    refreshRate: 900,
    params: { count: 5, game: "" },
    count: { label: "widget.count.news", min: 1, max: 10 },
    text: {
      param: "game",
      label: "widget.updates.game",
      placeholder: "widget.updates.game_placeholder",
      hint: "widget.updates.game_hint",
    },
  },
  {
    type: "steam_playtime",
    service: "service.steam",
    title: "widget.steam_playtime.title",
    description: "widget.steam_playtime.desc",
    cols: 1,
    rows: 2,
    refreshRate: 600,
    params: { count: 3 },
    count: { label: "widget.count.games", min: 1, max: 10 },
  },
  {
    type: "steam_achievements",
    service: "service.steam",
    title: "widget.steam_achievements.title",
    description: "widget.steam_achievements.desc",
    cols: 1,
    rows: 2,
    refreshRate: 600,
    params: { game: "", show: "recent", count: 6 },
    text: {
      param: "game",
      label: "widget.achievements.game",
      placeholder: "widget.achievements.game_placeholder",
      hint: "widget.achievements.game_hint",
      required: true,
    },
    choices: [{
      param: "show",
      label: "widget.achievements.show",
      options: [
        { value: "recent", label: "widget.achievements.show.recent" },
        { value: "locked", label: "widget.achievements.show.locked" },
      ],
    }],
    count: { label: "widget.count.achievements", min: 1, max: 20 },
  },
  {
    type: "steam_deals",
    service: "service.steam",
    title: "widget.steam_deals.title",
    description: "widget.steam_deals.desc",
    cols: 2,
    rows: 2,
    refreshRate: 1800,
    params: { games: "", country: "fr", count: 5 },
    noAccount: true,
    text: {
      param: "games",
      label: "widget.deals.games",
      placeholder: "widget.deals.games_placeholder",
      hint: "widget.deals.games_hint",
    },
    choices: [{
      param: "country",
      label: "widget.deals.country",
      options: [
        { value: "fr", label: "widget.deals.country.fr" },
        { value: "us", label: "widget.deals.country.us" },
        { value: "gb", label: "widget.deals.country.gb" },
        { value: "ch", label: "widget.deals.country.ch" },
        { value: "ca", label: "widget.deals.country.ca" },
        { value: "jp", label: "widget.deals.country.jp" },
      ],
    }],
    count: { label: "widget.count.deals", min: 1, max: 10 },
  },
  {
    type: "github_notifications",
    service: "service.github",
    title: "widget.github_notifications.title",
    description: "widget.github_notifications.desc",
    cols: 2,
    rows: 1,
    refreshRate: 120,
    params: { count: 10, filter: "unread" },
    count: { label: "widget.count.notifications", min: 1, max: 50 },
    choices: [{
      param: "filter",
      label: "widget.notif.filter",
      options: [
        { value: "unread", label: "widget.notif.filter.unread" },
        { value: "all", label: "widget.notif.filter.all" },
        { value: "participating", label: "widget.notif.filter.participating" },
      ],
    }],
  },
  {
    type: "github_commits",
    service: "service.github",
    title: "widget.github_commits.title",
    description: "widget.github_commits.desc",
    cols: 2,
    rows: 2,
    refreshRate: 120,
    params: { repo: "", count: 5 },
    count: { label: "widget.count.commits", min: 1, max: 20 },
  },
  {
    type: "spotify_now_playing",
    service: "service.spotify",
    title: "widget.spotify_now_playing.title",
    description: "widget.spotify_now_playing.desc",
    cols: 1,
    rows: 2,
    refreshRate: 30,
    params: { history: 3 },
    count: { param: "history", label: "widget.count.history", min: 0, max: 10 },
  },
  {
    type: "spotify_top",
    service: "service.spotify",
    title: "widget.spotify_top.title",
    description: "widget.spotify_top.desc",
    cols: 1,
    rows: 2,
    refreshRate: 1800,
    params: { type: "tracks", period: "short_term", count: 5 },
    choices: [
      {
        param: "type",
        label: "widget.spotify_top.type",
        options: [
          { value: "tracks", label: "widget.spotify_top.type.tracks" },
          { value: "artists", label: "widget.spotify_top.type.artists" },
        ],
      },
      {
        param: "period",
        label: "widget.spotify_top.period",
        options: [
          { value: "short_term", label: "widget.spotify_top.period.short" },
          { value: "medium_term", label: "widget.spotify_top.period.medium" },
          { value: "long_term", label: "widget.spotify_top.period.long" },
        ],
      },
    ],
    count: { label: "widget.count.items", min: 1, max: 20 },
  },
  {
    type: "spotify_playlists",
    service: "service.spotify",
    title: "widget.spotify_playlists.title",
    description: "widget.spotify_playlists.desc",
    cols: 1,
    rows: 2,
    refreshRate: 600,
    params: { owner: "all", count: 5 },
    choices: [{
      param: "owner",
      label: "widget.spotify_playlists.owner",
      options: [
        { value: "all", label: "widget.spotify_playlists.owner.all" },
        { value: "mine", label: "widget.spotify_playlists.owner.mine" },
      ],
    }],
    count: { label: "widget.count.playlists", min: 1, max: 20 },
  },
];

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 1, type: "weather", title: "", cols: 1, rows: 1, refreshRate: 600, params: { city: "Nancy" } },
  { id: 2, type: "weather", title: "", cols: 1, rows: 1, refreshRate: 600, params: { city: "Paris" } },
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
    SteamAchievementsWidget,
    SteamDealsWidget,
    SpotifyNowPlayingWidget,
    SpotifyTopWidget,
    SpotifyPlaylistsWidget,
    TitleCasePipe,
    TranslatePipe,
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

  private i18n = inject(I18nService);

  readonly catalog = WIDGET_CATALOG;
  readonly refreshChoices = [30, 60, 120, 300, 600, 900, 1800];

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
  /** Valeur du filtre (liste de choix) et du texte facultatif du widget. */
  newChoices: Record<string, string> = {};
  newText = "";
  newRefresh = 600;
  newTitle = "";
  addError = signal<string | null>(null);
  /** Widget en cours de modification, null en mode ajout. */
  editingId = signal<number | null>(null);

  /** Choix d'actualisation, plus la valeur actuelle si elle n'est pas dans la liste. */
  /** Choix d'actualisation, plus la valeur actuelle si elle n'est pas dans la liste. */
  refreshOptions(): { value: number; label: string }[] {
    const values = this.refreshChoices.includes(this.newRefresh)
      ? this.refreshChoices
      : [...this.refreshChoices, this.newRefresh].sort((a, b) => a - b);
    return values.map((value) => ({ value, label: this.refreshLabel(value) }));
  }

  refreshLabel(seconds: number): string {
    if (seconds < 60) return this.i18n.t("refresh.every_seconds", { n: seconds });
    const minutes = Math.round(seconds / 60);
    return minutes === 1 ? this.i18n.t("refresh.every_minute") : this.i18n.t("refresh.every_minutes", { n: minutes });
  }

  /** Nom affiché : celui choisi par l'utilisateur, sinon le nom par défaut dans la langue courante. */
  titleOf(w: WidgetConfig): string {
    return this.isDefaultTitle(w) ? this.i18n.t(this.definition(w.type).title) : w.title;
  }

  /** Vide, ou identique au nom par défaut en français ou en anglais (anciennes dispositions). */
  private isDefaultTitle(w: WidgetConfig): boolean {
    const key = this.definition(w.type).title;
    const title = w.title.trim();
    return !title || title === fr[key] || title === en[key];
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
    // Nom par défaut : champ vide, le nom traduit s'affiche en placeholder
    this.newTitle = this.isDefaultTitle(w) ? "" : w.title;
    this.newCity = String(w.params["city"] ?? "");
    this.newRepo = String(w.params["repo"] ?? "");
    const countParam = def.count?.param ?? "count";
    this.newCount = Number(w.params[countParam] ?? def.params[countParam] ?? 5);
    this.newChoices = Object.fromEntries(
      (def.choices ?? []).map((c) => [c.param, String(w.params[c.param] ?? c.options[0].value)]),
    );
    this.newText = def.text ? String(w.params[def.text.param] ?? "") : "";
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
    this.newCount = Number(def.params[def.count?.param ?? "count"] ?? 5);
    this.newChoices = Object.fromEntries((def.choices ?? []).map((c) => [c.param, c.options[0].value]));
    this.newText = "";
    this.addError.set(null);
  }

  /** Bouton Valider grisé tant qu'un champ obligatoire est vide. */
  missingRequired(): boolean {
    const def = this.definition(this.selectedType());
    return (
      (def.type === "weather" && !this.newCity.trim()) ||
      (def.type === "github_commits" && !this.newRepo.trim()) ||
      (!!def.text?.required && !this.newText.trim())
    );
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
        this.addError.set(this.i18n.t("dialog.error.city"));
        return null;
      }
      params["city"] = city;
    }
    if (def.type === "github_commits") {
      const repo = this.newRepo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$|\/$/g, "");
      if (!REPO_RE.test(repo)) {
        this.addError.set(this.i18n.t("dialog.error.repo"));
        return null;
      }
      params["repo"] = repo;
    }
    if (def.count) {
      const n = Math.round(Number(this.newCount));
      if (!(n >= def.count.min && n <= def.count.max)) {
        this.addError.set(
          this.i18n.t("dialog.error.count", { label: this.i18n.t(def.count.label), min: def.count.min, max: def.count.max }),
        );
        return null;
      }
      params[def.count.param ?? "count"] = n;
    }
    for (const c of def.choices ?? []) {
      const allowed = c.options.map((o) => o.value);
      const value = this.newChoices[c.param];
      params[c.param] = allowed.includes(value) ? value : allowed[0];
    }
    if (def.text) {
      const text = this.newText.trim().slice(0, def.text.param === "games" ? 300 : 100);
      if (def.text.required && !text) {
        this.addError.set(this.i18n.t("dialog.error.required", { label: this.i18n.t(def.text.label) }));
        return null;
      }
      params[def.text.param] = text;
    }
    return params;
  }

  submitDialog(): void {
    const def = this.definition(this.selectedType());
    const params = this.buildParams(def);
    if (!params) return;

    const editing = this.editingId();
    if (editing !== null) {
      // Vide ou égal au nom par défaut : on garde "" pour que le nom suive la langue
      const typed = this.newTitle.trim();
      const title = typed === fr[def.title] || typed === en[def.title] ? "" : typed;
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
        title: "",
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
      case "steam_achievements":
        return a?.steam ?? null;
      case "github_notifications":
        return a?.github ?? null;
      case "spotify_now_playing":
      case "spotify_top":
      case "spotify_playlists":
        return a?.spotify ?? null;
      case "github_commits": {
        const owner = String(w.params["repo"] ?? "").split("/")[0];
        return owner ? `https://github.com/${encodeURIComponent(owner)}.png?size=64` : (a?.github ?? null);
      }
      default:
        return null;
    }
  }

  serviceOf(w: WidgetConfig): string {
    return this.i18n.t(this.definition(w.type).service);
  }

  /** Sous-titre de la carte : ville, dépôt ou jeu choisi, sinon le filtre s'il n'est pas celui par défaut. */
  subtitleOf(w: WidgetConfig): string {
    const def = this.definition(w.type);
    const text = w.params["city"] ?? w.params["repo"] ?? (def.text ? w.params[def.text.param] : undefined);
    if (text) return String(text);
    // Choix différents de la valeur par défaut, par exemple « Artistes · 6 derniers mois »
    return (def.choices ?? [])
      .map((c) => c.options.find((o) => o.value === w.params[c.param]))
      .filter((o, i) => o && o !== def.choices![i].options[0])
      .map((o) => this.i18n.t(o!.label))
      .join(" · ");
  }

  settings(): void {
    this.router.navigate(["dashboard/settings"]);
  }
}

