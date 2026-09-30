"""
Generador de datos de prueba para el Sistema de Seguimiento a Titulados y Egresados
de la Carrera de Estadistica (UMSA).

Produce un CSV UTF-8 con `N` personas (titulados y egresados) usando nombres y
apellidos bolivianos REALES, incluidos muchos con Ñ y acentos, para poder verificar
que la collation `es-BO-x-icu` de la base de datos los ordena correctamente.

Uso:
    python scripts_generar_seed.py --salida datos_prueba.csv --registros 10000

El CSV lo carga despues `pnpm seed -- --masivo`, que hace la insercion por lotes.
"""

import argparse
import csv
import random
import sys
from datetime import date

# ── Nombres y apellidos bolivianos (con Ñ, acentos y diéresis a proposito) ──────

NOMBRES_M = [
    "Carlos", "José", "Luis", "Juan", "Marco", "Diego", "Fernando", "Jorge",
    "Raúl", "Miguel", "Antonio", "Rodrigo", "Gonzalo", "Nicolás", "Sebastián",
    "Alejandro", "Eduardo", "Hugo", "Iván", "Óscar", "Pablo", "Sergio",
    "Wálter", "Freddy", "Ramiro", "Máximo", "Álvaro", "Renzo", "Gualberto",
    "Wilson", "Nelvin", "Rómulo", "Zenón", "Adolfo", "Leopoldo", "Bernardo",
]

NOMBRES_F = [
    "María", "Ana", "Carmen", "Rosa", "Lucía", "Gabriela", "Fernanda", "Mariana",
    "Katherine", "Verónica", "Silvia", "Patricia", "Claudia", "Yolanda", "Norma",
    "Mónica", "Daniela", "Paola", "Alejandra", "Jimena", "Valeria", "Ximena",
    "Josefa", "Concepción", "Órgulo", "Ángela", "Rocío", "Ámbar", "Noelia", "Gisela",
]

APELLIDOS = [
    # Los 6 siguientes empiezan con Ñ a propósito, para probar la collation
    "Ñuñez", "Ñiquén", "Ñuricalde", "Ñáñez", "Ñoño", "Ñañez",
    "Mendoza", "Quispe", "Mamani", "Choque", "Rojas", "Flores", "Pérez", "Peralta",
    "García", "Martínez", "López", "Sánchez", "Ramírez", "Torres", "Vargas",
    "Salazar", "Oquendo", "Aponte", "Condori", "Apaza", "Chávez", "Cáceres",
    "Guzmán", "Zeballos", "Villarroel", "Mariscal", "Escóbar", "Antezana",
    "Callisaya", "Mamani", "Huanca", "Choque", "Apaza", "Ulloa", "Zuna",
    "Villca", "Limachi", "Ccahuana", "Chambilla", "Quispe", "Colque", "Mamani",
    "Aliaga", "Bustos", "Fernández", "Gutiérrez", "Machicado", "Óñez",
    "Ortiz", "Parada", "Roca", "Saavedra", "Terceros", "Valdez", "Zubiaga",
    "Angulo", "Ballivián", "Canelas", "Dávalos", "Escalante", "Figueroa",
    "García", "Huerta", "Ibáñez", "Jiménez", "Klein", "Landívar", "Monroy",
    "Navia", "Ortega", "Paz", "Quiroga", "Roca", "Sotelo", "Tapia", "Vega",
    "Wieler", "Yépez", "Zapana", "Arispe", "Blanes", "Cabré", "Díez",
]

# Departamentos de Bolivia con sus ciudades
DEPARTAMENTOS = [
    ("La Paz", ["La Paz", "El Alto", "Viacha", "Achacachi", "Coroico"]),
    ("Santa Cruz", ["Santa Cruz de la Sierra", "Montero", "Santa Ynez"]),
    ("Cochabamba", ["Cochabamba", "Quillacollo", "Sacaba", "Punata"]),
    ("Potosí", ["Potosí", "Llallagua", "Villa imperial", "Tupiza"]),
    ("Oruro", ["Oruro", "Huanuni", "Challapata"]),
    ("Chuquisaca", ["Sucre", "Monteagudo", "Azurduy"]),
    ("Tarija", ["Tarija", "Yacuiba", "Bermejo"]),
    ("Beni", ["Trinidad", "Riberalta"]),
    ("Santa Cruz (exterior)", ["Brasil", "España"]),
]

