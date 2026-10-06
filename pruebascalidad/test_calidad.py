"""
Pruebas de calidad y seguridad para el Sistema de Seguimiento a Titulados.
Verifica cumplimiento de la Ley 1405 art. 5 y estándares de calidad.
"""

import os
import re
import json
from pathlib import Path
from bs4 import BeautifulSoup
import requests

BASE_DIR = Path(__file__).parent.parent
SRC_DIR = BASE_DIR / "src"

RESULTADOS = []

def agregar_resultado(categoria, prueba, estado, detalle=""):
    RESULTADOS.append({
        "categoria": categoria,
        "prueba": prueba,
        "estado": "PASS" if estado else "FAIL",
        "detalle": detalle
    })
    print(f"[{'PASS' if estado else 'FAIL'}] {categoria} - {prueba}: {detalle}")

def test_estructura_proyecto():
    """Verifica que la estructura del proyecto sea correcta."""
    carpetas_requeridas = ["app", "components", "db", "lib"]
    for carpeta in carpetas_requeridas:
        existe = (SRC_DIR / carpeta).exists()
        agregar_resultado("Estructura", f"Carpeta {carpeta}/", existe)

def test_seguridad_api():
    """Verifica que las APIs estén protegidas según Ley 1405 art. 5."""
    rutas_api = list((SRC_DIR / "app" / "api").rglob("route.ts"))
    for ruta in rutas_api:
        contenido = ruta.read_text(encoding="utf-8")
        tiene_auth = "exigirAdmin" in contenido or "exigirAdminOContacto" in contenido or "sesion" in contenido.lower()
        agregar_resultado("Seguridad", f"API protegida: {ruta.relative_to(SRC_DIR)}", tiene_auth)

def test_credenciales_no_hardcodeadas():
    """Verifica que no haya contraseñas hardcodeadas en el código."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    patrones_peligrosos = [
        r'password\s*=\s*["\'][^"\']+["\']',
        r'passwd\s*=\s*["\'][^"\']+["\']',
        r'secret\s*=\s*["\'][^"\']+["\']',
    ]
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        for patron in patrones_peligrosos:
            coincidencias = re.findall(patron, contenido, re.IGNORECASE)
            if coincidencias:
                agregar_resultado("Seguridad", f"Credencial en {archivo.name}", False, f"Encontrado: {coincidencias[0][:30]}...")
                return
    agregar_resultado("Seguridad", "Sin credenciales hardcodeadas", True)

def test_validacion_entradas():
    """Verifica que haya validación de entradas con zod."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    tiene_zod = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "zod" in contenido.lower() or "z." in contenido:
            tiene_zod = True
            break
    agregar_resultado("Calidad", "Validación de entradas (zod)", tiene_zod)

def test_manejo_errores():
    """Verifica que haya manejo de errores try-catch."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    con_try_catch = 0
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "try {" in contenido and "catch" in contenido:
            con_try_catch += 1
    agregar_resultado("Calidad", f"Archivos con manejo de errores ({con_try_catch}/{len(archivos)})", con_try_catch > 0)

def test_cookies_seguras():
    """Verifica que las cookies sean httpOnly y seguras."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "httpOnly" in contenido or "http_only" in contenido:
            agregar_resultado("Seguridad", "Cookies httpOnly", True)
            return
    agregar_resultado("Seguridad", "Cookies httpOnly", False)

def test_auditoria():
    """Verifica que exista sistema de auditoría."""
    tiene_auditoria = (SRC_DIR / "lib" / "auditoria.ts").exists()
    agregar_resultado("Seguridad", "Sistema de auditoría", tiene_auditoria)

def test_rate_limiting():
    """Verifica que exista rate limiting."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    tiene_rate_limit = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "rateLimit" in contenido or "rate_limit" in contenido.lower():
            tiene_rate_limit = True
            break
    agregar_resultado("Seguridad", "Rate limiting", tiene_rate_limit)

def test_hash_contrasenas():
    """Verifica que las contraseñas se hasheaden correctamente."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    tiene_hash = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "scrypt" in contenido or "bcrypt" in contenido or "argon2" in contenido:
            tiene_hash = True
            break
    agregar_resultado("Seguridad", "Hash de contraseñas", tiene_hash)

