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
import { registrarSesion } from "@/lib/sesiones";
import { DURACION_SESION_MS } from "@/lib/sesion";
import { verificarTurnstile } from "@/lib/turnstile";

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
    const turnstileToken = parseo.data.turnstileToken;
    const cookieStore = await cookies(); // Obtenemos el almacén de cookies de forma asíncrona

    // ── Validación de Cloudflare Turnstile (Anti-bots) ─────────────────────────
    const ip = ipDesde(req) ?? "desconocida";
    const verif = await verificarTurnstile(turnstileToken, ip);
    if (!verif.valido) {
      return NextResponse.json(
        { error: verif.motivo || "Verificación de seguridad fallida. Por favor, intente nuevamente." },
        { status: 403 }
      );
    }
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

      if (u.rol !== "admin" && u.rol !== "KARDEX") {
        return await fallo(`Intento de acceso con rol no habilitado ${u.rol}`);
      }

      limpiarIntentos(ip, entrada);

      // ⚠️ FIX: Usar await al crear el token
      const token = await crearToken({
        sub: u.id,
        rol: u.rol,
        ci: (u.ci ?? "").toUpperCase(),
        nombre: u.nombre,
        correo: u.correo,
      });

cookieStore.set("seguit_sesion", token, opcionesCookie());

      // Rastro de la sesión en `sesiones` (decisión D2): permite revocarla al instante
      // y saber qué accesos están abiertos. Nunca bloquea el login si falla.
      await registrarSesion({
        token,
        idUsuario: u.id,
        ci: u.ci ?? "",
        rol: u.rol,
        expiracionMs: DURACION_SESION_MS,
        ip: ipDesde(req),
        userAgent: req.headers.get("user-agent"),
      });

      return NextResponse.json({
        rol: u.rol,
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
        activo: personas.activo,
        estadoRegistro: personas.estadoRegistro,
      })
      .from(personas)
      .where(sql`upper(${personas.cedulaIdentidad}) = ${entrada}`)
      .limit(1);

    const persona = personasRows[0];
    const credencialesInvalidas = async () =>
      await fallo(`Intento de acceso fallido con CI ${entrada}`);

    if (!persona) return await credencialesInvalidas();

    // Baja lógica (decisión D3): un registro dado de baja no puede iniciar sesión, aunque
    // el usuario siga recordando su contraseña. Se comprueba DESPUÉS de validar la
    // contraseña y no antes, para que la respuesta siga siendo la misma para una cédula
    // inexistente y para una dada de baja, y no sirva para enumerar quién está dado de
    // baja en el sistema.
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

    if (!persona.activo) {
      registrarIntento(ip, entrada);
      await registrarAuditoria({
        accion: "editar",
        entidad: "sesion",
        entidadId: persona.id,
        detalles: `Intento de acceso a un registro dado de baja: CI ${entrada}`,
        req,
      });
      return NextResponse.json(
        {
          error: "Su registro se encuentra dado de baja. Contacte a la Carrera de Estadística.",
          codigo: "REGISTRO_DADO_DE_BAJA",
        },
        { status: 403 }
      );
    }

    // Alta pública (D5): hasta que un administrador valida la solicitud, el registro no
    // habilita el acceso. Se comprueba DESPUÉS de validar la contraseña, como la baja
    // lógica, para que la respuesta no sirva para averiguar qué cédulas están pendientes
    // ni cuáles fueron rechazadas.
    if (persona.estadoRegistro !== "VALIDADO") {
      registrarIntento(ip, entrada);
      const rechazado = persona.estadoRegistro === "RECHAZADO";
      await registrarAuditoria({
        accion: "editar",
        entidad: "sesion",
        entidadId: persona.id,
        detalles: `Intento de acceso con registro ${persona.estadoRegistro}: CI ${entrada}`,
        req,
      });
      return NextResponse.json(
        {
          error: rechazado
            ? "Su solicitud de registro fue rechazada. Contacte a la Carrera de Estadística."
            : "Su solicitud de registro está pendiente de validación por la Carrera de Estadística.",
          codigo: rechazado ? "REGISTRO_RECHAZADO" : "REGISTRO_PENDIENTE",
        },
        { status: 403 }
      );
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

    await registrarSesion({
      token,
      // `id_usuario` apunta a `usuarios`; un titular sin cuenta propia no tiene fila
      // ahí, se identifica por `id_persona`.
      idUsuario: null,
      idPersona: persona.id,
      ci: persona.cedulaIdentidad,
      rol: persona.tipo,
      expiracionMs: DURACION_SESION_MS,
      ip: ipDesde(req),
      userAgent: req.headers.get("user-agent"),
    });

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