# Sistema de Seguimiento a Titulados y Egresados
### Carrera de Estadística — Universidad Mayor de San Andrés

Aplicación web para registrar y mantener actualizada la información de titulados y egresados,
y generar los indicadores consolidados que la carrera presenta ante la comisión de evaluación
externa de acreditación.

---

## 1. Requisitos previos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | **22** (o 18.17+) | Framework |
| pnpm | 9 o superior | Gestor de paquetes |
| PostgreSQL | **16** | Base de datos |
| Python | 3.9+ (opcional no se necesita para levantar sistema) | Solo para generar datos de prueba |

```bash
node --version    # v20.x
pnpm --version
psql --version    # PostgreSQL 16.x
```

> Node 22/25 puede funcionar. Si `pnpm install`
> falla complaining sobre scripts de compilación, revise `.npmrc` y `pnpm-workspace.yaml`.

---

## 2. Instalación

```bash
# 1. Instalar dependencias
pnpm install

# 2. Configurar variables de entorno
cp .env.example .env.local      # en Windows:  copy .env.example .env.local
#    Luego editar .env.local con sus datos de PostgreSQL

# 3. Crear la base de datos (ver sección 3, es importante la collation)

# 4. Aplicar el esquema (crea 4 tablas, 11 índices y 12 tipos ENUM)
pnpm db:migrate

# 5. Cargar los datos mínimos (admin + noticias + 10 ejemplos)
pnpm seed

# 6. Arrancar
pnpm dev        # desarrollo, http://localhost:3000

# 7. Cargar 10 000 datos prueba
pnpm seed:masivo
```

### Datos de prueba opcionales

Para levantar un volumen grande y probar el rendimiento de los indicadores:

```bash
#el csv ya esta para ejecutar directamente pnpm seed:masivo
pnpm generar:datos                  # genera datos_prueba.csv con 10.000 personas (Python)

pnpm seed:masivo                    # las carga en la base (por lotes)
```

La semilla es **idempotente**: si las cédulas ya existen, las omite y no duplica nada.

### Otros comandos

```bash
pnpm db:generate    # genera migraciones nuevas cuando cambias src/db/schema.ts
pnpm db:migrate     # aplica las migraciones pendientes
pnpm db:push        # empuja el estado actual del esquema (SOLO desarrollo)
pnpm db:studio      # abre Drizzle Studio para ver la base en el navegador
pnpm build          # build de producción
pnpm start          # ejecuta el build de producción
pnpm seed -- --reset  # borra y recarga los datos mínimos (solo desarrollo)
```


---

## 3. `SESSION_SECRET` — el secreto de la sesión

### Qué es

La sesión se guarda en una cookie `httpOnly` firmada con HMAC-SHA256. El secreto con el que se
firma **nunca sale del servidor** y **nunca se manda al navegador**. Si alguien no tiene la
cookie válida, no puede convertirse en administrador: no hay nada que falsificar desde la consola.

### En desarrollo

`scripts/seed.ts` **no necesita** este valor: en `NODE_ENV !== "production"` la aplicación usa un
secreto de desarrollo. Por eso `pnpm dev` funciona apenas se instala.

### En producción — OBLIGATORIO

La aplicación **lanza un error** al arrancar si `NODE_ENV=production` y falta `SESSION_SECRET`:

```
Error: SESSION_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.
```

### Cómo generarlo

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Sale algo como `aVrG0YqCNcUwk9OgiK7LxX0g03nMZDMtyCtWd6hrObSuIFYIZuM_5l4IRWcu7WId` (64 caracteres).

### Cómo usarlo

Opción A — en el archivo `.env.production` del servidor (recomendado):

```dotenv
SESSION_SECRET=aVrG0YqCNcUwk9OgiK7LxX0g03nMZDMtyCtWd6hrObSuIFYIZuM_5l4IRWcu7WId
```

Opción B — como variable de entorno del proceso, sin dejar el secreto en ningún archivo:

```bash
# Linux, al arrancar con pm2
SESSION_SECRET=$(openssl rand -base64 48) pm2 start npm -- start --name seguimiento

# O en un servicio de systemd, con un archivo 600:
sudo install -m 600 /dev/null /etc/seguit/secret.env
echo "SESSION_SECRET=$(openssl rand -base64 48)" | sudo tee -a /etc/seguit/secret.env
```

