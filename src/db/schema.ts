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

// ── Tipos TypeScript inferidos ────────────────────────────────────────────────
export type Persona = typeof personas.$inferSelect;
export type NuevaPersona = typeof personas.$inferInsert;

export type Usuario = typeof usuarios.$inferSelect;
export type NuevoUsuario = typeof usuarios.$inferInsert;

export type NoticiaCurso = typeof noticiasCursos.$inferSelect;
export type NuevaNoticiaCurso = typeof noticiasCursos.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NuevoAuditLogEntry = typeof auditLog.$inferInsert;
