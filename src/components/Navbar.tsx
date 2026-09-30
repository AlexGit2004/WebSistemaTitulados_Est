"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, LogOut, LogIn, Menu, X, GraduationCap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCierreSesion } from "@/lib/useCierreSesion";

type Palette = "dis1" | "dis2" | "dis3" | "noche1" | "noche2" | "noche3";

export default function Navbar() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [palette, setPalette] = useState<Palette>("dis1");
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const { volverSeguimiento, pedir, overlay } = useCierreSesion();
  const isEstadistica = pathname === "/";
  const isTitulados = pathname === "/titulados" || pathname.startsWith("/titulados") || pathname.startsWith("/kpis/");
  // Páginas donde se muestra el botón home secundario hacia el inicio del seguimiento
  const isSeguimientoSub = pathname === "/titulados" || pathname === "/login" || pathname === "/admin/dashboard" || pathname.startsWith("/portal/") || pathname.startsWith("/kpis/") || pathname.startsWith("/noticias/");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const savedPalette = localStorage.getItem("palette") as Palette | null;
    if (savedPalette) {
      setPalette(savedPalette);
      document.documentElement.setAttribute("data-palette", savedPalette);
      const isDark = savedPalette.startsWith("noche");
      setTheme(isDark ? "dark" : "light");
      if (isDark) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    } else if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setTheme("dark");
      setPalette("noche1");
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-palette", "noche1");
    } else {
      setTheme("light");
      setPalette("dis1");
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-palette", "dis1");
    }
  }, []);

  // Cerrar el menú al cambiar de ruta
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const applyPalette = (p: Palette) => {
    setPalette(p);
    localStorage.setItem("palette", p);
    document.documentElement.setAttribute("data-palette", p);
    const isDark = p.startsWith("noche");
    setTheme(isDark ? "dark" : "light");
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const toggleTheme = () => {
    if (theme === "light") {
      applyPalette("noche1");
    } else {
      applyPalette("dis1");
    }
  };

  const menuItems = [
    { label: "Inicio", href: "/", active: isEstadistica },
    { label: "Institucional", href: null },
    { label: "Pregrado", href: null },
    { label: "Postgrado", href: null },
    { label: "Estudiantes", href: null },
    { label: "Investigación", href: null },
    { label: "Recursos", href: null },
    { label: "Contacto", href: null },
  ];

  const leyendaSeguimiento = !user
    ? "Volver al inicio del sistema"
    : user.rol === "admin"
      ? "Cerrar sesión · Administrador"
      : user.rol === "TITULADO"
        ? "Cerrar sesión · Titulado"
        : "Cerrar sesión · Egresado";

  const rolLabel = user
    ? user.rol === "admin"
      ? "Administrador"
      : user.rol === "TITULADO"
        ? "Titulado"
        : "Egresado"
    : "Sistema";

  return (
    <>
      {/* Espacio reservado para el navbar fijo (se mantiene visible al deslizar) */}
      <div className="h-[56px] w-full" aria-hidden="true" />
      <nav className="fixed top-0 inset-x-0 z-50 h-[56px] w-full border-b text-white" style={{ backgroundColor: "var(--nav-bg)", borderColor: "var(--nav-border)" }}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[56px] gap-2">
          {/* Logo original */}
          <Link href="/" className="flex items-center gap-3 shrink-0 min-w-0">
            <div className="w-10 h-10 flex items-center justify-center shadow-sm shrink-0 p-1 overflow-hidden">
              <img src="/LogoCarrera.png" alt="Logo Carrera Estadística" className="w-full h-full object-contain" />
            </div>
            <div className="leading-tight hidden md:block">
              <p className="text-[13px] font-black tracking-tight leading-none">CARRERA DE ESTADÍSTICA</p>
              <p className="text-[11px] font-semibold text-white/70 tracking-wide hidden 2xl:block">Facultad de Ciencias Puras y Naturales</p>
            </div>
          </Link>

          {/* Menú desplegado en laptop/pc; hamburguesa al reducir resolución */}
          <ul className="hidden lg:flex items-center gap-0.5 xl:gap-1 ml-1 xl:ml-2">
            {menuItems.map((item) =>
              item.href ? (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`px-2 xl:px-2.5 py-2 text-[11px] xl:text-xs font-bold tracking-wide rounded-lg transition whitespace-nowrap ${
                      item.active
                        ? "bg-white/15 text-white"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li key={item.label}>
                  <span className="px-2 xl:px-2.5 py-2 text-[11px] xl:text-xs font-bold tracking-wide text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer whitespace-nowrap">
                    {item.label}
                  </span>
                </li>
              )
            )}
          </ul>

          <div className="flex items-center gap-1.5 shrink-0 justify-end min-w-0">
            {/* Botón home secundario: lleva al inicio de la página de seguimiento */}
            {isSeguimientoSub && (
              <button
                onClick={volverSeguimiento}
                className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-white/20 text-white hover:bg-white/10 min-h-[40px] transition shrink-0"
                title="Ir al inicio de la página de seguimiento a titulados"
              >
                <span className="w-7 h-7 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-amber-300" />
                </span>
                <span className="leading-tight text-left hidden xl:block">
                  <span className="block text-[11px] font-black tracking-tight leading-none">Seguimiento a Titulados</span>
                  <span className="block text-[9px] font-semibold text-white/70 tracking-wide mt-0.5">{leyendaSeguimiento}</span>
                </span>
              </button>
            )}

            <button onClick={toggleTheme} className="p-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 min-h-[40px] flex items-center" title={theme === "light" ? "Noche 1 (oscuro actual)" : "Dis 1 (claro actual)"}>
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-300" />}
            </button>

            {user ? (
              /* Con sesión abierta NO hay botón de cerrar sesión.
                 La sesión es "interna": para salir del dashboard o de los formularios
                 hay que cerrar la sesión, y ese es el único camino. El botón de arriba
                 ("Seguimiento a Titulados") y el botón "atrás" del navegador abren el
                 aviso de "¿Está seguro de cerrar la sesión?". */
              <div
                className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-white/20 shrink-0"
                title={`Sesión activa: ${user.nombre}`}
              >
                <div className="w-8 h-8 rounded-full bg-white/15 border border-white/25 text-xs font-black flex items-center justify-center shrink-0">
                  {user.nombre?.charAt(0).toUpperCase() || "?"}
                </div>
                <span className="hidden xl:block text-[10px] font-bold uppercase tracking-widest text-white/70 whitespace-nowrap">
                  Sesión activa
                </span>
              </div>
            ) : (
              <Link href="/login" className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-transparent text-white/90 text-xs font-bold hover:text-white shrink-0 min-h-[40px]">
                <LogIn className="w-4 h-4 shrink-0" />
                <span className="hidden 2xl:inline">Ingresar</span>
              </Link>
            )}

            {/* Hamburguesa - todas las opciones (solo al reducir resolución) */}
            <button onClick={() => setMenuOpen((o) => !o)} className="flex lg:hidden p-2 rounded-lg border border-white/20 text-white/90 hover:bg-white/10 min-h-[40px] items-center gap-1.5 text-xs font-bold" aria-label="menú">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Dropdown hamburguesa */}
      {menuOpen && (
        <div className="border-t border-white/10 shadow-2xl" style={{ backgroundColor: "var(--nav-bg)" }}>
          <ul className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col">
            {menuItems.map((item) =>
              item.href ? (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`block px-3 py-3 rounded-xl text-sm font-bold transition ${item.active ? "bg-white text-[var(--nav-bg)]" : "text-white hover:bg-white/10"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li key={item.label}>
                  <span className="block px-3 py-3 rounded-xl text-sm font-semibold text-white/60 cursor-default opacity-70">
                    {item.label} ▾
                  </span>
                </li>
              )
            )}
            {/* Con sesión activa tampoco hay salida en el menú desplegable. */}
            {isSeguimientoSub && !user && (
              <li>
                <button onClick={volverSeguimiento} className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold text-white hover:bg-white/10">
                  ← Inicio del seguimiento
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
      </nav>

      {overlay}
    </>
  );
}