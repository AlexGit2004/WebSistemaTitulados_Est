/**
 * Pruebas de seguridad que no necesitan base de datos:limitador de intentos,
 * cookie de sesión y destino del cierre de sesión.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  verificarLimite,
  registrarIntento,
  limpiarIntentos,
  reiniciarLimitador,
} from "../src/lib/rateLimit";
import { crearToken, verificarToken, opcionesCookie } from "../src/lib/sesion";

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-secret-de-64-caracteres-minimo-para-pruebas-000000000000";

/**
 * `next-env.d.ts` declara `NODE_ENV` como solo lectura, pero para poder probar el
 * comportamiento según el ambiente hay que escribirlo. El cast a `Record` es la vía
 *válida en TypeScript para saltarse esa marca.
 */
function setEnv(clave: string, valor: string): void {
  (process.env as unknown as Record<string, string | undefined>)[clave] = valor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Limitador de intentos
// ─────────────────────────────────────────────────────────────────────────────

test("permite los primeros intentos", async () => {
  reiniciarLimitador();
  for (let i = 0; i < 4; i++) {
    assert.equal(verificarLimite("1.1.1.1", "admin@umsa.bo").permitido, true, `intento ${i + 1}`);
    registrarIntento("1.1.1.1", "admin@umsa.bo");
  }
});

test("bloquea al superar el máximo de intentos", async () => {
  reiniciarLimitador();
  for (let i = 0; i < 5; i++) registrarIntento("1.1.1.1", "admin@umsa.bo");
  const r = verificarLimite("1.1.1.1", "admin@umsa.bo");
  assert.equal(r.permitido, false, "debe bloquear tras 5 intentos");
  assert.equal(r.minutosEspera, 15);
});

test("el bloqueo es por identificador, no solo por IP", async () => {
  reiniciarLimitador();
  for (let i = 0; i < 5; i++) registrarIntento("9.9.9.9", "victima@umsa.bo");
  // Otra IP distinto tampoco puede atacar esa misma cuenta.
  assert.equal(verificarLimite("8.8.8.8", "victima@umsa.bo").permitido, false);
  // Pero sí puede entrar con otra cuenta.
  assert.equal(verificarLimite("8.8.8.8", "otro@umsa.bo").permitido, true);
});

test("el bloqueo es por IP para una misma cuenta distinta", async () => {
  reiniciarLimitador();
  for (let i = 0; i < 5; i++) registrarIntento("7.7.7.7", "admin@umsa.bo");
  // Otra cuenta desde la misma IP también queda frenada (protege la red).
  assert.equal(verificarLimite("7.7.7.7", "otra-cuenta@umsa.bo").permitido, false);
});

test("un login exitoso limpia el contador", async () => {
  reiniciarLimitador();
  for (let i = 0; i < 4; i++) registrarIntento("5.5.5.5", "admin@umsa.bo");
  limpiarIntentos("5.5.5.5", "admin@umsa.bo");
  const r = verificarLimite("5.5.5.5", "admin@umsa.bo");
  assert.equal(r.permitido, true);
  assert.equal(r.restantes, 5, "el contador vuelve a cero");
});

test("el límite informa cuántos intentos quedan", async () => {
  reiniciarLimitador();
  registrarIntento("4.4.4.4", "x@y.bo");
  registrarIntento("4.4.4.4", "x@y.bo");
  assert.equal(verificarLimite("4.4.4.4", "x@y.bo").restantes, 3);
});

test("el límite sobrevive a valores raros de IP", async () => {
  reiniciarLimitador();
  for (const ip of ["", "desconocida", "::1", "999.999.999.999"]) {
    assert.equal(verificarLimite(ip, "a@b.bo").permitido, true);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cookie de sesión
// ─────────────────────────────────────────────────────────────────────────────

test("la cookie es httpOnly y sameSite lax", async () => {
  const o = opcionesCookie();
  assert.equal(o.httpOnly, true, "debe ser httpOnly para que JS no la lea");
  assert.equal(o.sameSite, "lax");
  assert.equal(o.path, "/");
  assert.equal(o.maxAge, 8 * 60 * 60, "8 horas");
});

test("en producción la cookie es secure; en desarrollo no", async () => {
  const original = process.env.NODE_ENV;
  try {
    setEnv("NODE_ENV", "production");
    assert.equal(opcionesCookie().secure, true, "en producción debe ir por HTTPS");
    setEnv("NODE_ENV", "development");
    assert.equal(opcionesCookie().secure, false, "en local no hay HTTPS y se bloquearía");
  } finally {
    setEnv("NODE_ENV", original ?? "development");
  }
});

test("el logout usa maxAge 0 para borrar la cookie", async () => {
  assert.equal(opcionesCookie(0).maxAge, 0);
});

test("el token incluye la CI, que es lo que autoriza al titular", async () => {
  const token = await crearToken({
    sub: 42,
    rol: "EGRESADO",
    ci: "8341920LP",
    nombre: "Lucía",
    correo: null,
  });
  const s = await verificarToken(token);
  assert.equal(s?.ci, "8341920LP");
  assert.equal(s?.rol, "EGRESADO");
  assert.equal(s?.sub, 42);
});

test("sin SESSION_SECRET en producción, el sistema lanza error", async () => {
  const original = process.env.SESSION_SECRET;
  const originalNode = process.env.NODE_ENV;
  try {
    delete process.env.SESSION_SECRET;
    setEnv("NODE_ENV", "production");
    await assert.rejects(
      () => crearToken({ sub: 1, rol: "admin", ci: "", nombre: "A", correo: null }),
      /SESSION_SECRET es obligatorio/
    );
  } finally {
    if (original !== undefined) setEnv("SESSION_SECRET", original);
    setEnv("NODE_ENV", originalNode ?? "development");
  }
});