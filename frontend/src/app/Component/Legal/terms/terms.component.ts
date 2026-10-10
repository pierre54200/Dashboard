import { Component, effect, inject } from "@angular/core";
import { Title } from "@angular/platform-browser";
import { RouterLink } from "@angular/router";
import { TranslatePipe } from "../../../I18n/translate.pipe";
import { I18nService } from "../../../I18n/i18n.service";
import { TranslationKey } from "../../../I18n/fr";
import { LanguageSwitch } from "../../Shared/language-switch/language-switch";

export const TERMS_VERSION = "2026-09-30";

export const LEGAL = {
  appName: "Dashboard",
  editor: "l'équipe du projet Dashboard (projet étudiant Epitech)",
  editorEn: "the Dashboard project team (Epitech student project)",
  contactEmail: "contact@exemple.fr",
  updatedAt: "10 octobre 2026",
  updatedAtEn: "October 10, 2026",
};

@Component({
  selector: "app-terms",
  imports: [RouterLink, TranslatePipe, LanguageSwitch],
  templateUrl: "./terms.component.html",
  styleUrl: "./terms.component.css",
})
export class TermsComponent {
  readonly legal = LEGAL;
  readonly version = TERMS_VERSION;

  readonly toc: { id: string; label: TranslationKey }[] = [
    { id: "cgu", label: "terms.toc.cgu" },
    { id: "rgpd", label: "terms.toc.rgpd" },
    { id: "donnees", label: "terms.toc.data" },
    { id: "finalites", label: "terms.toc.purposes" },
    { id: "conservation", label: "terms.toc.retention" },
    { id: "tiers", label: "terms.toc.third_parties" },
    { id: "cookies", label: "terms.toc.cookies" },
    { id: "securite", label: "terms.toc.security" },
    { id: "droits", label: "terms.toc.rights" },
  ];

  protected i18n = inject(I18nService);

  constructor(title: Title) {
    effect(() => title.setTitle(this.i18n.t("terms.page_title")));
  }

  /** Défilement vers une section sans changer d'URL (compatible avec <base href="/">) */
  scrollTo(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }
}
