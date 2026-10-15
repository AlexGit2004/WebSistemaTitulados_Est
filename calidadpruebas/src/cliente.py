"""
Cliente HTTP de pruebas y utilidades comunes.

Decisión de diseño importante: las cookies se manejan a mano en lugar de confiar en el
almacén de `httpx`. El servidor de pruebas corre con `NODE_ENV=production`, de modo que
las cookies de sesión salen con la marca `Secure` y `httpx` no las reenviaría por
http://. Enviando la cabecera `Cookie` explícitamente se puede autenticar la petición
y, a la vez, INSPECCIONAR los atributos de la cookie, que es lo que pide B-SEG-02.
"""
from __future__ import annotations

import time
from typing import Iterable

import httpx

from config import ORIGEN, tachar


class Cliente:
    """Cliente con sesión manual: guarda la cookie y la reenvía siempre."""

    def __init__(self, origen: str = ORIGEN) -> None:
        self.origen = origen
        self.cookies: dict[str, str] = {}
        self.http = httpx.Client(base_url=origen, timeout=30.0, follow_redirects=False)

    # ── Peticiones ──────────────────────────────────────────────────────────
    def get(self, ruta: str, **kw) -> httpx.Response:
        return self.http.get(ruta, headers=self._cabeceras(), **kw)

    def post(self, ruta: str, cuerpo=None, **kw) -> httpx.Response:
        return self.http.post(ruta, json=cuerpo, headers=self._cabeceras(), **kw)

    def patch(self, ruta: str, cuerpo=None, **kw) -> httpx.Response:
        return self.http.patch(ruta, json=cuerpo, headers=self._cabeceras(), **kw)

    def put(self, ruta: str, cuerpo=None, **kw) -> httpx.Response:
        return self.http.put(ruta, json=cuerpo, headers=self._cabeceras(), **kw)

    def delete(self, ruta: str, cuerpo=None, **kw) -> httpx.Response:
        return self.http.delete(ruta, json=cuerpo, headers=self._cabeceras(), **kw)

    def crudo(self, metodo: str, ruta: str, contenido: bytes, tipo: str, **kw) -> httpx.Response:
        return self.http.request(
            metodo, ruta, content=contenido,
            headers={**self._cabeceras(), "Content-Type": tipo}, **kw)

    def _cabeceras(self) -> dict:
        if not self.cookies:
            return {}
        partes = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        return {"Cookie": partes}

    # ── Sesión ──────────────────────────────────────────────────────────────
    def absorber_cookies(self, r: httpx.Response) -> dict:
        """Guarda las cookies de la respuesta para las siguientes peticiones."""
        for cab in r.headers.get_list("set-cookie"):
            par = cab.split(";", 1)[0]
            if "=" in par:
                k, v = par.split("=", 1)
                self.cookies[k.strip()] = v.strip()
        return self.cookies

    def iniciar_sesion(self, usuario: str, clave: str) -> httpx.Response:
        r = self.post("/api/auth/login", {"ci": usuario, "password": clave})
        if r.status_code == 200:
            self.absorber_cookies(r)
        return r

    def cerrar(self) -> None:
        self.http.close()


def resumen_respuesta(r: httpx.Response, largo: int = 220) -> str:
    """Extracto de respuesta con los datos sensibles tachados, apto para el informe."""
    cuerpo = r.text or ""
    if len(cuerpo) > largo:
        cuerpo = cuerpo[:largo] + "…"
    return f"HTTP {r.status_code} · cuerpo: {tachar(cuerpo)}"


def percentil(valores: list[float], p: float) -> float:
    """Percentil por ordenación (no hay interpolación: con pocas muestras es más
    honesto reportar un valor realmente observado que uno inventado entre dos)."""
    if not valores:
        return 0.0
    ordenados = sorted(valores)
    idx = min(len(ordenados) - 1, max(0, int(round((p / 100) * len(ordenados) + 0.5)) - 1))
    return ordenados[idx]


def resumen_tiempos(valores: Iterable[float]) -> str:
    v = list(valores)
    if not v:
        return "sin muestras"
    return (f"p50={percentil(v, 50):.0f} ms · p95={percentil(v, 95):.0f} ms · "
            f"máx={max(v):.0f} ms · n={len(v)}")


def esperar(fn, intentos: int = 20, pausa: float = 0.5) -> bool:
    for _ in range(intentos):
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(pausa)
    return False