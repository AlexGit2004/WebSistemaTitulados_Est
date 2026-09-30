import { z } from "zod";

/**
 * Esquemas de validación (zod) compartidos entre el cliente y el servidor.
 *
 * Reglas de negocio:
 *  - `cedulaIdentidad` es la llave única e irrepetible (spec del PDF).
 *  - Los campos "K" (Kardex) solo los puede escribir el ADMIN.
 *  - Los campos de titulación de egresados siguen la matriz condicional de `important.md` §1.
 */

/**
 * Cédula boliviana: 4 a 12 dígitos seguidos opcionalmente de dos letras (el sufijo del
 * departamento: LP, OR, CB, SC, PT, TJ, BE...).
 *
 * Se aceptan dos letras cualesquiera en vez de una lista fija: las extensiones
 * departamentales cambian con el tiempo y una lista desactualizada rechazaría cédulas
 * válidas, dejándolas fuera de la base. El requisito real de la especificación es que la
 * cédula sea única e irrepetible, no que el sufijo esté en un catálogo.
 */
const CI_REGEX = /^[0-9]{4,12}([A-Z]{2})?$/i;

export const tipoEnum = z.enum(["TITULADO", "EGRESADO"]);
export const generoEnum = z.enum(["MASCULINO", "FEMENINO", "PREFIERO_NO_DECIR"]);
export const modalidadEnum = z.enum([
  "Tesis",
  "Proyecto de grado",
  "Examen de grado",
  "Trabajo dirigido",
  "Otro",
]);
export const planeaEnum = z.enum(["SI", "NO", "NO_SABE"]);
export const inicioProcesoEnum = z.enum(["SI", "NO"]);
export const motivoEnum = z.enum(["LABORAL", "ECONOMICO", "PERSONAL", "EN_PROCESO", "OTRO"]);
export const estadoLaboralEnum = z.enum(["EMPLEADO", "DESEMPLEADO", "INDEPENDIENTE"]);
export const sectorEnum = z.enum(["PUBLICO", "PRIVADO", "ACADEMICO", "ONG", "OTRO"]);

const anio = z.coerce.number().int().min(1970, "Año demasiado antiguo").max(2100, "Año inválido");

const semestre = z
  .string()
  .trim()
  .max(30)
  .regex(
    /^(I{1,2}\/\d{4}|1er\s+semestre\s+\d{4}|2do\s+semestre\s+\d{4}|20\d{2})$/i,
    "Formato esperado: I/AAAA, II/AAAA, '1er semestre AAAA' o '2do semestre AAAA'"
  );

const textoOpcional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

/** Campos que el ADMIN puede escribir (incluye los "K" de Kardex). */
export const personaAdminSchema = z
  .object({
    tipo: tipoEnum.default("TITULADO"),
    nombresApellidos: z.string().trim().min(3, "Nombre muy corto").max(150, "Máximo 150 caracteres"),
    cedulaIdentidad: z
      .string()
      .trim()
      .toUpperCase()
      .regex(CI_REGEX, "Cédula inválida (se espera el número, con sufijo opcional)"),
    genero: generoEnum.default("PREFIERO_NO_DECIR"),
    semestreIngreso: semestre.nullable().optional(),
    semestreEgreso: semestre.nullable().optional(),
    anioEgreso: anio.nullable().optional(),
    anioTitulacion: anio.nullable().optional(),
    modalidadTitulacion: modalidadEnum.nullable().optional(),
    areaEspecializacion: textoOpcional(200),

    planeaTitularse: planeaEnum.nullable().optional(),
    inicioProcesoTitulacion: inicioProcesoEnum.nullable().optional(),
    motivoNoTitulacion: motivoEnum.nullable().optional(),

    correoElectronico: z
      .string()
      .trim()
      .email("Correo inválido")
      .max(150)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    telefono: z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9+\-\s()]*$/, "Teléfono inválido")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    redesSociales: textoOpcional(300),
    ciudadRegionTrabajo: textoOpcional(200),

    estadoLaboral: estadoLaboralEnum.default("DESEMPLEADO"),
    sectorTrabajo: sectorEnum.nullable().optional(),
    sectorTrabajoOtro: textoOpcional(200),
    ocupacionCargo: textoOpcional(200),
    trabajaEnEstadistica: z.coerce.boolean().default(false),

    // Métricas calculadas. El admin puede corregirlas a mano si el cálculo automático
    // no aplica, pero normalmente se derivan de anioEgreso/anioTitulacion.
    tiempoEgresoTitulacionMeses: z.coerce.number().int().min(0).max(1200).nullable().optional(),
    tiempoInsercionLaboralMeses: z.coerce.number().int().min(0).max(600).nullable().optional(),
    observaciones: textoOpcional(2000),
  })
  .superRefine((v, ctx) => {
    // Si el sector es OTRO, exigir la descripción (important.md y spec del PDF).
    if (v.sectorTrabajo === "OTRO" && !v.sectorTrabajoOtro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectorTrabajoOtro"],
        message: "Debe especificar cuál es el otro sector",
      });
    }
    if (v.sectorTrabajo !== "OTRO" && v.sectorTrabajoOtro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectorTrabajoOtro"],
        message: "Solo aplica si el sector es 'OTRO'",
      });
    }
    // Titulados deben tener datos de titulación formal.
    if (v.tipo === "TITULADO" && !v.anioTitulacion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["anioTitulacion"],
        message: "Un titulado debe tener año de titulación",
      });
    }
    if (v.tipo === "TITULADO" && !v.modalidadTitulacion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modalidadTitulacion"],
        message: "Un titulado debe tener modalidad de titulación",
      });
    }
    // Solo egresados tienen los 3 campos de titulación.
    if (v.tipo === "TITULADO") {
      if (v.planeaTitularse) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planeaTitularse"],
          message: 'Este campo es exclusivo de egresados',
        });
      }
      if (v.motivoNoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["motivoNoTitulacion"],
          message: "Este campo es exclusivo de egresados",
        });
      }
    }
    // Matriz condicional de egresados (important.md §1)
    if (v.tipo === "EGRESADO") {
      if (!v.planeaTitularse) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planeaTitularse"],
          message: "Todo egresado debe indicar si planea titularse",
        });
      }
      if (v.planeaTitularse === "SI" && !v.inicioProcesoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inicioProcesoTitulacion"],
          message: 'Si planea titularse, indique si ya inició el proceso',
        });
      }
      const pideMotivo =
        v.planeaTitularse === "NO" ||
        v.planeaTitularse === "NO_SABE" ||
        (v.planeaTitularse === "SI" && v.inicioProcesoTitulacion === "NO");
      if (pideMotivo && !v.motivoNoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["motivoNoTitulacion"],
          message: "Debe indicar el motivo de no titulación",
        });
      }
      if (!pideMotivo && v.motivoNoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["motivoNoTitulacion"],
          message: "No aplica: ya inició su proceso de titulación",
        });
      }
    }
  });

