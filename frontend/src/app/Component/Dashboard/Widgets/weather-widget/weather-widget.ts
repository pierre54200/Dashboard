import { Component, computed, input } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import { PollingWidget } from "../polling-widget";
import { IWeather } from "../../../../Interface/Widget/widget.interface";

const WMO: Record<number, string> = {
  0: "Ciel dégagé",
  1: "Plutôt dégagé",
  2: "Partiellement nuageux",
  3: "Couvert",
  45: "Brouillard",
  48: "Brouillard givrant",
  51: "Bruine légère",
  53: "Bruine",
  55: "Bruine dense",
  56: "Bruine verglaçante",
  57: "Bruine verglaçante dense",
  61: "Pluie faible",
  63: "Pluie",
  65: "Pluie forte",
  66: "Pluie verglaçante",
  67: "Pluie verglaçante forte",
  71: "Neige faible",
  73: "Neige",
  75: "Neige forte",
  77: "Grains de neige",
  80: "Averses faibles",
  81: "Averses",
  82: "Averses violentes",
  85: "Averses de neige",
  86: "Fortes averses de neige",
  95: "Orage",
  96: "Orage avec grêle",
  99: "Orage avec forte grêle",
};

@Component({
  selector: "app-weather-widget",
  imports: [DecimalPipe],
  templateUrl: "./weather-widget.html",
  styleUrls: ["../widget-shared.css", "./weather-widget.css"],
})
export class WeatherWidget extends PollingWidget<IWeather> {
  city = input<string>("");

  description = computed(() => {
    const code = this.data()?.current?.weather_code;
    return code === undefined ? "" : (WMO[code] ?? "Conditions inconnues");
  });

  protected override trackInputs(): void {
    this.city();
  }

  protected fetch() {
    return this.api.weather(this.city().trim() || undefined);
  }
}
