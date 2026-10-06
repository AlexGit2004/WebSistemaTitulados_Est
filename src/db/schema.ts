import { relations } from "drizzle-orm";
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  date,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────────────
export const tipoEstudianteEnum = pgEnum("tipo_estudiante", [
  "TITULADO",
  "EGRESADO",
]);

export const generoEnum = pgEnum("genero_enum", [
  "MASCULINO",
  "FEMENINO",
  "PREFIERO_NO_DECIR",
]);

/**
 * Ciclo de vida del registro (decisión D5, opción B: alta pública).
 *
 * PENDIENTE → el egresado se registró solo y todavía no fue validado por la Carrera: no
 *             cuenta en métricas ni puede entrar al sistema.
 * VALIDADO  → alta efectiva. Todos los registros ya existentes pasan a este estado con
 *             la migración, porque ninguno nació pendiente de validación.
 * RECHAZADO → el administrador lo descartó. La fila y el motivo se conservan, igual que
 *             en la baja lógica, para poder contabilizar los descartes y sus causas.
 */
export const estadoRegistroEnum = pgEnum("estado_registro_enum", [
  "PENDIENTE",
  "VALIDADO",
  "RECHAZADO",
]);

export const modalidadTitulacionEnum = pgEnum("modalidad_titulacion_enum", [
  "Tesis",
  "Proyecto de grado",
  "Examen de grado",
  "Trabajo dirigido",
  "Otro",
]);

export const planeaTitularseEnum = pgEnum("planea_titularse_enum", [
  "SI",
  "NO",
  "NO_SABE",
]);

export const inicioProcesoEnum = pgEnum("inicio_proceso_enum", [
  "SI",
  "NO",
]);

export const motivoNoTitulacionEnum = pgEnum("motivo_no_titulacion_enum", [
  "LABORAL",
  "ECONOMICO",
  "PERSONAL",
  "EN_PROCESO",
  "OTRO",
]);

export const estadoLaboralEnum = pgEnum("estado_laboral_enum", [
  "EMPLEADO",
  "DESEMPLEADO",
  "INDEPENDIENTE",
]);

export const sectorTrabajoEnum = pgEnum("sector_trabajo_enum", [
  "PUBLICO",
  "PRIVADO",
  "ACADEMICO",
  "ONG",
  "OTRO",
]);

export const usuarioRolEnum = pgEnum("usuario_rol_enum", [
  "admin",
  "usuario",
]);

export const usuarioEstadoEnum = pgEnum("usuario_estado_enum", [
  "activo",
  "inactivo",
  "bloqueado",
]);

export const noticiasTipoEnum = pgEnum("noticias_tipo_enum", [
  "noticia_institucional",
  "curso_evento",
  "noticia_social",
]);

export const auditAccionEnum = pgEnum("audit_accion_enum", [
  "crear",
  "editar",
  "eliminar",
  "exportar",
  "importar",
]);

