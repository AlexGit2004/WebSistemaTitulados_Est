import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denegado = await exigirAdmin(request);
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") || "TODOS";
    const sector = searchParams.get("sector");
    const modalidad = searchParams.get("modalidad");
    const anioMin = searchParams.get("anioMin");
    const anioMax = searchParams.get("anioMax");

    const conditions = [];

    // Baja lógica (decisión D3): lo dado de baja queda fuera de los reportes. Para
    // incluirlo hay que pedirlo expresamente con ?incluirBajas=true.
    if (searchParams.get("incluirBajas") !== "true") {
      conditions.push(eq(personas.activo, true), eq(personas.estadoRegistro, "VALIDADO"));
    }

    if (tipo === "TITULADOS") {
      conditions.push(eq(personas.tipo, "TITULADO"));
    } else if (tipo === "EGRESADOS") {
      conditions.push(eq(personas.tipo, "EGRESADO"));
    }

    if (sector && sector !== "TODOS") {
      conditions.push(eq(personas.sectorTrabajo, sector as any));
    }

    if (modalidad && modalidad !== "TODAS") {
      conditions.push(eq(personas.modalidadTitulacion, modalidad as any));
    }

    if (anioMin) {
      conditions.push(
        sql`COALESCE(${personas.anioTitulacion}, ${personas.anioEgreso}) >= ${parseInt(anioMin)}`
      );
    }

    if (anioMax) {
      conditions.push(
        sql`COALESCE(${personas.anioTitulacion}, ${personas.anioEgreso}) <= ${parseInt(anioMax)}`
      );
    }

    const registros = await db
      .select()
      .from(personas)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(50);

    const dataPreview = registros.map((r, idx) => ({
      "N°": idx + 1,
      Tipo: r.tipo,
      "Cédula de Identidad (K)": r.cedulaIdentidad,
      "Nombres y Apellidos (K)": r.nombresApellidos,
      "Género (K)": r.genero,
      "Semestre Ingreso (K)": r.semestreIngreso || "—",
      "Semestre Egreso (K)": r.semestreEgreso || "—",
      "Año Titulación (K)": r.anioTitulacion || "—",
      "Modalidad Titulación (K)": r.modalidadTitulacion || "—",
      "Área de Especialización (K)": r.areaEspecializacion || "—",
      "Planea Titularse (Egresados)": r.planeaTitularse || "—",
      "Inició Proceso Titulación": r.inicioProcesoTitulacion || "—",
      "Motivo No Titulación": r.motivoNoTitulacion || "—",
      "Estado Laboral": r.estadoLaboral || "—",
      "Sector de Trabajo": r.sectorTrabajo || "—",
      "Sector Otro (especificado)": r.sectorTrabajo === "OTRO" ? (r.sectorTrabajoOtro || "—") : "—",
      "Ocupación / Cargo": r.ocupacionCargo || "—",
      "Trabaja en Estadística": r.trabajaEnEstadistica ? "SÍ" : "NO",
      "Ubicación Geográfica": r.ciudadRegionTrabajo || "—",
      "T. Egreso-Titulación (meses)": r.tiempoEgresoTitulacionMeses ?? "—",
      "T. Inserción Laboral (meses)": r.tiempoInsercionLaboralMeses ?? "—",
      "Correo Electrónico": r.correoElectronico || "—",
      Teléfono: r.telefono || "—",
      "Redes Sociales": r.redesSociales || "—",
      Observaciones: r.observaciones || "—",
    }));

    return NextResponse.json({
      total: registros.length,
      data: dataPreview,
    });
  } catch (error: unknown) {
    return errorInterno(error, "api/exportar/preview");
  }
}
