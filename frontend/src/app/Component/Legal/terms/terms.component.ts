import { Component } from "@angular/core";
import { Title } from "@angular/platform-browser";
import { RouterLink } from "@angular/router";

/**
 * Informations légales à adapter avant la mise en ligne.
 * Changer TERMS_VERSION à chaque modification du texte : la version acceptée
 * est enregistrée avec chaque inscription.
 */
export const TERMS_VERSION = "2026-09-30";

export const LEGAL = {
  appName: "Dashboard",
  editor: "l'équipe du projet Dashboard (projet étudiant Epitech)",
  contactEmail: "contact@exemple.fr",
  updatedAt: "30 septembre 2026",
};

@Component({
  selector: "app-terms",
  imports: [RouterLink],
  templateUrl: "./terms.component.html",
  styleUrl: "./terms.component.css",
})
export class TermsComponent {
  readonly legal = LEGAL;
  readonly version = TERMS_VERSION;

  readonly toc = [
    { id: "cgu", label: "Conditions générales d'utilisation" },
    { id: "rgpd", label: "Politique de confidentialité (RGPD)" },
    { id: "donnees", label: "Données collectées" },
    { id: "finalites", label: "Finalités et bases légales" },
    { id: "conservation", label: "Durée de conservation" },
    { id: "tiers", label: "Services tiers" },
    { id: "cookies", label: "Cookies et stockage local" },
    { id: "securite", label: "Sécurité" },
    { id: "droits", label: "Vos droits" },
  ];

  constructor(title: Title) {
    title.setTitle("Conditions d'utilisation - Dashboard");
  }

  /** Défilement vers une section sans changer d'URL (compatible avec <base href="/">) */
  scrollTo(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }
}
