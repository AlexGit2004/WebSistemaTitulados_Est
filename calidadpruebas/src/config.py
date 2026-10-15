"""
Configuración de la validación en ejecución.

Reglas que se respetan aquí:
  · Ninguna credencial se escribe en el informe: se leen del entorno o de
    `credencial.txt` y solo se usan en memoria.
  · Todo archivo que la suite produzca vive en ESTA carpeta.
  · La base de datos de pruebas es una base NUEVA, distinta de la de desarrollo, y se
    destruye al terminar. El código del sistema no se toca.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

AQUI = Path(__file__).resolve().parent          # .../calidadpruebas/src
BASE = AQUI.parent.parent                        # .../sistema1_5
SALIDA = AQUI                                     # resultados.json / resumen.md / docx

# Puerto propio del entorno de pruebas: no choca con un `pnpm dev` ya en marcha.
PUERTO = int(os.environ.get("CALIDAD_PUERTO", "3111"))
ORIGEN = f"http://127.0.0.1:{PUERTO}"

# Base de datos aislada.
BD_NOMBRE = os.environ.get("CALIDAD_BD", "sistitulados_calidad")
BD_USUARIO = os.environ.get("CALIDAD_BD_USUARIO", "postgres")
BD_PASSWORD = os.environ.get("CALIDAD_BD_PASSWORD", "12345678")
BD_HOST = os.environ.get("CALIDAD_BD_HOST", "localhost")
BD_PUERTO = int(os.environ.get("CALIDAD_BD_PUERTO", "5432"))
DATABASE_URL_PRUEBA = (
    f"postgresql://{BD_USUARIO}:{BD_PASSWORD}@{BD_HOST}:{BD_PUERTO}/{BD_NOMBRE}"
)

# Secreto de sesión SOLO de este entorno. No es un secreto real: se genera por ejecución
# y desaparece con la base de datos.
SESSION_SECRET_PRUEBA = os.environ.get(
    "CALIDAD_SESSION_SECRET",
    "clave-efimera-de-la-suite-de-calidad-no-usar-en-produccion-0123456789",
)

RUTA_LOG_SERVIDOR = AQUI / "servidor.log"
RUTA_TAPAS = AQUI / "tapas"          # volcados de respaldo que genera B-REG-05

# Rutas de API que se pueden consultar sin sesión. El control B-PRI-01 recorre esta
# lista completa: no basta con mirar el dashboard.
RUTAS_PUBLICAS = [
    "/api/dashboard",
    "/api/noticias",
    "/api/carreras",
    "/",
    "/titulados",
    "/login",
    "/registro",
]


def leer_credenciales() -> dict:
    """
    Credenciales de prueba. Se leen de `credencial.txt`; no se imprimen nunca.

    Formato del fichero (bloques de tres líneas):
        Rol
        identificador
        contraseña
    """
    salida = {"admin": {}, "titulado": {}, "egresado": {}, "kardex": {}}
    ruta = BASE / "credencial.txt"
    if not ruta.is_file():
        return salida
    lineas = [l.strip() for l in ruta.read_text(encoding="utf-8", errors="replace").splitlines()]
    bloque: list[str] = []
    for linea in lineas + [""]:
        if linea:
            bloque.append(linea)
            continue
        if len(bloque) >= 2:
            rol = bloque[0].lower()
            if rol in salida:
                salida[rol] = {"usuario": bloque[1], "clave": bloque[2] if len(bloque) > 2 else ""}
        bloque = []
    return salida


def tachar(texto: str) -> str:
    """
    Sustituye cualquier cosa que parezca un dato personal por `[TACHADO]`.

    Se aplica a los extractos de respuesta ANTES de guardarlos en el informe: un
    informe de calidad que filtra la cédula que estaba comprobando que no se filtra
    sería peor que no hacer la prueba.
    """
    t = texto
    t = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[TACHADO:correo]", t)
    t = re.sub(r"\b\d{6,10}\b", "[TACHADO:cedula]", t)
    t = re.sub(r"\+?\d[\d\s-]{7,14}\d", "[TACHADO:telefono]", t)
    return t