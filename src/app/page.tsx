"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Trophy, Mail, GraduationCap, ArrowRight, Clock, Newspaper, Megaphone, Landmark } from "lucide-react";

/**
 * Portada pública de la Carrera de Estadística.
 *
 * El bloque "Noticias Destacadas" antes era un array de texto fijo dentro del componente,
 * con imágenes de `picsum.photos`: nada de eso venía de la base de datos, así que el admin
 * no podía actualizarlo. Ahora se leen las publicaciones reales desde `/api/noticias`.
 */
export default function EstadisticaPage() {
  const [noticias, setNoticias] = useState<
    Array<{ id: number; titulo: string; fecha: string; imagenUrl: string | null; categoria: string }>
  >([]);

  useEffect(() => {
    fetch("/api/noticias")
      .then((r) => r.json())
      .then((d) => setNoticias(Array.isArray(d) ? d.slice(0, 3) : []))
      .catch(() => setNoticias([]));
  }, []);

  const ETIQUETA: Record<string, { tag: string; color: string }> = {
    noticia_institucional: { tag: "INVESTIGACIÓN", color: "bg-orange-100 text-[#e86a17]" },
    curso_evento: { tag: "ACADÉMICO", color: "bg-blue-100 text-[#0f3a6b]" },
    noticia_social: { tag: "EVENTOS", color: "bg-slate-100 text-slate-600" },
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] dark:bg-slate-950 transition-colors">
      {/* HERO */}
      <section className="relative bg-[#0f2d52] overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1541339907198-e08756ebafe3?auto=format&fit=crop&q=80&w=1600" alt="graduado" className="w-full h-full object-cover opacity-[0.28]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f2d52]/90 via-[#0f2d52]/70 to-[#0f2d52]/60" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f2d52]/40" />
        </div>

        <div className="relative max-w-[1200px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start lg:items-center">
            {/* Left */}
            <div>
              <span className="inline-flex items-center gap-1.5 bg-[#0f3a6b] border border-white/10 text-white text-xs font-black tracking-widest px-3 py-1.5 rounded-full">📚 POSTGRADO 2025</span>
              <h1 className="mt-6 text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-white">
                Magíster en Análisis de<br className="hidden sm:block" />Datos
              </h1>
              <p className="mt-4 text-sm sm:text-base leading-relaxed text-white/80 max-w-[560px]">
                Formación avanzada en machine learning, estadística bayesiana y big data. Clases presenciales y en línea para profesionales.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row flex-wrap gap-3">
                <Link href="/titulados" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#0f3a6b] text-white px-6 py-3.5 rounded-xl text-base sm:text-sm font-bold shadow hover:bg-[#14477f] transition min-h-[44px]">
                  <Landmark className="w-4 h-4" /> Conocer la Carrera
                </Link>
                <Link href="/kpis/titulados" className="w-full sm:w-auto inline-flex items-center justify-center bg-white/10 backdrop-blur border border-white/30 text-white px-6 py-3.5 rounded-xl text-base sm:text-sm font-bold hover:bg-white/20 transition min-h-[44px]">
                  Ver indicadores de egresados
                </Link>
              </div>
            </div>

            {/* Right - Actualidad */}
            <div className="space-y-3">
              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-xs font-black tracking-[0.2em] text-amber-300"><span className="w-6 h-0.5 bg-[#e86a17]" /> ACTUALIDAD</div>
                <h3 className="text-white font-black text-lg mt-1">Noticias <span className="text-[#e86a17]">Destacadas</span></h3>
                <p className="text-white/60 text-xs font-bold tracking-wide mt-1">LAS 3 PUBLICACIONES MAS RECIENTES</p>
              </div>

              {noticias.length === 0 ? (
                <p className="text-white/60 text-xs text-center py-4">No hay publicaciones recientes.</p>
              ) : (
                noticias.map((n) => {
                  const est = ETIQUETA[n.categoria === "convocatoria" ? "curso_evento" : "noticia_institucional"]!;
                  const esConv = n.categoria === "convocatoria";
                  return (
                    <Link
                      key={n.id}
                      href={`/noticias/${n.id}`}
                      className="bg-white rounded-2xl p-3 flex gap-3 shadow-lg hover:shadow-xl transition"
                    >
                      <div className="w-12 h-12 rounded-xl bg-slate-100 shrink-0 overflow-hidden">
                        {n.imagenUrl ? (
                          <img src={n.imagenUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {esConv ? (
                              <Megaphone className="w-5 h-5 text-[#e86a17]" />
                            ) : (
                              <Newspaper className="w-5 h-5 text-[#0f3a6b]" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-black tracking-widest">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${esConv ? "bg-orange-100 text-[#e86a17]" : est.color}`}>
                            {esConv ? "CONVOCATORIA" : est.tag}
                          </span>
                          <span className="text-slate-500">{n.fecha}</span>
                        </div>
                        <p className="text-[13px] font-semibold leading-tight text-slate-800 mt-1 line-clamp-2">
                          {n.titulo}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> LEER MÁS →
                        </p>
                      </div>
                    </Link>
                  );
                })
              )}

              <Link
                href="/titulados"
                className="w-full block text-center bg-[#e86a17]/20 border border-[#e86a17]/30 text-amber-200 rounded-full py-3 text-xs font-black tracking-widest hover:bg-[#e86a17]/30 transition min-h-[44px]"
              >
                ∨ VER TODAS LAS NOTICIAS Y CONVOCATORIAS →
              </Link>
            </div>
          </div>
        </div>

        {/* Quick access cards - sin translate que corte contenido */}
        <div className="relative max-w-[1200px] mx-auto w-full px-4 sm:px-6 lg:px-8 pb-8 pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* UNICO FUNCIONAL */}
            <Link href="/titulados" className="bg-white rounded-2xl p-4 flex gap-3 shadow-xl border border-slate-100 hover:shadow-2xl hover:border-[#0f2d52]/20 transition group min-h-[88px]">
              <div className="w-11 h-11 rounded-xl bg-[#0f3a6b] text-white flex items-center justify-center shrink-0 group-hover:bg-[#0f2d52] transition"><Users className="w-5 h-5" /></div>
              <div className="min-w-0">
                <h4 className="text-sm font-black leading-tight text-slate-900">Seguimiento a Titulados</h4>
                <p className="text-[11px] font-bold tracking-widest text-[#0f3a6b] mt-0.5">ACCESO RÁPIDO</p>
                <p className="text-xs text-slate-500 mt-1">Portal de empleabilidad</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 ml-auto shrink-0 group-hover:text-[#0f2d52] group-hover:translate-x-1 transition" />
            </Link>

            {/* Las otras tres tarjetas todavía no tienen sección implementada. Se dejan
                deshabilitadas y visibles, para no prometer navegación que no existe. */}
            {[
              { titulo: "Olimpiadas de Estadística", sub: "Competencia académica", icono: Trophy, color: "text-[#e86a17]" },
              { titulo: "Correo Institucional", sub: "Webmail UMSA", icono: Mail, color: "text-[#0f3a6b]" },
              { titulo: "Acceso SIA", sub: "Sistema de Información Académica", icono: GraduationCap, color: "text-[#e86a17]" },
            ].map((c) => (
              <div
                key={c.titulo}
                title="Sección en construcción"
                className="bg-white rounded-2xl p-4 flex gap-3 shadow-xl border border-slate-100 opacity-60 cursor-not-allowed min-h-[88px]"
              >
                <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                  <c.icono className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-black leading-tight text-slate-900">{c.titulo}</h4>
                  <p className="text-[11px] font-bold tracking-widest text-slate-400 mt-0.5">PRÓXIMAMENTE</p>
                  <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Métricas Institucionales */}
      <section className="bg-[#f8fafc] dark:bg-slate-900 pt-12 pb-12 transition-colors">
        <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="w-8 h-1 bg-[#0f2d52] dark:bg-blue-400" />
            <p className="text-[13px] font-black tracking-[0.2em] text-slate-500 dark:text-slate-400 uppercase">Métricas Institucionales</p>
          </div>
          <div className="mt-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-[#0f172a] dark:text-white leading-tight">
              Resultados de Excelencia<br className="hidden sm:block" />Académica
            </h2>
            <div className="text-right">
              <p className="text-sm font-black tracking-widest text-slate-500 dark:text-slate-400">GESTIÓN EDUCATIVA</p>
              <p className="text-sm font-black tracking-widest text-[#e86a17]">CARRERA DE ESTADÍSTICA 2026</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { value: "92%", unit: "%", label: "EMPLEABILIDAD DIRECTA", sub: "EGRESADOS EN PUESTOS SENIOR", color: "text-[#0f3a6b] dark:text-blue-400" },
              { value: "15:1", unit: "", label: "RATIO ESTUDIANTE DOCENTE", sub: "ATENCIÓN PERSONALIZADA", color: "text-[#e86a17]" },
              { value: "25+", unit: "", label: "INVESTIGACIONES PUBLICADAS", sub: "GESTIÓN 2025-2026", color: "text-[#0f3a6b] dark:text-blue-400" },
              { value: "A+", unit: "", label: "ACREDITACIÓN INTERNACIONAL", sub: "MERCOSUR EDUCATIVO", color: "text-[#e86a17]" },
            ].map((c) => (
              <div key={c.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm transition-colors">
                <p className={`text-4xl sm:text-5xl font-black tracking-tighter ${c.color}`}>{c.value}</p>
                <p className="text-xs font-black tracking-wide text-[#0f2d52] dark:text-slate-100 mt-3 leading-tight">{c.label}</p>
                <p className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 mt-2">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer simple */}
      <footer className="bg-[#0f2d52] text-white/70">
        <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row justify-between gap-3 text-xs">
          <span>© {new Date().getFullYear()} Carrera de Estadística — UMSA.</span>
          <span className="text-white/50">Av. Villazón 1995 — La Paz, Bolivia</span>
        </div>
      </footer>
    </div>
  );
}