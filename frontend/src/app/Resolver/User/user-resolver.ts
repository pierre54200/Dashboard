import { inject } from "@angular/core";
import { ResolveFn } from "@angular/router";
import { UserService } from "../../Service/User/user.service";
import { IUser } from "../../Interface/Auth/auth.interface";


export const userResolver: ResolveFn<IUser | null> = () => inject(UserService).me();