/**
 * Campos que el propio TITULADO / EGRESADO puede editar sobre su perfil.
 *
 * `.strict()` es deliberado: si el titular manda un campo de Kardex (anioTitulacion,
 * cedulaIdentidad, modalidadTitulacion…) la petición se rechaza con 400 en vez de ignorar
 * el campo en silencio. Es defensa en profundidad: aunque el API route ya filtra la lista
 * de campos permitidos, el esquema por sí solo tampoco acepta campos que no le pertenecen.
 */
export const personaAutogestionSchema = z
  .object({
    correoElectronico: z
      .string()
      .trim()
      .email("Correo inválido")
      .max(150)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    telefono: z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9+\-\s()]*$/, "Teléfono inválido")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    redesSociales: textoOpcional(300),
    ciudadRegionTrabajo: textoOpcional(200),
    estadoLaboral: estadoLaboralEnum.optional(),
    sectorTrabajo: sectorEnum.nullable().optional(),
    sectorTrabajoOtro: textoOpcional(200),
    ocupacionCargo: textoOpcional(200),
    trabajaEnEstadistica: z.coerce.boolean().optional(),
    tiempoInsercionLaboralMeses: z.coerce.number().int().min(0).max(600).nullable().optional(),
    observaciones: textoOpcional(2000),
    // Solo egresados
    planeaTitularse: planeaEnum.nullable().optional(),
    inicioProcesoTitulacion: inicioProcesoEnum.nullable().optional(),
    motivoNoTitulacion: motivoEnum.nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.sectorTrabajo === "OTRO" && !v.sectorTrabajoOtro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectorTrabajoOtro"],
        message: "Debe especificar cuál es el otro sector",
      });
    }
    const pideMotivo =
      v.planeaTitularse === "NO" ||
      v.planeaTitularse === "NO_SABE" ||
      (v.planeaTitularse === "SI" && v.inicioProcesoTitulacion === "NO");
    if (v.planeaTitularse && !pideMotivo && v.motivoNoTitulacion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["motivoNoTitulacion"],
        message: "No aplica: ya inició su proceso de titulación",
      });
    }
  });

export const usuarioSchema = z.object({
  nombre: z.string().trim().min(3, "Nombre muy corto").max(150),
  correo: z.string().trim().toLowerCase().email("Correo inválido").max(150),
  ci: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CI_REGEX, "Cédula inválida")
    .nullable()
    .optional(),
  rol: z.enum(["admin", "usuario"]).default("admin"),
  estado: z.enum(["activo", "inactivo", "bloqueado"]).default("activo"),
});

export const usuarioConPasswordSchema = usuarioSchema.extend({
  password: z.string().min(8, "Mínimo 8 caracteres").max(200),
});

export const loginSchema = z.object({
  ci: z.string().trim().min(1, "Ingrese su CI o correo"),
  password: z.string().max(200).optional(),
});

export type PersonaAdminInput = z.infer<typeof personaAdminSchema>;
export type PersonaAutogestionInput = z.infer<typeof personaAutogestionSchema>;

/** Convierte los issues de zod en un mensaje legible. */
export function primerErrorZod(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "datos"}: ${i.message}`).join(" · ");
}