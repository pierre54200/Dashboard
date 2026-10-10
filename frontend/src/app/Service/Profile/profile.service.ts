import { Injectable, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, tap } from "rxjs";
import { environment } from "../../Environments/environment";
import { IProfile, IProfileUpdate } from "../../Interface/Profile/profile.interface";

export const ACCEPTED_IMAGES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

@Injectable({ providedIn: "root" })
export class ProfileService {
  private readonly url = `${environment.apiUrl}users/me/profile`;

  readonly profile = signal<IProfile | null>(null);

  constructor(private http: HttpClient) {}

  load(): Observable<IProfile> {
    return this.http.get<IProfile>(this.url).pipe(tap((p) => this.profile.set(p)));
  }

  refresh(): void {
    this.load().subscribe({ error: () => {} });
  }

  update(changes: IProfileUpdate): Observable<IProfile> {
    return this.http.patch<IProfile>(this.url, changes).pipe(tap((p) => this.profile.set(p)));
  }

  uploadImage(field: "pfp" | "background", image: Blob): Observable<IProfile> {
    const form = new FormData();
    form.append(`perso.${field}`, image, `${field}.jpg`);
    return this.http.patch<IProfile>(this.url, form).pipe(tap((p) => this.profile.set(p)));
  }

  clear(): void {
    this.profile.set(null);
  }
}

export function checkImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGES.includes(file.type)) return "Format non pris en charge. Utilise une image JPEG, PNG ou WebP.";
  if (file.size > MAX_SOURCE_BYTES) return "L'image est trop lourde (25 Mo maximum).";
  return null;
}

export async function compressImage(file: File, maxSize: number, square = false): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    sw = sh = side;
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const toBlob = (q: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", q),
    );
  let quality = 0.88;
  let blob = await toBlob(quality);
  while (blob.size > MAX_UPLOAD_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await toBlob(quality);
  }
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("too big");
  return blob;
}

export function firstApiError(body: unknown, fallback = "L'enregistrement a échoué."): string {
  let value: unknown = body;
  for (let i = 0; i < 4 && value && typeof value === "object"; i++) {
    value = Array.isArray(value) ? value[0] : Object.values(value as object)[0];
  }
  return typeof value === "string" ? value : fallback;
}
