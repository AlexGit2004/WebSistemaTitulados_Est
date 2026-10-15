"""
Generador de informes: resultados.json, resumen.md y resultados.docx.

Los tres llevan la misma información con los mismos cuatro estados (PASS/FAIL/WARN/SKIP)
y, para cada control: norma, medida numérica, umbral y evidencia.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from config import SALIDA, tachar


@dataclass
class Control:
    id: str
    categoria: str
    nombre: str
    norma: str
    estado: str                 # PASS | FAIL | WARN | SKIP
    medida: str
    umbral: str
    evidencia: list[str] = field(default_factory=list)
    nota: str = ""
    descripcion: str = ""       # qué hace la prueba y cómo se interpreta


ICONO = {"PASS": "OK", "FAIL": "FALLO", "WARN": "AVISO", "SKIP": "N/AP"}


def escribir_json(controles: list[Control], contexto: dict) -> str:
    ruta = SALIDA / "resultados.json"
    ruta.write_text(
        json.dumps({"contexto": contexto,
                    "controles": [asdict(c) for c in controles]},
                   ensure_ascii=False, indent=2),
        encoding="utf-8")
    return str(ruta)


def _tabla_md(controles: list[Control]) -> str:
    lineas = ["| Estado | ID | Control | Qué hace la prueba | Medida | Umbral | Evidencia |",
              "|---|---|---|---|---|---|---|"]
    for c in controles:
        ev = "<br>".join(tachar(e)[:150] for e in c.evidencia[:4]) or "—"
        lineas.append(
            f"| **{ICONO[c.estado]}** | `{c.id}` | {c.nombre} | "
            f"{tachar(c.descripcion)} | {tachar(c.medida)} | {tachar(c.umbral)} | {ev} |")
    return "\n".join(lineas)


def escribir_md(controles: list[Control], contexto: dict) -> str:
    resumen = contexto["resumen"]
    partes = [
        "# Validación en ejecución — Sistema de Seguimiento a Titulados y Egresados",
        "",
        f"**{contexto['fecha']}** · Suite `run_validacion.py` · "
        f"controles: **{resumen['total']}** · OK {resumen['pass']} · "
        f"FALLO {resumen['fail']} · AVISO {resumen['warn']} · N/AP {resumen['skip']}",
        "",
        "## 1. Qué mide este informe y qué NO",
        "",
        "Se ejecutó el sistema **en funcionamiento** y se le enviou peticiones reales. "
        "Un PASS significa *«se midió y cumplió en esta ejecución»*, no «el sistema es "
        "correcto».",
        "",
        "**Límites, declarados de antemano:**",
        "",
        "- Entorno **local**, no producción, y con **datos ficticios**.",
        "- **No es una prueba de penetración profesional**: no hay escaneo de "
        "vulnerabilidades, ni análisis del cliente, ni revisión manual de la lógica de negocio.",
        "- **No es una prueba de carga**: 50 peticiones concurrentes dicen poco sobre el "
        "comportamiento con el volumen real de la Carrera.",
        "- **No se certifica conformidad WCAG**: solo se reportan las violaciones que "
        "axe-core midió en las páginas probadas.",
        "- Docker no estaba disponible en la máquina: el aislamiento se logró con una "
        "**base de datos propia y efímera** y un **puerto propio**, no con contenedores.",
        "",
        "## 2. Entorno",
        "",
        f"- Servidor: `next start` (producción) en {contexto['origen']}",
        f"- Base de datos: `{contexto['bd']}` (creada y destruida por la suite)",
        f"- Datos: {contexto['datos']}",
        f"- Huella del código antes/después: `{contexto['hash_antes'][:16]}…` / "
        f"`{contexto['hash_despues'][:16]}…` → "
        f"**{'idéntica' if contexto['hash_igual'] else 'DIFERENTE'}**",
        "",
        "## 3. Resumen por categoría",
        "",
    ]
    for cat, st in contexto["por_categoria"].items():
        partes.append(f"- **{cat}**: OK {st['PASS']} · FALLO {st['FAIL']} · "
                      f"AVISO {st['WARN']} · N/AP {st['SKIP']}")
    partes += ["", "## 4. Controles", ""]

    cat_actual = None
    for c in controles:
        if c.categoria != cat_actual:
            cat_actual = c.categoria
            partes += ["", f"### {cat_actual}", "",
                       "| Estado | ID | Control | Qué hace la prueba | Medida | Umbral | Evidencia |",
                       "|---|---|---|---|---|---|---|"]
        ev = "<br>".join(tachar(e)[:150] for e in c.evidencia[:4]) or "—"
        partes.append(
            f"| **{ICONO[c.estado]}** | `{c.id}` | {c.nombre} | "
            f"{tachar(c.descripcion)} | {tachar(c.medida)} | {tachar(c.umbral)} | {ev} |")
        if c.nota:
            partes.append(f"| | | | *Nota*: {tachar(c.nota)} | | | |")

    fallos = [c for c in controles if c.estado == "FAIL"]
    partes += ["", "## 5. Incumplimientos", ""]
    if not fallos:
        partes.append("Ninguno: todos los controles ejecutados cumplieron su umbral.")
    for c in fallos:
        partes.append(f"- **`{c.id}` {c.nombre}** — medido: {tachar(c.medida)}. "
                      f"Umbral: {tachar(c.umbral)}.")

    omitidos = [c for c in controles if c.estado == "SKIP"]
    if omitidos:
        partes += ["", "## 6. Controles no ejecutados", ""]
        for c in omitidos:
            partes.append(f"- `{c.id}` {c.nombre}: {tachar(c.medida)}. {tachar(c.nota)}")

    partes += ["", "---", "",
               "*Informe generado automáticamente. Los datos sensibles aparecen tachados "
               "por diseño: comprobar que no se filtran no justifica filtrarlos en el "
               "informe.*"]

    ruta = SALIDA / "resumen.md"
    ruta.write_text("\n".join(partes), encoding="utf-8")
    return str(ruta)


def escribir_docx(controles: list[Control], contexto: dict) -> str:
    """
    DOCX con tablas. Toda la salida es UTF-8 y los textos llevan los acentos correctos:
    el informe anterior suffering de `A3` en pantalla porque el texto llegaba en cp1252.
    """
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except ImportError:
        return ""

    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10)

    doc.add_heading("Validación en ejecución", level=0)
    p = doc.add_paragraph("Sistema de Seguimiento a Titulados y Egresados — Estadística, UMSA")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    t = doc.add_table(rows=0, cols=2)
    t.style = "Light Grid Accent 1"
    r = contexto["resumen"]
    for k, v in (("Fecha", contexto["fecha"]),
                 ("Entorno", contexto["origen"]),
                 ("Base de datos", contexto["bd"]),
                 ("Controles", f"{r['total']} · OK {r['pass']} · FALLO {r['fail']} · "
                               f"AVISO {r['warn']} · N/AP {r['skip']}"),
                 ("Código intacto", "sí" if contexto["hash_igual"] else "NO: se modificó")):
        celdas = t.add_row().cells
        celdas[0].text = k
        celdas[1].text = str(v)

    doc.add_heading("Alcance y límites", level=1)
    for lim in ("Entorno local con datos ficticios; no es producción.",
                "No es una prueba de penetración profesional.",
                "No es una prueba de carga real.",
                "La conformidad WCAG solo se afirma donde axe-core la midió.",
                "Docker no disponible: el aislamiento fue por base de datos y puerto propios."):
        doc.add_paragraph(lim, style="List Bullet")

    doc.add_heading("Detalle de controles", level=1)
    cat = None
    for c in controles:
        if c.categoria != cat:
            cat = c.categoria
            doc.add_heading(cat, level=2)

        par = doc.add_paragraph()
        run = par.add_run(f"[{ICONO[c.estado]}] {c.id}  ")
        run.bold = True
        colores = {"FAIL": RGBColor(0xB0, 0x00, 0x00), "WARN": RGBColor(0xB5, 0x6A, 0x00),
                   "PASS": RGBColor(0x00, 0x60, 0x00), "SKIP": RGBColor(0x60, 0x60, 0x60)}
        run.font.color.rgb = colores[c.estado]
        par.add_run(c.nombre).bold = True

        # Tabla de una fila por control: incluye la columna de descripción exigida.
        tt = doc.add_table(rows=0, cols=2)
        tt.style = "Light List Accent 1"
        for etiqueta, valor in (("Norma", c.norma),
                                ("Descripción", tachar(c.descripcion)),
                                ("Medida", tachar(c.medida)),
                                ("Umbral", tachar(c.umbral)),
                                ("Evidencia", "\n".join(tachar(e) for e in c.evidencia[:6]) or "—"),
                                ("Nota", tachar(c.nota) or "—")):
            celdas = tt.add_row().cells
            celdas[0].text = etiqueta
            celdas[1].text = str(valor)

    doc.add_paragraph()
    doc.add_paragraph(
        "Un PASS indica que la condición medida se cumplió en esta ejecución y con estos "
        "datos ficticios. No constituye una certificación."
    )

    ruta = SALIDA / "resultados.docx"
    doc.save(str(ruta))
    return str(ruta)


def construir_contexto(origen: str, bd: str, hash_antes: str, hash_despues: str,
                       hash_igual: bool, datos: str) -> dict:
    return {
        "fecha": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "origen": origen,
        "bd": bd,
        "datos": datos,
        "hash_antes": hash_antes,
        "hash_despues": hash_despues,
        "hash_igual": hash_igual,
    }