SECTORES = ["PUBLICO", "PRIVADO", "ACADEMICO", "ONG", "OTRO"]
SECTORES_OTRO = [
    "Gobierno municipal", "Empresa pública", "Organismo internacional",
    "Consultora", "Cooperativa", "Fundación", "Empresa familiar",
    "Banco privado", "Telecomunicaciones", "Sector salud",
]
ESTADOS = ["EMPLEADO", "DESEMPLEADO", "INDEPENDIENTE"]
MODALIDADES = ["Tesis", "Proyecto de grado", "Examen de grado", "Trabajo dirigido", "Otro"]
GENEROS = ["MASCULINO", "FEMENINO", "PREFIERO_NO_DECIR"]
AREAS = [
    "Estadística Aplicada", "Bioestadística", "Econometría", "Minería de Datos",
    "Estadística Social", "Demografía", "Inferencia Bayesiana", "Control de Calidad",
    "Ciencia de Datos", "Modelos Lineales", "Diseño de Experimentos", "Análisis de Series",
    "Estadística Ambiental", "Finanzas y Riesgos", "Salud Pública", "Investigación de Mercados",
]
CARGO_SEG = ["Analista de Datos", "Especialista en Modelamiento", "Técnico Estadístico",
             "Docente", "Investigador", "Asistente de Investigación", "Coordinador de M&E",
             "Analista de Riesgo", "Consultor de BI", "Científico de Datos", "Auditor Estadístico",
             "Analista de Sistemas", "Responsable de Planejamento", "Economista Junior"]
PLANEA = ["SI", "SI", "SI", "NO", "NO_SABE"]
INICIO = ["SI", "NO"]
MOTIVO = ["LABORAL", "ECONOMICO", "PERSONAL", "EN_PROCESO", "OTRO"]

ENCABEZADOS = [
    "tipo", "nombres_apellidos", "cedula_identidad", "genero", "semestre_ingreso",
    "semestre_egreso", "anio_egreso", "anio_titulacion", "modalidad_titulacion",
    "area_especializacion", "planea_titularse", "inicio_proceso_titulacion",
    "motivo_no_titulacion", "correo_electronico", "telefono", "redes_sociales",
    "ciudad_region_trabajo", "estado_laboral", "sector_trabajo", "sector_trabajo_otro",
    "ocupacion_cargo", "trabaja_en_estadistica", "tiempo_egreso_titulacion_meses",
    "tiempo_insercion_laboral_meses", "observaciones",
]


def ci_bolivia(rng: random.Random) -> str:
    """CI boliviana: 4-8 dígitos + sufijo de departamento."""
    sufijos = ["LP", "SC", "CB", "TQ", "OR", "PT", "CB", "SC"]
    digitos = rng.choice([rng.randint(1000000, 9999999), rng.randint(10000000, 99999999)])
    return f"{digitos}{rng.choice(sufijos)}"


def semestre(anio: int, rng: random.Random) -> str:
    return f"{rng.choice(['I', 'II'])}/{anio}"


def slug(texto: str) -> str:
    tabla = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ ", "aeiouunAEIOUUN-")
    return texto.translate(tabla).replace("--", "-").lower()


