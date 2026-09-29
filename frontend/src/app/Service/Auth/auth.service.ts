import { Injectable } from "@angular/core";
import { environment } from "../../Environments/environment";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { ILogin, IRegister, IUser } from "../../Interface/Auth/auth.interface";
import { UserService } from "../User/user.service";

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}users/`;

  constructor(
    private http: HttpClient,
    private userService: UserService,
    private router: Router,
  ) {}

  isAuthenticated(): boolean {
      if (this.userService.me() === null) {
          return false;
        }
    return true
  }

  login(user: ILogin): void {
    this.http.post<IUser>(this.apiUrl + "login", user).subscribe({
      next: (data: IUser) => {
        this.router.navigate(["/dashboard"]);
      },
      error: (err) => {
        console.error(err);
      },
    });
  }

  logout(): void {
    this.http.post(this.apiUrl + "logout", null).subscribe({
      next: (data) => {
        this.router.navigate(["/login"]);
      },
      error: (err) => {
        console.error(err);
      },
    });
  }

  register(user: IRegister): void {
    this.http.post<IUser>(this.apiUrl + "register", user).subscribe({
      next: (data: IUser) => {
        this.router.navigate(["/dashboard"]);
      },
      error: (err) => {
        console.error(err);
      },
    });
  }
}
