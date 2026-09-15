import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../Service/Auth/auth.service';

@Component({
  imports: [],
  selector: 'app-login',
  styleUrl: './login.component.css',
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {

  constructor(
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    console.log("caca")
    this.authService.getTest().subscribe({
      next: data => {
        console.log(data)
      }
    })
  }
}