### Reglas

- **Nunca** subirlo al repositorio. Ya está cubierto: `.gitignore` ignora `.env*`.
- Si cambia, **todas las sesiones abiertas quedan invalidadas** y hay que volver a iniciar sesión.
- Cada entorno (local, pruebas, producción) debe tener **su propio** secreto.
- Regenerarlo es la forma de "echar" a todos los que tuvieran sesión abierta.

---

## 4. Estructura del proyecto

```
sistema1_5/
├── drizzle/                     Migraciones versionadas (generadas, NO editar a mano)
│   ├── 0000_init_esquema_completo.sql
│   └── meta/
├── scripts/
│   ├── seed.ts                  Datos mínimos: admin + noticias + 10 ejemplos
│   └── seed_masivo.ts           Carga por lotes desde CSV
├── scripts_generar_seed.py      Generador de 10.000 personas (Python)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/login/      Iniciar sesión
│   │   │   ├── auth/sesion/     Ver sesión actual (GET) y cerrarla (DELETE)
│   │   │   ├── dashboard/       KPIs y series del dashboard
│   │   │   ├── exportar/        Excel y CSV en memoria
│   │   │   ├── exportar/pdf/    Reporte PDF en memoria
│   │   │   ├── importar/        Importación masiva Excel/CSV en memoria
│   │   │   ├── noticias/        CRUD de publicaciones
│   │   │   ├── personas/        Módulo 1: listado, alta, edición
│   │   │   ├── usuarios/        Gestión de administradores
│   │   │   └── auditoria/       Registro de actividad
│   │   ├── admin/
│   │   │   ├── dashboard/       Dashboard privado (KPIs, gráficos, exportaciones)
│   │   │   ├── personas/        Registro administrativo de titulados y egresados
│   │   │   ├── usuarios/        Usuarios administradores
│   │   │   ├── auditoria/       Consulta del registro de actividad
│   │   │   ├── importar/        Pantalla de importación masiva
│   │   │   └── noticias/        Gestión de noticias y convocatorias
│   │   ├── portal/titulado/     Formulario del titulado
│   │   ├── portal/egresado/     Formulario del egresado
│   │   ├── kpis/               Dashboards públicos
│   │   ├── noticias/           Noticias públicas
│   │   ├── titulados/          Página pública del sistema
│   │   └── login/              Inicio de sesión
│   ├── components/              Navbar, PublicDashboard, KpiNavigation, LoadingOverlay
│   ├── db/                      schema.ts (tablas) e index.ts (conexión)
│   ├── lib/
│   │   ├── sesion.ts            Cookie firmada (crear/verificar token)
│   │   ├── password.ts          Hash y verificación de contraseñas (scrypt)
│   │   ├── guards.ts            Autorización de los API Routes
│   │   ├── validaciones.ts      Esquemas zod
│   │   ├── auditoria.ts         Escritura del registro de actividad
│   │   ├── reportePdf.ts        Generación del PDF en memoria
│   │   ├── csv.ts               Lector de CSV en memoria
│   │   ├── auth.tsx             Contexto de sesión en el cliente
│   │   ├── useCierreSesion.tsx  Confirmación de cierre de sesión
│   │   └── sectorOtro.ts        Validación del campo "Otro"
│   └── middleware.ts            Protección de /admin/** y /portal/** en el servidor
├── tests/                       Pruebas
├── .env.example                 Plantilla de variables (sin secretos)
└── .env.local                   Tus variables reales — NO se sube
```

---

## 5. Usuarios y acceso

### El administrador

Lo crea `pnpm seed`:

| Campo | Valor |
|---|---|
| Correo | `admin@umsa.bo` |
| Contraseña | `admin123` |
| Rol | `admin` |

> **Cámbiala antes de entregar el sistema.** Entrá a *Usuarios* → ícono de llave → *Cambiar
> contraseña*. La contraseña se guarda cifrada con **scrypt**; nunca se muestra después de
> guardada y no se puede recuperar, solo cambiar.

### Titulados y egresados

Entran con su **cédula de identidad**. Si la carrera les asigna una contraseña (creando un
usuario con esa CI en *Usuarios*), también pueden entrar con CI + contraseña.

