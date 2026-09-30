import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { noticiasCursos, type NuevaNoticiaCurso } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: Partial<NuevaNoticiaCurso> = {};
  if (body.titulo !== undefined) {
    if (String(body.titulo).trim().length === 0)
      return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });
    patch.titulo = String(body.titulo).trim();
  }
  if (body.cuerpo !== undefined) {
    if (String(body.cuerpo).trim().length === 0)
      return NextResponse.json({ error: "La descripción es obligatoria" }, { status: 400 });
    patch.cuerpo = String(body.cuerpo).trim();
  }
  if (body.tipo !== undefined) {
    if (!TIPOS.includes(body.tipo))
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    patch.tipo = body.tipo;
  }
  if (body.categoria !== undefined) {
    if (!CATEGORIAS.includes(body.categoria))
      return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
    patch.categoria = body.categoria;
  }
  if (body.fecha !== undefined) {
    if (Number.isNaN(new Date(body.fecha).getTime()))
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    patch.fecha = body.fecha;
  }
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