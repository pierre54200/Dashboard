import { Component, inject, input } from "@angular/core";
import { I18nService, LANGUAGES } from "../../../I18n/i18n.service";
import { TranslatePipe } from "../../../I18n/translate.pipe";

/** Boutons FR / EN. `compact` pour les pages de connexion, complet dans les paramètres. */
@Component({
  selector: "app-language-switch",
  imports: [TranslatePipe],
  template: `
    <div class="switch" [class.compact]="compact()" role="radiogroup" [attr.aria-label]="'language.title' | t">
      @for (l of languages; track l.code) {
        <button
          type="button"
          role="radio"
          class="option"
          [attr.aria-checked]="i18n.lang() === l.code"
          [attr.lang]="l.code"
          (click)="i18n.setLanguage(l.code)"
        >
          <span class="code">{{ l.code.toUpperCase() }}</span>
          @if (!compact()) {
            <span class="name">{{ l.label }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    .switch {
      display: inline-flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .option {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 150px;
      padding: 10px 14px;
      border: 2px solid var(--border);
      border-radius: 8px;
      background-color: var(--bg-elevated);
      color: var(--text);
      font-size: 0.9375rem;
      cursor: pointer;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }

    .option:hover {
      background-color: var(--bg-hover);
    }

    .option[aria-checked="true"] {
      border-color: var(--blue);
      background-color: rgba(88, 101, 242, 0.12);
    }

    .option:focus-visible {
      outline: 2px solid var(--link);
      outline-offset: 2px;
    }

    .code {
      display: grid;
      place-items: center;
      min-width: 32px;
      height: 24px;
      padding: 0 6px;
      border-radius: 4px;
      background-color: var(--bg-input);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }

    .option[aria-checked="true"] .code {
      background-color: var(--blue);
      color: #fff;
    }

    .compact {
      gap: 4px;
      padding: 3px;
      border-radius: 8px;
      background-color: var(--bg-input);
    }

    .compact .option {
      min-width: 0;
      padding: 4px;
      border: none;
      background: transparent;
    }

    .compact .code {
      background: transparent;
      color: var(--text-muted);
    }

    .compact .option[aria-checked="true"] .code {
      background-color: var(--blue);
      color: #fff;
    }
  `,
})
export class LanguageSwitch {
  compact = input(false);
  protected i18n = inject(I18nService);
  protected readonly languages = LANGUAGES;
}
