# Informe de Verificación de Calidad, Seguridad y Privacidad

**Sistema de Seguimiento a Titulados y Egresados — Carrera de Estadística, UMSA**
Suite: `test_calidad2.py` v2.0 (+ control PRI-09) · Datos crudos: `resultados.json` · Entrega: `resultados.docx`

---

## 1. Qué es este informe y qué no es

Resultado de **66 controles** sobre el código. Cada control declara la norma, **qué se midió**
(con números), el **umbral exigido** y la **evidencia** (archivos). Un PASS significa que se midió una
proporción y superó el umbral; no basta con que un archivo contenga una palabra.

**No es:** una certificación ISO (ISO/IEC 25010, 27001, 27002, 29119 y 27701 se citan como referencia
de los controles); una prueba de penetración; un análisis de vulnerabilidades de dependencias;
una medición de accesibilidad (sin axe/Lighthouse **no puede afirmarse conformidad WCAG**); ni una
prueba contra PostgreSQL en ejecución.

**Cómo se ejecutó cada parte:**

- 3 controles ejecutan herramientas reales: `tsc --noEmit`, `next lint`, `node --test` (DIN-01/02/03).
  Los otros 63 son análisis estático (DIN-04 incluido: busca palabras clave, no ejecuta nada).
- Los controles estáticos se re-ejecutaron en la revisión sobre el zip entregado.
- DIN-01..03 **no se pudieron re-ejecutar** en la revisión (el zip no incluye `node_modules`). Sus cifras
  (0 errores de tipos, 0 errores de lint, 74/83 pruebas) provienen de la ejecución original del agente.

## 2. Resultado global

| Ejecución | PASS | FAIL | WARN | SKIP | Total |
|---|---|---|---|---|---|
| Completa (con dinámicos, cifras de la ejecución original + PRI-09) | 50 | 7 | 8 | 1 | 66 |
| Estática sobre el zip (`--sin-dinamicos`, re-ejecutada) | 46 | 7 | 9 | 4 | 66 |

La diferencia entre ambas son DIN-01/02/03 (omitidos), AUD-02 (pasa a WARN si no hay dinámicos) y
CAL-11 (el zip no trae la carpeta `drizzle/`; confirmar si es del empaquetado o falta de migraciones).

## 3. Los incumplimientos

### 3.1 PRI-04 / PRI-05 / PRI-09 — El anonimato no se aplica, y no se arregla solo con `K_MIN`
**Medido:** `src/lib/privacidad.ts` fija `K_MIN = 1`. El aviso al titular
(`AvisoProteccionDatos.tsx`) y el comentario de `dashboard/route.ts` prometen "menos de 5 personas".
**Hallazgo adicional (PRI-09):** `muestraSuficiente(n, k)` **ignora `k`** (solo evalúa `n > 0`) y
`aplicarKAnonimato` retorna sin filtrar si `k <= 1`. Por eso **subir `K_MIN` a 5 no suprimiría ningún
grupo**: hay que corregir también `muestraSuficiente` para que devuelva `n >= k`.
**Umbral:** k ≥ 5 y que el umbral se aplique de verdad.
**Además:** `exportar/pdf/route.ts` documenta que el PDF no lleva k-anonimato (es solo admin; decisión a
justificar por escrito).
**Acción:** (1) `muestraSuficiente` → `n >= k`; (2) `K_MIN = 5`; (3) alinear aviso y comentarios.

