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
export type EstadoAyudante = "comprobando" | "listo" | "sin-ayudante" | "desactualizado" | "sin-impresora" | "sin-chrome";

/** La versión del ayudante que sabe imprimir con otra medida (`?medida=`): los rótulos de anaquel la necesitan (ADR-0366). */
export const VERSION_CON_MEDIDA = 2;

/** El papel del rótulo de anaquel: el rollo de 62 mm cortado cada 100 mm (`POST /imprimir?medida=`, lista en `servidor.sh`). */
export const MEDIDA_ROTULO = "62x100mm";

/** Lee la respuesta de `GET /estado` (o su falta: `null` si no contestó, que es lo normal cuando no está instalado).
 *  `versionMinima`: la que necesita la pantalla; uno más viejo imprimiría en el papel de la etiqueta y no en el suyo. */
export function estadoDelAyudante(respuesta: unknown, versionMinima = 1): EstadoAyudante {
  if (!respuesta || typeof respuesta !== "object") return "sin-ayudante";
  const r = respuesta as { ok?: unknown; chrome?: unknown; impresora?: unknown; version?: unknown };
  if (r.ok !== true) return "sin-ayudante";
  if ((typeof r.version === "number" ? r.version : 1) < versionMinima) return "desactualizado";
  if (r.chrome === false) return "sin-chrome";
  if (r.impresora === false) return "sin-impresora";
  return "listo";
}

/** Qué decir cuando la Mac no puede imprimir por el ayudante. `null` = puede.
 *  `resumen` es lo único a la vista (Formidable, 2026-10-09): una línea que dice que SÍ se puede imprimir —por el diálogo de
 *  Chrome— y qué falta para la medida exacta; `titulo` y `detalle`, con la línea de Terminal, van bajo «Ver cómo». */
export function avisoDelAyudante(estado: EstadoAyudante): { resumen: string; titulo: string; detalle: string } | null {
  switch (estado) {
    case "listo":
    case "comprobando":
      return null;
    case "sin-ayudante":
      return {
        resumen: "Puedes imprimir igual. Para que salga a la medida exacta, esta Mac necesita un paso único.",
        titulo: "Esta Mac todavía no tiene el ayudante de etiquetas",
        detalle:
          "Sin él, la Mac manda la etiqueta girada y la Brother la saca más larga de lo necesario. Se instala una vez: abre Terminal, pega la línea de abajo y presiona Enter. Si Chrome pregunta por acceso a la red local, elige Permitir.",
      };
    case "desactualizado":
      return {
        resumen: "Puedes imprimir igual. Para que salga a la medida exacta, esta Mac necesita una actualización de un minuto.",
        titulo: "El ayudante de esta Mac es de una versión anterior",
        detalle:
          "Imprime las etiquetas de precio, pero no conoce el papel de los rótulos. Se actualiza igual que se instaló: abre Terminal, pega la línea de abajo y presiona Enter.",
      };
    case "sin-impresora":
      return {
        resumen: "Puedes imprimir igual. Para que salga a la medida exacta, falta agregar la Brother a esta Mac.",
        titulo: "El ayudante no encuentra la Brother",
        detalle: "Agrega la impresora en Ajustes del Sistema ▸ Impresoras y escáneres (cable USB conectado y la Brother encendida) y recarga esta página.",
      };
    case "sin-chrome":
      return {
        resumen: "Puedes imprimir igual. Para que salga a la medida exacta, esta Mac necesita Google Chrome.",
        titulo: "El ayudante necesita Google Chrome",
        detalle: "Instala Google Chrome en Aplicaciones: el ayudante lo usa, sin abrir ventanas, para preparar las etiquetas.",
      };
  }
}

/** Qué se manda a la Brother, para los avisos: «etiqueta(s)» o «rótulo(s)». */
export type PiezaImpresa = "etiqueta" | "rotulo";
const NOMBRES: Record<PiezaImpresa, { uno: string; varios: string; Varios: string; Uno: string }> = {
  etiqueta: { uno: "etiqueta", varios: "etiquetas", Uno: "Etiqueta enviada", Varios: "etiquetas enviadas" },
  rotulo: { uno: "rótulo", varios: "rótulos", Uno: "Rótulo enviado", Varios: "rótulos enviados" },
};

/** El aviso al terminar de mandar las etiquetas (o los rótulos). */
export function resultadoDeImpresion(
  status: number | null,
  cuerpo: unknown,
  total: number,
  pieza: PiezaImpresa = "etiqueta",
): { ok: true; texto: string } | { ok: false; texto: string; detalle: string } {
  const r = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as { ok?: unknown; error?: unknown };
  const n = NOMBRES[pieza];
  if (status === 200 && r.ok === true) {
    return { ok: true, texto: total === 1 ? `${n.Uno} a la Brother` : `${total} ${n.Varios} a la Brother` };
  }
  if (status === null) {
    return {
      ok: false,
      texto: "No se pudo hablar con el ayudante de esta Mac",
      detalle: "Recarga la página. Si sigue igual, vuelve a instalar el ayudante (Guía de impresión ▸ Mac).",
    };
  }
  const motivo = typeof r.error === "string" && r.error ? r.error : `respuesta ${status}`;
  return { ok: false, texto: `${pieza === "rotulo" ? "Los rótulos" : "Las etiquetas"} no se imprimieron`, detalle: `El ayudante dijo: ${motivo}.` };
}
