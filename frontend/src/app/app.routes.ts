import { Routes } from "@angular/router";
import { LoginComponent } from "./Component/Auth/login/login.component";
import { RegisterComponent } from "./Component/Auth/register/register.component";

export const routes: Routes = [
  { path: "", redirectTo: "/login", pathMatch: "full" },

  // Auth
  { path: "login", component: LoginComponent },
  { path: "register", component: RegisterComponent },
];
