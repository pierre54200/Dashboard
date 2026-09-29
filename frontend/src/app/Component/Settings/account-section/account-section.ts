import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../Service/User/user.service';

type EditableField = 'username' | 'email';

@Component({
  selector: 'app-account-section',
  imports: [FormsModule],
  templateUrl: './account-section.html',
  styleUrls: ['../settings-shared.css', './account-section.css'],
})
export class AccountSection {

  constructor(
    private userService: UserService,
  ) {}





  user = signal({
    username: 'pierre',
    email: 'pierre@exemple.fr',
    createdAt: new Date('2026-09-01'),
    verified: true,
  });

  /** Champ en cours d'édition (un seul à la fois). */
  editing = signal<EditableField | null>(null);
  draft = '';

  // Changement de mot de passe
  showPassword = signal(false);
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordError = signal<string | null>(null);
  passwordSuccess = signal(false);

  // Suppression du compte
  confirmDelete = signal(false);

  startEdit(field: EditableField): void {
    this.draft = this.user()[field];
    this.editing.set(field);
  }

  saveEdit(): void {
    const field = this.editing();
    if (!field || !this.draft.trim()) return;
    this.user.update((u) => ({ ...u, [field]: this.draft.trim() }));
    this.editing.set(null);
    // A brancher : PATCH /api/me/
  }

  mask(email: string): string {
    const [name, domain] = email.split('@');
    return '*'.repeat(Math.max(name.length, 4)) + '@' + domain;
  }

  revealEmail = signal(false);

  changePassword(): void {
  }

  deleteAccount(): void {
    this.userService.deleteUser();
  }
}
