"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Mail, Phone, MapPin, Clock, ArrowRight, History, Newspaper, Megaphone, LogIn, BarChart3 } from "lucide-react";
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
    <div className="min-h-screen bg-[#eef5fb] dark:bg-[#0d1728]">
      <section className="relative isolate flex min-h-[calc(100svh-56px)] items-center overflow-hidden bg-[#dceff0] text-slate-900 dark:bg-[#101b2d] dark:text-white">
        <img src="/2png/fondo-estadistica.png" alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover object-right opacity-70 dark:opacity-25" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-white/95 via-sky-50/85 to-cyan-50/35 dark:from-[#0c1830]/95 dark:via-[#0c1830]/82 dark:to-[#102337]/60" />
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12 relative grid lg:grid-cols-[1.15fr_.85fr] gap-8 lg:gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2.5 rounded-full border border-sky-900/10 bg-white/75 px-3 py-2 shadow-sm backdrop-blur-md dark:border-white/20 dark:bg-white/10">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#123652]"><img src="/2png/logo-seguimiento.png" alt="" className="h-6 w-6 object-contain" /></span>
              <span className="text-sm sm:text-[15px] font-normal tracking-wide text-[#31536a] dark:text-white/90">CARRERA DE ESTADÍSTICA · UMSA</span>
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl sm:text-5xl font-black leading-[1.08] text-[#142d46] dark:text-white">
              Seguimiento a <span className="text-[#d86524] dark:text-amber-300">titulados</span>
            </h1>
            <p className="mt-5 max-w-xl text-[19px] sm:text-[21px] font-normal leading-relaxed text-slate-700 dark:text-slate-100/90">
              Actualiza tu trayectoria profesional, consulta indicadores y mantente al día con la Carrera de Estadística.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#f2a638] px-5 py-3 text-[17px] font-normal text-slate-950 shadow-lg shadow-amber-900/15 transition hover:bg-[#e89424] dark:bg-amber-400 dark:hover:bg-amber-300">
                <LogIn className="w-4 h-4" /> Iniciar sesión <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/kpis/titulados" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-cyan-900/15 bg-white/70 px-5 py-3 text-[17px] font-normal text-[#15556a] backdrop-blur-sm transition hover:bg-white dark:border-white/30 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
                <BarChart3 className="w-4 h-4" /> Consultar indicadores
              </Link>
            </div>
          </div>

          <aside className="w-full max-w-md lg:ml-auto rounded-2xl border border-sky-900/10 bg-white/75 p-4 sm:p-5 shadow-xl shadow-cyan-950/10 backdrop-blur-md dark:border-white/20 dark:bg-slate-950/55 dark:shadow-slate-950/25">
            <p className="px-1 text-sm font-normal tracking-[.16em] text-slate-600 dark:text-white/65">ACCESOS DIRECTOS</p>
            <div className="mt-3 divide-y divide-slate-200/80 dark:divide-white/15">
              <Link href="/login" className="group flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-cyan-100/70 dark:hover:bg-white/10">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-900/10 bg-cyan-100 text-[#a95a18] dark:border-white/15 dark:bg-white/10 dark:text-amber-300"><LogIn className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900 dark:text-white">Mi perfil profesional</span><span className="mt-0.5 block text-[15px] font-normal text-slate-600 dark:text-white/65">Gestiona tus datos laborales</span></span>
                <ArrowRight className="w-4 h-4 shrink-0 text-slate-500 transition group-hover:translate-x-1 dark:text-white/60" />
              </Link>
              <Link href="/kpis/titulados" className="group flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-cyan-100/70 dark:hover:bg-white/10">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-900/10 bg-cyan-100 text-[#0d7580] dark:border-white/15 dark:bg-white/10 dark:text-teal-200"><BarChart3 className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900 dark:text-white">Indicadores públicos</span><span className="mt-0.5 block text-[15px] font-normal text-slate-600 dark:text-white/65">Empleabilidad y trayectoria</span></span>
                <ArrowRight className="w-4 h-4 shrink-0 text-slate-500 transition group-hover:translate-x-1 dark:text-white/60" />
              </Link>
              <a href="#noticias" className="group flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-cyan-100/70 dark:hover:bg-white/10">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-900/10 bg-cyan-100 text-[#a95a18] dark:border-white/15 dark:bg-white/10 dark:text-amber-200"><Newspaper className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900 dark:text-white">Noticias y convocatorias</span><span className="mt-0.5 block text-[15px] font-normal text-slate-600 dark:text-white/65">Novedades de la Carrera</span></span>
                <ArrowRight className="w-4 h-4 shrink-0 text-slate-500 transition group-hover:translate-x-1 dark:text-white/60" />
              </a>
            </div>
          </aside>
        </div>
      </section>

      <section id="indicadores" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <KpiNavigation />
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
      <section id="noticias" className="max-w-7xl mx-auto px-4 sm:px-6 py-8 scroll-mt-20">
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