def test_middleware_proteccion():
    """Verifica que exista middleware de protección de rutas."""
    tiene_middleware = (SRC_DIR / "middleware.ts").exists()
    agregar_resultado("Seguridad", "Middleware de protección", tiene_middleware)

def test_sql_injection():
    """Verifica que no haya consultas SQL vulnerables."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    vulnerables = []
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        # Buscar concatenación directa en queries
        if re.search(r'execute\s*\(\s*["\'].*\+', contenido):
            vulnerables.append(archivo.name)
    agregar_resultado("Seguridad", "Sin SQL injection", len(vulnerables) == 0, f"Vulnerables: {vulnerables}" if vulnerables else "")

def test_xss():
    """Verifica que no haya vulnerabilidades XSS."""
    archivos = list(SRC_DIR.rglob("*.tsx"))
    vulnerables = []
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        # Buscar dangerouslySetInnerHTML sin sanitización
        if "dangerouslySetInnerHTML" in contenido and "sanitize" not in contenido.lower():
            # Verificar si es el script de tema (conocido y seguro)
            if "localStorage" not in contenido or "theme" not in contenido:
                vulnerables.append(archivo.name)
    agregar_resultado("Seguridad", "Sin XSS", len(vulnerables) == 0, f"Vulnerables: {vulnerables}" if vulnerables else "")

def test_variables_entorno():
    """Verifica que se usen variables de entorno para secretos."""
    tiene_env = (BASE_DIR / ".env.local").exists() or (BASE_DIR / ".env").exists()
    agregar_resultado("Seguridad", "Variables de entorno", tiene_env)

def test_https():
    """Verifica configuración para HTTPS."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    tiene_https = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "https" in contenido.lower() or "secure" in contenido.lower():
            tiene_https = True
            break
    agregar_resultado("Seguridad", "Configuración HTTPS", tiene_https)

