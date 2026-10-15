"""
Controles de PRIVACIDAD ejecutados contra el sistema en marcha.

Cada control declara: norma, medida numérica, umbral y evidencia real (la petición
enviada, el status y un extracto de respuesta con los datos sensibles tachados).

Los datos personales que se buscan proceden de la siembra ficticia de la suite, de modo
que si aparecieran en una respuesta pública se reconocería sin ambigüedad.
"""
from __future__ import annotations

import json
import re

from cliente import Cliente, resumen_respuesta
from config import RUTAS_PUBLICAS, tachar

# Datos sembrados que NUNCA deben aparecer fuera de una sesión autorizada.
NOMBRES_SEMBRADOS = [
    "PERSONA FICTICIA TITULADO UNO",
    "PERSONA FICTICIA EGRESADO UNO",
    "PERSONA FICTICIA TITULADO DOS",
    "PERSONA FICTICIA GRUPO UNICO",
]
CEDULAS_SEMBRADAS = ["90000001", "90000002", "90000003", "90000004", "90000005"]
CORREOS_SEMBRADOS = ["titular9000000", "example.invalid"]

RE_CORREO = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# 7 a 10 dígitos: excluye años sueltos y códigos cortos, incluye cédulas y teléfonos.
RE_LARGO_DIGITOS = re.compile(r"(?<!\d)\d{7,10}(?!\d)")


def _buscar_pii(texto: str) -> list[str]:
    """Lista de hallazgos PII. Se distingue lo sembrado de lo que parece un dato."""
    hallazgos: list[str] = []
    for nombre in NOMBRES_SEMBRADOS:
        if nombre in texto:
            hallazgos.append(f"nombre sembrado «{nombre}»")
    for cedula in CEDULAS_SEMBRADAS:
        if cedula in texto:
            hallazgos.append(f"cédula sembrada {tachar(cedula)}")
    for correo in CORREOS_SEMBRADOS:
        if correo in texto:
            hallazgos.append("correo sembrado")
    if RE_CORREO.search(texto):
        hallazgos.append(f"patrón de correo {RE_CORREO.search(texto).group(0)}")
    largos = RE_LARGO_DIGITOS.findall(texto)
    if largos:
        hallazgos.append(f"{len(largos)} secuencia(s) de 7-10 dígitos: {tachar(str(largos[:3]))}")
    return hallazgos


def b_pri_01(cli: Cliente, reg) -> None:
    """Ninguna ruta pública devuelve PII, ni sembrada ni con forma de dato de identidad."""
    filas = []
    total_hallazgos = 0
    for ruta in RUTAS_PUBLICAS:
        r = cli.get(ruta)
        texto = r.text or ""
        hallazgos = _buscar_pii(texto)
        total_hallazgos += len(hallazgos)
        filas.append(f"GET {ruta} → {resumen_respuesta(r, 120)}"
                     + (f" · PII: {hallazgos}" if hallazgos else " · sin PII"))
    reg("B-PRI-01", "Privacidad",
        "Respuesta pública sin datos personales",
        "ISO/IEC 27001:2022 A.8.11/A.8.12; Ley 1405 art. 5; art. 130 CPE",
        "PASS" if total_hallazgos == 0 else "FAIL",
        f"{total_hallazgos} hallazgo(s) de PII en {len(RUTAS_PUBLICAS)} rutas públicas",
        "0 hallazgos en todas las rutas públicas",
        filas)


def b_pri_02(cli: Cliente, reg) -> None:
    """Un grupo de una sola persona SE publica: no hay umbral que lo oculte."""
    r = cli.get("/api/dashboard")
    datos = r.json() if r.status_code == 200 else {}
    year = datos.get("seriesPorAnio") or []
    grupo_uno = next((f for f in year if f.get("anio") == 2099), None)
    ok = grupo_uno is not None and (grupo_uno.get("titulados", 0) + grupo_uno.get("egresados", 0)) >= 1
    reg("B-PRI-02", "Privacidad",
        "Un grupo de 1 persona sí aparece en los indicadores",
        "Decisión del dueño del sistema: métricas públicas agregadas sin umbral k",
        "PASS" if ok else "FAIL",
        f"fila del año 2099 presente={grupo_uno is not None}; "
        f"contenido={json.dumps(grupo_uno) if grupo_uno else 'ausente'}",
        "el conteo de la cohorte de 1 persona aparece con valor >= 1",
        [f"GET /api/dashboard → HTTP {r.status_code}"])


