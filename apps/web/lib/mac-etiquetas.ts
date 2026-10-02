/**
 * Etiquetas de precio desde una Mac (ADR-0304): la parte pura del botón «Imprimir en Mac».
 *
 * EL PROBLEMA. Chrome en Mac le entrega a la Brother cualquier papel más ancho que largo girado a vertical: la hoja de
 * 62 × 40,1 mm llega como 40,1 × 62 y la Brother imprime 40 mm a lo ancho del rollo (medido el 2026-10-01: trabajos 4 a
 * 11, con papel personalizado, papel de la cola y forma A o B, siempre `Custom.113…x175…`). Ningún ajuste del diálogo lo
 * evita. El ayudante (`public/mac-etiquetas/servidor.sh`) se salta ese camino: recibe la hoja de etiquetas como HTML, la
 * pasa a PDF con el mismo Chrome y la manda con `lp -o media=Custom.62x40.1mm`.
 *
 * Aquí: armar el documento que se le manda (mismas hojas de estilo y fuentes que la pantalla, así sale igual que en
 * Windows) y leer lo que contesta, para que la pantalla diga algo que una colaboradora entienda.
 */

/** Donde escucha el ayudante (solo esta Mac: `SockNodeName` 127.0.0.1 en su LaunchAgent). */
export const URL_AYUDANTE = "http://127.0.0.1:9631";

/** La línea que se pega en Terminal, una vez por Mac. */
export const COMANDO_INSTALAR = "curl -fsSL https://cayla-retail.vercel.app/mac-etiquetas/instalar.sh | sh";

/**
 * El ayudante exige que el documento empiece EXACTO así: justo detrás inserta una CSP que apaga todo JavaScript. Si se
 * cambia aquí, se cambia en `servidor.sh` (lo vigila `mac-etiquetas.test.ts`).
 */
export const PREFIJO_DOCUMENTO = "<!doctype html><html><head>";

/**
 * El documento que imprime el ayudante. `estilos` son los `<link rel="stylesheet">`, `<style>` y precargas de fuente de la
 * pantalla, tal cual; `base` es el origen de la app, para que esas direcciones relativas (`/_next/static/…`) se resuelvan
 * desde un archivo local. Las clases de `<html>` y `<body>` van al `<body>`: ahí define next/font las variables de las
 * fuentes (`--font-dm-sans`), y el prefijo fijo no deja ponerle atributos a `<html>`. La hoja va con la forma A (girada):
 * aquí la página SÍ mide 62 × 40,1 y nadie la vuelve a girar.
 */
export function documentoParaAyudante({ estilos, base, clases, hoja }: { estilos: string[]; base: string; clases: string; hoja: string }): string {
  const seguros = estilos.filter((e) => !/<script/i.test(e));
  return (
    PREFIJO_DOCUMENTO +
    `<meta charset="utf-8"><base href="${escaparAtributo(base)}">` +
    seguros.join("") +
    `</head><body class="${escaparAtributo(clases)}">${hoja}</body></html>`
  );
}

function escaparAtributo(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Lo que la pantalla sabe del ayudante de esta Mac. */
export type EstadoAyudante = "comprobando" | "listo" | "sin-ayudante" | "sin-impresora" | "sin-chrome";

/** Lee la respuesta de `GET /estado` (o su falta: `null` si no contestó, que es lo normal cuando no está instalado). */
export function estadoDelAyudante(respuesta: unknown): EstadoAyudante {
  if (!respuesta || typeof respuesta !== "object") return "sin-ayudante";
  const r = respuesta as { ok?: unknown; chrome?: unknown; impresora?: unknown };
  if (r.ok !== true) return "sin-ayudante";
  if (r.chrome === false) return "sin-chrome";
  if (r.impresora === false) return "sin-impresora";
  return "listo";
}

/** Qué decir cuando la Mac no puede imprimir por el ayudante. `null` = puede. */
export function avisoDelAyudante(estado: EstadoAyudante): { titulo: string; detalle: string } | null {
  switch (estado) {
    case "listo":
    case "comprobando":
      return null;
    case "sin-ayudante":
      return {
        titulo: "Esta Mac todavía no tiene el ayudante de etiquetas",
        detalle:
          "Sin él, la Mac manda la etiqueta girada y la Brother la saca más larga de lo necesario. Se instala una vez: abre Terminal, pega la línea de abajo y presiona Enter. Si Chrome pregunta por acceso a la red local, elige Permitir.",
      };
    case "sin-impresora":
      return {
        titulo: "El ayudante no encuentra la Brother",
        detalle: "Agrega la impresora en Ajustes del Sistema ▸ Impresoras y escáneres (cable USB conectado y la Brother encendida) y recarga esta página.",
      };
    case "sin-chrome":
      return {
        titulo: "El ayudante necesita Google Chrome",
        detalle: "Instala Google Chrome en Aplicaciones: el ayudante lo usa, sin abrir ventanas, para preparar las etiquetas.",
      };
  }
}

/** El aviso al terminar de mandar las etiquetas. */
export function resultadoDeImpresion(
  status: number | null,
  cuerpo: unknown,
  total: number,
): { ok: true; texto: string } | { ok: false; texto: string; detalle: string } {
  const r = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as { ok?: unknown; error?: unknown };
  if (status === 200 && r.ok === true) {
    return { ok: true, texto: total === 1 ? "Etiqueta enviada a la Brother" : `${total} etiquetas enviadas a la Brother` };
  }
  if (status === null) {
    return {
      ok: false,
      texto: "No se pudo hablar con el ayudante de esta Mac",
      detalle: "Recarga la página. Si sigue igual, vuelve a instalar el ayudante (Guía de impresión ▸ Mac).",
    };
  }
  const motivo = typeof r.error === "string" && r.error ? r.error : `respuesta ${status}`;
  return { ok: false, texto: "Las etiquetas no se imprimieron", detalle: `El ayudante dijo: ${motivo}.` };
}
