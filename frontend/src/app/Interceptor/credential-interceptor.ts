import { HttpInterceptorFn } from "@angular/common/http";

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  const token = document.cookie.match(/csrftoken=([^;]+)/)?.[1];
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);

  return next(
    req.clone({
      withCredentials: true,
      ...(unsafe && token ? { setHeaders: { "X-CSRFToken": token } } : {}),
    }),
  );
};