def b_pri_03(cli: Cliente, cred, reg) -> None:
    """Un titular NO puede leer la ficha de otro (IDOR)."""
    titular = cred["titulado"]["usuario"]
    victima = "90000003"
    propios = cli.get(f"/api/personas?ci={titular}")
    ajena = cli.get(f"/api/personas?ci={victima}")
    escritura_ajena = cli.patch(f"/api/personas?ci={victima}",
                               {"telefono": "70000000",
                                "consentimientoPrivacidad": True,
                                "versionAvisoPrivacidad": "1.0.0"})
    desv = [x for x in (propios, ajena, escritura_ajena) if x.status_code not in (200, 403, 404)]
    ok = ajena.status_code in (403, 404) and escritura_ajena.status_code in (403, 400, 404)
    reg("B-PRI-03", "Privacidad",
        "Aislamiento del titular (IDOR)",
        "ISO/IEC 27002:2022 §8.2 y §8.16; art. 130 CPE",
        "PASS" if ok and not desv else "FAIL",
        f"ficha propia HTTP {propios.status_code}; "
        f"ficha ajena ({tachar(victima)}) HTTP {ajena.status_code}; "
        f"escritura sobre ficha ajena HTTP {escritura_ajena.status_code}",
        "100% de las peticiones sobre otra ficha devuelven 403/404",
        [f"GET /api/personas?ci={tachar(victima)} → {resumen_respuesta(ajena, 140)}",
         f"PATCH /api/personas?ci={tachar(victima)} → {resumen_respuesta(escritura_ajena, 140)}"])


def b_pri_04(cli: Cliente, cred, reg) -> None:
    """El consentimiento es obligatorio y lo rechaza el SERVIDOR, no solo el formulario."""
    filas = []
    # 1) Sin marcar la casilla: el servidor debe rechazar.
    r1 = cli.patch(f"/api/personas?ci={cred['titulado']['usuario']}",
                   {"telefono": "71234567"})
    # 2) Marcado: debe aceptar.
    r2 = cli.patch(f"/api/personas?ci={cred['titulado']['usuario']}",
                   {"telefono": "71234567",
                    "consentimientoPrivacidad": True,
                    "versionAvisoPrivacidad": "1.0.0"})
    filas.append(f"PATCH sin consentimiento → {resumen_respuesta(r1, 140)}")
    filas.append(f"PATCH con consentimiento → {resumen_respuesta(r2, 140)}")
    ok = r1.status_code == 400 and r2.status_code in (200, 201)
    reg("B-PRI-04", "Privacidad",
        "Consentimiento obligatorio, validado en el servidor",
        "Constitución del Estado de Bolivia, art. 130; ISO/IEC 27701:2025 §8.2",
        "PASS" if ok else "FAIL",
        f"sin consentimiento: HTTP {r1.status_code}; con consentimiento: HTTP {r2.status_code}",
        "400 sin la casilla y 2xx con la casilla",
        filas)


def b_pri_05(cli: Cliente, cred, reg) -> None:
    """Las respuestas con datos personales no se guardan en caché."""
    cli.iniciar_sesion(cred["titulado"]["usuario"], cred["titulado"]["clave"])
    propias = cli.get(f"/api/personas?ci={cred['titulado']['usuario']}")
    panel = cli.get("/api/auditoria")
    filas = [
        f"GET /api/personas?ci=<propia> → Cache-Control: {propias.headers.get('cache-control', '(ausente)')}",
        f"GET /api/auditoria → Cache-Control: {panel.headers.get('cache-control', '(ausente)')}",
    ]
    cc = (propias.headers.get("cache-control") or "").lower()
    ok = "no-store" in cc
    reg("B-PRI-05", "Privacidad",
        "Datos personales sin caché (Cache-Control: no-store)",
        "ISO/IEC 27002:2022 §8.11 (data masking); OWASP Caching",
        "PASS" if ok else "FAIL",
        f"Cache-Control de la ficha propia: {cc or '(ausente)'}",
        "no-store en las respuestas con datos personales",
        filas)