// ── Tabla Principal Unificada: personas ───────────────────────────────────────
export const personas = pgTable(
  "personas",
  {
    id: serial("id").primaryKey(),

    // Discriminador de entidad
    tipo: tipoEstudianteEnum("tipo").notNull().default("TITULADO"),

    // ── Campos Kardex Estáticos (Marcados con 'K' - Inmutables) ───────────────
    nombresApellidos: text("nombres_apellidos").notNull(),
    cedulaIdentidad: varchar("cedula_identidad", { length: 20 }).notNull().unique(),
    genero: generoEnum("genero").notNull().default("PREFIERO_NO_DECIR"),
    semestreIngreso: varchar("semestre_ingreso", { length: 20 }), // ej. "I/2018", "II/2019"
    semestreEgreso: varchar("semestre_egreso", { length: 30 }),   // ej. "1er semestre 2023", "I/2023"
    anioEgreso: integer("anio_egreso"),

    // ── Campos Exclusivos de Titulados (Kardex 'K') ───────────────────────────
    anioTitulacion: integer("anio_titulacion"),
    modalidadTitulacion: modalidadTitulacionEnum("modalidad_titulacion"),
    areaEspecializacion: text("area_especializacion"),

    // ── Campos Condicionales de Egresados ─────────────────────────────────────
    planeaTitularse: planeaTitularseEnum("planea_titularse"),
    inicioProcesoTitulacion: inicioProcesoEnum("inicio_proceso_titulacion"),
    motivoNoTitulacion: motivoNoTitulacionEnum("motivo_no_titulacion"),

    // ── Campos Dinámicos de Contacto y Ubicación (Compartidos) ─────────────────
    correoElectronico: text("correo_electronico"),
    telefono: varchar("telefono", { length: 20 }),
    redesSociales: text("redes_sociales"), // URLs LinkedIn / Facebook
    ciudadRegionTrabajo: text("ciudad_region_trabajo"), // ej. "La Paz, Bolivia", "Santa Cruz", "Exterior"

    // ── Campos Dinámicos de Situación Laboral y Métricas ───────────────────────
    estadoLaboral: estadoLaboralEnum("estado_laboral").default("DESEMPLEADO"),
    sectorTrabajo: sectorTrabajoEnum("sector_trabajo"),
    sectorTrabajoOtro: text("sector_trabajo_otro"),
    ocupacionCargo: text("ocupacion_cargo"),
    trabajaEnEstadistica: boolean("trabaja_en_estadistica").default(false),

    // Métricas calculadas para Acreditación (en meses)
    tiempoEgresoTitulacionMeses: integer("tiempo_egreso_titulacion_meses"),
    tiempoInsercionLaboralMeses: integer("tiempo_insercion_laboral_meses"),

    // Observaciones administrativas
    observaciones: text("observaciones"),

    // Baja lógica (decisión D3): el DELETE marca la baja en vez de borrar la fila.
    // Los datos de un egresado forman parte del histórico de acreditación, y los
    // reportes por año y sector deben seguir contando igual. Un hard delete los
    // haría desaparecer sin dejar rastro del contenido.
    activo: boolean("activo").notNull().default(true),
    estadoRegistro: estadoRegistroEnum("estado_registro").notNull().default("VALIDADO"),
    fechaValidacion: timestamp("fecha_validacion"),
    motivoRechazo: text("motivo_rechazo"),
    eliminadoEn: timestamp("eliminado_en"),
    eliminadoPor: integer("eliminado_por").references(() => usuarios.id, { onDelete: "set null" }),
    motivoBaja: text("motivo_baja"),

    // Auditoría temporal
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").defaultNow(),
  },
  (table) => ({
    ciIdx: uniqueIndex("personas_ci_unique_idx").on(table.cedulaIdentidad),
    tipoIdx: index("idx_personas_tipo").on(table.tipo),
    estadoLaboralIdx: index("idx_personas_estado_laboral").on(table.estadoLaboral),
    sectorTrabajoIdx: index("idx_personas_sector_trabajo").on(table.sectorTrabajo),
    anioTitulacionIdx: index("idx_personas_anio_titulacion").on(table.anioTitulacion),
    anioEgresoIdx: index("idx_personas_anio_egreso").on(table.anioEgreso),
    ciudadIdx: index("idx_personas_ciudad").on(table.ciudadRegionTrabajo),
    activoIdx: index("idx_personas_activo").on(table.activo),
  })
);

// ── Tabla de Usuarios Administrativos ─────────────────────────────────────────
export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  ci: varchar("ci", { length: 20 }),
  nombre: text("nombre").notNull(),
  correo: varchar("correo", { length: 150 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  rol: usuarioRolEnum("rol").notNull().default("admin"),
  estado: usuarioEstadoEnum("estado").notNull().default("activo"),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});

// ── Tabla de Sesiones (D2 · decisión aprobada) ────────────────────────────────
/**
 * El token de `lib/sesion.ts` es un HMAC sobre un JSON, y por sí solo es *stateless*:
 * mientras no expiren sus 30 minutos no hay forma de cortarlo, y tampoco queda rastro
 * de qué usuarios están conectados. Esta tabla guarda solo el SHA-256 del token
 * (nunca el token en sí: si alguien lee la base no sirve una fila para suplantar a
 * nadie) y permite revocar un acceso al instante y auditar las sesiones activas.
 */
