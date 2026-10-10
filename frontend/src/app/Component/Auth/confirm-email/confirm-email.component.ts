import { Component, OnInit, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Title } from "@angular/platform-browser";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { AuthService } from "../../../Service/Auth/auth.service";
import { TranslatePipe } from "../../../I18n/translate.pipe";
import { I18nService } from "../../../I18n/i18n.service";
import { LanguageSwitch } from "../../Shared/language-switch/language-switch";

type State = "checking" | "success" | "invalid";

/** Page ouverte par le lien de l'e-mail : /confirm-email?uid=...&token=... */
@Component({
  imports: [FormsModule, RouterLink, TranslatePipe, LanguageSwitch],
  selector: "app-confirm-email",
  styleUrls: [
    "../auth-shared.css",
    "../login/login.component.css",
    "../check-email/check-email.component.css",
  ],
  templateUrl: "./confirm-email.component.html",
})
export class ConfirmEmailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private i18n = inject(I18nService);
  private title = inject(Title);
  private pageTitle = effect(() => this.title.setTitle(this.i18n.t("confirm.page_title")));

  state = signal<State>("checking");
  email = "";
  resent = signal(false);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const uid = params.get("uid");
    const token = params.get("token");
    if (!uid || !token) {
      this.state.set("invalid");
      return;
    }
    this.auth.confirmEmail(uid, token).subscribe({
      next: () => {
        this.state.set("success");
        // Django a ouvert la session : direction le dashboard
        setTimeout(() => this.router.navigate(["/dashboard"]), 1500);
      },
      error: () => this.state.set("invalid"),
    });
  }

  resend(): void {
    const email = this.email.trim();
    if (!email) return;
    this.auth.resendConfirmation(email).subscribe({
      next: () => this.resent.set(true),
      error: () => this.resent.set(true),
    });
  }
}
