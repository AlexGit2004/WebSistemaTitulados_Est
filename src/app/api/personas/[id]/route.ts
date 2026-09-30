import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas, auditLog } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/**
 * /api/personas/[id]
 *   GET    → ficha por id (admin o el propio titular). Útil para la UI.
 *   PATCH  → edición por id (admin o el propio titular). Requiere la CI actual para
 *            autorizar, igual que la ruta por `?ci=`.
 *   DELETE → baja lógica. Solo admin.
 *
 * La baja es LÓGICA, no física: los titulados son evidencia de acreditación y sus datos
 * deben conservarse. Se marca `estadoLaboral` y se deja registro en `audit_log`.
 * Para borrado físico se requiere el parámetro `?definitivo=1` (reservado).
 */

function idInvalido(id: string) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const malo = idInvalido(params.id);
  if (malo) return malo;

  const n = Number(params.id);
  const filas = await db.select().from(personas).where(eq(personas.id, n)).limit(1);
  if (!filas.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const sesion = await leerSesionDeRequest(req);
  const esSuyo = sesion && sesion.rol !== "admin" && sesion.ci === filas[0]!.cedulaIdentidad;
  if (sesion?.rol !== "admin" && !esSuyo) {
    return NextResponse.json({ error: "Requiere permisos de administrador" }, { status: 403 });
  }

  return NextResponse.json(filas[0]);
}

/**
 * PATCH /api/personas/[id] → edición por id.
 *
 * La CI es la llave única del registro y NO se puede cambiar por esta vía: se usa para
 * firmar las sesiones, identificar los reportes y la auditoría. Para corregir una cédula
 * equivocada hay que dar de baja el registro y crear uno nuevo, de modo que quede
 * constancia del cambio en lugar de reescribir la historia.
 *
 * El resto de campos usa EXACTAMENTE las mismas reglas que `PATCH /api/personas?ci=`.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const malo = idInvalido(params.id);
  if (malo) return malo;
  const n = Number(params.id);

  const actual = await db.select().from(personas).where(eq(personas.id, n)).limit(1);
  if (!actual.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Reutiliza la lógica ya probada de la ruta por cédula, delegando en ella.
  const url = new URL(req.url);
  url.searchParams.set("ci", actual[0]!.cedulaIdentidad);

  const { PATCH: patchPorCi } = await import("../route");
  return patchPorCi(
    new NextRequest(url, {
      method: "PATCH",
      headers: req.headers,
      body: await req.text(),
    }) as never
  );
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const malo = idInvalido(params.id);
  if (malo) return malo;

  const n = Number(params.id);

  try {
    const filas = await db.select().from(personas).where(eq(personas.id, n)).limit(1);
    if (!filas.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const persona = filas[0]!;
    const definitivo = new URL(req.url).searchParams.get("definitivo") === "1";

    // Para proteger la evidencia de acreditación, el borrado físico exige que el
    // administrador lo pida explícitamente con ?definitivo=1, y aun así se conserva
    // la traza en `audit_log`.
    if (definitivo) {
      const usos = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.entidadId, n));
      await db.delete(personas).where(eq(personas.id, n));

      await registrarAuditoria({
        accion: "eliminar",
        entidad: "personas",
        entidadId: n,
        idUsuario: await (await leerSesionDeRequest(req))?.sub ?? null,
        detalles: `BORRADO FÍSICO de ${persona.nombresApellidos} (CI ${persona.cedulaIdentidad}). Registros de auditoría previos: ${usos[0]?.n ?? 0}`,
        datosAnteriores: persona,
        req,
      });

      return NextResponse.json({ ok: true, eliminado: "definitivo" });
    }

    // Baja lógica: se conserva el registro para la evidencia, y se anota la baja.
    const marca = `[BAJA ${new Date().toISOString().slice(0, 10)}]`;
    const [actualizada] = await db
      .update(personas)
      .set({
        estadoLaboral: null,
        actualizadoEn: new Date(),
        observaciones: `${marca} ${persona.observaciones ?? ""}`.trim(),
      })
      .where(eq(personas.id, n))
      .returning();

    await registrarAuditoria({
      accion: "eliminar",
      entidad: "personas",
      entidadId: n,
      idUsuario: await (await leerSesionDeRequest(req))?.sub ?? null,
      detalles: `Baja lógica de ${persona.nombresApellidos} (CI ${persona.cedulaIdentidad})`,
      datosAnteriores: persona,
      req,
    });

    return NextResponse.json({ ok: true, eliminado: "logico", persona: actualizada });
  } catch (e) {
    return errorInterno(e, "api/personas/[id] DELETE");
  }
}