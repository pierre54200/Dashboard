import { Routes } from "@angular/router";
import { LoginComponent } from "./Component/Auth/login/login.component";
import { RegisterComponent } from "./Component/Auth/register/register.component";
import { CheckEmailComponent } from "./Component/Auth/check-email/check-email.component";
import { ConfirmEmailComponent } from "./Component/Auth/confirm-email/confirm-email.component";
import { DashboardComponent } from "./Component/Dashboard/dashboard.component";
import { AuthGuard } from "./Guard/auth-guard";
import { SettingsComponent } from "./Component/Settings/settings.component";
import { TermsComponent } from "./Component/Legal/terms/terms.component";
import { userResolver } from "./Resolver/User/user-resolver";

export const routes: Routes = [

  { path: "", redirectTo: "/login", pathMatch: "full" },

  // Auth
  { path: "login", component: LoginComponent },
  { path: "register", component: RegisterComponent },
  { path: "check-email", component: CheckEmailComponent },
  { path: "confirm-email", component: ConfirmEmailComponent },
  { path: "terms", component: TermsComponent },
  // Dashboard
  {
    path: "dashboard",
    canActivate: [AuthGuard],
    children: [
      {
        path: "",
        component: DashboardComponent,
        resolve: { user: userResolver },
      },
      {
        path: "settings",
        component: SettingsComponent,
        resolve: { user: userResolver },
      }
    ],
  },
];
