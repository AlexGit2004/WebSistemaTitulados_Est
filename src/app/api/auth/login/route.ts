import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { personas, usuarios } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { verifyPassword } from "@/lib/password";
import { crearToken, opcionesCookie } from "@/lib/sesion";
import { loginSchema, primerErrorZod } from "@/lib/validaciones";
import { registrarAuditoria, ipDesde } from "@/lib/auditoria";
import { errorInterno } from "@/lib/guards";
import { verificarLimite, registrarIntento, limpiarIntentos } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // ── Validar entrada ────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parseo = loginSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json({ error: primerErrorZod(parseo.error) }, { status: 400 });
    }

    const entrada = parseo.data.ci.trim().toUpperCase();
    const password = parseo.data.password ?? "";
    const cookieStore = await cookies(); // Obtenemos el almacén de cookies de forma asíncrona

    // ── Límite de intentos (fuerza bruta) ─────────────────────────────────────
    // Se cuenta por IP y por identificador: atacar una cuenta desde muchas máquinas
    // tampoco sirve, porque el contador por identificador también se agota.
    const ip = ipDesde(req) ?? "desconocida";
    const limite = verificarLimite(ip, entrada);

    if (!limite.permitido) {
      await registrarAuditoria({
        accion: "editar",
        entidad: "sesion",
        detalles: `Login bloqueado por exceso de intentos · ${entrada} · IP ${ip}`,
        req,
      });
      return NextResponse.json(
        {
          error: `Demasiados intentos fallidos. Intente nuevamente en ${limite.minutosEspera} minuto(s).`,
        },
        { status: 429 }
      );
    }

    // Todo fallo cuenta como intento.
    const fallo = async (detalle: string) => {
      registrarIntento(ip, entrada);
      await registrarAuditoria({ accion: "editar", entidad: "sesion", detalles: detalle, req });
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    };

    // ── 1) Administradores (por correo O por CI) ──────────────────────────────
    const admins = await db
      .select()
      .from(usuarios)
      .where(
        and(
          eq(usuarios.estado, "activo"),
          or(
            eq(usuarios.correo, entrada.toLowerCase()),
            sql`upper(${usuarios.ci}) = ${entrada}`
          )
        )
      )
      .limit(1);

    if (admins.length) {
      const u = admins[0]!;
      
      // Si verifyPassword fuera asíncrono, agregar await: await verifyPassword(...)
      const esPasswordValido = await verifyPassword(password, u.passwordHash);

      if (!esPasswordValido) {
        return await fallo(`Intento de acceso fallido al administrador ${u.correo}`);
      }

      limpiarIntentos(ip, entrada);

      // ⚠️ FIX: Usar await al crear el token
      const token = await crearToken({
        sub: u.id,
        rol: "admin",
        ci: (u.ci ?? "").toUpperCase(),
        nombre: u.nombre,
        correo: u.correo,
      });

      cookieStore.set("seguit_sesion", token, opcionesCookie());

      return NextResponse.json({
        rol: "admin",
        ci: u.ci ?? "",
        nombre: u.nombre,
        correo: u.correo,
        id: u.id,
      });
    }

    // ── 2) Titulados y egresados (por cédula) ────────────────────────────────
    const personasRows = await db
      .select({
        id: personas.id,
        nombresApellidos: personas.nombresApellidos,
        cedulaIdentidad: personas.cedulaIdentidad,
        tipo: personas.tipo,
        correoElectronico: personas.correoElectronico,
      })
      .from(personas)
      .where(sql`upper(${personas.cedulaIdentidad}) = ${entrada}`)
      .limit(1);

    const persona = personasRows[0];
    const credencialesInvalidas = async () =>
      await fallo(`Intento de acceso fallido con CI ${entrada}`);

    if (!persona) return await credencialesInvalidas();

    const comoUsuario = await db
      .select({ passwordHash: usuarios.passwordHash, estado: usuarios.estado })
      .from(usuarios)
      .where(sql`upper(${usuarios.ci}) = ${persona.cedulaIdentidad.toUpperCase()}`)
      .limit(1);

    if (comoUsuario.length) {
      const u = comoUsuario[0]!;
      if (u.estado === "bloqueado" || u.estado === "inactivo") {
        return NextResponse.json(
          { error: `Su cuenta está ${u.estado}. Contacte a la Carrera de Estadística.` },
          { status: 403 }
        );
      }

      const esPasswordValido = await verifyPassword(password, u.passwordHash);
      if (!esPasswordValido) return await credencialesInvalidas();
    } else if (password) {
      return await credencialesInvalidas();
    }

    limpiarIntentos(ip, entrada);

    // ⚠️ FIX: Usar await al crear el token
    const token = await crearToken({
      sub: persona.id,
      rol: persona.tipo,
      ci: persona.cedulaIdentidad,
      nombre: persona.nombresApellidos,
      correo: persona.correoElectronico,
    });

    cookieStore.set("seguit_sesion", token, opcionesCookie());

    await registrarAuditoria({
      accion: "editar",
      entidad: "sesion",
      entidadId: persona.id,
      idUsuario: null,
      detalles: `Inicio de sesión de ${persona.nombresApellidos} (${persona.tipo})`,
      req,
    });

    return NextResponse.json({
      rol: persona.tipo,
      ci: persona.cedulaIdentidad,
      nombre: persona.nombresApellidos,
      correo: persona.correoElectronico,
      id: persona.id,
      tipo: persona.tipo,
    });
  } catch (e) {
    return errorInterno(e, "auth/login");
  }
}