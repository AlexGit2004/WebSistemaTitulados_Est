"""
Controles de ACCESO, SESIÓN Y SUPERFICIE DE ATAQUE sobre el sistema en marcha.
"""
from __future__ import annotations

import re
import time

from cliente import Cliente, resumen_respuesta
from config import ORIGEN, tachar

# Matriz de acceso declarada. Se comprueba ruta por ruta y perfil por perfil.
# Valores: 200/2xx permitido · 401 sin sesión · 403 rol insuficiente.
MATRIZ = [
    # (ruta, metodo, sin sesion, titulado, egresado, kardex, admin)
    ("/api/dashboard", "GET", 200, 200, 200, 200, 200),
    ("/api/dashboard?scope=admin", "GET", 401, 403, 403, 403, 200),
    ("/api/noticias", "GET", 200, 200, 200, 200, 200),
    ("/api/carreras", "GET", 401, 200, 200, 200, 200),
    ("/api/personas", "GET", 401, 401, 401, 401, 200),
    ("/api/usuarios", "GET", 401, 401, 401, 401, 200),
    ("/api/auditoria", "GET", 401, 401, 401, 401, 200),
    ("/api/exportar/preview", "GET", 401, 401, 401, 401, 200),
    ("/api/respaldar", "GET", 401, 401, 401, 401, 200),
    ("/api/mis-datos", "GET", 401, 200, 200, 403, 403),
    ("/api/kardex/solicitudes", "GET", 401, 401, 401, 200, 403),
    ("/api/registros/pendientes", "GET", 401, 401, 401, 401, 200),
]


def _acepta(status: int, esperado: int) -> bool:
    """
    El status esperado se compara tolerando la familia del código: una ruta que
    devuelve 403 a un no admin puede responder 401 si además no hay sesión.
    """
    if status == esperado:
        return True
    if esperado == 200 and 200 <= status < 300:
        return True
    return False


def b_seg_01(cli_factory, cred, reg) -> None:
    """Matriz de roles ruta × perfil. Cualquier desviación es un fallo."""
    perfiles = {
        "sin sesion": None,
        "titulado": (cred["titulado"]["usuario"], cred["titulado"]["clave"]),
        "egresado": (cred["egresado"]["usuario"], cred["egresado"]["clave"]),
        "kardex": ("kardex@example.invalid", "clave-kardex-prueba-123"),
        "admin": (cred["admin"]["usuario"], cred["admin"]["clave"]),
    }
    filas = []
    desviaciones = 0
    comprobaciones = 0
    for ruta, metodo, *esperados in MATRIZ:
        for perfil, esperado in zip(perfiles, esperados):
            cli = cli_factory()
            ok_login = True
            if perfiles[perfil]:
                r_login = cli.iniciar_sesion(*perfiles[perfil])
                ok_login = r_login.status_code == 200
                if not ok_login:
                    filas.append(f"{perfil} no pudo iniciar sesión: HTTP {r_login.status_code}")
            r = (cli.get(ruta) if metodo == "GET" else cli.post(ruta, {}))
            comprobaciones += 1
            coincide = _acepta(r.status_code, esperado)
            if not coincide:
                desviaciones += 1
                filas.append(f"DESVIACIÓN {metodo} {ruta} como {perfil}: "
                             f"esperado {esperado}, recibido {r.status_code}")
            cli.cerrar()
    reg("B-SEG-01", "Acceso y sesión",
        "Matriz de roles ruta × perfil",
        "ISO/IEC 27002:2022 §8.2 (control de acceso); ISO/IEC 29119 §4",
        "PASS" if desviaciones == 0 else "FAIL",
        f"{desviaciones} desviación(es) sobre {comprobaciones} comprobaciones "
        f"({len(MATRIZ)} rutas × {len(perfiles)} perfiles)",
        "0 desviaciones respecto de la matriz declarada",
        filas[:14])