### 3.2 DIN-03 — La suite de pruebas del proyecto está en rojo *(cifra original, no re-verificada)*
74/83 (89.2%), 11 fallos, todos de umbral (*"el umbral por defecto es 5"*, *"un grupo de 1 persona no
se publica"*, …). El proyecto ya trae el test que exige K=5. **Ojo:** como `muestraSuficiente` ignora
`k`, es probable que algunas de esas pruebas sigan fallando tras cambiar solo `K_MIN`; el cierre
completo requiere el arreglo de 3.1.

### 3.3 PRI-02 — Consentimiento explícito ausente en los portales
1/3 formularios lo piden (`registro/page.tsx`); faltan `portal/titulado` y `portal/egresado`. Umbral: 100%.

### 3.4 REG-06 — El respaldo depende de `pg_dump`
`scripts/backup.sh` invoca `pg_dump` y no hay respaldo generado desde la aplicación, contra
`reglas/important.md` §2 (la imagen de producción no incluye el cliente de PostgreSQL).

### 3.5 CAL-07 — Validación de entrada incompleta
9/16 rutas de escritura con esquema (56.2%); faltan, entre otras, `auth/sesion`, `exportar/enlace`,
`mis-datos`, `noticias/[id]`. Umbral: 100%.

### 3.6 CAL-11 — Migraciones *(solo en la ejecución sobre el zip)*
5/5 ficheros de configuración, pero 0 migraciones SQL en `drizzle/`. Verificar en el repositorio real.

## 4. Avisos (cumple, con deuda)

| Control | Medido | Por qué no es PASS |
|---|---|---|
| SEG-07 Token de sesión | HMAC, caducidad y revocación; sin componente aleatorio | Predecible; añadir 16 bytes aleatorios. |
| SEG-05 Defensa en profundidad | 17 rutas bajo el matcher, 3 fuera | Tienen guard propio; falta la 2.ª capa. |
| SEG-16 Cabeceras | 0/5 (HSTS, nosniff, X-Frame-Options, Referrer-Policy, CSP) | Añadir en `headers()` de Next o el proxy. |
| CAL-03 TypeScript | `strict=true`, 33 usos de `any` | Sobre todo `campo as any` en filtros Drizzle. |
| CAL-04 Cohesión | 2/76 archivos >800 líneas (máx. 923) | Componentes con más de una responsabilidad. |
| CAL-05 Listados | 8/10 con `LIMIT` | `dashboard` y `exportar` sin acotar. |
| CAL-08 Accesibilidad | 5/26 componentes con ARIA | No se ejecutó axe. |
| CAL-12 Datos de prueba | 2/3 seeds ficticios | Falta uno. |

## 5. Lo que está bien, con evidencia

- `tsc --noEmit` 0 errores; ESLint 0 errores y 3 avisos *(ejecución original)*.
- Control de acceso: 20/20 rutas exigibles con guarda en servidor; 4 públicas con mitigación verificada.
- Contraseñas: scrypt N=16384, sal aleatoria de 16 bytes, `timingSafeEqual`.
- Cookies: 6/6 con `httpOnly`, `sameSite` y `secure`.
- Auditoría: 16/16 rutas de escritura con IP, actor y cadena de hash.
- SQL: 0 concatenaciones; las plantillas `sql\`${}\`` de Drizzle son parametrizadas y no se cuentan como inyección.
- Rate limiting por IP e identificador; alta pública sin enumeración (202 uniforme).
- Privacidad: aviso en los 2 puntos de recogida; 4 derechos con vía real; titular solo ve su ficha; 109/150 columnas opcionales.
- Reglas de `important.md`: tabla única con discriminador, cédula UNIQUE, 8 campos Kardex, condicionalidad del egresado, 25 índices, agregación en SQL.
- Exportación: 0 escrituras de reportes a disco (las 2 detectadas son adjuntos del titular).
- Funcionalidad: 13/13 capacidades del plan.

## 6. Auto-auditoría de la suite

- **AUD-01:** ningún control sin norma, umbral o medida; ningún PASS sin evidencia.
- **AUD-02:** cuenta solo los controles que ejecutan herramientas y que realmente corrieron (3/66 en la
  ejecución completa; 0/66 con `--sin-dinamicos`, que se marca WARN). Corregido: antes contaba DIN-04
  (análisis por palabras clave) como ejecución real y mezclaba totales distintos (65/64/63/61).

## 7. Orden de corrección sugerido

1. `muestraSuficiente` usando `k` + `K_MIN = 5` + textos alineados (PRI-04/05/09 y las 11 pruebas de DIN-03). Es lo de mayor riesgo legal.
2. Consentimiento explícito en los dos portales (PRI-02).
3. Respaldo desde la aplicación (REG-06).
4. Esquemas de validación en las 7 rutas restantes (CAL-07).
5. Cabeceras de seguridad (SEG-16) y componente aleatorio en el token (SEG-07).
6. `LIMIT` en `dashboard` y `exportar` (CAL-05); eliminar `as any` (CAL-03).

## 8. Cómo reproducirlo

```bash
cd pruebascalidad/src
python test_calidad2.py                  # completo (~2 min: tsc, lint, tests; requiere node_modules)
python test_calidad2.py --sin-dinamicos  # solo estático, rápido
```

Salida: `resultados.json`, `resultados.docx`. Código de salida 1 si hay algún FAIL (apto para CI).

---

*No constituye certificación. Un PASS significa que la condición medida se cumple en el código en la
fecha indicada, no que el sistema sea correcto en todos sus entornos.*
