import { Component, Injector, effect, signal } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { AuthService } from "../../../Service/Auth/auth.service";
import { IRegister } from "../../../Interface/Auth/auth.interface";
import { CommonModule } from "@angular/common";
import { Title } from "@angular/platform-browser";
import { Router, RouterLink } from "@angular/router";
import { TERMS_VERSION } from "../../Legal/terms/terms.component";
import { TranslatePipe } from "../../../I18n/translate.pipe";
import { I18nService } from "../../../I18n/i18n.service";
import { LanguageSwitch } from "../../Shared/language-switch/language-switch";
import { OAuthButtons } from "../../Shared/oauth-buttons/oauth-buttons";

@Component({
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, LanguageSwitch, OAuthButtons],
  selector: "app-register",
  styleUrls: ["../auth-shared.css", "./register.component.css"],
  templateUrl: "./register.component.html",
})
export class RegisterComponent {
  registerForm!: FormGroup;
  submitting = signal(false);
  /** Erreurs renvoyées par Django (pseudo ou e-mail déjà pris...), déjà traduites. */
  serverErrors = signal<Record<string, string>>({});
  serverError = signal<string | null>(null);

  constructor(
    private authService: AuthService,
    private fb: FormBuilder,
    private ts: Title,
    private i18n: I18nService,
    private injector: Injector,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.initForm();

    effect(() => this.ts.setTitle(this.i18n.t("register.page_title")), { injector: this.injector });
  }

  getErrorMessage(field: string): string {
    const control = this.registerForm.get(field);
    if (!control || !control.errors) return "";

    if (control.errors["required"]) {
      return this.i18n.t(field === "terms" ? "register.error.terms" : "register.error.required");
    }
    if (control.errors["email"]) return this.i18n.t("register.error.email");
    if (control.errors["minlength"]) {
      return this.i18n.t("register.error.minlength", { n: control.errors["minlength"].requiredLength });
    }
    return this.i18n.t("register.error.invalid");
  }

  isFieldInvalid(field: string): boolean {
    const control = this.registerForm.get(field);
    return !!control && control.invalid && control.touched;
  }

  /** Message renvoyé par le serveur pour ce champ, effacé dès que le champ change. */
  serverErrorFor(field: string): string | null {
    return this.serverErrors()[field] ?? null;
  }

  initForm(): void {
    this.registerForm = this.fb.group(
      {
        username: ["", [Validators.required, Validators.minLength(4)]],
        email: ["", [Validators.required, Validators.email]],
        password: ["", [Validators.required, Validators.minLength(8)]],
        confirmPassword: ["", [Validators.required, Validators.minLength(8)]],
        terms: [false, Validators.requiredTrue],
      },
      { validators: this.passwordsMatchValidator },
    );
  }

  passwordsMatchValidator(form: AbstractControl): ValidationErrors | null {
    const password = form.get("password")?.value;
    const confirmPassword = form.get("confirmPassword")?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const user: IRegister = {
      username: this.registerForm.value.username,
      email: this.registerForm.value.email,
      password: this.registerForm.value.password,
      language: this.i18n.lang(),
    };

    this.submitting.set(true);
    this.serverErrors.set({});
    this.serverError.set(null);
    this.authService.register(user).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.router.navigate(["/check-email"], {
          queryParams: { email: res.email, sent: res.email_sent ? null : 0 },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        if (err.status === 400 && err.error && typeof err.error === "object") {
          const errors: Record<string, string> = {};
          for (const [field, messages] of Object.entries(err.error)) {
            const first = Array.isArray(messages) ? String(messages[0]) : String(messages);
            errors[field] = this.i18n.apiError(first);
          }
          this.serverErrors.set(errors);
          for (const field of Object.keys(errors)) {
            this.registerForm.get(field)?.valueChanges.subscribe(() => {
              const { [field]: _, ...rest } = this.serverErrors();
              this.serverErrors.set(rest);
            });
          }
        } else {
          this.serverError.set(this.i18n.t("widget.error.server"));
        }
      },
    });
  }
}
