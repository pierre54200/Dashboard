import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { AuthService } from "../Service/Auth/auth.service";

export const AuthGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return true; //! Enlever plus tard



  if (!auth.isAuthenticated()) {
    router.navigateByUrl("/login");
    return false;
  }
  return true;
};
