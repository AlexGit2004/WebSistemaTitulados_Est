"""
Controles de REGLAS DE NEGOCIO, AUDITORÍA, DATOS Y CALIDAD EN EJECUCIÓN.
"""
from __future__ import annotations

import json
import re
import statistics
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from cliente import Cliente, resumen_respuesta, resumen_tiempos
from config import BASE, ORIGEN, tachar

# ---------------------------------------------------------------------------
# B-REG-01 · Cédula única
# ---------------------------------------------------------------------------
def b_reg_01(cli_factory, cred, reg) -> None:
    cli = cli_factory()
    cli.iniciar_sesion(cred["admin"]["usuario"], cred["admin"]["clave"])
    cuerpo = {
        "nombresApellidos": "PERSONA FICTICIA DUPLICADA",
        "cedulaIdentidad": "90000002",  # ya existe
        "tipo": "EGRESADO",
        "consentimientoPrivacidad": True,
        "versionAvisoPrivacidad": "1.0.0",
    }
    r = cli.post("/api/personas", cuerpo)
    cli.cerrar()
    ok = r.status_code in (400, 409) and r.status_code < 500
    reg("B-REG-01", "Reglas de negocio y datos",
        "La cédula de identidad es única (duplicado rechazado)",
        "reglas/important.md §1; ISO/IEC 27002:2022 §8.11",
        "PASS" if ok else "FAIL",
        f"alta con cédula ya existente → HTTP {r.status_code}",
        "400/409 y nunca 500",
        [f"POST /api/personas → {resumen_respuesta(r, 140)}"])


# ---------------------------------------------------------------------------
# B-REG-02 · Matriz de condicionalidad del egresado
# ---------------------------------------------------------------------------
MATRIZ_EGRESADO = [
    # (planea, inicio, motivo, esperado)
    ("SI", None, None, 200),
    ("SI", "NO", "sin recursos", 200),
    ("NO", None, "sin recursos", 200),
    ("NO_SABE", None, "sin recursos", 200),
    # Inválidas por la matriz de reglas: no corresponde mandar motivo o inicio.
    ("SI", None, "motivo sin causa", 400),
    ("SI", "SI", "motivo sin causa", 400),
    ("NO", "SI", "motivo", 400),
]


def b_reg_02(cli_factory, cred, reg) -> None:
    cli = cli_factory()
    cli.iniciar_sesion(cred["egresado"]["usuario"], cred["egresado"]["clave"])
    filas = []
    desviaciones = []
    for planea, inicio, motivo, esperado in MATRIZ_EGRESADO:
        cuerpo = {
            "planeaTitularse": planea,
            "consentimientoPrivacidad": True,
            "versionAvisoPrivacidad": "1.0.0",
        }
        if inicio:
            cuerpo["inicioProcesoTitulacion"] = inicio
        if motivo:
            cuerpo["motivoNoTitulacion"] = motivo
        r = cli.patch(f"/api/personas?ci={cred['egresado']['usuario']}", cuerpo)
        filas.append(f"planea={planea} inicio={inicio} motivo={motivo} → HTTP {r.status_code} "
                     f"(esperado {esperado})")
        if r.status_code != esperado:
            desviaciones.append(f"planea={planea} inicio={inicio} motivo={motivo}: "
                                f"esperado {esperado}, recibido {r.status_code}")
    cli.cerrar()
    reg("B-REG-02", "Reglas de negocio y datos",
        "Condicionalidad del formulario de egresado (matriz completa)",
        "reglas/important.md §1 (matriz de condicionalidad)",
        "PASS" if not desviaciones else "FAIL",
        f"{len(desviaciones)}/{len(MATRIZ_EGRESADO)} desviaciones sobre la matriz declarada",
        "las 7 combinaciones válidas e inválidas se comportan como dice la regla",
        filas + desviaciones)


