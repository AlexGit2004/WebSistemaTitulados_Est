import { NextResponse, type NextRequest } from "next/server";
import { leerSesionDeRequest } from "@/lib/sesion";

/**
 * Protección de rutas en el SERVIDOR.
 *
 * Antes, `/admin/dashboard` solo ocultaba contenido con un `useEffect` en el cliente
 * (`src/app/admin/dashboard/page.tsx`), con el `router.push("/login")` comentado. Eso no
 * protege nada: la página se seguía descargando y la API respondía igual.
 *
 * Ahora el bloqueo ocurre antes de renderizar, y por rol.
 */

const RUTAS_POR_ROL: Array<{ prefijo: string; roles: Array<"admin" | "TITULADO" | "EGRESADO"> }> = [
  { prefijo: "/admin", roles: ["admin"] },
  { prefijo: "/portal/titulado", roles: ["TITULADO", "admin"] },
  { prefijo: "/portal/egresado", roles: ["EGRESADO", "admin"] },
];

export async function middleware(req: NextRequest) {
  const ruta = req.nextUrl.pathname;

  const regla = RUTAS_POR_ROL.find((r) => ruta === r.prefijo || ruta.startsWith(`${r.prefijo}/`));
  if (!regla) return NextResponse.next();

  const sesion = await leerSesionDeRequest(req);

  if (!sesion) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?origen=${encodeURIComponent(ruta)}`;
    return NextResponse.redirect(url);
  }

  if (!regla.roles.includes(sesion.rol)) {
    // Con sesión pero del rol equivocado: a su portal, no a /login.
    const url = req.nextUrl.clone();
    url.pathname = sesion.rol === "admin" ? "/admin/dashboard" : `/portal/${sesion.rol.toLowerCase()}`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};