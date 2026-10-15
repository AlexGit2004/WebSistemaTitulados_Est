# Pruebas de Calidad y Seguridad

Sistema de Seguimiento a Titulados y Egresados — Carrera de Estadística, UMSA

**Resultado: 82/82 pruebas superadas (0 fallidas)**

## Estructura (4/4)

| Estado | Prueba | Detalle | Descripción |
|---|---|---|---|
| PASS | Carpeta app/ |  | Verifica que la carpeta exista |
| PASS | Carpeta components/ |  | Verifica que la carpeta exista |
| PASS | Carpeta db/ |  | Verifica que la carpeta exista |
| PASS | Carpeta lib/ |  | Verifica que la carpeta exista |

## Seguridad (49/49)

| Estado | Prueba | Detalle | Descripción |
|---|---|---|---|
| PASS | API protegida: app/api/auditoria/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API pública con mitigación: app/api/auth/login/route.ts | establece la sesión, así que no puede exigir una; compensa con límite de intentos por IP y por cuenta, y registra cada fallo en la auditoría | Ruta API pública con mitigación documentada |
| PASS | API protegida: app/api/auth/sesion/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/carreras/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/dashboard/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/exportar/enlace/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/exportar/pdf/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/exportar/preview/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/exportar/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/importar/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/kardex/solicitudes/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/mis-datos/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/noticias/[id]/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/noticias/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/personas/[id]/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/personas/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API pública con mitigación: app/api/registro/route.ts | alta pública de graduados; compensa con rate limit por IP, respuesta idéntica exista o no la cédula y registro que nace PENDIENTE | Ruta API pública con mitigación documentada |
| PASS | API protegida: app/api/registros/[id]/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/registros/pendientes/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/solicitudes/[id]/documentos/[documentoId]/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/solicitudes/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/usuarios/[id]/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API protegida: app/api/usuarios/route.ts | exige sesión | Ruta API requiere sesión autenticada |
| PASS | API pública con mitigación: app/api/verificar/route.ts | el token del enlace ES la credencial; compensa con vigencia de 48 h, máximo de intentos y marca de uso | Ruta API pública con mitigación documentada |
| PASS | Sin credenciales hardcodeadas |  | Verifica el requisito correspondiente |
| PASS | Cookies httpOnly |  | Cookies configuradas como httpOnly/sameSite |
| PASS | Cookie sameSite | restringida al mismo sitio | Cookies configuradas como httpOnly/sameSite |
| PASS | Sistema de auditoría |  | Registra eventos de auditoría con IP y usuario |
| PASS | Auditoría identifica usuario y dirección IP | actor (id_usuario) y origen (ip) en audit_log | Registra eventos de auditoría con IP y usuario |
| PASS | Auditoría en rutas de escritura | todas registran | Registra eventos de auditoría con IP y usuario |
| PASS | Rate limiting |  | Limita peticiones por identificador (no solo IP) |
| PASS | Rate limit por identificador, no solo por IP |  | Verifica el requisito correspondiente |
| PASS | Hash de contraseñas |  | Contraseñas almacenadas con hash y sal aleatoria |
| PASS | Hash con sal aleatoria y comparación en tiempo constante | sal por usuario + timingSafeEqual | Verifica el requisito correspondiente |
| PASS | Sin comparación de contraseña en texto plano |  | Verifica el requisito correspondiente |
| PASS | Middleware de protección |  | Verifica el requisito correspondiente |
| PASS | Middleware cubre /admin y /portal | ambos prefijos protegidos en el servidor | Verifica el requisito correspondiente |
| PASS | Sin SQL injection |  | Verifica el requisito correspondiente |
| PASS | Consultas parametrizadas | valores siempre como parámetro | Verifica el requisito correspondiente |
| PASS | Sin XSS |  | Verifica el requisito correspondiente |
| PASS | Variables de entorno |  | Verifica el requisito correspondiente |
| PASS | Secretos fuera del repositorio | .gitignore cubre .env y .env.example usa marcadores (las claves secretas usan marcadores) | Credenciales fuera del repositorio .env |
| PASS | Configuración HTTPS |  | Verifica el requisito correspondiente |
| PASS | CORS cerrado (sistema de un solo origen) | sin Access-Control-Allow-Origin: * (correcto en same-origin) | Verifica el requisito correspondiente |
| PASS | Consola sin datos sensibles |  | Verifica el requisito correspondiente |
| PASS | Token de verificación con caducidad y uso único | expira, limita intentos y se marca usado | Verifica el requisito correspondiente |
| PASS | Alta pública sin enumeración de cédulas | respuesta compartida, status únicos: ['202', '400', '429', '500'] | Verifica el requisito correspondiente |
| PASS | Cédula de identidad única en el esquema | restricción UNIQUE + índice único | Verifica el requisito correspondiente |
| PASS | Credenciales fuera de la URL | ninguna credencial en la URL; el token de verificación caduca, limita intentos y es de un solo uso | Verifica el requisito correspondiente |

## Calidad (12/12)

| Estado | Prueba | Detalle | Descripción |
|---|---|---|---|
| PASS | Validación de entradas (zod) |  | Verifica el requisito correspondiente |
| PASS | Logging de eventos (audit_log, no consola) | registro estructurado usado en 22 archivo(s) | Registra eventos de auditoría con IP y usuario |
| PASS | Archivos con manejo de errores (48/76) |  | Verifica el requisito correspondiente |
| PASS | Documentación (README) |  | Verifica el requisito correspondiente |
| PASS | Pruebas unitarias |  | Verifica el requisito correspondiente |
| PASS | TypeScript configurado |  | Verifica el requisito correspondiente |
| PASS | Linting (ESLint) |  | Verifica el requisito correspondiente |
| PASS | Diseño responsive |  | Verifica el requisito correspondiente |
| PASS | Accesibilidad (ARIA) |  | Verifica el requisito correspondiente |
| PASS | Optimización de performance |  | Verifica el requisito correspondiente |
| PASS | Paginación en el servidor con tope máximo | 11 ruta(s) acotada(s); perPage con tope | Verifica el requisito correspondiente |
| PASS | Búsqueda y filtros |  | Verifica el requisito correspondiente |

## Funcionalidad (17/17)

| Estado | Prueba | Detalle | Descripción |
|---|---|---|---|
| PASS | KPI del plan implementados (8) | los 8 disponibles | KPIs definidos y calculados en el dashboard |
| PASS | Exportación de datos |  | Verifica el requisito correspondiente |
| PASS | Importación de datos |  | Verifica el requisito correspondiente |
| PASS | Notificaciones |  | Verifica el requisito correspondiente |
| PASS | Generación de reportes PDF |  | Verifica el requisito correspondiente |
| PASS | Sistema de backups |  | Verifica el requisito correspondiente |
| PASS | Migraciones de BD |  | Verifica el requisito correspondiente |
| PASS | Seed de datos |  | Cargar datos de prueba en la base |
| PASS | Gestión de usuarios admin |  | Verifica el requisito correspondiente |
| PASS | Gestión de personas |  | Verifica el requisito correspondiente |
| PASS | Visualización de auditoría |  | Registra eventos de auditoría con IP y usuario |
| PASS | Portal del titulado |  | Verifica el requisito correspondiente |
| PASS | Portal del egresado |  | Verifica el requisito correspondiente |
| PASS | KPIs |  | KPIs definidos y calculados en el dashboard |
| PASS | Dashboard admin |  | Verifica el requisito correspondiente |
| PASS | Página de login |  | Verifica el requisito correspondiente |
| PASS | Gestión de noticias |  | Verifica el requisito correspondiente |
