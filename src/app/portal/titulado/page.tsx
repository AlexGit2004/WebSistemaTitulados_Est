"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { validarSectorOtro } from "@/lib/sectorOtro";

export default function TituladoPortal() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [sector, setSector] = useState<string>("");
  const [otroSector, setOtroSector] = useState<string>("");
  const [otroError, setOtroError] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.rol !== "TITULADO" && user.rol !== "admin") router.push("/login");
  }, [loading, user]);

  useEffect(() => {
    if (user?.ci) fetch(`/api/personas?ci=${encodeURIComponent(user.ci)}`).then(r=>r.json()).then(d=>{ setData(d); setSector(d.sectorTrabajo||""); setOtroSector(d.sectorTrabajoOtro||""); }).catch(()=>{});
  }, [user]);

  if (loading || !data) return <div className="max-w-3xl mx-auto p-6 text-sm">Cargando formulario titulado...</div>;
  if (data.tipo !== "TITULADO") return <div className="max-w-3xl mx-auto p-6 text-sm text-red-600">Esta cuenta no es de titulado (tipo={data.tipo}). Use CI 6893412LP.</div>;

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: any = {};
    ["correoElectronico","telefono","redesSociales","ciudadRegionTrabajo","estadoLaboral","sectorTrabajo","ocupacionCargo","observaciones","tiempoInsercionLaboralMeses"].forEach(k=> payload[k]=fd.get(k));
    payload.trabajaEnEstadistica = fd.get("trabajaEnEstadistica")==="SI";
    if (fd.get("sectorTrabajo") === "OTRO") {
      // Si escribió algo se valida (palabra coherente); si está vacío solo se envía OTRO
      const err = validarSectorOtro(otroSector);
      if (err) { setOtroError(err); return; }
      payload.sectorTrabajoOtro = otroSector.trim() || null;
    } else payload.sectorTrabajoOtro = null;
    setSaving(true); setMsg("");
    const res = await fetch(`/api/personas?ci=${encodeURIComponent(user!.ci)}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)});
    const j = await res.json();
    setSaving(false);
    if (res.ok) { setData(j); setMsg("Guardado correctamente"); } else setMsg(j.error||"Error");
  };

  const input = "w-full mt-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100";
  const lbl = "text-xs font-bold text-slate-700 dark:text-slate-300";
  const K = "bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed border-slate-200 dark:border-slate-700";
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3 text-xs"><b>Formulario Titulado</b></div>
      <form onSubmit={onSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h1 className="font-black text-lg text-slate-900 dark:text-white">Registro de Titulado — {data.nombresApellidos}</h1>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className={lbl}>Nombres y apellidos<input value={data.nombresApellidos} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Cédula de identidad<input value={data.cedulaIdentidad} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Género<input value={data.genero} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Semestre ingreso<input value={data.semestreIngreso||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Semestre egreso<input value={data.semestreEgreso||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Año titulación<input value={data.anioTitulacion||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Modalidad titulación<input value={data.modalidadTitulacion||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Área especialización<input value={data.areaEspecializacion||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
        </div>
        <hr className="border-slate-200 dark:border-slate-800" />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className={lbl}>Correo electrónico<input name="correoElectronico" defaultValue={data.correoElectronico||""} className={input} /></label>
          <label className={lbl}>Teléfono / celular<input name="telefono" defaultValue={data.telefono||""} className={input} /></label>
          <label className="text-xs font-bold sm:col-span-2 text-slate-700 dark:text-slate-300">Facebook / LinkedIn<input name="redesSociales" defaultValue={data.redesSociales||""} placeholder="URL o usuario" className={input} /></label>
          <label className={lbl}>Estado laboral actual<select name="estadoLaboral" defaultValue={data.estadoLaboral||"DESEMPLEADO"} className={input}><option value="EMPLEADO">Empleado</option><option value="DESEMPLEADO">Desempleado</option><option value="INDEPENDIENTE">Independiente</option></select></label>
          <div>
            <label className={lbl}>Sector donde trabaja<select name="sectorTrabajo" value={sector} onChange={(e)=>setSector(e.target.value)} className={input}><option value="">--</option><option value="PUBLICO">Público</option><option value="PRIVADO">Privado</option><option value="ACADEMICO">Académico</option><option value="ONG">ONG</option><option value="OTRO">Otro</option></select></label>
            {sector === "OTRO" && (
              <label className={`${lbl} mt-3 block`}>Especifique el sector (Otro)<input name="sectorTrabajoOtro" value={otroSector} onChange={(e)=>{ setOtroSector(e.target.value); setOtroError(""); }} placeholder="Ej. Gobierno municipal, organismo internacional, consultora..." className={`${input} ${otroError ? "border-red-500 focus:ring-2 focus:ring-red-600" : ""}`} />
                {otroError && <span className="mt-1.5 block text-[11px] font-bold text-red-600 dark:text-red-400">⚠ {otroError}</span>}
                <span className="mt-1 block text-[10px] text-slate-400">Si deja vac&iacute;o este campo, solo se registrar&aacute; la opci&oacute;n &quot;Otro&quot;.</span>
              </label>
            )}
          </div>
          <label className="text-xs font-bold sm:col-span-2 text-slate-700 dark:text-slate-300">Ocupación / cargo actual<input name="ocupacionCargo" defaultValue={data.ocupacionCargo||""} className={input} /></label>
          <label className={lbl}>Ciudad / región donde trabaja<input name="ciudadRegionTrabajo" defaultValue={data.ciudadRegionTrabajo||""} className={input} /></label>
          <label className={lbl}>Trabaja en Estadística<select name="trabajaEnEstadistica" defaultValue={data.trabajaEnEstadistica?"SI":"NO"} className={input}><option value="SI">Sí</option><option value="NO">No</option></select></label>
          <label className={lbl}>Tiempo inserción laboral (meses)<input name="tiempoInsercionLaboralMeses" type="number" defaultValue={data.tiempoInsercionLaboralMeses||""} className={input} /></label>
          <label className="text-xs font-bold sm:col-span-2 text-slate-700 dark:text-slate-300">Ayudanos con tus sugerencias y observaciones sobre la pagina<textarea name="observaciones" defaultValue={data.observaciones||""} rows={3} className={input} /></label>
        </div>
        {msg && <div className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2">{msg}</div>}
        <button disabled={saving} className="w-full bg-blue-900 hover:bg-blue-800 text-white rounded-xl py-2.5 font-bold disabled:opacity-50">{saving?"Guardando...":"Guardar cambios"}</button>
      </form>
    </div>
  );
}
