import { Injectable } from "@angular/core";
import { environment } from "../../Environments/environment";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { Observable, tap } from "rxjs";
import {
  IConnections,
  ILogin,
  IOAuthProvider,
  IRegister,
  IRegisterResult,
  IUser,
} from "../../Interface/Auth/auth.interface";
import { UserService } from "../User/user.service";
import { ThemeService } from "../Theme/theme.service";
import { ProfileService } from "../Profile/profile.service";

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}users/`;

  constructor(
    private http: HttpClient,
    private userService: UserService,
    private router: Router,
    private themeService: ThemeService,
    private profileService: ProfileService,
  ) {
    this.http.get(`${environment.apiUrl}csrf`).subscribe({
      error: (err) => console.error("CSRF", err),
    });
  }

  isAuthenticated(): boolean {
    if (this.userService.me() === null) {
      return false;
    }
    return true;
  }

  /** Crée un compte inactif : Django envoie un lien de confirmation par e-mail. */
  register(user: IRegister): Observable<IRegisterResult> {
    return this.http.post<IRegisterResult>(this.apiUrl + "register", user);
  }

  /** Les erreurs sont renvoyées au formulaire (403 email_not_confirmed, 400 identifiants). */
  login(user: ILogin): Observable<IUser> {
    return this.http.post<IUser>(this.apiUrl + "login", user).pipe(tap(() => this.onLoggedIn()));
  }

  /** Active le compte avec le lien reçu par e-mail ; Django ouvre aussi la session. */
  confirmEmail(uid: string, token: string): Observable<IUser> {
    return this.http.post<IUser>(this.apiUrl + "confirm", { uid, token }).pipe(tap(() => this.themeService.loadFromServer()));
  }

  resendConfirmation(email: string): Observable<void> {
    return this.http.post<void>(this.apiUrl + "confirm/resend", { email });
  }

  /* Google / GitHub */

  oauthProviders(): Observable<IOAuthProvider[]> {
    return this.http.get<IOAuthProvider[]>(`${environment.apiUrl}auth/providers`);
  }

  /**
   * La connexion OAuth se fait par navigation complète vers Django, qui redirige vers Google
   * ou GitHub puis revient sur le front. `link` : lier au compte connecté (Paramètres > Connexions).
   */
  startOAuth(provider: string, link = false): void {
    window.location.href = `${environment.apiUrl}auth/${provider}/login${link ? "?mode=link" : ""}`;
  }

  connections(): Observable<IConnections> {
    return this.http.get<IConnections>(this.apiUrl + "me/connections");
  }

  unlink(provider: string): Observable<IConnections> {
    return this.http.delete<IConnections>(`${this.apiUrl}me/connections/${provider}`);
  }

  logout(): void {
    this.http.post(this.apiUrl + "logout", null).subscribe({
      next: () => {
        this.profileService.clear();
        this.router.navigate(["/login"]);
      },
      error: (err) => {
        console.error(err);
      },
    });
  }

  private onLoggedIn(): void {
    this.themeService.loadFromServer();
    this.router.navigate(["/dashboard"]);
  }
}
