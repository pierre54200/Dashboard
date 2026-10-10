import { Component, OnDestroy, OnInit, effect, inject, signal } from "@angular/core";
import { Title } from "@angular/platform-browser";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { AuthService } from "../../../Service/Auth/auth.service";
import { TranslatePipe } from "../../../I18n/translate.pipe";
import { I18nService } from "../../../I18n/i18n.service";
import { LanguageSwitch } from "../../Shared/language-switch/language-switch";

/** Délai entre deux renvois (Django refuse aussi plus d'un envoi par minute). */
const COOLDOWN = 60;

/** Affichée juste après l'inscription : le compte attend la confirmation par e-mail. */
@Component({
  imports: [RouterLink, TranslatePipe, LanguageSwitch],
  selector: "app-check-email",
  styleUrls: ["../auth-shared.css", "../login/login.component.css", "./check-email.component.css"],
  templateUrl: "./check-email.component.html",
})
export class CheckEmailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private i18n = inject(I18nService);
  private title = inject(Title);
  private pageTitle = effect(() => this.title.setTitle(this.i18n.t("confirm.check.page_title")));

  email = signal("");
  /** Django n'a pas réussi à envoyer le premier e-mail (serveur SMTP injoignable...). */
  sendFailed = signal(false);
  resent = signal(false);
  cooldown = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.email.set(params.get("email") ?? "");
    this.sendFailed.set(params.get("sent") === "0");
    // Le premier e-mail vient d'être envoyé : on attend avant d'autoriser un renvoi
    if (!this.sendFailed()) this.startCooldown();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  resend(): void {
    if (!this.email() || this.cooldown() > 0) return;
    this.auth.resendConfirmation(this.email()).subscribe({
      next: () => {
        this.resent.set(true);
        this.sendFailed.set(false);
        this.startCooldown();
      },
      error: () => this.startCooldown(),
    });
  }

  private startCooldown(): void {
    clearInterval(this.timer);
    this.cooldown.set(COOLDOWN);
    this.timer = setInterval(() => {
      this.cooldown.update((n) => n - 1);
      if (this.cooldown() <= 0) clearInterval(this.timer);
    }, 1000);
  }
}
