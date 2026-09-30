"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Mail, Phone, MapPin, Clock, ArrowRight, History, Newspaper, Megaphone } from "lucide-react";
import KpiNavigation from "@/components/KpiNavigation";

interface Noticia {
  id: number;
  titulo: string;
  cuerpo: string;
  tipo: string;
  categoria: string;
  fecha: string;
  imagenUrl: string | null;
  publicado: boolean;
}

const SCROLL_KEY = "sg_scroll_titulados";

function fmtFecha(f: string) {
  try {
    return new Date(f + "T00:00:00")
      .toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .toUpperCase();
  } catch {
    return f;
  }
}

function CardPublicacion({ n }: { n: Noticia }) {
  const esConvocatoria = n.categoria === "convocatoria";
  return (
    <Link
      href={`/noticias/${n.id}`}
      className="group bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition flex flex-col"
    >
      {n.imagenUrl ? (
        <div className="h-40 sm:h-44 overflow-hidden">
          <img src={n.imagenUrl} alt={n.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      ) : (
        <div className={`h-40 sm:h-44 flex flex-col items-center justify-center gap-2 text-white bg-gradient-to-br ${esConvocatoria ? "from-teal-700 via-teal-800 to-slate-900" : "from-blue-800 via-blue-900 to-slate-900"}`}>
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center">
            {esConvocatoria ? <Megaphone className="w-6 h-6" /> : <Newspaper className="w-6 h-6" />}
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
            {esConvocatoria ? "Convocatoria" : "Noticia"} · Carrera
          </p>
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <p className="text-[11px] font-black tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 shrink-0" /> {fmtFecha(n.fecha)}
        </p>
        <h5 className="text-sm font-black text-[#0f2d52] dark:text-blue-300 uppercase mt-2 leading-snug">{n.titulo}</h5>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed line-clamp-4">
          {n.cuerpo.split(/\n{2,}/)[0]}
        </p>
        <span className="mt-auto pt-3 inline-flex items-center gap-1.5 text-xs font-black text-teal-700 dark:text-teal-300 group-hover:gap-2.5 transition-all">
          {esConvocatoria ? "Leer convocatoria completa" : "Leer noticia completa"} <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

export default function TituladosPage() {
  const [noticias, setNoticias] = useState<Noticia[] | null>(null);

  useEffect(() => {
    fetch("/api/noticias")
      .then((r) => r.json())
      .then((d) => setNoticias(Array.isArray(d) ? d : []))
      .catch(() => setNoticias([]));
  }, []);

  // Guarda la posición de scroll al entrar a una noticia/convocatoria o a los KPIs,
  // para volver a la misma posición con el botón "atrás".
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const a = t.closest("a");
      if (a) {
        const href = a.getAttribute("href") || "";
        if (href.startsWith("/noticias/") || href.startsWith("/kpis/")) {
          try {
            sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
          } catch {}
        }
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  // Restaura la posición exacta al volver atrás (no aplica para el botón home del navbar)
  useEffect(() => {
    if (noticias === null) return;
    let saved = "";
    try {
      saved = sessionStorage.getItem(SCROLL_KEY) || "";
      sessionStorage.removeItem(SCROLL_KEY);
    } catch {}
    if (saved) {
      const y = Number(saved);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo(0, y));
      });
    }
  }, [noticias]);

  const lista = noticias ?? [];
  const noticiasList = lista.filter((n) => n.categoria === "noticia");
  const convocatoriasList = lista.filter((n) => n.categoria === "convocatoria");

  return (
    <div className="min-h-screen bg-[#f1f5f9] dark:bg-slate-950">
      {/* Hero */}
      <section className="bg-gradient-to-br text-white relative overflow-hidden" style={{ backgroundImage: `linear-gradient(to bottom right, var(--hero-from), var(--hero-via), #0f172a)` }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="max-w-7xl mx-auto px-6 py-10 lg:py-14 relative">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-3 py-1 text-xs font-bold tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            ACREDITACIÓN 2026 · CARRERA DE ESTADÍSTICA · UMSA
          </div>
          <h1 className="mt-6 text-4xl lg:text-5xl font-black leading-tight max-w-3xl">
            Sistema de Seguimiento a <span className="text-amber-300">Titulados</span>
          </h1>
          <p className="mt-4 text-lg text-blue-100 max-w-2xl">
            Plataforma oficial para el registro, actualización y visualización de indicadores de la Carrera de Estadística. Acceso público informativo — inicie sesión para gestionar su información.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 bg-white text-blue-900 px-6 py-3 rounded-xl font-bold shadow hover:bg-blue-50 transition">
              Iniciar sesión <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Hitos Históricos Clave - mismo diseño que noticias */}
      <section id="hitos" className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-1.5 h-6 bg-[#0f2d52] dark:bg-blue-400 rounded-full" />
          <h3 className="text-base sm:text-lg font-black tracking-widest text-[#0f2d52] dark:text-white uppercase">Hitos Históricos Clave — Carrera de Estadística</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              etiqueta: "HITO 1 · 1974",
              titulo: "Creación de la carrera",
              desc: "Inicia sus actividades formativas orientándose al desarrollo y análisis de datos en el país.",
              img: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&q=80&w=800",
            },
            {
              etiqueta: "HITO 2 · 1979",
              titulo: "Primeros titulados",
              desc: "Egresan y se titulan los primeros profesionales especialistas en estadística de la institución.",
              img: "https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&q=80&w=800",
            },
            {
              etiqueta: "HITO 3 · IETA",
              titulo: "Instituto de investigación",
              desc: "Se instituye el Instituto de Estadística Teórica y Aplicada (IETA) para potenciar la investigación científica.",
              img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800",
            },
            {
              etiqueta: "HITO 4 · ACTUALIDAD",
              titulo: "Enfoque ciencia de datos",
              desc: "La malla curricular se actualizó para integrar el perfil de ciencia de datos y modelos predictivos acordes a las demandas del mercado.",
              img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800",
            },
          ].map((h) => (
            <article key={h.titulo} className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition flex flex-col">
              <div className="h-36 sm:h-40 overflow-hidden">
                <img src={h.img} alt={h.titulo} className="w-full h-full object-cover" />
              </div>
              <div className="p-4 flex flex-col flex-1">
                <p className="text-[11px] font-black tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 shrink-0" /> {h.etiqueta}
                </p>
                <h5 className="text-sm font-black text-[#0f2d52] dark:text-blue-300 uppercase mt-2 leading-snug">{h.titulo}</h5>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{h.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Noticias y convocatorias */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/50 space-y-10">
            {/* SECCIÓN NOTICIAS */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <span className="w-1.5 h-6 bg-[#0f2d52] dark:bg-blue-400 rounded-full" />
                <h4 className="text-base sm:text-lg font-black tracking-widest text-[#0f2d52] dark:text-white uppercase">Noticias</h4>
              </div>
              {noticias === null ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 h-64 animate-pulse" />
                  ))}
                </div>
              ) : noticiasList.length === 0 ? (
                <p className="text-xs text-slate-400">Aún no hay noticias publicadas.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {noticiasList.map((n) => <CardPublicacion key={n.id} n={n} />)}
                </div>
              )}
              {noticias !== null && noticiasList.length > 0 && (
                <div className="mt-6 flex justify-center">
                  <span className="text-xs text-slate-400 font-bold tracking-widest">
                    Mostrando las {noticiasList.length} noticias más recientes
                  </span>
                </div>
              )}
            </div>

            {/* SECCIÓN CONVOCATORIAS */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <span className="w-1.5 h-6 bg-teal-600 dark:bg-teal-400 rounded-full" />
                <h4 className="text-base sm:text-lg font-black tracking-widest text-[#0f2d52] dark:text-white uppercase">Convocatorias</h4>
              </div>
              {noticias === null ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[0, 1].map((i) => (
                    <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 h-64 animate-pulse" />
                  ))}
                </div>
              ) : convocatoriasList.length === 0 ? (
                <p className="text-xs text-slate-400">Aún no hay convocatorias publicadas.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {convocatoriasList.map((n) => <CardPublicacion key={n.id} n={n} />)}
                </div>
              )}
              {noticias !== null && convocatoriasList.length > 0 && (
                <div className="mt-6 flex justify-center">
                  <span className="text-xs text-slate-400 font-bold tracking-widest">
                    {convocatoriasList.length} convocatoria{convocatoriasList.length === 1 ? "" : "s"} vigente{convocatoriasList.length === 1 ? "" : "s"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard público - botones de navegación a KPIs */}
      <section className="max-w-7xl mx-auto px-6 py-6">
        <KpiNavigation />
      </section>

      {/* Contacto */}
      <section className="max-w-7xl mx-auto px-6 pb-12 grid md:grid-cols-1 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <h3 className="font-bold flex items-center gap-2"><Mail className="w-5 h-5 text-blue-700" /> Información de Contacto</h3>
          <div className="mt-3 grid sm:grid-cols-3 gap-4 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex gap-2"><MapPin className="w-4 h-4 mt-0.5 text-slate-500" /><span><b>Carrera de Estadística</b><br/>Av. Villazón N° 1995, Monoblock Central, 2do piso<br/>La Paz, Bolivia</span></div>
            <div className="flex gap-2"><Mail className="w-4 h-4 mt-0.5 text-slate-500" /><span>estadistica@umsa.bo<br/>kardex.estadistica@umsa.bo<br/>Lun–Vie 08:30–16:30</span></div>
            <div className="flex gap-2"><Phone className="w-4 h-4 mt-0.5 text-slate-500" /><span>+591 2 2441570<br/>WhatsApp: +591 71500000<br/><Link href="/login" className="text-blue-700 font-bold underline inline-flex items-center gap-1 mt-1">Ir a login <ArrowRight className="w-3 h-3"/></Link></span></div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Clock className="w-3.5 h-3.5"/> Atención Kardex y Acreditación 2026</div>
        </div>
      </section>
    </div>
  );
}