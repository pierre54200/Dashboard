import { Component, OnInit, effect, inject } from "@angular/core";
import { AuthService } from "../../../Service/Auth/auth.service";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ILogin } from "../../../Interface/Auth/auth.interface";
import { Title } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { TranslatePipe } from "../../../I18n/translate.pipe";
import { I18nService } from "../../../I18n/i18n.service";
import { LanguageSwitch } from "../../Shared/language-switch/language-switch";

@Component({
  imports: [ReactiveFormsModule, TranslatePipe, LanguageSwitch],
  selector: "app-login",
  styleUrl: "./login.component.css",
  templateUrl: "./login.component.html",
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  private i18n = inject(I18nService);
  private titleService = inject(Title);
  private pageTitle = effect(() => this.titleService.setTitle(this.i18n.t("login.page_title")));

  constructor(
    private authService: AuthService,
    private fb: FormBuilder,
    private ts: Title,
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.ts.setTitle(this.i18n.t("login.page_title"));
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

    this.authService.login(user);
  }
}