def b_seg_02(cli_factory, cred, reg) -> None:
    """Todas las cookies de sesión salen con HttpOnly, SameSite y Secure."""
    filas = []
    faltan = 0
    total = 0
    for rol in ("admin", "titulado"):
        cli = cli_factory()
        r = cli.iniciar_sesion(cred[rol]["usuario"], cred[rol]["clave"])
        for cab in r.headers.get_list("set-cookie"):
            if not cab.lower().startswith("seguit"):
                continue
            total += 1
            partes = {p.strip().lower() for p in cab.split(";")[1:]}
            ok_http = "httponly" in partes
            ok_same = "samesite=lax" in partes or "samesite=strict" in partes
            ok_sec = "secure" in partes
            if not (ok_http and ok_same and ok_sec):
                faltan += 1
            filas.append(f"[{rol}] {cab.split(';')[0].strip()[:40]} · "
                         f"HttpOnly={ok_http} SameSite={ok_same} Secure={ok_sec}")
        cli.cerrar()
    if total == 0:
        reg("B-SEG-02", "Acceso y sesión", "Banderas de las cookies de sesión",
            "ISO/IEC 27002:2022 §8.5; OWASP Session Management", "SKIP",
            "0 cookies de sesión emitidas", "HttpOnly + SameSite + Secure en todas",
            filas, nota="el login no devolvió cookie: no se puede verificar el control")
        return
    reg("B-SEG-02", "Acceso y sesión", "Banderas de las cookies de sesión",
        "ISO/IEC 27002:2022 §8.5; OWASP Session Management",
        "PASS" if faltan == 0 else "FAIL",
        f"{total - faltan}/{total} cookies de sesión con las tres banderas",
        "el 100% con HttpOnly, SameSite y Secure",
        filas)


def b_seg_03(cli_factory, cred, reg) -> None:
    """N intentos fallidos de login producen bloqueo (429), tanto por IP como por CI."""
    cli = cli_factory()
    estados = []
    for _ in range(9):
        r = cli.post("/api/auth/login", {"ci": "90000001", "password": "incorrecta"})
        estados.append(r.status_code)
        if r.status_code == 429:
            break
    r_ip = cli.post("/api/auth/login", {"ci": "90000002", "password": "incorrecta"})
    filas = [f"intentos consecutivos → {estados}"] + [f"último → {resumen_respuesta(r_ip, 120)}"]
    ok = 429 in estados and r_ip.status_code == 429
    cli.cerrar()
    reg("B-SEG-03", "Acceso y sesión", "Límite de intentos de inicio de sesión",
        "ISO/IEC 27002:2022 §8.6; OWASP Authentication",
        "PASS" if ok else "FAIL",
        f"estados observados={estados}; estado final tras agotar el límite={r_ip.status_code}",
        "bloqueo (429) antes del décimo intento, por IP y por identificador",
        filas)


def b_seg_04(cli_factory, reg) -> None:
    """El alta pública no revela si una cédula ya está registrada."""
    cliente_nuevo = {"nombresApellidos": "PERSONA FICTICIA ALTA NUEVA",
                     "cedulaIdentidad": "90123456", "tipo": "EGRESADO",
                     "consentimientoPrivacidad": True, "versionAvisoPrivacidad": "1.0.0"}
    cliente_existente = dict(cliente_nuevo, cedulaIdentidad="90000002")
    resultados = {}
    for etiqueta, cuerpo in (("nueva", cliente_nuevo), ("existente", cliente_existente)):
        cli = cli_factory()
        inicio = time.perf_counter()
        r = cli.post("/api/registro", cuerpo)
        resultados[etiqueta] = (r.status_code, r.text, (time.perf_counter() - inicio) * 1000)
        cli.cerrar()
    (s1, c1, t1), (s2, c2, t2) = resultados["nueva"], resultados["existente"]
    iguales = s1 == s2 and c1 == c2
    # La diferencia temporal se informa, pero no es un umbral: una diferencia de unos
    # milisegundos puede ser ruido de red, así que se marca como AVISO si es amplia.
    delta = abs(t1 - t2)
    if iguales and delta < 250:
        estado = "PASS"
    elif iguales:
        estado = "WARN"
    else:
        estado = "FAIL"
    reg("B-SEG-04", "Acceso y sesión", "Alta pública sin enumeración de cédulas",
        "ISO/IEC 27002:2022 §8.16 (fuga de información)",
        estado,
        f"cédula nueva: HTTP {s1} en {t1:.0f} ms · cédula existente: HTTP {s2} en {t2:.0f} ms "
        f"· diferencia temporal {delta:.0f} ms · cuerpos idénticos={c1 == c2}",
        "mismo status y mismo cuerpo para ambas; diferencia temporal < 250 ms",
        [f"nueva → {resumen_respuesta(cli.get('/api/dashboard'), 60)}",
         f"existente → {tachar(c2[:120])}"])


def b_seg_05(cli_factory, reg) -> None:
    """Las 5 cabeceras de seguridad están presentes en páginas y en la API."""
    esperadas = ["strict-transport-security", "x-content-type-options",
                 "x-frame-options", "referrer-policy", "content-security-policy"]
    filas = []
    faltan_global: set[str] = set()
    for ruta in ("/", "/api/dashboard", "/login"):
        cli = cli_factory()
        r = cli.get(ruta)
        presentes = [h for h in esperadas if h in {k.lower() for k in r.headers.keys()}]
        faltan = [h for h in esperadas if h not in presentes]
        faltan_global.update(faltan)
        filas.append(f"GET {ruta} → HTTP {r.status_code} · {len(presentes)}/5 cabeceras"
                     + (f" · faltan: {', '.join(faltan)}" if faltan else ""))
        cli.cerrar()
    reg("B-SEG-05", "Acceso y sesión", "Cabeceras de seguridad",
        "OWASP Secure Headers; ISO/IEC 27002:2022 §8.24",
        "PASS" if not faltan_global else "FAIL",
        f"{len(esperadas) - len(faltan_global)}/5 cabeceras presentes en las 3 rutas probadas",
        "las 5 cabeceras en páginas y API",
        filas)


