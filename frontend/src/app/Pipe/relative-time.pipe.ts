import { Pipe, PipeTransform, inject } from "@angular/core";
import { I18nService } from "../I18n/i18n.service";

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Infinity],
];

/** Impur : suit la langue choisie (« il y a 3 h » / « 3 hours ago »). */
@Pipe({ name: "relativeTime", pure: false })
export class RelativeTimePipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
    let diff = (date.getTime() - Date.now()) / 1000;

    for (const [unit, size] of STEPS) {
      if (Math.abs(diff) < size) return new Intl.RelativeTimeFormat(this.i18n.lang(), { numeric: "auto" }).format(Math.round(diff), unit);
      diff /= size;
    }
    return "";
  }
}
