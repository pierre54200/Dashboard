import { Component, input } from '@angular/core';

@Component({
  selector: 'app-weather-widget',
  templateUrl: './weather-widget.html',
  styleUrl: './weather-widget.css',
})
export class WeatherWidget {
  city = input.required<string>();

  temperature = 16;
  description = 'Partiellement nuageux';
  humidity = 72;
  wind = 14;
}