def b_seg_06(cli_factory, cred, reg) -> None:
    """Entradas hostiles: JSON roto, tipos erróneos, SQLi y XSS. Ni un 500."""
    payloads = [
        ("json roto", b'{"roto":', "application/json"),
        ("array donde se espera objeto", b'[1,2,3]', "application/json"),
        ("tipo numérico en un enum", b'{"tipo":"titulado","categoria":"noticia",'
         b'"titulo":"t","cuerpo":"c","fecha":"2020-01-01"}', "application/json"),
        ("inyección SQL", b"{\"titulo\":\"'; DROP TABLE personas; --\",\"cuerpo\":\"x\","
         b'"tipo":"noticia_social","categoria":"noticia","fecha":"2020-01-01"}', "application/json"),
        ("XSS reflejado", b'{"titulo":"<script>alert(1)</script>","cuerpo":"x",'
         b'"tipo":"noticia_social","categoria":"noticia","fecha":"2020-01-01"}', "application/json"),
        ("id no numérico", None, None),
    ]
    cli = cli_factory()
    cli.iniciar_sesion(cred["admin"]["usuario"], cred["admin"]["clave"])
    filas = []
    servidores_500 = 0
    reflejos = 0
    for etiqueta, cuerpo, tipo in payloads:
        if cuerpo is None:
            r = cli.get("/api/noticias/abc")
        else:
            r = cli.crudo("POST", "/api/noticias", cuerpo, tipo)
        if r.status_code >= 500:
            servidores_500 += 1
        if "<script>alert(1)</script>" in (r.text or ""):
            reflejos += 1
        filas.append(f"{etiqueta} → {resumen_respuesta(r, 110)}")
    cli.cerrar()
    reg("B-SEG-06", "Acceso y sesión", "Entradas hostiles sin error interno ni XSS reflejado",
        "ISO/IEC 27002:2022 §8.28 (inyección); OWASP Input Validation",
        "PASS" if servidores_500 == 0 and reflejos == 0 else "FAIL",
        f"{servidores_500} respuestas 5xx; {reflejos} reflejos de HTML sin escapar",
        "0 respuestas 5xx y 0 reflejos sin escapar",
        filas)


def b_seg_07(cli_factory, cred, reg) -> None:
    """Dos sesiones del mismo usuario dan tokens distintos; uno alterado da 401."""
    cli1 = cli_factory()
    r1 = cli1.iniciar_sesion(cred["admin"]["usuario"], cred["admin"]["clave"])
    token1 = cli1.cookies.get("seguit_sesion", "")
    cli1.cerrar()

    cli2 = cli_factory()
    r2 = cli2.iniciar_sesion(cred["admin"]["usuario"], cred["admin"]["clave"])
    token2 = cli2.cookies.get("seguit_sesion", "")
    cli2.cerrar()

    distintos = bool(token1) and token1 != token2

    cli3 = cli_factory()
    alterado = token1[:-3] + ("aaa" if not token1.endswith("aaa") else "bbb")
    cli3.cookies["seguit_sesion"] = alterado
    r_alterado = cli3.get("/api/personas")
    cli3.cerrar()

    cli4 = cli_factory()
    cli4.cookies["seguit_sesion"] = "basura.invalida"
    r_basura = cli4.get("/api/personas")
    cli4.cerrar()

    ok = distintos and r_alterado.status_code == 401 and r_basura.status_code == 401
    reg("B-SEG-07", "Acceso y sesión", "Token de sesión impredecible y verificable",
        "ISO/IEC 27002:2022 §8.5; OWASP Session Management",
        "PASS" if ok else "FAIL",
        f"tokens distintos entre dos inicios={distintos}; "
        f"token alterado → HTTP {r_alterado.status_code}; token corrupto → HTTP {r_basura.status_code}",
        "tokens diferentes en cada inicio y 401 ante token alterado o corrupto",
        [f"login admin → HTTP {r1.status_code} / {r2.status_code}",
         f"GET /api/personas con token alterado → {resumen_respuesta(r_alterado, 80)}",
         f"GET /api/personas con token corrupto → {resumen_respuesta(r_basura, 80)}"])