"""
Levanta y apaga el entorno de pruebas.

No se toca ningún archivo del sistema: solo se crea una base de datos nueva, se aplica
el esquema, se siembran datos FICTICIOS y se arranca el servidor de producción en un
puerto propio. Al terminar se borra la base y se detiene el proceso.

Docker no está disponible en esta máquina, así que el aislamiento se consigue con:
  · una base de datos DEDICADA (`sistitulados_calidad`), creada y destruida aquí,
  · un PUERTO propio,
  · variables de entorno propias (SESSION_SECRET efímero, sin Turnstile),
  · `next start` (servidor de producción), no `next dev`.
El informe declara esta limitación explícitamente.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import httpx

from config import (
    BASE, BD_HOST, BD_NOMBRE, BD_PUERTO, BD_PASSWORD, BD_USUARIO,
    DATABASE_URL_PRUEBA, ORIGEN, PUERTO, RUTA_LOG_SERVIDOR, SESSION_SECRET_PRUEBA,
)

PSQL = r"C:\Program Files\PostgreSQL\16\bin\psql.exe"


class Entorno:
    def __init__(self) -> None:
        self.proceso: subprocess.Popen | None = None
        self.hizo_build = False

    # ── Utilidades ──────────────────────────────────────────────────────────
    def _psql(self, sql: str, base: str = "postgres") -> tuple[int, str]:
        env = dict(os.environ, PGPASSWORD=BD_PASSWORD)
        cmd = [PSQL, "-U", BD_USUARIO, "-h", BD_HOST, "-p", str(BD_PUERTO),
               "-d", base, "-v", "ON_ERROR_STOP=1", "-c", sql]
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=120)
            return p.returncode, (p.stdout or "") + (p.stderr or "")
        except (OSError, subprocess.SubprocessError) as e:
            return -1, str(e)

    def _cmd_app(self, cmd: list[str], timeout: int = 900, extra_env: dict | None = None) -> tuple[int, str]:
        env = dict(os.environ)
        env["DATABASE_URL"] = DATABASE_URL_PRUEBA
        env["SESSION_SECRET"] = SESSION_SECRET_PRUEBA
        env["TZ"] = "America/La_Paz"
        # Sin clave de Turnstile: en un entorno de pruebas no hay servicio anti-bots y
        # mantenerlo bloquearía todos los inicios de sesión sin probar nada útil.
        env.pop("TURNSTILE_SECRET_KEY", None)
        env.pop("NEXT_PUBLIC_TURNSTILE_SITE_KEY", None)
        if extra_env:
            env.update(extra_env)
        # En Windows, las herramientas de npm son `*.cmd`; sin esto subprocess no las
        # encuentra y falla con un WinError 2 que no dice nada del problema real.
        exe = shutil.which(cmd[0]) or shutil.which(cmd[0] + ".cmd") or cmd[0]
        if exe is None:
            return -1, f"no se encontró el ejecutable {cmd[0]}"
        ejecutable = exe
        if os.name == "nt" and not ejecutable.lower().endswith((".exe", ".cmd", ".bat")):
            ejecutable += ".cmd"
        if os.name == "nt":
            # Un `.cmd` no se puede lanzar directamente con shell=False en algunos
            # entornos: se enruta por cmd.exe, que sí lo resuelve.
            argumentos = ["cmd.exe", "/c", ejecutable] + cmd[1:]
        else:
            argumentos = [ejecutable] + cmd[1:]
        try:
            p = subprocess.run(argumentos, cwd=BASE, capture_output=True, text=True,
                               env=env, timeout=timeout)
            return p.returncode, (p.stdout or "") + (p.stderr or "")
        except (OSError, subprocess.SubprocessError) as e:
            return -1, f"{type(e).__name__}: {e}"

    # ── Ciclo de vida ───────────────────────────────────────────────────────
    def crear_base(self) -> tuple[bool, str]:
        """Base NUEVA: nunca se toca la base de desarrollo."""
        self._psql(f"DROP DATABASE IF EXISTS {BD_NOMBRE};")
        code, out = self._psql(f"CREATE DATABASE {BD_NOMBRE};")
        if code != 0:
            return False, out.strip()[:300]
        return True, f"base creada: {BD_NOMBRE} @ {BD_HOST}:{BD_PUERTO}"

    def aplicar_esquema(self) -> tuple[bool, str]:
        code, out = self._cmd_app(["npx", "drizzle-kit", "push", "--force"])
        return code == 0, out.strip()[-400:]

    def sembrar(self) -> tuple[bool, str]:
        """Datos ficticios: cuentas de prueba y personas para las pruebas de aislamiento."""
        code, out = self._cmd_app(["npx", "tsx", str(BASE / "calidadpruebas" / "src" / "fixtures" / "datos_prueba.ts")])
        return code == 0, out.strip()[-400:]

    def compilar(self) -> tuple[bool, str]:
        code, out = self._cmd_app(["npx", "next", "build"], timeout=1800)
        self.hizo_build = code == 0
        return code == 0, out.strip()[-500:]

    def arrancar(self) -> tuple[bool, str]:
        env = dict(os.environ)
        env.update(
            DATABASE_URL=DATABASE_URL_PRUEBA,
            SESSION_SECRET=SESSION_SECRET_PRUEBA,
            TZ="America/La_Paz",
            PORT=str(PUERTO),
            HOSTNAME="127.0.0.1",
            NODE_ENV="production",
            NEXT_TELEMETRY_DISABLED="1",
        )
        env.pop("TURNSTILE_SECRET_KEY", None)
        env.pop("NEXT_PUBLIC_TURNSTILE_SITE_KEY", None)
        log = open(RUTA_LOG_SERVIDOR, "w", encoding="utf-8", errors="replace")
        npx = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
        argumentos = (["cmd.exe", "/c", npx, "next", "start", "-p", str(PUERTO),
                       "-H", "127.0.0.1"] if os.name == "nt" else
                      [npx, "next", "start", "-p", str(PUERTO), "-H", "127.0.0.1"])
        self.proceso = subprocess.Popen(
            argumentos, cwd=BASE, stdout=log, stderr=subprocess.STDOUT, env=env,
        )
        for _ in range(90):
            time.sleep(2)
            try:
                r = httpx.get(f"{ORIGEN}/api/dashboard", timeout=10)
                if r.status_code in (200, 401, 403):
                    return True, f"servidor listo en {ORIGEN} (HTTP {r.status_code})"
            except httpx.HTTPError:
                pass
            if self.proceso.poll() is not None:
                return False, "el servidor terminó antes de responder"
        return False, "tiempo de espera agotado al arrancar el servidor"

    def detener(self) -> None:
        if self.proceso and self.proceso.poll() is None:
            self.proceso.terminate()
            try:
                self.proceso.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.proceso.kill()

    def destruir_base(self) -> str:
        # El servidor ya está parado, pero puede quedar alguna conexión abierta: se
        # fuerza el cierre para que el borrado no dependa del orden.
        code, out = self._psql(f"DROP DATABASE IF EXISTS {BD_NOMBRE} WITH (FORCE);")
        return "base de pruebas eliminada" if code == 0 else f"No se pudo eliminar: {out.strip()[:200]}"

    def hash_codigo(self) -> str:
        """
        Huella del código del sistema, para demostrar que las pruebas no lo alteran.

        Se calcula sobre los archivos que las pruebas podrían tocar (src/, tests/,
        package.json, drizzle/) y se compara antes y después de la ejecución.
        """
        import hashlib

        h = hashlib.sha256()
        rutas: list[Path] = []
        for carpeta in ("src", "tests", "drizzle", "scripts"):
            d = BASE / carpeta
            if d.is_dir():
                rutas.extend(sorted(p for p in d.rglob("*") if p.is_file()
                                    and p.suffix in {".ts", ".tsx", ".sql", ".js", ".mjs", ".json"}))
        for nombre in ("package.json", "next.config.mjs", "tsconfig.json", "middleware.ts"):
            p = BASE / nombre
            if p.is_file():
                rutas.append(p)
        for p in rutas:
            h.update(str(p.relative_to(BASE)).encode())
            try:
                h.update(p.read_bytes())
            except OSError:
                pass
        return h.hexdigest()