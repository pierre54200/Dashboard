import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type EditableField = 'username' | 'email';

@Component({
  selector: 'app-account-section',
  imports: [FormsModule],
  templateUrl: './account-section.html',
  styleUrls: ['../settings-shared.css', './account-section.css'],
})
export class AccountSection {
  // Données d'exemple, à remplacer par l'utilisateur connecté (GET /api/me/)
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
    this.passwordSuccess.set(false);
    if (!this.currentPassword || !this.newPassword) {
      this.passwordError.set('Remplis tous les champs.');
    } else if (this.newPassword.length < 8) {
      this.passwordError.set('Le nouveau mot de passe doit faire au moins 8 caractères.');
    } else if (this.newPassword !== this.confirmPassword) {
      this.passwordError.set('Les deux mots de passe ne correspondent pas.');
    } else {
      this.passwordError.set(null);
      this.passwordSuccess.set(true);
      this.showPassword.set(false);
      this.currentPassword = this.newPassword = this.confirmPassword = '';
      // A brancher : POST /api/me/password/
    }
  }

  deleteAccount(): void {
    this.confirmDelete.set(false);
    // A brancher : DELETE /api/me/ puis redirection vers /login
  }
}
