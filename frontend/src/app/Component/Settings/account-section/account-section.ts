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

type EditableField = "username" | "email" | "sexe" | "age";

const LABELS: Record<EditableField, string> = {
  username: "Nom d'utilisateur",
  email: "E-mail",
  sexe: "Sexe",
  age: "Âge",
};

@Component({
  selector: "app-account-section",
  imports: [FormsModule, RouterLink],
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
  readonly sexes = ["", "Homme", "Femme", "Autre"];

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
    if (value === null || value === "") return "Non renseigné";
    if (field === "email" && !this.revealEmail()) return this.mask(String(value));
    if (field === "age") return `${value} ans`;
    return String(value);
  }

  startEdit(field: EditableField): void {
    const value = this.info()?.[field];
    this.draft = value === null || value === undefined ? "" : String(value);
    this.editError.set(null);
    this.editing.set(field);
  }

  async saveEdit(): Promise<void> {
    const field = this.editing();
    if (!field) return;
    const raw = String(this.draft ?? "").trim();

    let value: string | number | null = raw;
    if (field === "username" && raw.length < 3) {
      this.editError.set("Le nom d'utilisateur doit faire au moins 3 caractères.");
      return;
    }
    if (field === "email" && !raw) {
      this.editError.set("L'e-mail est requis.");
      return;
    }
    if (field === "age") {
      if (!raw) value = null;
      else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 120) {
          this.editError.set("L'âge doit être un nombre entre 1 et 120.");
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
      this.editError.set(firstApiError((err as HttpErrorResponse).error));
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
      this.pfpError.set(invalid);
      return;
    }

    this.pfpLoading.set(true);
    this.pfpError.set(null);
    try {
      const image = await compressImage(file, 512, true);
      await firstValueFrom(this.profiles.uploadImage("pfp", image));
    } catch (err) {
      this.pfpError.set(
        err instanceof HttpErrorResponse ? firstApiError(err.error) : "Impossible de lire cette image.",
      );
    } finally {
      this.pfpLoading.set(false);
    }
  }

  removePfp(): void {
    this.pfpError.set(null);
    this.profiles.update({ perso: { pfp: null } }).subscribe({
      error: (err: HttpErrorResponse) => this.pfpError.set(firstApiError(err.error)),
    });
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
