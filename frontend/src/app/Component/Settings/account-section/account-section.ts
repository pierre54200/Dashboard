import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { HttpErrorResponse } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { UserService } from "../../../Service/User/user.service";
import {
  ProfileService,
  checkImageFile,
  compressImage,
  firstApiError,
} from "../../../Service/Profile/profile.service";
import { IProfile } from "../../../Interface/Profile/profile.interface";
import { TranslatePipe } from "../../../I18n/translate.pipe";
import { I18nService } from "../../../I18n/i18n.service";
import { TranslationKey } from "../../../I18n/fr";

type EditableField = "username" | "email" | "sexe" | "age";

const LABELS: Record<EditableField, TranslationKey> = {
  username: "auth.username",
  email: "auth.email",
  sexe: "account.sexe",
  age: "account.age",
};

/** Valeurs enregistrées pour « sexe » (codes neutres, traduits à l'affichage). */
const SEXES = ["", "male", "female", "other"] as const;
/** Anciennes valeurs enregistrées en français. */
const LEGACY_SEXES: Record<string, string> = { homme: "male", femme: "female", autre: "other" };

@Component({
  selector: "app-account-section",
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: "./account-section.html",
  styleUrls: ["../settings-shared.css", "./account-section.css"],
})
export class AccountSection {
  private profiles = inject(ProfileService);
  private userService = inject(UserService);

  /** Profil Django, mis à jour après chaque enregistrement. */
  profile = this.profiles.profile;
  info = computed(() => this.profile()?.info ?? null);
  pfp = computed(() => this.profile()?.perso.pfp ?? null);
  banner = computed(() => this.profile()?.perso.background ?? null);

  readonly labels = LABELS;
  readonly fields: EditableField[] = ["username", "email", "sexe", "age"];
  readonly sexes = SEXES;
  private i18n = inject(I18nService);

  /** Champ en cours d'édition (un seul à la fois). */
  editing = signal<EditableField | null>(null);
  /** Texte saisi (un champ number renvoie un nombre). */
  draft: string | number = "";
  saving = signal(false);
  editError = signal<string | null>(null);

  pfpLoading = signal(false);
  pfpError = signal<string | null>(null);

  revealEmail = signal(false);

  // Changement de mot de passe (pas encore de route côté Django)
  showPassword = signal(false);
  currentPassword = "";
  newPassword = "";
  confirmPassword = "";
  passwordError = signal<string | null>(null);
  passwordSuccess = signal(false);

  confirmDelete = signal(false);

  constructor() {
    if (!this.profile()) this.profiles.refresh();
  }

  /* Champs texte */

  display(field: EditableField): string {
    const info = this.info();
    if (!info) return "";
    const value = info[field];
    if (value === null || value === "") return this.i18n.t("account.not_set");
    if (field === "email" && !this.revealEmail()) return this.mask(String(value));
    if (field === "age") return this.i18n.t("account.age_value", { n: value });
    if (field === "sexe") return this.sexLabel(String(value));
    return String(value);
  }

  sexLabel(value: string): string {
    if (!value) return this.i18n.t("account.not_set");
    const code = LEGACY_SEXES[value.toLowerCase()] ?? value;
    const key = `account.sexe.${code}`;
    return this.i18n.has(key) ? this.i18n.t(key) : value;
  }

  startEdit(field: EditableField): void {
    const value = this.info()?.[field];
    this.draft = value === null || value === undefined ? "" : String(value);
    if (field === "sexe") this.draft = LEGACY_SEXES[String(this.draft).toLowerCase()] ?? this.draft;
    this.editError.set(null);
    this.editing.set(field);
  }

  async saveEdit(): Promise<void> {
    const field = this.editing();
    if (!field) return;
    const raw = String(this.draft ?? "").trim();

    let value: string | number | null = raw;
    if (field === "username" && raw.length < 3) {
      this.editError.set(this.i18n.t("account.error.username"));
      return;
    }
    if (field === "email" && !raw) {
      this.editError.set(this.i18n.t("account.error.email"));
      return;
    }
    if (field === "age") {
      if (!raw) value = null;
      else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 120) {
          this.editError.set(this.i18n.t("account.error.age"));
          return;
        }
        value = n;
      }
    }

    this.saving.set(true);
    this.editError.set(null);
    try {
      await firstValueFrom(this.profiles.update({ info: { [field]: value } as Partial<IProfile["info"]> }));
      this.editing.set(null);
    } catch (err) {
      this.editError.set(this.apiMessage(err as HttpErrorResponse));
    } finally {
      this.saving.set(false);
    }
  }

  /* Photo de profil */

  async onPfpSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const invalid = checkImageFile(file);
    if (invalid) {
      this.pfpError.set(this.i18n.t(invalid));
      return;
    }

    this.pfpLoading.set(true);
    this.pfpError.set(null);
    try {
      const image = await compressImage(file, 512, true);
      await firstValueFrom(this.profiles.uploadImage("pfp", image));
    } catch (err) {
      this.pfpError.set(
        err instanceof HttpErrorResponse ? this.apiMessage(err) : this.i18n.t("image.error.read"),
      );
    } finally {
      this.pfpLoading.set(false);
    }
  }

  removePfp(): void {
    this.pfpError.set(null);
    this.profiles.update({ perso: { pfp: null } }).subscribe({
      error: (err: HttpErrorResponse) => this.pfpError.set(this.apiMessage(err)),
    });
  }

  /** Erreur Django traduite si on la connaît. */
  private apiMessage(err: HttpErrorResponse): string {
    const raw = firstApiError(err.error);
    return raw ? this.i18n.apiError(raw) : this.i18n.t("common.save_failed");
  }

  /* Divers */

  mask(email: string): string {
    const [name, domain] = email.split("@");
    return "*".repeat(Math.max(name.length, 4)) + "@" + (domain ?? "");
  }

  changePassword(): void {}

  deleteAccount(): void {
    this.userService.deleteUser();
  }

  exportData(): void {
    const data = this.profile();
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard-donnees-${data.info.username}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
