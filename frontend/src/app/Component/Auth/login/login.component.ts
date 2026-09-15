import { Component } from '@angular/core';
import { AuthService } from '../../../Service/Auth/auth.service';
import { FormsModule } from '@angular/forms';

@Component({
  imports: [FormsModule],
  selector: 'app-login',
  styleUrl: './login.component.css',
  templateUrl: './login.component.html',
})
export class LoginComponent {
  
  email: string = ''
  password: string = ''
  remember: boolean = false

  constructor(
    private authService: AuthService,
  ) {}


  onSubmit(): void {
    //TODO submit login
    console.log(this.email, this.password, this.remember)
  }
}
