import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { noticiasCursos, type NuevaNoticiaCurso } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { noticiaSchema, primerErrorZod } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

const TIPOS = ["noticia_institucional", "curso_evento", "noticia_social"];
const CATEGORIAS = ["noticia", "convocatoria"];

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

  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  // El esquema valida tipo, longitudes y campos prohibidos ANTES de insertar: un
  // `tipo` fuera del enum llegaba a PostgreSQL y devolvía 500 en lugar de un 400.
  const check = noticiaSchema.safeParse(crudo);
  if (!check.success) {
    return NextResponse.json(
      { error: primerErrorZod(check.error), campos: check.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const body = check.data;

  const nueva: NuevaNoticiaCurso = {
    titulo: body.titulo,
    cuerpo: body.cuerpo,
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