Ejemplos que trae el `seed`:

| CI | Nombre | Tipo |
|---|---|---|
| `6893412LP` | Carlos Alberto Mendoza Ramos | Titulado |
| `8341920LP` | Lucía Belén Gutierrez Morales | Egresado |

---

## 6. Seguridad: qué hace el sistema y qué no

### Lo que sí hace

| Medida | Dónde |
|---|---|
| Contraseñas cifradas con **scrypt** + salt por usuario | `src/lib/password.ts` |
| Comparación en **tiempo constante** (anti timing attack) | `src/lib/password.ts`, `src/lib/sesion.ts` |
| Sesión en **cookie `httpOnly` + `SameSite=Lax` + `Secure` en producción** | `src/lib/sesion.ts` |
| Token **firmado con HMAC-SHA256** y con expiración (8 h) | `src/lib/sesion.ts` |
| **Rutas protegidas en el servidor** antes de renderizar | `src/middleware.ts` |
| **Todas las APIs verifican sesión y rol**, no solo la UI | `src/lib/guards.ts` |
| Cédula única e irrepetible, con alerta clara | `src/lib/validaciones.ts` |
| Validación de entrada con **zod** en todas las escrituras | `src/lib/validaciones.ts` |
| Los errores internos **no** se devuelven al cliente | `src/lib/guards.ts` → `errorInterno` |
| Registro de quién hizo qué y cuándo | `src/lib/auditoria.ts` |
| Los datos exportados se generan **en memoria**, nunca en disco | `src/app/api/exportar/*` |

### Lo que NO hace (pendiente para producción real)

- **Sin HTTPS.** Sin TLS las contraseñas viajan en claro. Es obligatorio detrás de Nginx +
  Let's Encrypt.
- **Sin rate limiting** en el login: se podrían probar contraseñas a fuerza bruta.
- **Sin verificación por correo** ni recuperación de contraseña.
- **Sin CAPTCHA.**
- **Sin dependencia externa de auditoría.** Las contraseñas se pueden cambiar desde
  *Usuarios*, pero no hay "olvidé mi contraseña" por correo.
- **La cuenta admin inicial es conocida** (`admin@umsa.bo` / `admin123`) si se corrió el seed.
  Hay que cambiarla.

---

## 7. Copias de seguridad

`scripts/backup.sh` hace el backup con `pg_dump` y rota los archivos viejos:

```bash
# Ver el script
cat scripts/backup.sh

# Ejecutar a mano
bash scripts/backup.sh
```

Programarlo todos los días a las 02:00 (Linux, `crontab -e`):

```cron
0 2 * * * cd /opt/sistema1_5 && bash scripts/backup.sh >> /var/log/seguit-backup.log 2>&1
```

**Un backup que nunca se restauró no es un backup.** Pruébalo:

```bash
createdb -T template0 -E UTF8 --locale-provider=icu --icu-locale=es-BO-x-icu prueba_restore
pg_restore -d prueba_restore /var/backups/seguit/sistitulados_ULTIMO.dump && echo "BACKUP OK"
```

---

## 8. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `relation "personas" does not exist` | No se aplicó el esquema | `pnpm db:migrate` |
| `password authentication failed for user "postgres"` | La clave de `.env.local` no coincide | Revisar `DATABASE_URL` |
| `SESSION_SECRET es obligatorio en producción` | Falta la variable | Ver sección 4 |
| Los apellidos con `Ñ` salen desordenados | La BD se creó con collation de Windows | Recrear la BD (sección 3) |
| `column "personas.sector_trabajo" must appear in the GROUP BY clause` | Se editó una expresión agrupada sin actualizarla | Repetir la misma expresión en `select()` y `groupBy()` |
| `CASE types ... cannot be matched` | Se mezcló un enum con un `text` en un `CASE` | Castear con `::text` |
| `Cannot find module '.next/standalone/server.js'` | `output: "standalone"` no está activado | `pnpm start` (o activar standalone) |
| Los cambios en el login no se ven | Sesión vieja en la cookie | Cerrar sesión y volver a entrar |
| `python` no encontrado al generar datos | No está Python en el PATH | Usar `python3`, o instalar Python |
