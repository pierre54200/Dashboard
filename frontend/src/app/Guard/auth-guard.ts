import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { catchError, map, of } from "rxjs";
import { UserService } from "../Service/User/user.service";

export const AuthGuard: CanActivateFn = () => {
  const users = inject(UserService);
  const router = inject(Router);

  return users.me().pipe(
    map(() => true),
    catchError(() => of(router.parseUrl("/login"))),
  );
};