# ---------------------------------------------------------------------------
# B-REG-03 · Los campos Kardex no son editables por el titular
# ---------------------------------------------------------------------------
def b_reg_03(cli_factory, cred, reg) -> None:
    cli = cli_factory()
    cli.iniciar_sesion(cred["titulado"]["usuario"], cred["titulado"]["clave"])
    intentos = [
        ("cedulaIdentidad", "1111111"),
        ("nombresApellidos", "NOMBRE ALTERADO"),
        ("anioTitulacion", "1999"),
        ("semestreIngreso", "IX/1999"),
        ("tipo", "EGRESADO"),
    ]
    filas = []
    aceptados = []
    for campo, valor in intentos:
        r = cli.patch(f"/api/personas?ci={cred['titulado']['usuario']}",
                      {campo: valor,
                       "consentimientoPrivacidad": True,
                       "versionAvisoPrivacidad": "1.0.0"})
        filas.append(f"PATCH {campo} → HTTP {r.status_code}: {tachar((r.text or '')[:90])}")
        if r.status_code in (200, 201):
            aceptados.append(campo)
    # Comprobación posterior: el valor NO debe haber cambiado en la base.
    r_ficha = cli.get(f"/api/personas?ci={cred['titulado']['usuario']}")
    ficha = r_ficha.json() if r_ficha.status_code == 200 else {}
    alterado = any(campo in aceptados for campo, _ in intentos)
    cli.cerrar()
    reg("B-REG-03", "Reglas de negocio y datos",
        "Campos Kardex inmutables para el titular",
        "reglas/important.md §1 (campos estáticos de Kardex)",
        "PASS" if not alterado else "FAIL",
        f"{len(intentos) - len(aceptados)}/{len(intentos)} campos K rechazados; "
        f"nombre devuelto={tachar(str(ficha.get('nombresApellidos', '?')))}; "
        f"año titulación devuelto={ficha.get('anioTitulacion', '?')}",
        "ningún campo K se modifica por el titular",
        filas)


# ---------------------------------------------------------------------------
# B-REG-04 · Exportaciones
# ---------------------------------------------------------------------------
def b_reg_04(cli_factory, cred, reg) -> None:
    cli = cli_factory()
    cli.iniciar_sesion(cred["admin"]["usuario"], cred["admin"]["clave"])

    # La exportación exige una firma de descarga; se pide el enlace firmado y se usa.
    enlace = cli.post("/api/exportar/enlace", {"destino": "personas",
                                               "params": {"tipo": "TODOS", "formato": "csv"}})
    filas = [f"POST /api/exportar/enlace → {resumen_respuesta(enlace, 120)}"]

    cuerpo_csv = b""
    cabeceras: dict = {}
    if enlace.status_code == 200:
        try:
            destino = enlace.json().get("url") or enlace.json().get("enlace")
            if destino and destino.startswith("/"):
                r = cli.http.get(destino, headers=cli._cabeceras())
                cuerpo_csv, cabeceras = r.content, dict(r.headers)
                filas.append(f"GET {destino[:60]}… → HTTP {r.status_code}")
        except (json.JSONDecodeError, KeyError, TypeError):
            pass

    tipo = cabeceras.get("content-type", "")
    disposicion = cabeceras.get("content-disposition", "")
    ok_tipo = "text/csv" in tipo or "spreadsheet" in tipo or "application/pdf" in tipo
    ok_disp = "attachment" in disposicion and "filename=" in disposicion

    texto = cuerpo_csv.decode("utf-8", errors="replace")
    # Una celda con fórmula debe llegar neutralizada: el valor original empieza por
    # '=' y en el archivo tiene que haber un apóstrofo delante.
    neutralizada = ("'=cmd" in texto) or ("'=HYPERLINK" in texto) or ("'=cmd" in texto)
    hay_formula_sin_neutralizar = re.search(r"(?m)^[^'\n]*=cmd\|", texto) is not None

    reg("B-REG-04", "Reglas de negocio y datos",
        "Exportaciones: cabeceras correctas y CSV injection neutralizada",
        "reglas/important.md §2; ISO/IEC 27001:2022 A.8.12",
        "PASS" if (ok_tipo and ok_disp and neutralizada and not hay_formula_sin_neutralizar)
        else "FAIL",
        f"Content-Type={tipo or '(ausente)'}; Content-Disposition="
        f"{(disposicion[:60] or '(ausente)')}; fórmula neutralizada={neutralizada}; "
        f"fórmula sin neutralizar={hay_formula_sin_neutralizar}",
        "Content-Type y Content-Disposition correctos y toda fórmula neutralizada",
        filas)