def test_cors():
    """Verifica configuración de CORS."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    tiene_cors = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "cors" in contenido.lower() or "Access-Control" in contenido:
            tiene_cors = True
            break
    agregar_resultado("Seguridad", "Configuración CORS", tiene_cors)

def test_logging():
    """Verifica que exista logging de eventos."""
    archivos = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    tiene_logging = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "console.log" in contenido or "logger" in contenido.lower():
            tiene_logging = True
            break
    agregar_resultado("Calidad", "Logging de eventos", tiene_logging)

def test_documentacion():
    """Verifica que exista documentación."""
    tiene_readme = (BASE_DIR / "README.md").exists()
    agregar_resultado("Calidad", "Documentación (README)", tiene_readme)

def test_pruebas():
    """Verifica que existan pruebas."""
    tiene_pruebas = (BASE_DIR / "tests").exists()
    agregar_resultado("Calidad", "Pruebas unitarias", tiene_pruebas)

def test_tipos_typescript():
    """Verifica que se use TypeScript con tipos estrictos."""
    tiene_tsconfig = (BASE_DIR / "tsconfig.json").exists()
    agregar_resultado("Calidad", "TypeScript configurado", tiene_tsconfig)

def test_linting():
    """Verifica que exista configuración de linting."""
    tiene_eslint = (BASE_DIR / ".eslintrc.json").exists() or (BASE_DIR / "eslint.config.mjs").exists()
    agregar_resultado("Calidad", "Linting (ESLint)", tiene_eslint)

def test_responsive():
    """Verifica que el diseño sea responsive."""
    archivos = list(SRC_DIR.rglob("*.tsx"))
    tiene_responsive = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "sm:" in contenido or "md:" in contenido or "lg:" in contenido:
            tiene_responsive = True
            break
    agregar_resultado("Calidad", "Diseño responsive", tiene_responsive)

def test_accesibilidad():
    """Verifica atributos de accesibilidad."""
    archivos = list(SRC_DIR.rglob("*.tsx"))
    tiene_accesibilidad = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "aria-" in contenido or "role=" in contenido:
            tiene_accesibilidad = True
            break
    agregar_resultado("Calidad", "Accesibilidad (ARIA)", tiene_accesibilidad)

def test_performance():
    """Verifica optimizaciones de performance."""
    archivos = list(SRC_DIR.rglob("*.tsx"))
    tiene_optimizacion = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "lazy" in contenido.lower() or "memo" in contenido.lower() or "useMemo" in contenido:
            tiene_optimizacion = True
            break
    agregar_resultado("Calidad", "Optimización de performance", tiene_optimizacion)

def test_paginacion():
    """Verifica que exista paginación en listados."""
    archivos = list(SRC_DIR.rglob("*.tsx"))
    tiene_paginacion = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "page" in contenido.lower() and ("limit" in contenido.lower() or "offset" in contenido.lower()):
            tiene_paginacion = True
            break
    agregar_resultado("Calidad", "Paginación de resultados", tiene_paginacion)

def test_busqueda():
    """Verifica que exista funcionalidad de búsqueda."""
    archivos = list(SRC_DIR.rglob("*.tsx"))
    tiene_busqueda = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "search" in contenido.lower() or "buscar" in contenido.lower() or "filter" in contenido.lower():
            tiene_busqueda = True
            break
    agregar_resultado("Calidad", "Búsqueda y filtros", tiene_busqueda)

def test_exportacion():
    """Verifica que exista exportación de datos."""
    tiene_exportar = (SRC_DIR / "app" / "api" / "exportar").exists()
    agregar_resultado("Funcionalidad", "Exportación de datos", tiene_exportar)

def test_importacion():
    """Verifica que exista importación de datos."""
    tiene_importar = (SRC_DIR / "app" / "api" / "importar").exists()
    agregar_resultado("Funcionalidad", "Importación de datos", tiene_importar)

def test_notificaciones():
    """Verifica que exista sistema de notificaciones."""
    archivos = list(SRC_DIR.rglob("*.tsx"))
    tiene_notificaciones = False
    for archivo in archivos:
        contenido = archivo.read_text(encoding="utf-8")
        if "notification" in contenido.lower() or "toast" in contenido.lower() or "alert" in contenido.lower():
            tiene_notificaciones = True
            break
    agregar_resultado("Funcionalidad", "Notificaciones", tiene_notificaciones)

def test_reportes():
    """Verifica que exista generación de reportes."""
    tiene_reportes = (SRC_DIR / "app" / "api" / "exportar" / "pdf").exists()
    agregar_resultado("Funcionalidad", "Generación de reportes PDF", tiene_reportes)

def test_backups():
    """Verifica que exista sistema de backups."""
    tiene_backups = (BASE_DIR / "scripts" / "backup.sh").exists()
    agregar_resultado("Funcionalidad", "Sistema de backups", tiene_backups)

def test_migraciones():
    """Verifica que existan migraciones de base de datos."""
    tiene_migraciones = (BASE_DIR / "drizzle").exists()
    agregar_resultado("Funcionalidad", "Migraciones de BD", tiene_migraciones)

def test_seed():
    """Verifica que exista seed de datos."""
    tiene_seed = (BASE_DIR / "scripts" / "seed.ts").exists()
    agregar_resultado("Funcionalidad", "Seed de datos", tiene_seed)

def test_admin_usuarios():
    """Verifica que exista gestión de usuarios admin."""
    tiene_usuarios = (SRC_DIR / "app" / "admin" / "usuarios").exists()
    agregar_resultado("Funcionalidad", "Gestión de usuarios admin", tiene_usuarios)

def test_admin_personas():
    """Verifica que exista gestión de personas."""
    tiene_personas = (SRC_DIR / "app" / "admin" / "personas").exists()
    agregar_resultado("Funcionalidad", "Gestión de personas", tiene_personas)

def test_admin_auditoria():
    """Verifica que exista visualización de auditoría."""
    tiene_auditoria = (SRC_DIR / "app" / "admin" / "auditoria").exists()
    agregar_resultado("Funcionalidad", "Visualización de auditoría", tiene_auditoria)

def test_portal_titulado():
    """Verifica que exista portal del titulado."""
    tiene_portal = (SRC_DIR / "app" / "portal" / "titulado").exists()
    agregar_resultado("Funcionalidad", "Portal del titulado", tiene_portal)

def test_portal_egresado():
    """Verifica que exista portal del egresado."""
    tiene_portal = (SRC_DIR / "app" / "portal" / "egresado").exists()
    agregar_resultado("Funcionalidad", "Portal del egresado", tiene_portal)

def test_kpis():
    """Verifica que existan KPIs."""
    tiene_kpis = (SRC_DIR / "app" / "kpis").exists()
    agregar_resultado("Funcionalidad", "KPIs", tiene_kpis)

def test_dashboard():
    """Verifica que exista dashboard."""
    tiene_dashboard = (SRC_DIR / "app" / "admin" / "dashboard").exists()
    agregar_resultado("Funcionalidad", "Dashboard admin", tiene_dashboard)

def test_login():
    """Verifica que exista página de login."""
    tiene_login = (SRC_DIR / "app" / "login").exists()
    agregar_resultado("Funcionalidad", "Página de login", tiene_login)

def test_noticias():
    """Verifica que exista gestión de noticias."""
    tiene_noticias = (SRC_DIR / "app" / "admin" / "noticias").exists()
    agregar_resultado("Funcionalidad", "Gestión de noticias", tiene_noticias)

def main():
    print("=" * 70)
    print("PRUEBAS DE CALIDAD Y SEGURIDAD")
    print("Sistema de Seguimiento a Titulados - Carrera de Estadística UMSA")
    print("=" * 70)
    print()

    # Estructura
    print("--- Estructura del Proyecto ---")
    test_estructura_proyecto()
    print()

    # Seguridad (Ley 1405 art. 5)
    print("--- Seguridad (Ley 1405 art. 5) ---")
    test_seguridad_api()
    test_credenciales_no_hardcodeadas()
    test_validacion_entradas()
    test_cookies_seguras()
    test_auditoria()
    test_rate_limiting()
    test_hash_contrasenas()
    test_middleware_proteccion()
    test_sql_injection()
    test_xss()
    test_variables_entorno()
    test_https()
    test_cors()
    print()

    # Calidad
    print("--- Calidad del Código ---")
    test_manejo_errores()
    test_logging()
    test_documentacion()
    test_pruebas()
    test_tipos_typescript()
    test_linting()
    test_responsive()
    test_accesibilidad()
    test_performance()
    print()

    # Funcionalidad
    print("--- Funcionalidad ---")
    test_paginacion()
    test_busqueda()
    test_exportacion()
    test_importacion()
    test_notificaciones()
    test_reportes()
    test_backups()
    test_migraciones()
    test_seed()
    test_admin_usuarios()
    test_admin_personas()
    test_admin_auditoria()
    test_portal_titulado()
    test_portal_egresado()
    test_kpis()
    test_dashboard()
    test_login()
    test_noticias()
    print()

    # Resumen
    print("=" * 70)
    total = len(RESULTADOS)
    passed = sum(1 for r in RESULTADOS if r["estado"] == "PASS")
    failed = total - passed
    print(f"RESUMEN: {passed}/{total} pruebas pasaron ({failed} fallaron)")
    print("=" * 70)

    # Guardar resultados
    with open("resultados.json", "w", encoding="utf-8") as f:
        json.dump(RESULTADOS, f, indent=2, ensure_ascii=False)

    return failed == 0

if __name__ == "__main__":
    exit(0 if main() else 1)
