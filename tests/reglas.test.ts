import { test } from "node:test";
import assert from "node:assert/strict";

import { hashPassword, verifyPassword, normalizarCi } from "../src/lib/password";
import { crearToken, verificarToken, NOMBRE_COOKIE } from "../src/lib/sesion";
import { leerCsv } from "../src/lib/csv";
import {
  personaAdminSchema,
  personaAutogestionSchema,
  loginSchema,
  usuarioConPasswordSchema,
} from "../src/lib/validaciones";

// Un SESSION_SECRET de pruebas, para que el módulo no lea el .env.local.
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-secret-de-64-caracteres-minimo-para-pruebas-000000000000";

// ─────────────────────────────────────────────────────────────────────────────
// Hash de contraseñas
// ─────────────────────────────────────────────────────────────────────────────

test("hashPassword genera un hash distinto cada vez (salt aleatorio)", async () => {
  const a = hashPassword("admin123");
  const b = hashPassword("admin123");
  assert.notEqual(a, b, "dos hashes de la misma contraseña deben diferir por el salt");
  assert.ok(a.startsWith("scrypt$"), "el hash debe indicar el algoritmo");
});

test("verifyPassword acepta la contraseña correcta", async () => {
  const h = hashPassword("admin123");
  assert.equal(verifyPassword("admin123", h), true);
});

test("verifyPassword rechaza contraseñas incorrectas", async () => {
  const h = hashPassword("admin123");
  assert.equal(verifyPassword("admin124", h), false);
  assert.equal(verifyPassword("", h), false);
  assert.equal(verifyPassword("Admin123", h), false, "debe distinguir mayúsculas");
  assert.equal(verifyPassword("admin123 ", h), false);
});

