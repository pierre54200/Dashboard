import { Component, Injector, effect } from "@angular/core";
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
import { RouterLink } from "@angular/router";
import { TERMS_VERSION } from "../../Legal/terms/terms.component";
import { TranslatePipe } from "../../../I18n/translate.pipe";
import { I18nService } from "../../../I18n/i18n.service";
import { LanguageSwitch } from "../../Shared/language-switch/language-switch";

@Component({
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, LanguageSwitch],
  selector: "app-register",
  styleUrl: "./register.component.css",
  templateUrl: "./register.component.html",
})
export class RegisterComponent {
  registerForm!: FormGroup;

  constructor(
    private authService: AuthService,
    private fb: FormBuilder,
    private ts: Title,
    private i18n: I18nService,
    private injector: Injector,
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
    };

    this.authService.register(user);
  }
}
