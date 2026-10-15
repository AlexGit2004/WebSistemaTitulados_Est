# Validación en ejecución — Sistema de Seguimiento a Titulados y Egresados

**2026-10-13T19:33:42-04:00** · Suite `run_validacion.py` · controles: **10** · OK 1 · FALLO 8 · AVISO 0 · N/AP 1

## 1. Qué mide este informe y qué NO

Se ejecutó el sistema **en funcionamiento** y se le enviou peticiones reales. Un PASS significa *«se midió y cumplió en esta ejecución»*, no «el sistema es correcto».

**Límites, declarados de antemano:**

- Entorno **local**, no producción, y con **datos ficticios**.
- **No es una prueba de penetración profesional**: no hay escaneo de vulnerabilidades, ni análisis del cliente, ni revisión manual de la lógica de negocio.
- **No es una prueba de carga**: 50 peticiones concurrentes dicen poco sobre el comportamiento con el volumen real de la Carrera.
- **No se certifica conformidad WCAG**: solo se reportan las violaciones que axe-core midió en las páginas probadas.
- Docker no estaba disponible en la máquina: el aislamiento se logró con una **base de datos propia y efímera** y un **puerto propio**, no con contenedores.

## 2. Entorno

- Servidor: `next start` (producción) en http://127.0.0.1:3111
- Base de datos: `sistitulados_calidad (efímera)` (creada y destruida por la suite)
- Datos: 5 personas y 5 cuentas ficticias sembradas por la propia suite
- Huella del código antes/después: `900ff3ba483e94d3…` / `900ff3ba483e94d3…` → **idéntica**

## 3. Resumen por categoría

- **Privacidad**: OK 0 · FALLO 5 · AVISO 0 · N/AP 0
- **Acceso y sesión**: OK 0 · FALLO 2 · AVISO 0 · N/AP 1
- **Entorno**: OK 0 · FALLO 1 · AVISO 0 · N/AP 0
- **Integridad**: OK 1 · FALLO 0 · AVISO 0 · N/AP 0

## 4. Controles


### Privacidad

