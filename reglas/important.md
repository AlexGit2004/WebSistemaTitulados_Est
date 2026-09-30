# IMPORTANT.md — Reglas Críticas de Arquitectura, BD y Despliegue

Este archivo contiene restricciones técnicas y directrices de diseño que DEBEN ser respetadas rigurosamente por cualquier agente o desarrollador que trabaje en este repositorio.

---

## 1. Reglas de Base de Datos y Modelo de Datos

* **Tabla Unificada con Discriminador:** 
  Las entidades `Titulado` y `Egresado` DEBEN residir en una única tabla de PostgreSQL (ej. `personas` o `estudiantes_egresados`) para permitir consultas eficientes y reportes agregados.
  * Se debe incluir la columna `tipo` (ENUM o VARCHAR: `'TITULADO'` / `'EGRESADO'`).
  * `cedula_identidad` es la LLAVE ÚNICA (UNIQUE) e irrepetible en toda la tabla.

* **Campos Estáticos de Kardex (Marcados con 'K'):**
  * Los campos con prefijo K (`nombres_apellidos`, `cedula_identidad`, `genero`, `semestre_ingreso`, `semestre_egreso`, `anio_titulacion`, `modalidad_titulacion`, `area_especializacion`) son datos formales inmutables cargados por el administrador.
  * No deben permitir edición accidental si en el futuro se extiende el sistema para autoregistro.

* **Condicionalidad Formulario Egresados (Flujo Interactivo):**
  La lógica visual y de persistencia de titulación para egresados debe respetar la siguiente matriz estricta:
  1. Si `planea_titularse` == 'SI' -> Mostrar `inicio_proceso_titulacion` ('SI'/'NO').
     - Si `inicio_proceso_titulacion` == 'NO' -> Pedir `motivo_no_titulacion`.
  2. Si `planea_titularse` IN ('NO', 'NO_SABE') -> Pedir `motivo_no_titulacion`.

---

## 2. Reglas de Exportación, Backups y Memoria (Next.js Server-Side)

* **Exportación en Memoria (SIN Sistema de Archivos Efímero):**
  * Queda **estrictamente prohibido** escribir archivos exportados (Excel, CSV, PDF) en el disco duro local o en carpetas públicas (ej. `fs.writeFileSync('./exports/...')`). Esto rompe el despliegue en entornos Serverless / Docker efímeros.
  * Todos los reportes (Excel/CSV con `exceljs`/`papaparse` y PDFs) DEBEN generarse en memoria RAM como `Buffer` o `Stream`.
  * Los API Routes (`src/app/api/.../route.ts`) responderán directamente devolviendo un `NextResponse` con los headers:
    - `Content-Type: text/csv` o `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` / `application/pdf`
    - `Content-Disposition: attachment; filename="..."`

* **Generación de Backups de Base de Datos:**
  * No confiar en llamadas de sistema `child_process.exec('pg_dump')` ya que los contenedores Node/Next.js de producción no incluyen el cliente de PostgreSQL.
  * Los backups se generarán consultando la base de datos vía ORM (Drizzle) y serializando el esquema/datos en JSON/SQL directamente en memoria HTTP stream.

---

## 3. Arquitectura y Monopuerto (Next.js App Router)

* **Unificación Full-stack:**
  * El sistema opera bajo un **único servidor y un único puerto** (Next.js App Router).
  * El frontend habita en `src/app/(modulo)` y la API en `src/app/api/...`.
  * No usar servidores express separados ni configurar CORS cross-origin innecesarios.

* **Rendimiento e Integridad:**
  * Ninguna operación de lectura del Dashboard debe bloquear las transacciones activas de la BD.
  * Usar agrupaciones (`GROUP BY`, `COUNT`, `AVG`) directamente desde la BD en lugar de procesar grandes volúmenes de arrays en JS.