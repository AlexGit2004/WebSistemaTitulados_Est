import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { noticiasCursos, type NuevaNoticiaCurso } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

const TIPOS = ["noticia_institucional", "curso_evento", "noticia_social"];
const CATEGORIAS = ["noticia", "convocatoria"];

function validarVisible(body: any): string | null {
  if (!body || typeof body !== "object") return "Cuerpo inválido";
  if (!body.titulo || String(body.titulo).trim().length === 0) return "El título es obligatorio";
  if (String(body.titulo).trim().length > 250) return "El título no puede superar 250 caracteres";
  if (!body.cuerpo || String(body.cuerpo).trim().length === 0) return "La descripción (cuerpo) es obligatoria";
  if (!TIPOS.includes(body.tipo)) return "El tipo es inválido";
  if (!CATEGORIAS.includes(body.categoria)) return "La categoría debe ser noticia o convocatoria";
  if (!body.fecha || Number.isNaN(new Date(body.fecha).getTime())) return "La fecha es obligatoria";
  return null;
}

// GET /api/noticias → listado. ?admin=1 incluye no publicadas (requiere rol admin).
export async function GET(req: NextRequest) {
  try {
    const admin = new URL(req.url).searchParams.get("admin") === "1";
    // Antes, `?admin=1` listaba también las borradores sin pedir ninguna sesión.
    if (admin) {
      const denegado = await exigirAdmin(req);
      if (denegado) return denegado;
    }

    const rows = admin
      ? await db.select().from(noticiasCursos).orderBy(desc(noticiasCursos.fecha), desc(noticiasCursos.id))
      : await db
          .select()
          .from(noticiasCursos)
          .where(eq(noticiasCursos.publicado, true))
          .orderBy(desc(noticiasCursos.fecha), desc(noticiasCursos.id));
    return NextResponse.json(rows);
  } catch (e: unknown) {
    return errorInterno(e, "api/noticias GET");
  }
}

// POST /api/noticias → crear (SOLO ADMIN)
export async function POST(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const err = validarVisible(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const nueva: NuevaNoticiaCurso = {
    titulo: String(body.titulo).trim(),
    cuerpo: String(body.cuerpo).trim(),
    tipo: body.tipo,
    categoria: body.categoria,
    fecha: body.fecha,
    imagenUrl: body.imagenUrl && String(body.imagenUrl).trim() ? String(body.imagenUrl).trim() : null,
    publicado: body.publicado === true || body.publicado === undefined ? true : false,
  };
  try {
    const creada = await db.insert(noticiasCursos).values(nueva).returning();

    await registrarAuditoria({
      accion: "crear",
      entidad: "noticias_cursos",
      entidadId: creada[0]!.id,
      idUsuario: await (await leerSesionDeRequest(req))?.sub ?? null,
      detalles: `Publicación creada: "${creada[0]!.titulo}"`,
      req,
    });

    return NextResponse.json(creada[0], { status: 201 });
  } catch (e: unknown) {
    return errorInterno(e, "api/noticias POST");
  }
}