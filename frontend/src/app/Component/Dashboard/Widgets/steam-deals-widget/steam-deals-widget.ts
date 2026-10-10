import { Component, input } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { ISteamDeal } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";
import { TranslatePipe } from "../../../../I18n/translate.pipe";

/** Promos du moment sur le magasin Steam, ou prix des jeux suivis. */
@Component({
  selector: "app-steam-deals-widget",
  imports: [RelativeTimePipe, TranslatePipe],
  templateUrl: "./steam-deals-widget.html",
  styleUrls: ["../widget-shared.css", "./steam-deals-widget.css"],
})
export class SteamDealsWidget extends PollingWidget<ISteamDeal[]> {
  /** Jusqu'à 5 noms séparés par des virgules ; vide = meilleures promos du moment. */
  games = input<string>("");
  /** Pays du magasin (fixe la devise). */
  country = input<string>("fr");
  /** Nombre de jeux (1 à 10). */
  count = input<number>(5);

  protected override trackInputs(): void {
    this.games();
    this.country();
    this.count();
  }

  protected fetch(force: boolean) {
    const count = Math.min(10, Math.max(1, Math.round(Number(this.count()) || 5)));
    return this.api.steamDeals(this.games().trim(), this.country(), count, force);
  }

  /** Prix en centimes vers « 17,99 € » / « $17.99 », selon la langue de l'interface. */
  price(cents: number | null, currency: string | null): string {
    if (cents === null || !currency) return "";
    try {
      return new Intl.NumberFormat(this.i18n.locale(), { style: "currency", currency }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`;
    }
  }

  hideImage(event: Event): void {
    (event.target as HTMLElement).style.visibility = "hidden";
  }
}
