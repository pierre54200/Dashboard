import { Injectable } from "@angular/core";
import { environment } from "../../Environments/environment";
import { HttpClient } from "@angular/common/http";
import { IUser } from "../../Interface/Auth/auth.interface";
import { firstValueFrom, Observable } from "rxjs";

@Injectable({ providedIn: "root" })
export class UserService {
  private readonly apiUrl = `${environment.apiUrl}users/`;

  constructor(private http: HttpClient) {}

  async me(): Promise<IUser | null> {
    try {
      const user = await firstValueFrom(
        this.http.get<IUser>(this.apiUrl + "me"),
      );
      return user;
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}
