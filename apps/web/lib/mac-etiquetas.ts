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

/** Lee la respuesta de `GET /estado` (o su falta: `null` si no contestó, que es lo normal cuando no está instalado).
 */
export function estadoDelAyudante(respuesta: unknown): EstadoAyudante {
  if (!respuesta || typeof respuesta !== "object") return "sin-ayudante";
  const r = respuesta as { ok?: unknown; chrome?: unknown; impresora?: unknown };
  if (r.ok !== true) return "sin-ayudante";
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

/* ------------------------------------------------------------------------------------------------------------------
 * Boletas por el ayudante (ADR-0670, act. 2026-11-16): en la Mac del piso la ticketera imprime sin cuadro desde el Chrome de
 * siempre. Chrome sin cuadro (`--kiosk-printing`) obliga a un ícono aparte; el ayudante ya está en la Mac por las etiquetas, así
 * que la boleta va por él: `POST /imprimir?tipo=ticket&largo=<mm>` y el ayudante la manda a la ticketera con su papel exacto.
 * ------------------------------------------------------------------------------------------------------------------ */

/** Desde esta versión el ayudante imprime boletas (`servidor.sh`, `VERSION=3`). Una Mac con uno más viejo sigue con el cuadro. */
export const VERSION_CON_BOLETAS = 3;

/** ¿El ayudante de esta Mac imprime boletas? Necesita su versión 3, Chrome y la ticketera agregada a la Mac. */
export function ayudanteImprimeBoletas(respuesta: unknown): boolean {
  if (!respuesta || typeof respuesta !== "object") return false;
  const r = respuesta as { ok?: unknown; version?: unknown; chrome?: unknown; ticketera?: unknown };
  return r.ok === true && typeof r.version === "number" && r.version >= VERSION_CON_BOLETAS && r.chrome !== false && r.ticketera === true;
}

/** Topes del largo que acepta el ayudante (los mismos de `servidor.sh`). */
export const LARGO_MIN_MM = 30;
export const LARGO_MAX_MM = 3000;
/** Lo que se suma al largo medido: medir de menos parte la boleta en dos hojas (y la cuchilla corta al medio); medir de más deja
 *  un blanco al final que el driver de la Epson recorta solo (`TmxPaperReduction`). */
export const HOLGURA_MM = 3;

/** El largo del papel, en mm enteros, para una boleta que mide `altoPx` píxeles CSS (96 por pulgada). */
export function largoDeLaBoleta(altoPx: number): number {
  if (!Number.isFinite(altoPx) || altoPx <= 0) return LARGO_MIN_MM;
  const mm = Math.ceil((altoPx * 25.4) / 96) + HOLGURA_MM;
  return Math.min(LARGO_MAX_MM, Math.max(LARGO_MIN_MM, mm));
}

/** El documento de una boleta: el de las etiquetas más su página exacta (80 mm de ancho, el largo medido, sin márgenes) y la boleta
 *  centrada en el rollo (72 mm de 80, como la deja Chrome con el cuadro). */
export function documentoDeBoleta({ estilos, base, clases, boleta, largo }: { estilos: string[]; base: string; clases: string; boleta: string; largo: number }): string {
  const pagina = `<style>@page{size:80mm ${largo}mm;margin:0}#comprobante-print{margin-left:auto!important;margin-right:auto!important}</style>`;
  return documentoParaAyudante({ estilos, base, clases, hoja: pagina + boleta });
}

/** El aviso cuando la boleta no salió por el ayudante. `null` = salió. */
export function resultadoDeBoleta(status: number | null, cuerpo: unknown): { texto: string; detalle: string } | null {
  const r = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as { ok?: unknown; error?: unknown };
  if (status === 200 && r.ok === true) return null;
  if (status === null) {
    return { texto: "La boleta no salió por el ayudante", detalle: "No se pudo hablar con el ayudante de esta Mac. Recarga la página; si sigue igual, vuelve a instalarlo." };
  }
  const motivo = typeof r.error === "string" && r.error ? r.error : `respuesta ${status}`;
  return { texto: "La boleta no salió por el ayudante", detalle: `El ayudante dijo: ${motivo}.` };
}
