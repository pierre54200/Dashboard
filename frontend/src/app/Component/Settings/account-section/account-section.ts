import {
  Component,
  input,
  linkedSignal,
  signal,
  WritableSignal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UserService } from "../../../Service/User/user.service";
import { IUser } from "../../../Interface/Auth/auth.interface";

type EditableField = "username";

@Component({
  selector: "app-account-section",
  imports: [FormsModule],
  templateUrl: "./account-section.html",
  styleUrls: ["../settings-shared.css", "./account-section.css"],
})
export class AccountSection {
  user = input<IUser | null>(null);
  profile = linkedSignal(() => this.user());

  constructor(private userService: UserService) {}

  /** Champ en cours d'édition (un seul à la fois). */
  editing = signal<EditableField | null>(null);
  draft = "";

  // Changement de mot de passe
  showPassword = signal(false);
  currentPassword = "";
  newPassword = "";
  confirmPassword = "";
  passwordError = signal<string | null>(null);
  passwordSuccess = signal(false);

  // Suppression du compte
  confirmDelete = signal(false);

  startEdit(field: EditableField): void {
    this.draft = this.profile()?.[field] ?? "";
    this.editing.set(field);
  }

  saveEdit(): void {
    const field = this.editing();
    const value = this.draft.trim();
    if (!field || !value) return;
    this.profile.update((u) => (u ? { ...u, [field]: value } : u));
    this.editing.set(null);
  }

  mask(email: string): string {
    const [name, domain] = email.split("@");
    return "*".repeat(Math.max(name.length, 4)) + "@" + domain;
  }

  revealEmail = signal(false);

  changePassword(): void {}

  deleteAccount(): void {
    this.userService.deleteUser();
  }
}
