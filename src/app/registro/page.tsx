"use client";
import { useEffect, useState } from "react";
import { GraduationCap, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * /registro  ·  Alta pública de egresados (decisión D5, opción B).
 *
 * Es la contraparte de `POST /api/registro`. El formulario pide solo lo que el egresado
 * sabe de sí mismo y lo que la ley exige; el resto lo completa el administrador al
 * validar la solicitud.
 *
 * El registro NO queda activo al enviarlo: nace PENDIENTE, se envía un enlace al correo
 * para verificarlo, y hasta que un administrador lo valida no cuenta en el sistema ni
 * permite iniciar sesión. El mensaje final lo dice con claridad para que nadie crea que
 * con este formulario ya quedó incorporado.
 */

type Resultado =
  | { estado: "enviado"; mensaje: string; verificacionEnviada: boolean }
  | { estado: "error"; mensaje: string; campos?: Record<string, string[]> };

const inp =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none focus:ring-2 focus:ring-blue-600/40";

const err = "mt-1 text-xs font-semibold text-red-600";

export default function PaginaRegistro() {
  const [f, setF] = useState({
    tipo: "EGRESADO",
    nombresApellidos: "",
    cedulaIdentidad: "",
    genero: "PREFIERO_NO_DECIR",
    correoElectronico: "",
    telefono: "",
    semestreIngreso: "",
    semestreEgreso: "",
    anioEgreso: "",
    anioTitulacion: "",
    modalidadTitulacion: "",
  } as Record<string, string>);
  const [planeaTitularse, setPlaneaTitularse] = useState("");
  const [inicioProceso, setInicioProceso] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [r, setR] = useState<Resultado | null>(null);

  useEffect(() => {
    document.title = "Registro | Seguimiento a Titulados";
  }, []);

  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const esTitulado = f.tipo === "TITULADO";
  const pideMotivo =
    !esTitulado &&
    (planeaTitularse === "NO" ||
      planeaTitularse === "NO_SABE" ||
      (planeaTitularse === "SI" && inicioProceso === "NO"));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setR(null);

    // Se manda exactamente lo que el esquema acepta: si el valor de un desplegable está
    // vacío, la clave no viaja, para que el servidor aplique su propia validación.
    const cuerpo: Record<string, unknown> = {
      tipo: f.tipo,
      nombresApellidos: f.nombresApellidos,
      cedulaIdentidad: f.cedulaIdentidad,
      genero: f.genero,
      correoElectronico: f.correoElectronico,
    };
    const opcionales: Array<[string, string]> = [
      ["telefono", f.telefono],
      ["semestreIngreso", f.semestreIngreso],
      ["semestreEgreso", f.semestreEgreso],
      ["anioEgreso", f.anioEgreso],
      ["anioTitulacion", f.anioTitulacion],
      ["modalidadTitulacion", f.modalidadTitulacion],
    ];
    for (const [k, v] of opcionales) if (v) cuerpo[k] = v;

    if (!esTitulado) {
      cuerpo.planeaTitularse = planeaTitularse;
      if (planeaTitularse === "SI" && inicioProceso) cuerpo.inicioProcesoTitulacion = inicioProceso;
      if (pideMotivo && motivo) cuerpo.motivoNoTitulacion = motivo;
    }

    try {
      const res = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json();

      if (res.ok || res.status === 202) {
        setR({
          estado: "enviado",
          mensaje: data.mensaje ?? "Su solicitud fue registrada.",
          verificacionEnviada: Boolean(data.verificacionEnviada),
        });
      } else {
        setR({ estado: "error", mensaje: data.error ?? "No se pudo enviar la solicitud.", campos: data.campos });
      }
    } catch {
      setR({ estado: "error", mensaje: "Error de red. Intente nuevamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-12 bg-[var(--bg)] text-[var(--fg)]">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-11 h-11 rounded-xl bg-[var(--nav-bg)] flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-amber-300" />
          </span>
          <div>
            <h1 className="text-xl font-black tracking-tight">Registro de egresados y titulados</h1>
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
              Facultad de Ciencias · Universidad Mayor de San Andrés
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 mb-4 text-sm leading-relaxed">
          <p>
            Complete el formulario para que la Carrera de Estadística lo contacte. Su
            solicitud <strong>no</strong> queda activa al enviarla: primero se verifica su
            correo y después un administrador revisa los datos.
          </p>
        </div>

        {r?.estado === "enviado" && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 mb-6">
            <div className="flex items-center gap-2 text-emerald-700 mb-2">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="font-bold">Solicitud recibida</h2>
            </div>
            <p className="text-sm text-emerald-900">{r.mensaje}</p>
            {!r.verificacionEnviada && (
              <p className="text-xs text-emerald-800 mt-3">
                <strong>Nota del servidor:</strong> no hay servicio de correo configurado en
                esta instalación, así que el enlace de verificación se imprimió en la
                consola del servidor. El flujo completo queda probado, pero falta configurar
                el SMTP para que el correo llegue solo.
              </p>
            )}
          </div>
        )}

        {r?.estado === "error" && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-5 mb-6">
            <div className="flex items-center gap-2 text-red-700 mb-2">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="font-bold">No se pudo enviar</h2>
            </div>
            <p className="text-sm text-red-900">{r.mensaje}</p>
            {r.campos && (
              <ul className="mt-2 text-xs text-red-800 space-y-1">
                {Object.entries(r.campos).map(([campo, msgs]) => (
                  <li key={campo}>
                    <b>{campo}:</b> {msgs.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={enviar} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-[var(--muted)]">Datos personales</h2>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide">Nombres y apellidos *</span>
            <input required className={inp} value={f.nombresApellidos} onChange={(e) => set("nombresApellidos", e.target.value)} />
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Cédula de identidad *</span>
              <input required placeholder="1234567 LP" className={inp} value={f.cedulaIdentidad} onChange={(e) => set("cedulaIdentidad", e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Correo electrónico *</span>
              <input required type="email" placeholder="nombre@correo.com" className={inp} value={f.correoElectronico} onChange={(e) => set("correoElectronico", e.target.value)} />
              <span className="text-[11px] text-[var(--muted)]">Aquí le enviaremos el enlace de verificación.</span>
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Género *</span>
              <select className={inp} value={f.genero} onChange={(e) => set("genero", e.target.value)}>
                <option value="PREFIERO_NO_DECIR">Prefiero no decir</option>
                <option value="MASCULINO">Masculino</option>
                <option value="FEMENINO">Femenino</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Teléfono</span>
              <input className={inp} value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </label>
          </div>

          <h2 className="text-sm font-black uppercase tracking-widest text-[var(--muted)] pt-2">Situación académica</h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">¿Está titulado o es egresado? *</span>
              <select className={inp} value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
                <option value="EGRESADO">Egresado</option>
                <option value="TITULADO">Titulado</option>
              </select>
            </label>
            {esTitulado && (
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide">Modalidad de titulación *</span>
                <select className={inp} value={f.modalidadTitulacion} onChange={(e) => set("modalidadTitulacion", e.target.value)}>
                  <option value="">Seleccione…</option>
                  {["Tesis", "Proyecto de grado", "Examen de grado", "Trabajo dirigido", "Otro"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Semestre de ingreso</span>
              <input placeholder="I/2018" className={inp} value={f.semestreIngreso} onChange={(e) => set("semestreIngreso", e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Semestre de egreso</span>
              <input placeholder="II/2023" className={inp} value={f.semestreEgreso} onChange={(e) => set("semestreEgreso", e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Año de egreso</span>
              <input inputMode="numeric" className={inp} value={f.anioEgreso} onChange={(e) => set("anioEgreso", e.target.value)} />
            </label>
          </div>

          {esTitulado && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Año de titulación *</span>
              <input inputMode="numeric" className={inp} value={f.anioTitulacion} onChange={(e) => set("anioTitulacion", e.target.value)} />
            </label>
          )}

          {!esTitulado && (
            <>
              <h2 className="text-sm font-black uppercase tracking-widest text-[var(--muted)] pt-2">Titulación</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide">¿Planea titularse? *</span>
                  <select className={inp} value={planeaTitularse} onChange={(e) => setPlaneaTitularse(e.target.value)}>
                    <option value="">Seleccione…</option>
                    <option value="SI">Sí</option>
                    <option value="NO">No</option>
                    <option value="NO_SABE">No sabe</option>
                  </select>
                </label>
                {planeaTitularse === "SI" && (
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide">¿Ya inició el proceso? *</span>
                    <select className={inp} value={inicioProceso} onChange={(e) => setInicioProceso(e.target.value)}>
                      <option value="">Seleccione…</option>
                      <option value="SI">Sí</option>
                      <option value="NO">No</option>
                    </select>
                  </label>
                )}
              </div>

              {pideMotivo && (
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide">Motivo de no titulación *</span>
                  <select className={inp} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                    <option value="">Seleccione…</option>
                    <option value="LABORAL">Motivo laboral</option>
                    <option value="ECONOMICO">Motivo económico</option>
                    <option value="PERSONAL">Motivo personal</option>
                    <option value="EN_PROCESO">Está en proceso</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </label>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full sm:w-auto px-6 py-3 rounded-xl font-black uppercase tracking-wide text-white bg-[var(--nav-bg)] hover:opacity-90 disabled:opacity-60 transition inline-flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </button>

          <p className="text-xs text-[var(--muted)]">
            Los campos marcados con * son obligatorios. Si ya está registrado, su solicitud
            no se duplicará: revise el correo de contacto que registró.
          </p>
        </form>
      </div>
    </main>
  );
}