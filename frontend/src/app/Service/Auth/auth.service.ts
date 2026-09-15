import { Injectable } from "@angular/core";
import { environment } from "../../Environments/environment";
import { HttpClient } from "@angular/common/http";

@Injectable({ providedIn: 'root' })
export class AuthService {
    private apiUrl = `${environment.apiUrl}/test`

    constructor(
        private http: HttpClient
    ) {}

    getTest() {
        return this.http.get(this.apiUrl)
    }
}
