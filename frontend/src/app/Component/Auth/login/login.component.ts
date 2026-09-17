import { Component, OnInit } from "@angular/core";
import { AuthService } from "../../../Service/Auth/auth.service";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ILogin } from "../../../Interface/Auth/auth.interface";
import { Title } from "@angular/platform-browser";

@Component({
  imports: [ReactiveFormsModule],
  selector: "app-login",
  styleUrl: "./login.component.css",
  templateUrl: "./login.component.html",
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;

  constructor(
    private authService: AuthService,
    private fb: FormBuilder,
    private ts: Title,
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.ts.setTitle("Login - Dashboard");
  }

  initForm(): void {
    this.loginForm = this.fb.group({
      username: ["", Validators.required],
      password: ["", Validators.required],
      remember: [false],
    });
  }

  onSubmit(): void {
    //TODO submit login
    const user: ILogin = {
      username: this.loginForm.value.username,
      password: this.loginForm.value.password,
      remember: this.loginForm.value.remember,
    };
    console.log(user);
  }
}
