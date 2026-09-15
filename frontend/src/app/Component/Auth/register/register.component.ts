import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
  imports: [FormsModule],
  selector: "app-register",
  styleUrl: "./register.component.css",
  templateUrl: "./register.component.html",
})
export class RegisterComponent {
  username: string = ''
  email: string = ''
  password: string = ''
  confirmPassword: string = ''
  acceptTerms: boolean = false

  onSubmit() {
    console.log(this.username, this.email, this.password, this.confirmPassword, this.acceptTerms)
  }


}
