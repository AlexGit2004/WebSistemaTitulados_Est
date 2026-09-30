import { db } from "@/db";
import { auditLog, type NuevoAuditLogEntry } from "@/db/schema";
import type { NextRequest } from "next/server";

/**
 * Registro de actividad (spec del PDF, apartado 4.2: "quién hizo qué cambios y cuándo").
 *
 * Nunca debe romper la operación principal: si el log falla, la acción ya se hizo y
 * no queremos que el usuario pierda el trabajo por un error de auditoría.
 */

export interface DatosAuditoria {
  accion: NuevoAuditLogEntry["accion"];
  entidad: string;
  entidadId?: number | null;
  idUsuario?: number | null;
  detalles?: string | null;
  datosAnteriores?: unknown;
  datosNuevos?: unknown;
  req?: NextRequest | null;
}

/** Extrae la IP del cliente respetando proxies (X-Forwarded-For lo pone Nginx). */
export function ipDesde(req?: NextRequest | null): string | null {
  if (!req) return null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim().slice(0, 45);
  return req.headers.get("x-real-ip")?.slice(0, 45) ?? null;
}

/** Escribe una entrada en `audit_log`. Silencia errores a propósito. */
export async function registrarAuditoria(datos: DatosAuditoria): Promise<void> {
  try {
    const fila: NuevoAuditLogEntry = {
      idUsuario: datos.idUsuario ?? null,
      accion: datos.accion,
      entidad: datos.entidad,
      entidadId: datos.entidadId ?? null,
      detalles: datos.detalles ?? null,
      datosAnteriores: datos.datosAnteriores ? JSON.stringify(datos.datosAnteriores) : null,
      datosNuevos: datos.datosNuevos ? JSON.stringify(datos.datosNuevos) : null,
      ip: ipDesde(datos.req),
    };
    await db.insert(auditLog).values(fila);
  } catch (e) {
    console.error("[auditoria] no se pudo registrar:", e);
  }
}