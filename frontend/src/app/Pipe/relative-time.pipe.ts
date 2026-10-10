import { Pipe, PipeTransform } from "@angular/core";

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Infinity],
];

@Pipe({ name: "relativeTime" })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
    let diff = (date.getTime() - Date.now()) / 1000;

    for (const [unit, size] of STEPS) {
      if (Math.abs(diff) < size) return rtf.format(Math.round(diff), unit);
      diff /= size;
    }
    return "";
  }
}