| Estado | ID | Control | Qué hace la prueba | Medida | Umbral | Evidencia |
|---|---|---|---|---|---|---|
| **FALLO** | `B-PRI-01` | Respuesta pública sin datos personales | Recorre todas las rutas públicas sin sesión y busca nombres, cédulas, correos y secuencias largas de dígitos, tanto los sembrados como por forma. Interpretación: PASS = ninguna respuesta pública contiene un dato capaz de identificar a una persona. | 6 hallazgo(s) de PII en 7 rutas públicas | 0 hallazgos en todas las rutas públicas | GET /api/dashboard → HTTP 200 · cuerpo: {"kpisTitulados":{"metric_value":100,"total_sample":3,"show_kpi":true,"totalTitulados":3,"tasaEmpleabilidadTit<br>GET /api/noticias → HTTP 200 · cuerpo: [] · sin PII<br>GET /api/carreras → HTTP 401 · cuerpo: {"error":"Debe iniciar sesión"} · sin PII<br>GET / → HTTP 200 · cuerpo: <!DOCTYPE html><html lang="es"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-s… · |
| **FALLO** | `B-PRI-02` | Un grupo de 1 persona sí aparece en los indicadores | Comprueba que la cohorte con una sola persona aparece en la serie anual. Interpretación: PASS = los conteos agregados se publican sin umbral, como se decidió; la privacidad no depende de ocultar celdas. | fila del año 2099 presente=False; contenido=ausente | el conteo de la cohorte de 1 persona aparece con valor >= 1 | GET /api/dashboard → HTTP 200 |
| **FALLO** | `B-PRI-03` | Aislamiento del titular (IDOR) | Con sesión de un titular pide la ficha de otra cédula, tanto para leer como para escribir. Interpretación: 403/404 = el aislamiento por titular funciona; un 200 sería una fuga de datos entre egresados. | ficha propia HTTP 401; ficha ajena ([TACHADO:cedula]) HTTP 401; escritura sobre ficha ajena HTTP 401 | 100% de las peticiones sobre otra ficha devuelven 403/404 | GET /api/personas?ci=[TACHADO:cedula] → HTTP 401 · cuerpo: {"error":"Debe iniciar sesión"}<br>PATCH /api/personas?ci=[TACHADO:cedula] → HTTP 401 · cuerpo: {"error":"Debe iniciar sesión"} |
| **FALLO** | `B-PRI-04` | Consentimiento obligatorio, validado en el servidor | Envía un cambio de perfil sin marcar el consentimiento y luego marcándolo. Interpretación: 400 y luego 2xx demuestra que la casilla no es un adorno del formulario: el servidor la exige. | sin consentimiento: HTTP 401; con consentimiento: HTTP 401 | 400 sin la casilla y 2xx con la casilla | PATCH sin consentimiento → HTTP 401 · cuerpo: {"error":"Debe iniciar sesión"}<br>PATCH con consentimiento → HTTP 401 · cuerpo: {"error":"Debe iniciar sesión"} |
| **FALLO** | `B-PRI-05` | Datos personales sin caché (Cache-Control: no-store) | Lee la cabecera Cache-Control de una respuesta con datos personales. Interpretación: no-store evita que un intermediary guarde datos identificables en una caché compartida. | Cache-Control de la ficha propia: (ausente) | no-store en las respuestas con datos personales | GET /api/personas?ci=<propia> → Cache-Control: (ausente)<br>GET /api/auditoria → Cache-Control: (ausente) |

### Acceso y sesión

| Estado | ID | Control | Qué hace la prueba | Medida | Umbral | Evidencia |
|---|---|---|---|---|---|---|
| **FALLO** | `B-SEG-01` | Matriz de roles ruta × perfil | Recorre la matriz ruta × perfil (sin sesión, titulado, egresado, kardex, admin) y compara el status con el declarado. Interpretación: cualquier desviación significa que la autorización real difiere de la documentada. | 18 desviación(es) sobre 60 comprobaciones (12 rutas × 5 perfiles) | 0 desviaciones respecto de la matriz declarada | titulado no pudo iniciar sesión: HTTP 403<br>egresado no pudo iniciar sesión: HTTP 403<br>kardex no pudo iniciar sesión: HTTP 403<br>admin no pudo iniciar sesión: HTTP 403 |
| **N/AP** | `B-SEG-02` | Banderas de las cookies de sesión | Inspecciona los atributos de cada Set-Cookie de sesión. Interpretación: HttpOnly evita el robo por JavaScript, SameSite limita el CSRF y Secure exige TLS. | 0 cookies de sesión emitidas | HttpOnly + SameSite + Secure en todas | — |
| | | | *Nota*: el login no devolvió cookie: no se puede verificar el control | | | |
| **FALLO** | `B-SEG-03` | Límite de intentos de inicio de sesión | Repite intentos de login con contraseña incorrecta y luego prueba con otra cédula. Interpretación: el 429 en ambos casos demuestra que el límite es por IP y por identificador, no solo por IP. | estados observados=[403, 403, 403, 403, 403, 403, 403, 403, 403]; estado final tras agotar el límite=403 | bloqueo (429) antes del décimo intento, por IP y por identificador | intentos consecutivos → [403, 403, 403, 403, 403, 403, 403, 403, 403]<br>último → HTTP 403 · cuerpo: {"error":"Configuración de seguridad incompleta en el servidor"} |

### Entorno

| Estado | ID | Control | Qué hace la prueba | Medida | Umbral | Evidencia |
|---|---|---|---|---|---|---|
| **FALLO** | `B-ENV` | Ejecutar la batería de pruebas |  | RuntimeError: Cannot send a request, as the client has been closed. | la batería debe completarse | — |
| | | | *Nota*: la ejecución se interrumpió por un error no controlado | | | |

### Integridad

| Estado | ID | Control | Qué hace la prueba | Medida | Umbral | Evidencia |
|---|---|---|---|---|---|---|
| **OK** | `B-INT` | Las pruebas no alteraron el código del sistema |  | sha256 del código 900ff3ba483e94d3… → 900ff3ba483e94d3… | huella idéntica antes y después | antes:  900ff3ba483e94d34d0e96af7fee[TACHADO:telefono]e41715a8190a52e7e979b397c<br>después: 900ff3ba483e94d34d0e96af7fee[TACHADO:telefono]e41715a8190a52e7e979b397c |

## 5. Incumplimientos

- **`B-PRI-01` Respuesta pública sin datos personales** — medido: 6 hallazgo(s) de PII en 7 rutas públicas. Umbral: 0 hallazgos en todas las rutas públicas.
- **`B-PRI-02` Un grupo de 1 persona sí aparece en los indicadores** — medido: fila del año 2099 presente=False; contenido=ausente. Umbral: el conteo de la cohorte de 1 persona aparece con valor >= 1.
- **`B-PRI-03` Aislamiento del titular (IDOR)** — medido: ficha propia HTTP 401; ficha ajena ([TACHADO:cedula]) HTTP 401; escritura sobre ficha ajena HTTP 401. Umbral: 100% de las peticiones sobre otra ficha devuelven 403/404.
- **`B-PRI-04` Consentimiento obligatorio, validado en el servidor** — medido: sin consentimiento: HTTP 401; con consentimiento: HTTP 401. Umbral: 400 sin la casilla y 2xx con la casilla.
- **`B-PRI-05` Datos personales sin caché (Cache-Control: no-store)** — medido: Cache-Control de la ficha propia: (ausente). Umbral: no-store en las respuestas con datos personales.
- **`B-SEG-01` Matriz de roles ruta × perfil** — medido: 18 desviación(es) sobre 60 comprobaciones (12 rutas × 5 perfiles). Umbral: 0 desviaciones respecto de la matriz declarada.
- **`B-SEG-03` Límite de intentos de inicio de sesión** — medido: estados observados=[403, 403, 403, 403, 403, 403, 403, 403, 403]; estado final tras agotar el límite=403. Umbral: bloqueo (429) antes del décimo intento, por IP y por identificador.
- **`B-ENV` Ejecutar la batería de pruebas** — medido: RuntimeError: Cannot send a request, as the client has been closed.. Umbral: la batería debe completarse.

## 6. Controles no ejecutados

- `B-SEG-02` Banderas de las cookies de sesión: 0 cookies de sesión emitidas. el login no devolvió cookie: no se puede verificar el control

---

*Informe generado automáticamente. Los datos sensibles aparecen tachados por diseño: comprobar que no se filtran no justifica filtrarlos en el informe.*