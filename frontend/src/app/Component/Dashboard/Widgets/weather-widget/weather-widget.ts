import { Component, computed, effect, input, output } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import { TranslatePipe } from "../../../../I18n/translate.pipe";
import { PollingWidget } from "../polling-widget";
import { IWeather } from "../../../../Interface/Widget/widget.interface";


export type WeatherScene = "clear-day" | "clear-night" | "partly-day" | "partly-night" | "cloudy" | "fog" | "rain" | "snow" | "storm";

function sceneOf(code: number, isDay: boolean): WeatherScene {
  if (code === 0 || code === 1) return isDay ? "clear-day" : "clear-night";
  if (code === 2) return isDay ? "partly-day" : "partly-night";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 51 && code <= 82) return "rain";
  return "cloudy";
}

@Component({
  selector: "app-weather-widget",
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: "./weather-widget.html",
  styleUrls: ["../widget-shared.css", "./weather-widget.css"],
})
export class WeatherWidget extends PollingWidget<IWeather> {
  city = input<string>("");

  scene = output<WeatherScene>();

  private currentScene = computed<WeatherScene | null>(() => {
    const c = this.data()?.current;
    return c ? sceneOf(c.weather_code, c.is_day === 1) : null;
  });

  private emitScene = effect(() => {
    const s = this.currentScene();
    if (s) this.scene.emit(s);
  });

  description = computed(() => {
    const code = this.data()?.current?.weather_code;
    if (code === undefined) return "";
    return this.i18n.weatherLabel(code);
  });

  protected override trackInputs(): void {
    this.city();
  }

  protected fetch(force: boolean) {
    return this.api.weather(this.city().trim() || undefined, force);
  }
}
