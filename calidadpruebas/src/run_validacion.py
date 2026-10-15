"""
Runner de la validación en ejecución.

Uso:
    python run_validacion.py              # levanta el entorno, prueba y apaga
    python run_validacion.py --sin-arrancar   # usa un servidor ya levantado en el puerto

Responsabilidades:
  1. Guardar la huella del código del sistema (para demostrar que no se altera).
  2. Crear la base de datos de pruebas, aplicar el esquema y sembrar datos ficticios.
  3. Arrancar el servidor de PRODUCCIÓN en un puerto propio.
  4. Ejecutar los controles B-*.
  5. Volver a comprobar la huella del código.
  6. Generar resultados.json, resumen.md y resultados.docx.
  7. Apagar SIEMPRE el servidor y destruir SIEMPRE la base, incluso si algo falla.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import BD_NOMBRE, BD_PASSWORD, BD_USUARIO, ORIGEN, leer_credenciales
from controles_privacidad import (b_pri_01, b_pri_02, b_pri_03, b_pri_04, b_pri_05)
from controles_reglas import (b_aud_01, b_cal_01, b_cal_02, b_cal_03,
                              b_reg_01, b_reg_02, b_reg_03, b_reg_04, b_reg_05)
from controles_seguridad import (b_seg_01, b_seg_02, b_seg_03, b_seg_04,
                                 b_seg_05, b_seg_06, b_seg_07)
from cliente import Cliente
from entorno import Entorno, PSQL
from informe import Control, construir_contexto, escribir_docx, escribir_json, escribir_md

CONTROLES: list[Control] = []

DESCRIPCIONES = {
    "B-PRI-01": "Recorre todas las rutas públicas sin sesión y busca nombres, cédulas, "
                "correos y secuencias largas de dígitos, tanto los sembrados como por "
                "forma. Interpretación: PASS = ninguna respuesta pública contiene un dato "
                "capaz de identificar a una persona.",
    "B-PRI-02": "Comprueba que la cohorte con una sola persona aparece en la serie anual. "
                "Interpretación: PASS = los conteos agregados se publican sin umbral, "
                "como se decidió; la privacidad no depende de ocultar celdas.",
    "B-PRI-03": "Con sesión de un titular pide la ficha de otra cédula, tanto para leer "
                "como para escribir. Interpretación: 403/404 = el aislamiento por titular "
                "funciona; un 200 sería una fuga de datos entre egresados.",
    "B-PRI-04": "Envía un cambio de perfil sin marcar el consentimiento y luego marcándolo. "
                "Interpretación: 400 y luego 2xx demuestra que la casilla no es un adorno "
                "del formulario: el servidor la exige.",
    "B-PRI-05": "Lee la cabecera Cache-Control de una respuesta con datos personales. "
                "Interpretación: no-store evita que un intermediary guarde datos "
                "identificables en una caché compartida.",
    "B-SEG-01": "Recorre la matriz ruta × perfil (sin sesión, titulado, egresado, kardex, "
                "admin) y compara el status con el declarado. Interpretación: cualquier "
                "desviación significa que la autorización real difiere de la documentada.",
    "B-SEG-02": "Inspecciona los atributos de cada Set-Cookie de sesión. Interpretación: "
                "HttpOnly evita el robo por JavaScript, SameSite limita el CSRF y Secure "
                "exige TLS.",
    "B-SEG-03": "Repite intentos de login con contraseña incorrecta y luego prueba con otra "
                "cédula. Interpretación: el 429 en ambos casos demuestra que el límite es "
                "por IP y por identificador, no solo por IP.",
    "B-SEG-04": "Envía el alta pública con una cédula nueva y con una ya existente y "
                "compara status, cuerpo y tiempo. Interpretación: respuestas idénticas "
                "impiden descubrir qué cédulas están registradas.",
    "B-SEG-05": "Pide páginas y API y comprueba las cinco cabeceras de seguridad. "
                "Interpretación: PASS solo si están las cinco; cada una ausente es un "
                "mEDio de ataque que sigue abierto.",
    "B-SEG-06": "Manda JSON roto, tipos incorrectos, SQLi y XSS a rutas de escritura. "
                "Interpretación: ningún 500 significa que la entrada se controla antes de "
                "tocar la base de datos; ningún reflejo sin escapar significa que no hay "
                "HTML injection.",
    "B-SEG-07": "Compara dos tokens del mismo usuario y prueba tokens alterados. "
                "Interpretación: tokens distintos = impredecibles; 401 = la firma se "
                "verifica de verdad.",
    "B-REG-01": "Intenta crear una persona con una cédula que ya existe. Interpretación: "
                "400/409 en lugar de 500 demuestra que la restricción UNIQUE se traduce en "
                "un error de aplicación, no en una excepción de PostgreSQL.",
    "B-REG-02": "Recorre las siete combinaciones de la matriz de condicionalidad del "
                "egresado, válidas e inválidas. Interpretación: cada 400 esperado es el "
                "servidor aplicando la regla del enunciado.",
    "B-REG-03": "Intenta modificar campos Kardex como titular y comprueba que no cambian. "
                "Interpretación: los datos formales del Kardex los controla el "
                "administrador, no el titular.",
    "B-REG-04": "Descarga una exportación firmada y comprueba cabeceras y neutralización de "
                "fórmulas. Interpretación: un apóstrofo delante del '=' es lo que evita "
                "que Excel ejecute el contenido de una celda en el equipo del "
                "administrador.",
    "B-REG-05": "Pide el respaldo sin sesión, como titular y como admin. Interpretación: "
                "solo el admin lo obtiene y funciona sin invocar pg_dump.",
    "B-AUD-01": "Provoca una escritura y cuenta las filas de audit_log antes y después; "
                "después altera una fila dentro de una transacción revertida. "
                "Interpretación: el crecimiento demuestra que toda escritura deja rastro; "
                "la transacción revertida comprueba la cadena sin dejar rastro falso.",
    "B-CAL-01": "Ejecuta axe-core sobre las páginas reales. Interpretación: aquí, y solo "
                "aquí, se puede hablar de accesibilidad medida; un SKIP significa que no "
                "se midió, no que sea accesible.",
    "B-CAL-02": "Lanza 50 peticiones concurrentes al dashboard y una exportación, midiendo "
                "percentiles. Interpretación: detecta bloqueos y errores; no sustituye a "
                "una prueba de carga.",
    "B-CAL-03": "Verifica que el servidor de producción responde y que el log no contiene "
                "datos personales. Interpretación: un log con cédulas es una fuga tan real "
                "como la de una respuesta HTTP.",
}


def reg(id: str, categoria: str, nombre: str, norma: str, estado: str,
        medida: str, umbral: str, evidencia: list[str] | None = None,
        nota: str = "") -> None:
    assert estado in {"PASS", "FAIL", "WARN", "SKIP"}, estado
    CONTROLES.append(Control(id, categoria, nombre, norma, estado, medida, umbral,
                             list(evidencia or []), nota, DESCRIPCIONES.get(id, "")))
    marca = {"PASS": "OK  ", "FAIL": "FALLO", "WARN": "AVISO", "SKIP": "N/AP"}[estado]
    print(f"[{marca}] {id} {nombre} :: {medida}")


def psql(sql: str) -> str:
    env = dict(os.environ, PGPASSWORD=BD_PASSWORD)
    try:
        p = subprocess.run(
            [PSQL, "-U", BD_USUARIO, "-h", "localhost", "-d", BD_NOMBRE,
             "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
            capture_output=True, text=True, env=env, timeout=60)
        return (p.stdout or "") + (p.stderr or "")
    except (OSError, subprocess.SubprocessError) as e:
        return str(e)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sin-arrancar", action="store_true",
                    help="usa un servidor ya levantado en el puerto configurado")
    args = ap.parse_args()

    ent = Entorno()
    hash_antes = ent.hash_codigo()
    cred = leer_credenciales()
    fallos_entorno: list[str] = []

    print("=" * 78)
    print("VALIDACIÓN EN EJECUCIÓN · Sistema de Seguimiento a Titulados y Egresados")
    print(f"Huella del código antes de las pruebas: {hash_antes[:16]}…")
    print("=" * 78)

    try:
        if not args.sin_arrancar:
            ok, msg = ent.crear_base()
            print(f"[entorno] base de datos: {msg}")
            if not ok:
                fallos_entorno.append(msg)

            if not fallos_entorno:
                ok, msg = ent.aplicar_esquema()
                print(f"[entorno] esquema: {msg[:160]}")
                if not ok:
                    fallos_entorno.append(f"esquema: {msg}")

            if not fallos_entorno:
                ok, msg = ent.sembrar()
                print(f"[entorno] datos: {msg[:200]}")
                if not ok:
                    fallos_entorno.append(f"datos: {msg}")

            if not fallos_entorno:
                ok, msg = ent.compilar()
                print(f"[entorno] compilación de producción: {'ok' if ok else 'fallo'}")
                if not ok:
                    fallos_entorno.append(f"build: {msg}")

            if not fallos_entorno:
                ok, msg = ent.arrancar()
                print(f"[entorno] servidor: {msg}")
                if not ok:
                    fallos_entorno.append(f"servidor: {msg}")

        if fallos_entorno:
            for f in fallos_entorno:
                reg("B-ENV", "Entorno", "Levantar el sistema de pruebas",
                    "ISO/IEC 29119-2 §5 (entorno de pruebas)", "FAIL",
                    f[:200], "el sistema debe arrancar para poder probar nada",
                    nota="; ".join(fallos_entorno))
        else:
            def cli_factory():
                return Cliente(ORIGEN)

            print("\n--- Privacidad ---")
            b_pri_01(cli_factory(), reg)
            b_pri_02(cli_factory(), reg)
            b_pri_03(cli_factory(), cred, reg)
            b_pri_04(cli_factory(), cred, reg)
            b_pri_05(cli_factory(), cred, reg)

            print("\n--- Acceso y sesión ---")
            b_seg_01(cli_factory, cred, reg)
            b_seg_02(cli_factory, cred, reg)
            b_seg_03(cli_factory, cred, reg)
            b_seg_04(cli_factory, reg)
            b_seg_05(cli_factory, reg)
            b_seg_06(cli_factory, cred, reg)
            b_seg_07(cli_factory, cred, reg)

            print("\n--- Reglas de negocio, auditoría y calidad ---")
            b_reg_01(cli_factory, cred, reg)
            b_reg_02(cli_factory, cred, reg)
            b_reg_03(cli_factory, cred, reg)
            b_reg_04(cli_factory, cred, reg)
            b_reg_05(cli_factory, cred, reg)
            b_aud_01(cli_factory, cred, psql, reg)
            b_cal_01(cli_factory, reg)
            b_cal_02(cli_factory, cred, reg)
            b_cal_03(cli_factory, reg)

    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        reg("B-ENV", "Entorno", "Ejecutar la batería de pruebas",
            "ISO/IEC 29119-2 §5", "FAIL",
            f"{type(e).__name__}: {e}"[:200], "la batería debe completarse",
            nota="la ejecución se interrumpió por un error no controlado")

    finally:
        if not args.sin_arrancar:
            ent.detener()
            print("[entorno] servidor detenido")
            mensaje = ent.destruir_base()
            print(f"[entorno] {mensaje}")

    hash_despues = ent.hash_codigo()
    igual = hash_antes == hash_despues
    reg("B-INT", "Integridad", "Las pruebas no alteraron el código del sistema",
        "ISO/IEC 29119-2 §5.6 (control del proceso de pruebas)",
        "PASS" if igual else "FAIL",
        f"sha256 del código {hash_antes[:16]}… → {hash_despues[:16]}…",
        "huella idéntica antes y después",
        [f"antes:  {hash_antes}", f"después: {hash_despues}"],
        nota="" if igual else "algún archivo del sistema cambió durante la validación")

    # ── Informe ─────────────────────────────────────────────────────────────
    por_cat: dict[str, dict[str, int]] = {}
    for c in CONTROLES:
        d = por_cat.setdefault(c.categoria, {"PASS": 0, "FAIL": 0, "WARN": 0, "SKIP": 0})
        d[c.estado] += 1
    resumen = {
        "total": len(CONTROLES),
        "pass": sum(1 for c in CONTROLES if c.estado == "PASS"),
        "fail": sum(1 for c in CONTROLES if c.estado == "FAIL"),
        "warn": sum(1 for c in CONTROLES if c.estado == "WARN"),
        "skip": sum(1 for c in CONTROLES if c.estado == "SKIP"),
    }
    contexto = construir_contexto(
        ORIGEN, f"{BD_NOMBRE} (efímera)", hash_antes, hash_despues, igual,
        "5 personas y 5 cuentas ficticias sembradas por la propia suite")

    print("\n" + "=" * 78)
    print(f"CONTROLES: {resumen['total']} · OK {resumen['pass']} · FALLO {resumen['fail']} "
          f"· AVISO {resumen['warn']} · N/AP {resumen['skip']}")
    print("=" * 78)

    print(f"[informe] {escribir_json(CONTROLES, {**contexto, 'resumen': resumen, 'por_categoria': por_cat})}")
    print(f"[informe] {escribir_md(CONTROLES, {**contexto, 'resumen': resumen, 'por_categoria': por_cat})}")
    docx = escribir_docx(CONTROLES, {**contexto, "resumen": resumen, "por_categoria": por_cat})
    if docx:
        print(f"[informe] {docx}")

    return 0 if resumen["fail"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())