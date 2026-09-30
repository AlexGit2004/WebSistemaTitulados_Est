import type { NextRequest } from "next/server";

export const NOMBRE_COOKIE = "seguit_sesion";
const DURACION_SEGUNDOS = 8 * 60 * 60; // 8 horas

export type Rol = "admin" | "TITULADO" | "EGRESADO";

export interface Sesion {
  sub: number | null;
  rol: Rol;
  ci: string;
  nombre: string;
  correo: string | null;
}

function obtenerSecreto(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET es obligatorio en producción y debe tener al menos 32 caracteres."
    );
  }
  return "dev-only-secret-no-usar-en-produccion-cambiar-000000";
}

// Auxiliares para Base64URL sin depender de Buffer
function stringToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToString(b64u: string): string {
  let b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Firma asíncrona con Web Crypto API. */
async function firmar(datos: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(obtenerSecreto()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(datos));
  return bufferToBase64Url(signature);
}

/**
 * Comparación en tiempo constante de dos cadenas.
 *
 * Web Crypto no expone un equivalente a `crypto.timingSafeEqual`, y comparar con `!==`
 * sale del bucle en el primer carácter que difiere: eso filtra información por tiempo y,
 * en teoría, permite reconstruir la firma byte a byte. Se compara siempre completa.
 *
 * El coste es despreciable: las firmas son de 43 caracteres.
 */
function compararEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

/** Crea un token firmado con los datos de sesión */
export async function crearToken(sesion: Sesion, ahora = Date.now()): Promise<string> {
  const payload = {
    ...sesion,
    iat: Math.floor(ahora / 1000),
    exp: Math.floor(ahora / 1000) + DURACION_SEGUNDOS,
  };
  const cuerpo = stringToBase64Url(JSON.stringify(payload));
  const firma = await firmar(cuerpo);
  return `${cuerpo}.${firma}`;
}

/** Verifica la firma y la expiración en Edge/Node */
export async function verificarToken(
  token: string | undefined | null,
  ahora = Date.now()
): Promise<Sesion | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;

  const [cuerpo, firmaRecibida] = partes;
  const firmaEsperada = await firmar(cuerpo);

  if (!compararEnTiempoConstante(firmaRecibida, firmaEsperada)) return null;

  try {
    const payload = JSON.parse(base64UrlToString(cuerpo));
    if (typeof payload.exp !== "number" || payload.exp * 1000 < ahora) return null;
    if (!payload.rol || !["admin", "TITULADO", "EGRESADO"].includes(payload.rol)) return null;

    return {
      sub: payload.sub ?? null,
      rol: payload.rol,
      ci: payload.ci ?? "",
      nombre: payload.nombre ?? "",
      correo: payload.correo ?? null,
    };
  } catch {
    return null;
  }
}

export function opcionesCookie(maxAgeSegundos = DURACION_SEGUNDOS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSegundos,
  };
}

/** Lee la sesión desde NextRequest */
export async function leerSesionDeRequest(req: NextRequest): Promise<Sesion | null> {
  return await verificarToken(req.cookies.get(NOMBRE_COOKIE)?.value);
}