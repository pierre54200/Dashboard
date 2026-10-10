import { Pipe, PipeTransform, inject } from "@angular/core";
import { I18nService } from "./i18n.service";
import { TranslationKey } from "./fr";

/**
 * {{ 'dashboard.add' | t }} ou {{ 'widgets.updated_at' | t: { time: x } }}
 * Impur : se réévalue quand la langue change.
 */
@Pipe({ name: "t", pure: false })
export class TranslatePipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(key: TranslationKey, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}
