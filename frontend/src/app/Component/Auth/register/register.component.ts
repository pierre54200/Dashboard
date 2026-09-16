import { Component } from "@angular/core";
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

@Component({
  imports: [CommonModule, ReactiveFormsModule],
  selector: "app-register",
  styleUrl: "./register.component.css",
  templateUrl: "./register.component.html",
})
export class RegisterComponent {
  registerForm!: FormGroup;

  constructor(
    private authService: AuthService,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  getErrorMessage(field: string): string {
    const control = this.registerForm.get(field);
    if (!control || !control.errors) return "";

    if (control.errors["required"]) return "Ce champ est obligatoire";
    if (control.errors["email"]) return "Adresse e-mail invalide";
    if (control.errors["minlength"]) {
      const requiredLength = control.errors["minlength"].requiredLength;
      return `${requiredLength} caractères minimum`;
    }
    return "Champ invalide";
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
        terms: [false],
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
    //TODO submit login

    const user: IRegister = {
      username: this.registerForm.value.username,
      email: this.registerForm.value.email,
      password: this.registerForm.value.password,
    };
    console.log(user);
  }
}
