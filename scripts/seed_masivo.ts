/**
 * Carga masiva de personas desde el CSV generado por `scripts_generar_seed.py`.
 *
 * Se usa para levantar un volumen grande de datos de prueba y, al mismo tiempo, para
 * verificar que la importación masiva funciona: usa EXACTAMENTE el mismo lector de CSV
 * que el endpoint `/api/importar`.
 *
 *   pnpm seed:masivo              → carga datos_prueba.csv
 *   pnpm seed:masivo -- archivo.csv
 *
 * IMPORTANTE: inserta por lotes dentro de transacciones, y NO borra nada.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, pool } from "../src/db";
import { personas } from "../src/db/schema";
import { sql } from "drizzle-orm";
import { leerCsv } from "../src/lib/csv";

const LOTE = 500;

type Crud = {
  tipo: "TITULADO" | "EGRESADO";
  nombresApellidos: string;
  cedulaIdentidad: string;
  genero: "MASCULINO" | "FEMENINO" | "PREFIERO_NO_DECIR";
  semestreIngreso: string | null;
  semestreEgreso: string | null;
  anioEgreso: number | null;
  anioTitulacion: number | null;
  modalidadTitulacion: any;
  areaEspecializacion: string | null;
  planeaTitularse: any;
  inicioProcesoTitulacion: any;
  motivoNoTitulacion: any;
  correoElectronico: string | null;
  telefono: string | null;
  redesSociales: string | null;
  ciudadRegionTrabajo: string | null;
  estadoLaboral: any;
  sectorTrabajo: any;
  sectorTrabajoOtro: string | null;
  ocupacionCargo: string | null;
  trabajaEnEstadistica: boolean;
  tiempoEgresoTitulacionMeses: number | null;
  tiempoInsercionLaboralMeses: number | null;
  observaciones: string | null;
};

/** Convierte "" a null y aplica defaults, para encajar con el enum de la BD. */
const s2 = (v: string) => (v === "" ? null : v);
const n2 = (v: string) => (v === "" ? null : parseInt(v, 10));

export function filaACrud(f: Record<string, string>): Crud {
  return {
    tipo: f.tipo === "EGRESADO" ? "EGRESADO" : "TITULADO",
    nombresApellidos: f.nombres_apellidos,
    cedulaIdentidad: f.cedula_identidad.toUpperCase(),
    genero: (f.genero || "PREFIERO_NO_DECIR") as Crud["genero"],
    semestreIngreso: s2(f.semestre_ingreso),
    semestreEgreso: s2(f.semestre_egreso),
    anioEgreso: n2(f.anio_egreso),
    anioTitulacion: n2(f.anio_titulacion),
    modalidadTitulacion: s2(f.modalidad_titulacion),
    areaEspecializacion: s2(f.area_especializacion),
    planeaTitularse: s2(f.planea_titularse),
    inicioProcesoTitulacion: s2(f.inicio_proceso_titulacion),
    motivoNoTitulacion: s2(f.motivo_no_titulacion),
    correoElectronico: s2(f.correo_electronico),
    telefono: s2(f.telefono),
    redesSociales: s2(f.redes_sociales),
    ciudadRegionTrabajo: s2(f.ciudad_region_trabajo),
    estadoLaboral: s2(f.estado_laboral),
    sectorTrabajo: s2(f.sector_trabajo),
    sectorTrabajoOtro: s2(f.sector_trabajo_otro),
    ocupacionCargo: s2(f.ocupacion_cargo),
    trabajaEnEstadistica: f.trabaja_en_estadistica === "SI",
    tiempoEgresoTitulacionMeses: n2(f.tiempo_egreso_titulacion_meses),
    tiempoInsercionLaboralMeses: n2(f.tiempo_insercion_laboral_meses),
    observaciones: s2(f.observaciones),
  };
}

async function main() {
  const arg = process.argv[2] ?? "datos_prueba.csv";
  const archivo = path.resolve(process.cwd(), arg);

  if (!fs.existsSync(archivo)) {
    console.error(`No existe el archivo: ${archivo}`);
    console.error("Generálo primero con:");
    console.error('  python scripts_generar_seed.py --salida datos_prueba.csv --registros 10000');
    process.exit(1);
  }

  console.log(`Leyendo ${archivo}...`);
  const crudos = leerCsv(fs.readFileSync(archivo, "utf-8").replace(/^\uFEFF/, ""));
  console.log(`  ${crudos.length} filas en el CSV`);

  // Detectar CI repetidas dentro del propio archivo antes de tocar la base.
  const vistas = new Set<string>();
  const duplicados: string[] = [];
  const validas: Crud[] = [];

  for (const f of crudos) {
    const ci = (f.cedula_identidad ?? "").trim().toUpperCase();
    if (!ci || !f.nombres_apellidos) {
      continue;
    }
    if (vistas.has(ci)) {
      duplicados.push(ci);
      continue;
    }
    vistas.add(ci);
    validas.push(filaACrud(f));
  }

  if (duplicados.length) {
    console.log(`  ${duplicados.length} CI duplicadas dentro del CSV (se omiten)`);
  }

  // Cuántas ya existen en la base. Con este volumen traer las CI es más simple
  // y barato que un INSERT ... ON CONFLICT por fila.
  const existentes = await db
    .select({ cedulaIdentidad: personas.cedulaIdentidad })
    .from(personas);
  const yaEnBase = new Set(existentes.map((e) => e.cedulaIdentidad));

  let insertadas = 0;
  let omitidas = 0;
  const t0 = Date.now();

  for (let i = 0; i < validas.length; i += LOTE) {
    const lote = validas.slice(i, i + LOTE).filter((p) => !yaEnBase.has(p.cedulaIdentidad));
    omitidas += validas.slice(i, i + LOTE).length - lote.length;

    if (lote.length) {
      await db.insert(personas).values(lote as any);
      insertadas += lote.length;
    }

    if (Math.floor(i / LOTE) % 4 === 0 || i + LOTE >= validas.length) {
      const avance = Math.min(i + LOTE, validas.length);
      const pct = ((avance / validas.length) * 100).toFixed(1);
      process.stdout.write(`\r  ${pct}%  insertadas=${insertadas} omitidas=${omitidas}   `);
    }
  }

  process.stdout.write("\n");

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(personas);

  console.log("");
  console.log(`Insertadas:  ${insertadas}`);
  console.log(`Omitidas:    ${omitidas} (CI ya existentes)`);
  console.log(`Total en BD: ${total}`);
  console.log(`Duración:    ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await pool.end();
}

main().catch((e) => {
  console.error("Error en carga masiva:", e);
  process.exit(1);
});