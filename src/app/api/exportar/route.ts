import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/**
 * GET /api/exportar  (SOLO ADMIN)
 *
 * SEGURIDAD: antes esta ruta respondía a cualquier petición, sin sesión. Bastaba con
 * abrir `/api/exportar?tipo=TODOS&formato=xlsx` para descargar la base de datos completa
 * de la carrera. Ahora exige cookie de sesión con rol admin y registra la exportación
 * en `audit_log` (spec del PDF: "quién hizo qué y cuándo").
 */
export async function GET(request: NextRequest) {
  const denegado = await exigirAdmin(request);
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") || "TODOS"; // TITULADOS, EGRESADOS, TODOS
    const formato = searchParams.get("formato") || "excel"; // excel, csv
    const sector = searchParams.get("sector");
    const modalidad = searchParams.get("modalidad");
    const anioMin = searchParams.get("anioMin");
    const anioMax = searchParams.get("anioMax");

    // Construcción de condiciones Drizzle
    const conditions = [];

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

    // Consulta de registros
    const registros = await db
      .select()
      .from(personas)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const fechaGeneracion = new Date().toLocaleDateString("es-BO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Mapeo a formato de reporte oficial
    const dataReporte = registros.map((r, idx) => ({
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

    const dateStr = new Date().toISOString().split("T")[0];

    // Exportación a CSV en memoria
    if (formato.toLowerCase() === "csv") {
      const worksheet = XLSX.utils.json_to_sheet(dataReporte);
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
      // Añadir BOM para compatibilidad UTF-8 en Excel
      const csvBuffer = Buffer.from("\uFEFF" + csvOutput, "utf-8");

      await registrarAuditoria({
        accion: "exportar",
        entidad: "personas",
        detalles: `Exportación CSV · ${tipo} · ${dataReporte.length} registros`,
        req: request,
      });

      return new NextResponse(csvBuffer, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Reporte_${tipo}_Estadistica_${dateStr}.csv"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    // Exportación a Excel (.xlsx) en memoria
    const workbook = XLSX.utils.book_new();

    // Encabezado institucional UMSA / Estadística
    const headerMetadata = [
      ["UNIVERSIDAD MAYOR DE SAN ANDRÉS - FACULTAD DE CIENCIAS PURAS Y NATURALES"],
      ["CARRERA DE ESTADÍSTICA - SISTEMA DE SEGUIMIENTO A TITULADOS Y EGRESADOS"],
      [`REPORTE OFICIAL DE SEGUIMIENTO (${tipo})`],
      [`Fecha de Generación: ${fechaGeneracion}`, `Total de Registros: ${dataReporte.length}`],
      [], // Fila en blanco
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(headerMetadata);
    XLSX.utils.sheet_add_json(worksheet, dataReporte, {
      origin: "A6",
      skipHeader: false,
    });

    // Ajuste de anchos de columna
    worksheet["!cols"] = [
      { wch: 6 },  // N°
      { wch: 12 }, // Tipo
      { wch: 16 }, // CI
      { wch: 30 }, // Nombres
      { wch: 14 }, // Genero
      { wch: 16 }, // Sem Ingreso
      { wch: 18 }, // Sem Egreso
      { wch: 14 }, // Año Titulacion
      { wch: 22 }, // Modalidad
      { wch: 25 }, // Especializacion
      { wch: 15 }, // Planea titularse
      { wch: 15 }, // Inicio proceso
      { wch: 20 }, // Motivo no titulacion
      { wch: 16 }, // Estado laboral
      { wch: 16 }, // Sector
      { wch: 30 }, // Sector Otro (especificado)
      { wch: 25 }, // Ocupacion
      { wch: 14 }, // Trabaja estadistica
      { wch: 22 }, // Ubicacion
      { wch: 16 }, // T Egreso-Titulacion
      { wch: 16 }, // T Insercion
      { wch: 25 }, // Correo
      { wch: 16 }, // Telefono
      { wch: 20 }, // Redes
      { wch: 30 }, // Observaciones
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, `Seguimiento_${tipo}`);

    // Generar Buffer binario en memoria RAM
    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    await registrarAuditoria({
      accion: "exportar",
      entidad: "personas",
      detalles: `Exportación Excel · ${tipo} · ${dataReporte.length} registros`,
      req: request,
    });

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Reporte_${tipo}_Estadistica_${dateStr}.xlsx"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: unknown) {
    return errorInterno(error, "api/exportar");
  }
}