def generar(n: int, seed: int, anio_inicio_carrera: int = 2009):
    rng = random.Random(seed)
    cis_usadas = set()
    filas = []

    HOY = date.today().year

    for i in range(n):
        # 72% titulados, 28% egresados (aproximando la realidad de la carrera)
        es_titulado = rng.random() < 0.72

        genero = rng.choices(GENEROS, weights=[46, 46, 8])[0]
        if genero == "PREFIERO_NO_DECIR":
            nombre = rng.choice(NOMBRES_M + NOMBRES_F)
            segundo = rng.choice(NOMBRES_M + NOMBRES_F)
        else:
            pool = NOMBRES_M if genero == "MASCULINO" else NOMBRES_F
            nombre = rng.choice(pool)
            segundo = rng.choice(pool)
            # 6% de "PREFIERO_NO_DECIR" con nombres coherentes
            if rng.random() < 0.06:
                genero = "PREFIERO_NO_DECIR"

        nombre = f"{nombre} {segundo} {rng.choice(APELLIDOS)} {rng.choice(APELLIDOS)}"

        # CI única
        while True:
            ci = ci_bolivia(rng)
            if ci not in cis_usadas:
                cis_usadas.add(ci)
                break

        anio_ing = rng.randint(anio_inicio_carrera, HOY - 4)
        duracion = rng.choice([4, 4, 4, 5, 5, 6])
        anio_eg = anio_ing + duracion
        if anio_eg > HOY:
            anio_eg = HOY

        # Estado laboral
        estado = rng.choices(ESTADOS, weights=[72, 16, 12])[0]
        # En descriptors, ~8% no dijo nada
        if rng.random() < 0.08:
            estado = "DESEMPLEADO"
            sector = ""
        else:
            sector = rng.choice(SECTORES)

        sector_otro = ""
        if sector == "OTRO" and rng.random() < 0.85:
            sector_otro = rng.choice(SECTORES_OTRO)
        elif sector == "OTRO":
            sector_otro = ""

        esta_en_estadistica = (
            "SI"
            if (estado != "DESEMPLEADO" and sector in ("ACADEMICO", "PUBLICO", "PRIVADO") and rng.random() < 0.62)
            else "NO"
        )

        if rng.random() < 0.93:
            depto, ciudades = rng.choice(DEPARTAMENTOS)
            ciudad = rng.choice(ciudades)
        else:
            ciudad = ""  # 7% sin ciudad (para probar "Sin especificar")

        correo = f"{slug(nombre).replace('-', '.')}@{rng.choice(['gmail.com', 'umsa.bo', 'hotmail.com', 'outlook.com', 'yahoo.es'])}"
        telefono = f"7{rng.randint(1000000, 9999999)}"

        if es_titulado:
            # Titulan entre 0 y 36 meses después del egreso, sin pasar del año actual.
            meses = rng.choice([0, 4, 6, 8, 10, 12, 12, 18, 24, 30, 36])
            anio_tit = min(anio_eg + (meses // 12), HOY)
            modalidad = rng.choice(MODALIDADES)
            area = rng.choice(AREAS)
            # Matriz condicional: el titular no tiene estos 3 campos
            planea = inicio = motivo = ""
            tiempo_egr_tit = (anio_tit - anio_eg) * 12
        else:
            anio_tit = ""
            modalidad = ""
            area = ""
            # Matriz condicional de egresados (important.md seccion 1)
            planea = rng.choice(PLANEA)
            if planea == "SI":
                inicio = rng.choice(INICIO)
                motivo = "" if inicio == "SI" else rng.choice(MOTIVO)
            else:
                inicio = ""
                motivo = rng.choice(MOTIVO)
            tiempo_egr_tit = ""

        insercion = ""
        if estado != "DESEMPLEADO" and rng.random() < 0.85:
            insercion = rng.choice([0, 1, 2, 2, 3, 3, 4, 5, 6, 6, 8, 9, 12, 12, 18, 24, 30])

        filas.append({
            "tipo": "TITULADO" if es_titulado else "EGRESADO",
            "nombres_apellidos": nombre,
            "cedula_identidad": ci,
            "genero": genero,
            "semestre_ingreso": semestre(anio_ing, rng),
            "semestre_egreso": semestre(anio_eg, rng),
            "anio_egreso": anio_eg,
            "anio_titulacion": anio_tit,
            "modalidad_titulacion": modalidad,
            "area_especializacion": area,
            "planea_titularse": planea,
            "inicio_proceso_titulacion": inicio,
            "motivo_no_titulacion": motivo,
            "correo_electronico": correo,
            "telefono": telefono,
            "redes_sociales": "" if rng.random() < 0.45 else f"linkedin.com/in/{slug(nombre).replace('-', '')}",
            "ciudad_region_trabajo": ciudad,
            "estado_laboral": estado,
            "sector_trabajo": sector,
            "sector_trabajo_otro": sector_otro,
            "ocupacion_cargo": rng.choice(CARGO_SEG) if estado != "DESEMPLEADO" else "",
            "trabaja_en_estadistica": esta_en_estadistica,
            "tiempo_egreso_titulacion_meses": tiempo_egr_tit,
            "tiempo_insercion_laboral_meses": insercion,
            "observaciones": "" if rng.random() < 0.88 else "Registro de prueba generado automáticamente.",
        })

    return filas


def main():
    ap = argparse.ArgumentParser(description="Genera datos de prueba para el sistema de seguimiento.")
    ap.add_argument("--salida", default="datos_prueba.csv", help="Ruta del CSV de salida")
    ap.add_argument("--registros", type=int, default=10000, help="Cantidad de personas a generar")
    ap.add_argument("--seed", type=int, default=20260930, help="Semilla para reproducibilidad")
    args = ap.parse_args()

    print(f"Generando {args.registros} registros (seed={args.seed})...")
    filas = generar(args.registros, args.seed)

    with open(args.salida, "w", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=ENCABEZADOS)
        escritor.writeheader()
        escritor.writerows(filas)

    titulados = sum(1 for x in filas if x["tipo"] == "TITULADO")
    egresados = len(filas) - titulados
    con_enie = sum(1 for x in filas if any("\u00d1" in c for c in x["nombres_apellidos"]))
    con_acentos = sum(1 for x in filas if any(c in x["nombres_apellidos"] for c in "áéíóúÁÉÍÓÚüÜ"))

    print(f"OK  ->  {args.salida}")
    print(f"  titulados:      {titulados}")
    print(f"  egresados:      {egresados}")
    print(f"  con Ñ:          {con_enie}   (para probar la collation)")
    print(f"  con acentos:    {con_acentos}")
    return 0


if __name__ == "__main__":
    sys.exit(main())