export const sesiones = pgTable(
  "sesiones",
  {
    id: serial("id").primaryKey(),
    idUsuario: integer("id_usuario").references(() => usuarios.id, { onDelete: "cascade" }),
    idPersona: integer("id_persona").references(() => personas.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    ci: varchar("ci", { length: 20 }).notNull(),
    rol: varchar("rol", { length: 30 }).notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    creadaEn: timestamp("creada_en").notNull().defaultNow(),
    ultimaActividadEn: timestamp("ultima_actividad_en").notNull().defaultNow(),
    expiraEn: timestamp("expira_en").notNull(),
    revocadaEn: timestamp("revocada_en"),
    motivoRevocacion: varchar("motivo_revocacion", { length: 120 }),
  },
  (table) => ({
    idUsuarioIdx: index("idx_sesiones_id_usuario").on(table.idUsuario),
    ciIdx: index("idx_sesiones_ci").on(table.ci),
    expiraEnIdx: index("idx_sesiones_expira_en").on(table.expiraEn),
    revocadaEnIdx: index("idx_sesiones_revocada_en").on(table.revocadaEn),
  })
);

// ── Tabla de Verificaciones (D5 · alta pública) ──────────────────────────────
/**
 * Enlaces de un solo uso para verificar que el correo que se_AUTO registra es real.
 *
 * Se guarda el SHA-256 del token, nunca el token: leer la tabla no permite completar
 * el registro de otra persona. `intentos` limita los intentos por IP+token para que el
 * enlace no se pueda adivinar por fuerza bruta.
 */
export const verificaciones = pgTable(
  "verificaciones",
  {
    id: serial("id").primaryKey(),
    idPersona: integer("id_persona")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    proposito: varchar("proposito", { length: 40 }).notNull().default("REGISTRO"),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    destino: varchar("destino", { length: 150 }).notNull(),
    intentos: integer("intentos").notNull().default(0),
    expiraEn: timestamp("expira_en").notNull(),
    usadaEn: timestamp("usada_en"),
    creadaEn: timestamp("creada_en").notNull().defaultNow(),
  },
  (table) => ({
    idPersonaIdx: index("idx_verificaciones_id_persona").on(table.idPersona),
    expiraEnIdx: index("idx_verificaciones_expira_en").on(table.expiraEn),
  })
);

// ── Tabla de Noticias y Cursos ────────────────────────────────────────────────
export const noticiasCursos = pgTable(
  "noticias_cursos",
  {
    id: serial("id").primaryKey(),
    titulo: varchar("titulo", { length: 250 }).notNull(),
    cuerpo: text("cuerpo").notNull(),
    tipo: noticiasTipoEnum("tipo").notNull().default("noticia_institucional"),
    categoria: varchar("categoria", { length: 20 }).notNull().default("noticia"),
    fecha: date("fecha").notNull(),
    imagenUrl: varchar("imagen_url", { length: 500 }),
    publicado: boolean("publicado").notNull().default(true),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").defaultNow(),
  },
  (table) => ({
    tipoIdx: index("idx_noticias_tipo").on(table.tipo),
    fechaIdx: index("idx_noticias_fecha").on(table.fecha),
  })
);

// ── Tabla de Auditoría (Audit Log) ────────────────────────────────────────────
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    idUsuario: integer("id_usuario").references(() => usuarios.id, { onDelete: "set null" }),
    accion: auditAccionEnum("accion").notNull(),
    entidad: varchar("entidad", { length: 100 }).notNull(),
    entidadId: integer("entidad_id"),
    detalles: text("detalles"),
    datosAnteriores: text("datos_anteriores"),
    datosNuevos: text("datos_nuevos"),
    ip: varchar("ip", { length: 45 }),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
  },
  (table) => ({
    accionIdx: index("idx_audit_accion").on(table.accion),
    creadoEnIdx: index("idx_audit_creado_en").on(table.creadoEn),
  })
);

// ── Relaciones ────────────────────────────────────────────────────────────────
export const usuariosRelations = relations(usuarios, ({ many }) => ({
  auditLogs: many(auditLog),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [auditLog.idUsuario],
    references: [usuarios.id],
  }),
}));

export const sesionesRelations = relations(sesiones, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [sesiones.idUsuario],
    references: [usuarios.id],
  }),
  persona: one(personas, {
    fields: [sesiones.idPersona],
    references: [personas.id],
  }),
}));

// ── Tipos TypeScript inferidos ────────────────────────────────────────────────
export type Persona = typeof personas.$inferSelect;
export type NuevaPersona = typeof personas.$inferInsert;

export type Usuario = typeof usuarios.$inferSelect;
export type NuevoUsuario = typeof usuarios.$inferInsert;

export type NoticiaCurso = typeof noticiasCursos.$inferSelect;
export type NuevaNoticiaCurso = typeof noticiasCursos.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NuevoAuditLogEntry = typeof auditLog.$inferInsert;

export type SesionRow = typeof sesiones.$inferSelect;
export type NuevaSesionRow = typeof sesiones.$inferInsert;

export type VerificacionRow = typeof verificaciones.$inferSelect;
export type NuevaVerificacionRow = typeof verificaciones.$inferInsert;