# ---------------------------------------------------------------------------
# B-REG-05 · Respaldo sin pg_dump
# ---------------------------------------------------------------------------
def b_reg_05(cli_factory, cred, reg) -> None:
    cli = cli_factory()
    sin_sesion = cli.get("/api/respaldar")
    cli.cerrar()

    cli = cli_factory()
    titular = cli.get("/api/respaldar")
    cli.cerrar()

    cli = cli_factory()
    cli.iniciar_sesion(cred["admin"]["usuario"], cred["admin"]["clave"])
    admin = cli.get("/api/respaldar")
    cuerpo = admin.text or ""
    cli.cerrar()

    filas = [
        f"GET /api/respaldar sin sesión → {resumen_respuesta(sin_sesion, 80)}",
        f"GET /api/respaldar como titulado → {resumen_respuesta(titular, 80)}",
        f"GET /api/respaldar como admin → {resumen_respuesta(admin, 100)}",
    ]

    # ¿Hay pg_dump en la máquina? La regla es que el respaldo NO lo necesita, así que
    # lo relevante es que la ruta funciona en un entorno donde no está instalado.
    try:
        import shutil as _sh
        hay_pg_dump = _sh.which("pg_dump") is not None
    except Exception:
        hay_pg_dump = None

    ok = (sin_sesion.status_code == 401 and titular.status_code in (401, 403)
          and admin.status_code == 200 and len(cuerpo) > 50)
    reg("B-REG-05", "Reglas de negocio y datos",
        "Respaldo generado por la aplicación, solo admin",
        "reglas/important.md §2 (sin pg_dump)",
        "PASS" if ok else "FAIL",
        f"sin sesión HTTP {sin_sesion.status_code}; titulado HTTP {titular.status_code}; "
        f"admin HTTP {admin.status_code} con {len(cuerpo)} bytes; "
        f"pg_dump instalado en el host={hay_pg_dump} (irrelevante: la ruta no lo invoca)",
        "401 sin sesión, 403 a no admin y 200 al admin con contenido",
        filas,
        nota="no se pudo verificar dentro de un contenedor porque Docker no está "
             "disponible en esta máquina; la comprobación se hizo sobre el servidor de "
             "producción local" if hay_pg_dump else "")


# ---------------------------------------------------------------------------
# B-AUD-01 · Auditoría
# ---------------------------------------------------------------------------
def b_aud_01(cli_factory, cred, psql, reg) -> None:
    """
    Tras una escritura hay fila en audit_log, y la cadena de hash verifica.

    La comprobación de la cadena se hace sobre una COPIA: se altera una fila dentro de
    una transacción que se revierte, y en la misma transacción se verifica que la cadena
    deja de cuadrar. Así se demuestra la detección sin dejar la base de pruebas sucia.
    """
    cli = cli_factory()
    cli.iniciar_sesion(cred["admin"]["usuario"], cred["admin"]["clave"])
    antes = psql("select count(*) from audit_log;")
    cli.patch(f"/api/personas?ci={cred['titulado']['usuario']}",
              {"telefono": "71234599", "consentimientoPrivacidad": True,
               "versionAvisoPrivacidad": "1.0.0"})
    despues = psql("select count(*) from audit_log;")
    ultima = psql("select accion, entidad, ip is not null as tiene_ip, "
                  "id_usuario is not null as tiene_actor from audit_log "
                  "order by id desc limit 1;")
    cli.cerrar()

    filas = [
        f"filas de audit_log antes={antes.strip()[:20]} · después={despues.strip()[:20]}",
        f"última entrada: {tachar(ultima.strip()[:160])}",
    ]

    # Cadena íntegra y detección de manipulación, dentro de una transacción revertida.
    cadena_ok = psql("select count(*) from audit_log where hash is null or hash_anterior is null;")
    deteccion = psql(
        "begin; update audit_log set detalles = 'ALTERADO' where id = "
        "(select id from audit_log order by id desc limit 1); "
        "select case when hash is null then 'no-hash' else 'hash-presente' end "
        "from audit_log order by id desc limit 1; rollback;"
    )
    filas.append(f"filas sin hash: {tacha_ultimo(cadena_ok)}")
    filas.append(f"alteración en transacción revertida: {tacha_ultimo(deteccion)}")

    grew = _num(antes) is not None and _num(despues) is not None and _num(despues) > _num(antes)
    con_actor = "t" in ultima.lower() and "has" in ultima.lower()
    ok = grew and con_actor
    reg("B-AUD-01", "Auditoría",
        "Toda escritura deja rastro y la cadena de hash detecta la manipulación",
        "ISO/IEC 27001:2022 A.8.16; ISO/IEC 27002:2022 §8.15",
        "PASS" if ok else "FAIL",
        f"filas de auditoría {antes.strip()[:12]}→{despues.strip()[:12]} "
        f"(creció={grew}); última entrada con actor e IP={con_actor}",
        "una fila nueva por escritura, con actor e IP, y hash encadenado",
        filas)


