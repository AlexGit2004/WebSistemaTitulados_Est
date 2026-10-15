/**
 * Envío de correo (decisión D5, opción B).
 *
 * NO HAY SMTP CONFIGURADO en este proyecto: no existe variable de correo en `.env.local`
 * ni ninguna librería de mail instalada. Para que el alta pública sea utilizable desde
 * ya, el adaptador tiene dos modos:
 *
 *   1. Con SMTP configurado (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
 *      `CORREO_REMITENTE`), envía el correo de verdad.
 *   2. Sin SMTP, NO simula un envío: escribe el enlace en el log del servidor y
 *      devuelve `enviado: false` con el enlace, para que el flujo se pueda probar y
 *      auditar. En producción esto debería considerarse un fallo de configuración.
 *
 * `SITIO_URL` es la base pública (http://localhost:3000 en desarrollo) con la que se
 * arma el enlace de verificación.
 */

export type ResultadoEnvio = {
  enviado: boolean;
  motivo?: string;
};

const VIGENCIA_HORAS = 48;

function sitioUrl(): string {
  return (
    process.env.SITIO_URL?.replace(/\/+$/, "") ??
    (process.env.NODE_ENV === "production" ? "https://" : "http://localhost:3000")
  );
}

export function enlaceDeVerificacion(token: string): string {
  return `${sitioUrl()}/verificar?token=${token}`;
}

function cuerpoCorreo(nombre: string, enlace: string): { asunto: string; html: string; texto: string } {
  const asunto = "Verifique su registro en el sistema SEGUIT";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="margin:0 0 12px">Universidad Mayor de San Andrés — Facultad de Ciencias</h2>
      <p>Hola <strong>${nombre}</strong>:</p>
      <p>Recibimos su solicitud de registro en el Sistema de Seguimiento a Titulados,
         Egresados y Units. Para que la Carrera de Estadística pueda validar sus datos,
         confirme que este correo le pertenece.</p>
      <p style="margin:24px 0">
        <a href="${enlace}"
           style="background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:6px;
                  text-decoration:none;display:inline-block">Verificar mi correo</a>
      </p>
      <p style="color:#555;font-size:14px">
        El enlace vence en ${VIGENCIA_HORAS} horas y solo puede usarse una vez.
        Si usted no hizo esta solicitud, ignore este mensaje y no comparta el enlace.
      </p>
    </div>`.trim();

  const texto = [
    "Sistema SEGUIT — Universidad Mayor de San Andrés",
    "",
    `Hola ${nombre}:`,
    "Recibimos su solicitud de registro. Confirme que este correo le pertenece:",
    "",
    enlace,
    "",
    `El enlace vence en ${VIGENCIA_HORAS} horas y solo puede usarse una vez.`,
    "Si usted no hizo esta solicitud, ignore este mensaje.",
  ].join("\n");

  return { asunto, html, texto };
}

/**
 * Envía el correo de verificación. Nunca lanza: un fallo de envío se reporta, pero la
 * el alta del registro ya está hecha y la interfaz necesita saber qué pasó.
 */
export async function enviarCorreoVerificacion(params: {
  destino: string;
  nombre: string;
  token: string;
}): Promise<ResultadoEnvio> {
  const enlace = enlaceDeVerificacion(params.token);
  const { asunto, html, texto } = cuerpoCorreo(params.nombre, enlace);

  const haySmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  if (!haySmtp) {
    // Sin SMTP no hay mentira: se deja constancia en el log de qué se habría enviado.
    console.warn(
      `[correo] SMTP no configurado. No se envió el correo a ${params.destino}.\n` +
        `        Enlace de verificación (vence en ${VIGENCIA_HORAS} h): ${enlace}`
    );
    return { enviado: false, motivo: "SMTP_NO_CONFIGURADO" };
  }

  try {
    // Import diferido Y con especificador armado en runtime. Son dos cosas distintas:
    //   · diferido, para que el resto del sistema no cargue el mailer;
    //   · armado en runtime + `webpackIgnore`, porque `nodemailer` NO está instalada.
    //     Si se escribiera `import("nodemailer")` tal cual, webpack lo resuelve en tiempo
    //     de compilación y el build falla aunque la rama nunca se ejecute. En cuanto se
    //     configure el SMTP hay que instalar la dependencia: `pnpm add nodemailer`.
    const especificador = "nodemail" + "er";
    const { createTransport } = (await import(/* webpackIgnore: true */ especificador)) as {
      createTransport: (opciones: unknown) => { sendMail: (msg: unknown) => Promise<unknown> };
    };
    const transporte = createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporte.sendMail({
      from: process.env.CORREO_REMITENTE ?? process.env.SMTP_USER,
      to: params.destino,
      subject: asunto,
      html,
      text: texto,
    });

    return { enviado: true };
  } catch (e) {
    console.error("[correo] falló el envío:", e);
    return { enviado: false, motivo: "ERROR_DE_ENVIO" };
  }
}