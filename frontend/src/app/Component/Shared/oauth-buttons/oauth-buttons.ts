import { Component, inject, signal } from "@angular/core";
import { AuthService } from "../../../Service/Auth/auth.service";
import { IOAuthProvider } from "../../../Interface/Auth/auth.interface";
import { TranslatePipe } from "../../../I18n/translate.pipe";

/**
 * « Continuer avec Google / GitHub ». N'affiche que les fournisseurs configurés dans le .env
 * du backend ; rien du tout s'il n'y en a aucun.
 */
@Component({
  selector: "app-oauth-buttons",
  imports: [TranslatePipe],
  template: `
    @if (providers().length) {
      <div class="oauth">
        @for (p of providers(); track p.id) {
          <button type="button" class="oauth-btn" [attr.data-provider]="p.id" [disabled]="leaving()" (click)="go(p)">
            {{ 'oauth.continue_with' | t: { name: p.name } }}
          </button>
        }
      </div>
      <div class="separator" role="presentation"><span>{{ 'oauth.or' | t }}</span></div>
    }
  `,
  styles: `
    .oauth {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .oauth-btn {
      width: 100%;
      padding: 10px 16px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background-color: var(--bg-input);
      color: var(--text);
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }

    .oauth-btn:hover:not(:disabled) {
      border-color: var(--blue);
      background-color: var(--bg-hover);
    }

    .oauth-btn:disabled {
      opacity: 0.6;
      cursor: progress;
    }

    .oauth-btn:focus-visible {
      outline: 2px solid var(--link);
      outline-offset: 2px;
    }

    .separator {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 20px 0;
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .separator::before,
    .separator::after {
      content: "";
      flex: 1;
      height: 1px;
      background-color: var(--border);
    }
  `,
})
export class OAuthButtons {
  private auth = inject(AuthService);
  providers = signal<IOAuthProvider[]>([]);
  leaving = signal(false);

  constructor() {
    this.auth.oauthProviders().subscribe({
      next: (list) => this.providers.set(list),
      error: () => this.providers.set([]),
    });
  }

  go(p: IOAuthProvider): void {
    this.leaving.set(true);
    this.auth.startOAuth(p.id);
  }
}
