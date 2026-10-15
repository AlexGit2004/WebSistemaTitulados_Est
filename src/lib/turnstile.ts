/**
 * Servicio de verificación de Cloudflare Turnstile.
 * Permite validar tokens emitidos por el widget de Turnstile antes de procesar
 * acciones sensibles como login o registro.
 */

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export async function verificarTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<{ valido: boolean; motivo?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Si no está configurada la clave secreta (por ejemplo en local o desarrollo inicial sin cloudflare),
  // se permite continuar para no romper flujos locales a menos que se fuerce.
  if (!secretKey) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[TURNSTILE] Clave de verificación anti-bots no configurada en producción.");
      return { valido: false, motivo: "Configuración de seguridad incompleta en el servidor" };
    }
    return { valido: true };
  }

  if (!token || typeof token !== "string" || token.trim() === "") {
    return { valido: false, motivo: "Falta la verificación de seguridad (Turnstile)" };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token.trim());
    if (remoteIp && remoteIp !== "desconocida") {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!res.ok) {
      console.error("[TURNSTILE] Error HTTP al verificar con Cloudflare:", res.status);
      return { valido: false, motivo: "No se pudo conectar con el servicio de validación de bots" };
    }

    const data: TurnstileVerifyResponse = await res.json();

    if (!data.success) {
      const errorMsg = data["error-codes"]?.join(", ") ?? "fallo desconocido";
      console.warn(`[TURNSTILE] Validación rechazada: ${errorMsg}`);
      return { valido: false, motivo: "Verificación de seguridad fallida. Por favor, intente de nuevo." };
    }

    return { valido: true };
  } catch (error) {
    console.error("[TURNSTILE] Excepción validando captcha:", error);
    return { valido: false, motivo: "Error interno al verificar protección anti-bots" };
  }
}
