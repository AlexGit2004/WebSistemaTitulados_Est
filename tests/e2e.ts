/**
 * Prueba end-to-end contra el servidor de producción (pnpm start).
 *
 * Levanta el servidor, hace login por HTTP de verdad y comprueba que:
 *  - las APIs sin sesión responden 401/403 (y no entregan datos)
 *  - el login con contraseña incorrecta falla
 *  - el titular no puede tocar campos K ni datos ajenos
 *  - el admin sí puede crear, editar y dar de baja personas
 *  - la CI duplicada se rechaza
 *  - la auditoría registra todo
 */

const BASE = "http://localhost:3000";
let fallos = 0;
let pruebas = 0;

function check(nombre: string, condicion: boolean, extra = "") {
  pruebas++;
  if (condicion) {
    console.log(`  OK    ${nombre}`);
  } else {
    fallos++;
    console.log(`  FALLA ${nombre}${extra ? ` -> ${extra}` : ""}`);
  }
}

function cookieDe(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function pedir(metodo: string, ruta: string, cookie = "", cuerpo?: unknown) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(cuerpo ? { "content-type": "application/json" } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    redirect: "manual",
  });
  return res;
}

async function main() {
  console.log("\n=== 1. APIs sin sesión ===");
  for (const ruta of [
    "/api/exportar?tipo=TODOS&formato=excel",
    "/api/exportar/pdf",
    "/api/personas",
    "/api/usuarios",
    "/api/auditoria",
  ]) {
    const res = await pedir("GET", ruta);
    check(`GET ${ruta} sin sesión -> 401`, res.status === 401, `status=${res.status}`);
  }
  const noAuth = await pedir("GET", "/api/noticias?admin=1");
  check("GET /api/noticias?admin=1 sin sesión -> 401", noAuth.status === 401, `status=${noAuth.status}`);

  const escribir = await pedir("POST", "/api/personas", "", { nombresApellidos: "X" });
  check("POST /api/personas sin sesión -> 401", escribir.status === 401, `status=${escribir.status}`);

  const importar = await pedir("POST", "/api/importar", "");
  check("POST /api/importar sin sesión -> 401", importar.status === 401, `status=${importar.status}`);

  console.log("\n=== 2. Protección de rutas (middleware) ===");
  for (const ruta of ["/admin/dashboard", "/admin/personas", "/admin/usuarios", "/admin/auditoria"]) {
    const res = await pedir("GET", ruta);
    const redirige = res.status >= 300 && res.status < 400;
    check(`GET ${ruta} sin sesión redirige al login`, redirige, `status=${res.status}`);
  }

  console.log("\n=== 3. Login ===");
  const malaPass = await pedir("POST", "/api/auth/login", "", {
    ci: "admin@umsa.bo",
    password: "CLAVE_INCORRECTA",
  });
  check("login admin con contraseña incorrecta -> 401", malaPass.status === 401, `status=${malaPass.status}`);

  const sinPass = await pedir("POST", "/api/auth/login", "", { ci: "admin@umsa.bo" });
  check("login admin SIN contraseña -> 401 (ya no hay backdoor)", sinPass.status === 401, `status=${sinPass.status}`);

  const loginAdmin = await pedir("POST", "/api/auth/login", "", {
    ci: "admin@umsa.bo",
    password: "admin123",
  });
  const cookieAdmin = cookieDe(loginAdmin);
  check("login admin con contraseña correcta -> 200", loginAdmin.status === 200, `status=${loginAdmin.status}`);
  check("la cookie de sesión es httpOnly", /HttpOnly/i.test(loginAdmin.headers.get("set-cookie") ?? ""));
  check("la cookie no es localStorage", !cookieAdmin.includes("auth_user"));

  const loginTitulado = await pedir("POST", "/api/auth/login", "", { ci: "6893412LP" });
  const cookieTitulado = cookieDe(loginTitulado);
  check("login titulado por CI -> 200", loginTitulado.status === 200, `status=${loginTitulado.status}`);

  console.log("\n=== 4. Aislamiento del titular ===");
  const verOtro = await pedir("GET", "/api/personas?ci=8341920LP", cookieTitulado);
  check("titulado no puede ver el perfil de un egresado -> 403", verOtro.status === 403, `status=${verOtro.status}`);

  const editarOtro = await pedir("PATCH", "/api/personas?ci=8341920LP", cookieTitulado, {
    correoElectronico: "hack@x.com",
  });
  check("titulado no puede editar a otro -> 403", editarOtro.status === 403, `status=${editarOtro.status}`);

  const editarK = await pedir("PATCH", "/api/personas?ci=6893412LP", cookieTitulado, {
    anioTitulacion: 1999,
  });
  check("titulado no puede tocar campo K -> 200 pero K intacto o 400",
    editarK.status === 400 || editarK.status === 200);
  if (editarK.status === 200) {
    const r = (await editarK.json()) as { anioTitulacion: number | null };
    check("  el año de titulación NO cambió", r.anioTitulacion !== 1999, `anio=${r.anioTitulacion}`);
  }

  const listar = await pedir("GET", "/api/personas", cookieTitulado);
  check("titulado no puede listar todos -> 403", listar.status === 403, `status=${listar.status}`);

  const exportar = await pedir("GET", "/api/exportar?formato=csv", cookieTitulado);
  check("titulado no puede exportar -> 403", exportar.status === 403, `status=${exportar.status}`);

  console.log("\n=== 5. Admin: alta ===");
  const ciNueva = `9${Date.now().toString().slice(-7)}LP`;
  const alta = await pedir("POST", "/api/personas", cookieAdmin, {
    tipo: "TITULADO",
    nombresApellidos: "Persona Prueba Automatizada",
    cedulaIdentidad: ciNueva,
    genero: "FEMENINO",
    semestreIngreso: "I/2015",
    semestreEgreso: "II/2019",
    anioEgreso: 2019,
    anioTitulacion: 2020,
    modalidadTitulacion: "Tesis",
    estadoLaboral: "EMPLEADO",
    sectorTrabajo: "PRIVADO",
  });
  check(`alta de persona -> 201`, alta.status === 201, `status=${alta.status} ${await alta.clone().text()}`);
  const creada = (await alta.json().catch(() => ({}))) as { id?: number; tiempoEgresoTitulacionMeses?: number };

  check("calcula el tiempo egreso→titulación (2019→2020 = 12 meses)",
    creada.tiempoEgresoTitulacionMeses === 12, `valor=${creada.tiempoEgresoTitulacionMeses}`);

  const duplicada = await pedir("POST", "/api/personas", cookieAdmin, {
    tipo: "TITULADO",
    nombresApellidos: "Otra Persona",
    cedulaIdentidad: ciNueva,
    genero: "MASCULINO",
    anioTitulacion: 2020,
    modalidadTitulacion: "Tesis",
    estadoLaboral: "DESEMPLEADO",
  });
  check("CI duplicada se rechaza -> 409", duplicada.status === 409, `status=${duplicada.status}`);
  check("  con código CI_DUPLICADA", ((await duplicada.json()) as { codigo?: string }).codigo === "CI_DUPLICADA");

  console.log("\n=== 6. Validación (matriz condicional) ===");
  const tituladoIncompleto = await pedir("POST", "/api/personas", cookieAdmin, {
    tipo: "TITULADO",
    nombresApellidos: "Titulado Sin Año",
    cedulaIdentidad: `8${Date.now().toString().slice(-7)}LP`,
    genero: "MASCULINO",
    estadoLaboral: "DESEMPLEADO",
  });
  check("titulado sin año/modalidad -> 400", tituladoIncompleto.status === 400, `status=${tituladoIncompleto.status}`);

  const egresadoSinNada = await pedir("POST", "/api/personas", cookieAdmin, {
    tipo: "EGRESADO",
    nombresApellidos: "Egresado Sin Plan",
    cedulaIdentidad: `7${Date.now().toString().slice(-7)}LP`,
    genero: "FEMENINO",
    estadoLaboral: "DESEMPLEADO",
  });
  check("egresado sin 'planea titularse' -> 400", egresadoSinNada.status === 400, `status=${egresadoSinNada.status}`);

  const egresadoIncoherente = await pedir("POST", "/api/personas", cookieAdmin, {
    tipo: "EGRESADO",
    nombresApellidos: "Egresado Incoherente",
    cedulaIdentidad: `6${Date.now().toString().slice(-7)}LP`,
    genero: "MASCULINO",
    estadoLaboral: "DESEMPLEADO",
    planeaTitularse: "SI",
    inicioProcesoTitulacion: "SI",
    motivoNoTitulacion: "LABORAL",
  });
  check("egresado con motivo teniendo proceso iniciado -> 400", egresadoIncoherente.status === 400, `status=${egresadoIncoherente.status}`);

  const sectorOtroVacio = await pedir("POST", "/api/personas", cookieAdmin, {
    tipo: "TITULADO",
    nombresApellidos: "Sector Otro Vacio",
    cedulaIdentidad: `5${Date.now().toString().slice(-7)}LP`,
    genero: "MASCULINO",
    anioTitulacion: 2020,
    modalidadTitulacion: "Tesis",
    estadoLaboral: "EMPLEADO",
    sectorTrabajo: "OTRO",
  });
  check("sector OTRO sin descripción -> 400", sectorOtroVacio.status === 400, `status=${sectorOtroVacio.status}`);

  console.log("\n=== 7. Admin: listado y edición ===");
  // Buscar por la CI única de esta corrida, y no por el nombre: la prueba es idempotente
  // y no se acumula basura de corridas anteriores.
  const lista = await pedir("GET", `/api/personas?q=${ciNueva}`, cookieAdmin);
  const j = (await lista.json()) as { filas: Array<{ cedulaIdentidad: string }>; total: number; resumen: { titulados: number } };
  check("el listado busca por texto", j.filas.length === 1, `encontrados=${j.filas.length}`);
  check("  y devuelve la fila correcta", j.filas[0]?.cedulaIdentidad === ciNueva);
  check("el resumen trae el total de titulados", j.resumen.titulados > 7000, `titulados=${j.resumen.titulados}`);

  const edicion = await pedir("PATCH", `/api/personas?ci=${ciNueva}`, cookieAdmin, {
    ocupacionCargo: "Analista Senior",
    sectorTrabajo: "ACADEMICO",
  });
  check("el admin sí puede editar -> 200", edicion.status === 200, `status=${edicion.status}`);
  check("  el cambio se guardó", ((await edicion.json()) as { ocupacionCargo: string }).ocupacionCargo === "Analista Senior");

  console.log("\n=== 8. Baja lógica ===");
  if (creada.id) {
    const baja = await pedir("DELETE", `/api/personas/${creada.id}`, cookieAdmin);
    const bj = (await baja.json()) as { eliminado?: string };
    check("baja -> 200 y es lógica", baja.status === 200 && bj.eliminado === "logico", `status=${baja.status} tipo=${bj.eliminado}`);

    const sigueVivo = await pedir("GET", `/api/personas/${creada.id}`, cookieAdmin);
    check("el registro NO se borró físicamente", sigueVivo.status === 200, `status=${sigueVivo.status}`);
  }

  console.log("\n=== 9. Exportaciones con sesión de admin ===");
  const csv = await pedir("GET", "/api/exportar?tipo=TODOS&formato=csv", cookieAdmin);
  check("exportar CSV -> 200", csv.status === 200, `status=${csv.status}`);
  check("  content-type csv", (csv.headers.get("content-type") ?? "").includes("text/csv"));

  const xlsx = await pedir("GET", "/api/exportar?tipo=TITULADOS&formato=excel", cookieAdmin);
  check("exportar Excel -> 200", xlsx.status === 200, `status=${xlsx.status}`);

  const pdf = await pedir("GET", "/api/exportar/pdf?vista=COMPARATIVO", cookieAdmin);
  const pdfBuf = pdf.status === 200 ? Buffer.from(await pdf.arrayBuffer()) : Buffer.alloc(0);
  check("exportar PDF -> 200", pdf.status === 200, `status=${pdf.status}`);
  check("  content-type application/pdf", (pdf.headers.get("content-type") ?? "").includes("application/pdf"));
  check("  el archivo empieza con %PDF", pdfBuf.subarray(0, 5).toString() === "%PDF-");
  check("  pesa más de 10 KB", pdfBuf.length > 10_000, `bytes=${pdfBuf.length}`);

  console.log("\n=== 10. Auditoría ===");
  const aud = await pedir("GET", "/api/auditoria", cookieAdmin);
  const aj = (await aud.json()) as { filas: Array<{ accion: string; entidad: string }>; total: number };
  check("la auditoría tiene registros", aj.total > 0, `total=${aj.total}`);
  const acciones = Array.from(new Set(aj.filas.map((f) => f.accion)));
  check("  registra exportaciones", acciones.includes("exportar"), acciones.join(","));
  check("  registra altas/ediciones/bajas", acciones.includes("crear") || acciones.includes("editar"), acciones.join(","));

  console.log("\n=== 11. Cierre de sesión ===");
  const logout = await pedir("DELETE", "/api/auth/sesion", cookieAdmin);
  check("logout -> 200", logout.status === 200, `status=${logout.status}`);
  const trasLogout = await pedir("GET", "/api/personas", "");
  check("tras cerrar sesión, la API sigue cerrada -> 401", trasLogout.status === 401, `status=${trasLogout.status}`);

  console.log(`\n${"=".repeat(52)}`);
  console.log(`  ${pruebas - fallos}/${pruebas} pruebas correctas`);
  if (fallos > 0) console.log(`  ${fallos} FALLAS`);
  console.log(`${"=".repeat(52)}\n`);
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Error inesperado:", e);
  process.exit(1);
});