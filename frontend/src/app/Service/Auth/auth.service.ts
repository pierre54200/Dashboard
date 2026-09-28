import { Injectable } from "@angular/core";
import { environment } from "../../Environments/environment";
import { HttpClient } from "@angular/common/http";

@Injectable({ providedIn: 'root' })
export class AuthService {
    private apiUrl = `${environment.apiUrl}/test`
    private Authenticated = false;

    constructor(
        private http: HttpClient
    ) {}


    login() {
        this.Authenticated = true;
    }

    logout() {
        this.Authenticated = false;
    }

    isAuthenticated(): boolean {
        return this.Authenticated;
    }
}
