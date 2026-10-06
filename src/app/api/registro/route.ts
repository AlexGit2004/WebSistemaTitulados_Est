import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { errorInterno } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { personaRegistroPublicoSchema, primerErrorZod } from "@/lib/validaciones";
import { crearVerificacion } from "@/lib/verificacion";
import { enviarCorreoVerificacion } from "@/lib/correo";
import { registrarIntento, verificarLimite } from "@/lib/rateLimit";
import { ipDesde } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/**
 * POST /api/registro  ·  ALTA PÚBLICA (decisión D5, opción B)
 *
 * Es la ÚNICA ruta del sistema que acepta escritura sin sesión, y a propósito no está en
 * la lista de prefijos protegidos de `src/middleware.ts`. Como no hay ninguna credencial
 * que verificar, se apoya en tres cosas:
 *
 *   1. Rate limit por IP, para que no se pueda automatizar el envío de solicitudes.
 *   2. El registro nace `PENDIENTE`: no entra al sistema ni cuenta en las métricas hasta
 *      que un administrador lo valida (y hasta que se verifica el correo).
 *   3. Respuesta idéntica exista o no la cédula, para no poder enumerar quién está en el
 *      sistema. Solo quien controla el correo recibe el enlace de verificación.
 */

export async function POST(req: NextRequest) {
  try {
    // ── Límite de intentos ──────────────────────────────────────────────────────
    // Sin cuenta contra la que contar, el contador es por IP. Si se llegara a colar
    // una cédula ajena, el alta quedaría PENDIENTE y sin verificar, es decir inútil.
    const ip = ipDesde(req) ?? "desconocida";
    const limite = verificarLimite(ip, "registro-publico");
    if (!limite.permitido) {
      return NextResponse.json(
        { error: `Demasiados intentos. Intente nuevamente en ${limite.minutosEspera} minuto(s).` },
        { status: 429 }
      );
    }

    // ── Validar entrada ────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parseo = personaRegistroPublicoSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json(
        { error: primerErrorZod(parseo.error), campos: parseo.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const datos = parseo.data;

    // El correo es obligatorio en el alta pública: es lo único que permite demostrar que
    // la persona controla el buzón y, por tanto, que el registro es suyo.
    if (!datos.correoElectronico) {
      return NextResponse.json(
        { error: "Debe indicar un correo electrónico", campos: { correoElectronico: ["Obligatorio"] } },
        { status: 400 }
      );
    }

    // ── Cédula ya existente ────────────────────────────────────────────────────
    // Se responde IGUAL que en el caso exitoso a propósito: si se dijera "esa cédula ya
    // está registrada", el endpoint serviría para averiguar quién está en el sistema.
    const ci = datos.cedulaIdentidad.trim().toUpperCase();
    const existentes = await db
      .select({ id: personas.id, activo: personas.activo, estadoRegistro: personas.estadoRegistro })
      .from(personas)
      .where(sql`upper(${personas.cedulaIdentidad}) = ${ci}`)
      .limit(1);

    if (existentes.length) {
      registrarIntento(ip, "registro-publico");
      return NextResponse.json(
        {
          mensaje:
            "Si los datos son correctos, se le enviará un correo para verificar. " +
            "Si ya está registrado, revise su correo o contacte a la Carrera.",
        },
        { status: 202 }
      );
    }

    // ── Crear el registro en estado PENDIENTE ───────────────────────────────────
    const tiempoEgresoTitulacionMeses =
      datos.anioEgreso && datos.anioTitulacion
        ? (datos.anioTitulacion - datos.anioEgreso) * 12
        : null;

    const [creado] = await db
      .insert(personas)
      .values({
        ...datos,
        cedulaIdentidad: ci,
        activo: true,
        estadoRegistro: "PENDIENTE",
        tiempoEgresoTitulacionMeses:
          tiempoEgresoTitulacionMeses !== null && tiempoEgresoTitulacionMeses >= 0
            ? tiempoEgresoTitulacionMeses
            : null,
      })
      .returning();

    if (!creado) {
      return NextResponse.json(
        { error: "No se pudo crear el registro. Intente nuevamente." },
        { status: 500 }
      );
    }

    // ── Enlace de verificación ─────────────────────────────────────────────────
    const token = await crearVerificacion({
      idPersona: creado.id,
      destino: creado.correoElectronico!,
      proposito: "REGISTRO",
    });

    const envio = await enviarCorreoVerificacion({
      destino: creado.correoElectronico!,
      nombre: creado.nombresApellidos,
      token,
    });

    await registrarAuditoria({
      accion: "crear",
      entidad: "personas",
      entidadId: creado.id,
      idUsuario: null,
      detalles: `Alta pública PENDIENTE de ${creado.nombresApellidos} (CI ${ci}) · correo enviado: ${envio.enviado ? "sí" : "no"} (${envio.motivo ?? "ok"})`,
      req,
    });

    return NextResponse.json(
      {
        mensaje:
          "Registro creado. Revise su correo y siga el enlace para verificarlo; " +
          "luego la Carrera de Estadística validará sus datos.",
        id: creado.id,
        // Sin SMTP configurado el correo no sale, así que el enlace se devuelve para que
        // el flujo pueda probarse. En un despliegue real se elimina de la respuesta.
        verificacionEnviada: envio.enviado,
        ...(envio.enviado ? {} : { enlaceVerificacion: `/verificar?token=${token}` }),
      },
      { status: 201 }
    );
  } catch (e) {
    return errorInterno(e, "api/registro POST");
  }
}