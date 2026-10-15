import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { noticiasCursos, type NuevaNoticiaCurso } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { noticiaActualizacionSchema, primerErrorZod } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/** GET /api/noticias/:id → detalle. ?admin=1 incluye no publicadas (solo admin). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const admin = new URL(req.url).searchParams.get("admin") === "1";
  if (admin) {
    const denegado = await exigirAdmin(req);
    if (denegado) return denegado;
  }

  try {
    const rows = admin
      ? await db.select().from(noticiasCursos).where(eq(noticiasCursos.id, id)).limit(1)
      : await db
          .select()
          .from(noticiasCursos)
          .where(and(eq(noticiasCursos.id, id), eq(noticiasCursos.publicado, true)))
          .limit(1);
    if (!rows.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (e: unknown) {
    return errorInterno(e, "api/noticias/[id] GET");
  }
}

const TIPOS = ["noticia_institucional", "curso_evento", "noticia_social"];
const CATEGORIAS = ["noticia", "convocatoria"];

/** PATCH /api/noticias/:id → editar (SOLO ADMIN) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // La edición acepta un subconjunto del alta, pero con las MISMAS reglas de tipo y
  // longitud. Antes cada campo se validaba a mano y un campo desconocido pasaba
  // silenciosamente; el esquema `.strict()` lo rechaza.
  const check = noticiaActualizacionSchema.safeParse(crudo);
  if (!check.success) {
    return NextResponse.json(
      { error: primerErrorZod(check.error), campos: check.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const body = check.data as Record<string, unknown>;

  const patch: Partial<NuevaNoticiaCurso> = {};
  if (typeof body.titulo === "string") patch.titulo = body.titulo;
  if (typeof body.cuerpo === "string") patch.cuerpo = body.cuerpo;
  if (typeof body.tipo === "string") patch.tipo = body.tipo as NuevaNoticiaCurso["tipo"];
  if (typeof body.categoria === "string") patch.categoria = body.categoria as NuevaNoticiaCurso["categoria"];
  if (typeof body.fecha === "string") patch.fecha = body.fecha;
  if (body.imagenUrl !== undefined) patch.imagenUrl = String(body.imagenUrl).trim() || null;
  if (body.publicado !== undefined) patch.publicado = body.publicado === true;
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  patch.actualizadoEn = new Date();

  try {
    const antes = await db.select().from(noticiasCursos).where(eq(noticiasCursos.id, id)).limit(1);
    const [actualizada] = await db
      .update(noticiasCursos)
      .set(patch)
      .where(eq(noticiasCursos.id, id))
      .returning();

    await registrarAuditoria({
      accion: "editar",
      entidad: "noticias_cursos",
      entidadId: id,
      idUsuario: await (await leerSesionDeRequest(req))?.sub ?? null,
      detalles: `Publicación editada: "${actualizada!.titulo}" · campos: ${Object.keys(patch).filter((k) => k !== "actualizadoEn").join(", ")}`,
      datosAnteriores: antes[0] ?? null,
      datosNuevos: actualizada,
      req,
    });

    return NextResponse.json(actualizada);
  } catch (e: unknown) {
    return errorInterno(e, "api/noticias/[id] PATCH");
  }
}

/** DELETE /api/noticias/:id → eliminar (SOLO ADMIN) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  try {
    const antes = await db.select().from(noticiasCursos).where(eq(noticiasCursos.id, id)).limit(1);
    if (!antes.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    await db.delete(noticiasCursos).where(eq(noticiasCursos.id, id));

    await registrarAuditoria({
      accion: "eliminar",
      entidad: "noticias_cursos",
      entidadId: id,
      idUsuario: await (await leerSesionDeRequest(req))?.sub ?? null,
      detalles: `Publicación eliminada: "${antes[0]!.titulo}"`,
      datosAnteriores: antes[0],
      req,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return errorInterno(e, "api/noticias/[id] DELETE");
  }
}