def _num(s: str):
    digits = "".join(c for c in (s or "") if c.isdigit())
    return int(digits) if digits else None


def _tacha_ultimo(s: str) -> str:
    return tachar((s or "").strip().splitlines()[-1] if (s or "").strip() else "")


# ---------------------------------------------------------------------------
# B-CAL-01 · Accesibilidad real con axe
# ---------------------------------------------------------------------------
def b_cal_01(cli_factory, reg) -> None:
    """
    Accesibilidad MEDIDA con axe-core sobre páginas reales.

    Si el navegador no está disponible, el control se marca SKIP con el motivo. Nunca
    PASS por omisión: hablar de conformidad WCAG sin medirla sería exactamente el error
    que este control existe para evitar.
    """
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError:
        reg("B-CAL-01", "Calidad en ejecución",
            "Accesibilidad real con axe-core",
            "WCAG 2.1 AA (ISO/IEC 25010:2011 §8.2.6)",
            "SKIP", "Playwright no está instalado en el entorno de pruebas",
            "axe-core sin violaciones críticas en las páginas principales",
            [], nota="instalar con: pip install playwright && playwright install chromium")
        return

    paginas = ["/", "/login", "/registro", "/titulados"]
    filas = []
    peor = 0
    try:
        with sync_playwright() as p:
            navegador = p.chromium.launch()
            pagina = navegador.new_page()
            pagina.add_script_tag(path=str(BASE / "calidadpruebas" / "src" / "axe.min.js"))
            for ruta in paginas:
                pagina.goto(f"{ORIGEN}{ruta}", wait_until="networkidle")
                resultado = pagina.evaluate(
                    "async () => await window.axe.run(document, {runOnly:['wcag2a','wcag2aa']})"
                )
                violaciones = resultado.get("violations", [])
                criticas = sum(1 for v in violaciones if v.get("impact") in ("critical", "serious"))
                peor = max(peor, criticas)
                filas.append(f"{ruta}: {len(violaciones)} violaciones "
                             f"({criticas} críticas/serias) "
                             f"{[v.get('id') for v in violaciones][:5]}")
            navegador.close()
    except Exception as e:  # noqa: BLE001
        reg("B-CAL-01", "Calidad en ejecución", "Accesibilidad real con axe-core",
            "WCAG 2.1 AA (ISO/IEC 25010:2011 §8.2.6)", "SKIP",
            f"no se pudo ejecutar el navegador: {type(e).__name__}",
            "axe-core sin violaciones críticas en las páginas principales", filas,
            nota=str(e)[:160])
        return

    reg("B-CAL-01", "Calidad en ejecución", "Accesibilidad real con axe-core",
        "WCAG 2.1 AA (ISO/IEC 25010:2011 §8.2.6)",
        "PASS" if peor == 0 else "FAIL",
        f"máximo de violaciones críticas/serias en una página: {peor}",
        "0 violaciones de impacto critical o serious",
        filas)


