import { NextResponse } from "next/server";
import { leerSesionDeRequest } from "./sesion";

/**
 * Guardas de autorización para los API Routes.
 *
 * ANTES de este cambio, `/api/exportar` y `/api/dashboard` respondían a CUALQUIER
 * petición, incluso sin sesión: la protección era solo visual en el cliente
 * (`user.rol !== "admin"` en un `useEffect`), que se salta con un `fetch` directo.
 *
 * Reglas:
 *  - `/api/exportar`          → solo admin (descarga la base de datos completa).
 *  - `/api/dashboard`         → solo admin con ?scope=admin o con filtros; público sin parámetros.
 *  - `/api/personas`          → escritura y listado: admin. Autogestión por cookie.
 *  - `/api/noticias` (escrita)→ solo admin.
 *  - `/api/usuarios`, `/api/auditoria` → solo admin.
 *
 * SON ASÍNCRONAS a propósito: `verificarToken` firma con Web Crypto (`crypto.subtle`), que es
 * lo único disponible en el runtime Edge donde corre `src/middleware.ts`. Si se olvida el
 * `await` se obtiene una Promise —que es "truthy"— y `sesion.rol` queda `undefined`, lo que
 * provoca un 403 en todas partes. Ese fue el bug que dejó el login sin funcionar.
 */

export async function exigirAdmin(
  req: Parameters<typeof leerSesionDeRequest>[0]
): Promise<NextResponse | null> {
  const sesion = await leerSesionDeRequest(req);
  if (!sesion) {
    await registrarAccesoDenegado(req, "sin sesión válida");
    return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
  }
  if (sesion.rol !== "admin") {
    await registrarAccesoDenegado(
      req,
      `rol ${sesion.rol} intentó usar un recurso de administrador`,
      sesion.sub
    );
    return NextResponse.json({ error: "Requiere permisos de administrador" }, { status: 403 });
  }
  return null;
}

/** Admin, o bien el propio titular de la persona indicada por `ci`. */
export async function exigirAdminOContacto(
  req: Parameters<typeof leerSesionDeRequest>[0],
  ciSolicitada: string
): Promise<NextResponse | null> {
  const sesion = await leerSesionDeRequest(req);
  if (!sesion) {
    await registrarAccesoDenegado(req, "sin sesión válida");
    return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
  }
  if (sesion.rol === "admin") return null;

  const normalizar = (s: string) => (s ?? "").trim().toUpperCase();
  if (normalizar(sesion.ci) && normalizar(sesion.ci) === normalizar(ciSolicitada)) return null;

  await registrarAccesoDenegado(
    req,
    `intento de acceso al registro de otra persona (CI pedida: ${ciSolicitada})`,
    sesion.sub
  );
  return NextResponse.json({ error: "No tiene permisos sobre este registro" }, { status: 403 });
}

/**
 * Los intentos de acceso denegado (401/403) también quedan en `audit_log`, para poder
 * detectar alguien que anda probando el sistema. Nunca lanza: si el log falla, el 401/403
 * se devuelve igual.
 */
async function registrarAccesoDenegado(
  req: Parameters<typeof leerSesionDeRequest>[0],
  motivo: string,
  idUsuario?: number | null
): Promise<void> {
  const { registrarAuditoria } = await import("@/lib/auditoria");
  await registrarAuditoria({
    accion: "editar",
    entidad: "acceso_denegado",
    idUsuario: idUsuario ?? null,
    detalles: `Acceso denegado a ${req.nextUrl.pathname}: ${motivo}`,
    req: req as never,
  });
}

/** Respuesta uniforme de error interno, sin filtrar detalles de la base de datos. */
export function errorInterno(e: unknown, contexto: string): NextResponse {
  // El detalle real solo al log del servidor, nunca al cliente.
  console.error(`[${contexto}]`, e);
  return NextResponse.json(
    { error: "Ocurrió un error en el servidor. Intente nuevamente." },
    { status: 500 }
  );
}