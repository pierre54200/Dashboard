import { Component, OnInit, effect, inject, signal } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { AuthService } from "../../../Service/Auth/auth.service";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ILogin } from "../../../Interface/Auth/auth.interface";
import { Title } from "@angular/platform-browser";
import { ActivatedRoute, Router } from "@angular/router";
import { OAuthButtons } from "../../Shared/oauth-buttons/oauth-buttons";
import { TranslationKey } from "../../../I18n/fr";
import { TranslatePipe } from "../../../I18n/translate.pipe";
import { I18nService } from "../../../I18n/i18n.service";
import { LanguageSwitch } from "../../Shared/language-switch/language-switch";

@Component({
  imports: [ReactiveFormsModule, TranslatePipe, LanguageSwitch, OAuthButtons],
  selector: "app-login",
  styleUrls: ["../auth-shared.css", "./login.component.css"],
  templateUrl: "./login.component.html",
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  private i18n = inject(I18nService);
  private titleService = inject(Title);
  private pageTitle = effect(() => this.titleService.setTitle(this.i18n.t("login.page_title")));
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  submitting = signal(false);
  /** Clé du message d'erreur affiché au-dessus du formulaire. */
  error = signal<TranslationKey | null>(null);
  /** Compte pas encore confirmé : adresse à laquelle renvoyer le lien. */
  unconfirmedEmail = signal<string | null>(null);
  resent = signal(false);

  constructor(
    private authService: AuthService,
    private fb: FormBuilder,
    private ts: Title,
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.ts.setTitle(this.i18n.t("login.page_title"));

    // Retour d'une connexion Google / GitHub qui a échoué
    const oauthError = this.route.snapshot.queryParamMap.get("oauth_error");
    if (oauthError) {
      const key = `oauth.error.${oauthError}`;
      this.error.set(this.i18n.has(key) ? key : "oauth.error.failed");
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  initForm(): void {
    this.loginForm = this.fb.group({
      username: ["", Validators.required],
      password: ["", Validators.required],
      remember: [false],
    });
  }

  onSubmit(): void {
    const user: ILogin = {
      username: this.loginForm.value.username,
      password: this.loginForm.value.password,
      remember: this.loginForm.value.remember,
    };

    this.submitting.set(true);
    this.error.set(null);
    this.unconfirmedEmail.set(null);
    this.resent.set(false);
    this.authService.login(user).subscribe({
      next: () => this.submitting.set(false),
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        if (err.status === 403 && err.error?.code === "email_not_confirmed") {
          this.unconfirmedEmail.set(err.error.email ?? null);
          this.error.set("login.error.not_confirmed");
        } else if (err.status === 400) {
          this.error.set("login.error.invalid");
        } else {
          this.error.set("widget.error.server");
        }
      },
    });
  }

  resend(): void {
    const email = this.unconfirmedEmail();
    if (!email) return;
    this.authService.resendConfirmation(email).subscribe({
      next: () => this.resent.set(true),
      error: () => this.resent.set(true),
    });
  }
}