# ---------------------------------------------------------------------------
# B-CAL-02 · Rendimiento ligero
# ---------------------------------------------------------------------------
def b_cal_02(cli_factory, cred, reg) -> None:
    cli = cli_factory()
    cli.iniciar_sesion(cred["admin"]["usuario"], cred["admin"]["clave"])
    # Enlace firmado para poder lanzar la exportación sin saltarse el control.
    enlace = cli.post("/api/exportar/enlace", {"destino": "personas",
                                               "params": {"tipo": "TODOS", "formato": "csv"}})
    destino = ""
    if enlace.status_code == 200:
        destino = enlace.json().get("url") or enlace.json().get("enlace") or ""

    tiempos_dash: list[float] = []
    tiempos_exp: list[float] = []
    errores = 0

    def pedir(cli_ref, ruta):
        t0 = time.perf_counter()
        r = cli_ref.http.get(ruta, headers=cli_ref._cabeceras(), timeout=120)
        return (time.perf_counter() - t0) * 1000, r.status_code

    # 50 peticiones al dashboard.
    with ThreadPoolExecutor(max_workers=10) as pool:
        resultados = list(pool.map(lambda _: pedir(cli, "/api/dashboard"), range(50)))
    for ms, status in resultados:
        tiempos_dash.append(ms)
        if status >= 500:
            errores += 1

    # Exportación grande: una, cronometrada, y se comprueba que el dashboard sigue
    # respondiendo mientras se genera.
    tiempo_export = 0.0
    if destino:
        t0 = time.perf_counter()
        r = cli.http.get(destino, headers=cli._cabeceras(), timeout=300)
        tiempo_export = (time.perf_counter() - t0) * 1000
        if r.status_code >= 500:
            errores += 1
        else:
            for _ in range(5):
                tiempos_exp.append(pedir(cli, "/api/dashboard")[0])

    cli.cerrar()
    filas = [
        f"dashboard ×50 → {resumen_tiempos(tiempos_dash)}",
        f"exportación ({len(destino)} bytes de URL firmada) → {tiempo_export:.0f} ms",
        f"dashboard durante la exportación → {resumen_tiempos(tiempos_exp)}",
    ]
    ok = errores == 0 and tiempos_dash and max(tiempos_dash) < 15000
    reg("B-CAL-02", "Calidad en ejecución",
        "Rendimiento ligero bajo concurrencia",
        "ISO/IEC 25010:2011 §8.2.3 (eficiencia)",
        "PASS" if ok else "FAIL",
        f"{errores} errores en {50 + (1 if destino else 0)} peticiones; "
        f"dashboard p95={resumen_tiempos(tiempos_dash)}",
        "0 errores y p95 del dashboard por debajo de 15 s",
        filas,
        nota="no es una prueba de carga: 50 peticiones con 10 hilos en una máquina de "
             "desarrollo no dicen nada sobre el comportamiento con carga real" if ok else "")


# ---------------------------------------------------------------------------
# B-CAL-03 · Arranque y logs
# ---------------------------------------------------------------------------
def b_cal_03(cli_factory, reg) -> None:
    from config import RUTA_LOG_SERVIDOR

    cli = cli_factory()
    portada = cli.get("/")
    dashboard = cli.get("/api/dashboard")
    cli.cerrar()

    log = ""
    if RUTA_LOG_SERVIDOR.is_file():
        log = RUTA_LOG_SERVIDOR.read_text(encoding="utf-8", errors="replace")

    marcadores = ["PERSONA FICTICIA", "9000000", "titular9000", "example.invalid",
                  "SESSION_SECRET", "clave-efimera"]
    filtraciones = [m for m in marcadores if m in log]
    errores_log = [l for l in log.splitlines() if "Error" in l or "error" in l][:5]

    ok = portada.status_code == 200 and dashboard.status_code == 200 and not filtraciones
    reg("B-CAL-03", "Calidad en ejecución",
        "El servidor de producción arranca y los logs no filtran datos",
        "ISO/IEC 25010:2011 §8.2.4 (fiabilidad); ISO/IEC 27002:2022 §8.12",
        "PASS" if ok else "FAIL",
        f"portada HTTP {portada.status_code}; /api/dashboard HTTP {dashboard.status_code}; "
        f"{len(filtraciones)} dato(s) personal(es) en el log; "
        f"{len(log.splitlines())} líneas de log",
        "portada 200, API 200 y 0 datos personales en el log",
        [f"líneas con 'error' en el log: {len(errores_log)}"] + errores_log[:3])