test("verifyPassword no revienta con hashes corruptos", async () => {
  assert.equal(verifyPassword("x", ""), false);
  assert.equal(verifyPassword("x", "basura"), false);
  assert.equal(verifyPassword("x", "scrypt$a$b$c$d$e"), false);
  assert.equal(verifyPassword("x", null as unknown as string), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Sesión
// ─────────────────────────────────────────────────────────────────────────────

test("el token de sesión se crea y se verifica", async () => {
  const sesion = { sub: 1, rol: "admin" as const, ci: "", nombre: "Admin", correo: null };
  const token = await crearToken(sesion);
  const leida = await verificarToken(token);
  assert.deepEqual(leida, sesion);
});

test("un token adulterado se rechaza", async () => {
  const token = await crearToken({ sub: 1, rol: "admin", ci: "", nombre: "A", correo: null });
  assert.equal(await verificarToken(token.slice(0, -3) + "xyz"), null);
  assert.equal(await verificarToken(token + "extra"), null);
  assert.equal(await verificarToken(""), null);
  assert.equal(await verificarToken(undefined), null);
  assert.equal(await verificarToken("a.b"), null);
});

test("un token expirado se rechaza", async () => {
  const hace2Dias = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const token = await crearToken(
    { sub: 1, rol: "admin", ci: "", nombre: "A", correo: null },
    hace2Dias
  );
  assert.equal(await verificarToken(token, Date.now()), null, "un token de hace 2 días debe expirar");
});

test("un rol inventado en el payload se rechaza", async () => {
  // Aunque la firma sea válida, un rol fuera de la lista no se acepta.
  const token = await crearToken({ sub: 1, rol: "admin", ci: "", nombre: "A", correo: null });
  const [cuerpo] = token.split(".");
  const payload = JSON.parse(Buffer.from(cuerpo!, "base64url").toString("utf8"));
  payload.rol = "SUPERADMIN";
  const alterado = Buffer.from(JSON.stringify(payload)).toString("base64url");
  // Firma inválida (se cambió el cuerpo) → debe rechazarse igual.
  assert.equal(await verificarToken(`${alterado}.${token.split(".")[1]}`), null);
});

test("el nombre de la cookie es el esperado", async () => {
  assert.equal(NOMBRE_COOKIE, "seguit_sesion");
});

// ─────────────────────────────────────────────────────────────────────────────
// Cédula
// ─────────────────────────────────────────────────────────────────────────────

test("normalizarCi unifica formato", async () => {
  assert.equal(normalizarCi(" 6893412lp "), "6893412LP");
  assert.equal(normalizarCi("6893412 LP"), "6893412LP");
});

// ─────────────────────────────────────────────────────────────────────────────
// Matriz condicional de egresados (important.md §1)
// ─────────────────────────────────────────────────────────────────────────────

const EGRESADO_BASE = {
  tipo: "EGRESADO",
  nombresApellidos: "Lucía Belén Gutierrez Morales",
  cedulaIdentidad: "8341920LP",
  genero: "FEMENINO",
  semestreIngreso: "I/2018",
  semestreEgreso: "II/2023",
  anioEgreso: 2023,
  correoElectronico: "lucia@example.com",
  estadoLaboral: "DESEMPLEADO",
};

test("egresado: planea titularse = SI exige indicar si inició el proceso", async () => {
  const sinProceso = personaAdminSchema.safeParse({ ...EGRESADO_BASE, planeaTitularse: "SI" });
  assert.equal(sinProceso.success, false, "falta inicioProcesoTitulacion");

  const conProceso = personaAdminSchema.safeParse({
    ...EGRESADO_BASE,
    planeaTitularse: "SI",
    inicioProcesoTitulacion: "SI",
  });
  assert.equal(conProceso.success, true);
});

test("egresado: planea SI + inició NO exige motivo de no titulación", async () => {
  const sinMotivo = personaAdminSchema.safeParse({
    ...EGRESADO_BASE,
    planeaTitularse: "SI",
    inicioProcesoTitulacion: "NO",
  });
  assert.equal(sinMotivo.success, false, "debe pedir motivo cuando no inició el proceso");

  const conMotivo = personaAdminSchema.safeParse({
    ...EGRESADO_BASE,
    planeaTitularse: "SI",
    inicioProcesoTitulacion: "NO",
    motivoNoTitulacion: "LABORAL",
  });
  assert.equal(conMotivo.success, true);
});

test("egresado: planea NO o NO_SABE exige motivo y no pide proceso", async () => {
  for (const planes of ["NO", "NO_SABE"] as const) {
    const sinMotivo = personaAdminSchema.safeParse({ ...EGRESADO_BASE, planeaTitularse: planes });
    assert.equal(sinMotivo.success, false, `plan=${planes} debe exigir motivo`);

    const conMotivo = personaAdminSchema.safeParse({
      ...EGRESADO_BASE,
      planeaTitularse: planes,
      motivoNoTitulacion: "ECONOMICO",
    });
    assert.equal(conMotivo.success, true, `plan=${planes} con motivo debe pasar`);
  }
});

test("egresado: no se admite motivo si ya inició el proceso", async () => {
  const r = personaAdminSchema.safeParse({
    ...EGRESADO_BASE,
    planeaTitularse: "SI",
    inicioProcesoTitulacion: "SI",
    motivoNoTitulacion: "LABORAL",
  });
  assert.equal(r.success, false, "el motivo no aplica si ya inició el proceso");
});

test("egresado: es obligatorio indicar si planea titularse", async () => {
  const r = personaAdminSchema.safeParse(EGRESADO_BASE);
  assert.equal(r.success, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Titulados
// ─────────────────────────────────────────────────────────────────────────────

const TITULADO_BASE = {
  tipo: "TITULADO",
  nombresApellidos: "Carlos Alberto Mendoza Ramos",
  cedulaIdentidad: "6893412LP",
  genero: "MASCULINO",
  semestreIngreso: "I/2016",
  semestreEgreso: "II/2020",
  anioEgreso: 2020,
  correoElectronico: "carlos@example.com",
  estadoLaboral: "EMPLEADO",
};

test("titulado: exige año y modalidad de titulación", async () => {
  const r = personaAdminSchema.safeParse(TITULADO_BASE);
  assert.equal(r.success, false);
  if (!r.success) {
    const campos = Object.keys(r.error.flatten().fieldErrors);
    assert.ok(campos.includes("anioTitulacion"), "debe exigir anioTitulacion");
    assert.ok(campos.includes("modalidadTitulacion"), "debe exigir modalidadTitulacion");
  }
});

test("titulado completo es válido", async () => {
  const r = personaAdminSchema.safeParse({
    ...TITULADO_BASE,
    anioTitulacion: 2021,
    modalidadTitulacion: "Tesis",
    areaEspecializacion: "Bioestadística",
  });
  assert.equal(r.success, true);
});

test("titulado: no puede tener los campos de titulación de egresado", async () => {
  const r = personaAdminSchema.safeParse({
    ...TITULADO_BASE,
    anioTitulacion: 2021,
    modalidadTitulacion: "Tesis",
    planeaTitularse: "SI",
  });
  assert.equal(r.success, false, "planeaTitularse es exclusivo de egresados");
});

// ─────────────────────────────────────────────────────────────────────────────
// Sector "OTRO"
// ─────────────────────────────────────────────────────────────────────────────

test("sector OTRO exige la descripción", async () => {
  const r = personaAdminSchema.safeParse({
    ...TITULADO_BASE,
    anioTitulacion: 2021,
    modalidadTitulacion: "Tesis",
    sectorTrabajo: "OTRO",
  });
  assert.equal(r.success, false, "sector OTRO sin descripción debe rechazarse");
});

test("sector OTRO con descripción es válido", async () => {
  const r = personaAdminSchema.safeParse({
    ...TITULADO_BASE,
    anioTitulacion: 2021,
    modalidadTitulacion: "Tesis",
    sectorTrabajo: "OTRO",
    sectorTrabajoOtro: "Gobierno municipal",
  });
  assert.equal(r.success, true);
});

test("no se admite descripción de 'Otro' si el sector no es OTRO", async () => {
  const r = personaAdminSchema.safeParse({
    ...TITULADO_BASE,
    anioTitulacion: 2021,
    modalidadTitulacion: "Tesis",
    sectorTrabajo: "PUBLICO",
    sectorTrabajoOtro: "Gobierno municipal",
  });
  assert.equal(r.success, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Cédula única y formatos
// ─────────────────────────────────────────────────────────────────────────────

test("la cédula se normaliza a mayúsculas", async () => {
  const r = personaAdminSchema.safeParse({
    ...TITULADO_BASE,
    cedulaIdentidad: "6893412lp",
    anioTitulacion: 2021,
    modalidadTitulacion: "Tesis",
  });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.cedulaIdentidad, "6893412LP");
});

test("cédulas con formato inválido se rechazan", async () => {
  for (const mala of ["abc", "12", "CI-1234", ""]) {
    const r = personaAdminSchema.safeParse({
      ...TITULADO_BASE,
      cedulaIdentidad: mala,
      anioTitulacion: 2021,
      modalidadTitulacion: "Tesis",
    });
    assert.equal(r.success, false, `debería rechazar "${mala}"`);
  }
});

test("cédulas bolivianas con distintos sufijos son aceptadas", async () => {
  for (const ci of ["6893412LP", "1234567SC", "8765432CB", "11223344TQ"]) {
    const r = personaAdminSchema.safeParse({
      ...TITULADO_BASE,
      cedulaIdentidad: ci,
      anioTitulacion: 2021,
      modalidadTitulacion: "Tesis",
    });
    assert.equal(r.success, true, `debería aceptar "${ci}"`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Semestres
// ─────────────────────────────────────────────────────────────────────────────

test("el semestre acepta los formatos de la especificación", async () => {
  for (const s of ["I/2016", "II/2016", "1er semestre 2020", "2do semestre 2020", "2016"]) {
    const r = personaAdminSchema.safeParse({
      ...TITULADO_BASE,
      semestreIngreso: s,
      anioTitulacion: 2021,
      modalidadTitulacion: "Tesis",
    });
    assert.equal(r.success, true, `debería aceptar el semestre "${s}"`);
  }
});

test("el semestre rechaza formatos inventados", async () => {
  for (const s of ["primer semestre", "I-2016", "verano 2016", "III/2016"]) {
    const r = personaAdminSchema.safeParse({
      ...TITULADO_BASE,
      semestreIngreso: s,
      anioTitulacion: 2021,
      modalidadTitulacion: "Tesis",
    });
    assert.equal(r.success, false, `debería rechazar el semestre "${s}"`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Autogestión (titulado/egresado no pueden tocar campos K)
// ─────────────────────────────────────────────────────────────────────────────

test("autogestión acepta los campos dinámicos", async () => {
  const r = personaAutogestionSchema.safeParse({
    correoElectronico: "nuevo@example.com",
    telefono: "71234567",
    estadoLaboral: "EMPLEADO",
    sectorTrabajo: "PRIVADO",
    ciudadRegionTrabajo: "Santa Cruz, Bolivia",
    trabajaEnEstadistica: true,
  });
  assert.equal(r.success, true);
});

test("autogestión NO admite campos K", async () => {
  const r = personaAutogestionSchema.safeParse({
    correoElectronico: "nuevo@example.com",
    anioTitulacion: 2021,
    modalidadTitulacion: "Tesis",
    cedulaIdentidad: "1111111LP",
  });
  assert.equal(r.success, false, "el titular no puede enviar campos de Kardex");
});

test("autogestión valida el correo", async () => {
  const r = personaAutogestionSchema.safeParse({ correoElectronico: "no-es-correo" });
  assert.equal(r.success, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Login y usuarios
// ─────────────────────────────────────────────────────────────────────────────

test("login acepta CI sola o CI + contraseña", async () => {
  assert.equal(loginSchema.safeParse({ ci: "6893412LP" }).success, true);
  assert.equal(loginSchema.safeParse({ ci: "admin@umsa.bo", password: "admin123" }).success, true);
});

test("login rechaza CI vacía", async () => {
  assert.equal(loginSchema.safeParse({ ci: "  " }).success, false);
  assert.equal(loginSchema.safeParse({}).success, false);
});

test("alta de usuario exige contraseña de 8 caracteres o más", async () => {
  const base = { nombre: "Coordinador", correo: "coord@umsa.bo" };
  assert.equal(usuarioConPasswordSchema.safeParse({ ...base, password: "corta" }).success, false);
  assert.equal(usuarioConPasswordSchema.safeParse({ ...base, password: " sufficiently-long " }).success, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Lector de CSV
// ─────────────────────────────────────────────────────────────────────────────

test("leerCsv maneja comas y comillas dentro de los campos", async () => {
  const csv = 'a,b,c\n1,"Mendoza, Carlos","dijo ""hola"""\n';
  const filas = leerCsv(csv);
  assert.equal(filas.length, 1);
  assert.equal(filas[0]!.a, "1");
  assert.equal(filas[0]!.b, "Mendoza, Carlos");
  assert.equal(filas[0]!.c, 'dijo "hola"');
});

test("leerCsv conserva acentos y Ñ", async () => {
  const filas = leerCsv('nombre\nÑuñez\nÁlvarez\n');
  assert.equal(filas[0]!.nombre, "Ñuñez");
  assert.equal(filas[1]!.nombre, "Álvarez");
});

test("leerCsv ignora líneas vacías al final", async () => {
  const filas = leerCsv("a,b\n1,2\n\n\n");
  assert.equal(filas.length, 1);
});

test("leerCsv devuelve vacío si no hay datos", async () => {
  assert.deepEqual(leerCsv(""), []);
  assert.deepEqual(leerCsv("solo,encabezados\n"), []);
});