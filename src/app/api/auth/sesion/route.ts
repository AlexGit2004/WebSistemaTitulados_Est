import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { NOMBRE_COOKIE, opcionesCookie, verificarToken } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/sesion
 * Devuelve la sesión actual leída de la cookie httpOnly.
 *
 * Antes, el cliente leía `localStorage.getItem("auth_user")`, que cualquiera podía
 * editar desde la consola del navegador (poniendo rol "admin" y entrando al dashboard).
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(NOMBRE_COOKIE)?.value;
  const sesion = await verificarToken(token);

  if (!sesion) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user: sesion });
}

/** DELETE /api/auth/logout — borra la cookie de sesión. */
export async function DELETE() {
  cookies().set(NOMBRE_COOKIE, "", opcionesCookie(0));
  return NextResponse.json({ ok: true });
}