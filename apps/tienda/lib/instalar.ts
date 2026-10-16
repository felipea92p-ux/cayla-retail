// Instalar CAYLA en el celular (ADR-0431; Felipe 2026-10-16): la tienda se puede añadir a la pantalla de inicio, como una app, sin pasar
// por la Play Store ni la App Store. Aquí, lo que no necesita el navegador: en qué aparato estamos, cuándo se ofrece, cuándo se calla y
// qué dice la guía. Lógica pura: la usan el proveedor, los tres avisos (la hoja o la franja del Inicio, la tarjeta tras separar, la fila
// de «Mi perfil») y sus pruebas. Las plantillas aprobadas: docs/maquetas/tienda-instalar-2026-10.

export type Plataforma = "android" | "ios" | "otra";

/** Qué hace el botón «Añadir»: Chrome de Android instala con un toque (el aviso del navegador); el iPhone no deja, así que se enseña
 *  el camino; Android sin ese aviso (otro navegador, o ya lo descartó) también se enseña. En computadora no hay nada que hacer. */
export type ComoInstalar = "evento" | "guia-ios" | "guia-android" | "ninguno";

/** Dónde se guarda lo que la persona decidió (en este aparato; no sale de él). */
export const CLAVE_REGISTRO = "cayla-instalar";
/** Tras un «Ahora no», cuánto se calla. */
export const DIAS_DE_SILENCIO = 30;
/** Con este número de «Ahora no», no vuelve nunca (la fila de «Mi perfil» sigue ahí). */
export const CIERRES_PARA_NO_VOLVER = 2;
/** Sale ni bien entra (Felipe 2026-10-16: con 8 s «demoraba un rato en aparecer»): solo lo que tarda la página en pintarse y asentarse. */
export const RETRASO_MS = 800;
/** Quien acaba de tocar o de bajar la página no recibe una hoja encima: se espera a que se quede quieta este rato. */
export const QUIETUD_MS = 1200;
/** Cuántas veces se vuelve a mirar si ya está quieta antes de dejarlo para otra visita. */
export const INTENTOS_DE_QUIETUD = 5;

/** Las páginas donde se ofrece sola al entrar: el Inicio y el catálogo (no la ficha de una prenda, ni la bolsa, ni «Mi perfil»). */
export const PAGINAS_DEL_AVISO: readonly string[] = ["/inicio", "/catalogo"];

/** Donde un script mínimo del `<head>` deja el aviso de instalar de Chrome si llega ANTES de que la página termine de armarse (en un
 *  celular lento, o apenas inicia sesión): ese aviso llega una sola vez y, sin esto, se perdería y no saldría nada en Android. */
export const VARIABLE_DEL_AVISO = "__caylaAvisoInstalar";
export const SCRIPT_DEL_AVISO = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.${VARIABLE_DEL_AVISO}=e;});`;

const DIA_MS = 24 * 60 * 60 * 1000;

/** En qué aparato estamos, por lo que dice el navegador. Un iPad nuevo se presenta como Mac: se reconoce por la pantalla táctil. */
export function plataformaDe(d: { ua: string; plataforma?: string; toques?: number }): Plataforma {
  const ua = d.ua ?? "";
  if (/Android/.test(ua)) return "android";
  return /iPhone|iPad|iPod/.test(ua) || (d.plataforma === "MacIntel" && (d.toques ?? 0) > 1) ? "ios" : "otra";
}

export function comoInstalar(plataforma: Plataforma, hayEvento: boolean): ComoInstalar {
  if (plataforma === "android") return hayEvento ? "evento" : "guia-android";
  if (plataforma === "ios") return "guia-ios";
  return "ninguno";
}

/** Lo que la persona decidió en este aparato. */
export type Registro = { cierres: number; ultimo: number | null; instalada: boolean };

export const REGISTRO_VACIO: Registro = { cierres: 0, ultimo: null, instalada: false };

/** Lee lo guardado sin confiar en nada: un texto roto, de otra versión o tocado a mano vale como «nada decidido». */
export function leerRegistro(texto: string | null | undefined): Registro {
  if (!texto) return REGISTRO_VACIO;
  try {
    const d: unknown = JSON.parse(texto);
    if (typeof d !== "object" || d === null) return REGISTRO_VACIO;
    const { cierres, ultimo, instalada } = d as Record<string, unknown>;
    return {
      cierres: typeof cierres === "number" && Number.isFinite(cierres) && cierres > 0 ? Math.min(Math.floor(cierres), 99) : 0,
      ultimo: typeof ultimo === "number" && Number.isFinite(ultimo) ? ultimo : null,
      instalada: instalada === true,
    };
  } catch {
    return REGISTRO_VACIO;
  }
}

export const textoDelRegistro = (r: Registro): string => JSON.stringify(r);

export const conCierre = (r: Registro, ahora: number): Registro => ({ ...r, cierres: r.cierres + 1, ultimo: ahora });

export const conInstalada = (r: Registro): Registro => ({ ...r, instalada: true });

/** ¿Hay que callarse? Con un «Ahora no», 30 días; con dos, para siempre. Un reloj atrasado también calla (más vale de menos). */
export function enSilencio(r: Registro, ahora: number): boolean {
  if (r.cierres >= CIERRES_PARA_NO_VOLVER) return true;
  if (r.cierres < 1) return false;
  if (r.ultimo === null) return true;
  return ahora - r.ultimo < DIAS_DE_SILENCIO * DIA_MS;
}

export type Situacion = {
  plataforma: Plataforma;
  /** ¿Se abrió desde la pantalla de inicio? Ahí no hay nada que ofrecer. */
  yaEsApp: boolean;
  /** ¿El navegador mostró su aviso de instalar (solo Chrome de Android)? */
  hayEvento: boolean;
  registro: Registro;
  ahora: number;
};

const yaLaTiene = (s: Situacion) => s.yaEsApp || s.registro.instalada;

/** ¿Se puede ofrecer SOLA (sin que la persona la busque)? Solo si hay un camino de un toque o la guía de iPhone, y no la tiene ni dijo que no. */
export function puedeOfrecerSola(s: Situacion): boolean {
  if (yaLaTiene(s) || enSilencio(s.registro, s.ahora)) return false;
  const como = comoInstalar(s.plataforma, s.hayEvento);
  // Android sin aviso del navegador: la guía existe, pero no se empuja (solo desde «Mi perfil»).
  return como === "evento" || como === "guia-ios";
}

export type AvisoAlEntrar = "hoja" | "franja" | null;

/**
 * Qué aviso sale al entrar (o ninguno). La franja, que no tapa nada, cuando el Inicio ya trae el aviso del Club (uno espera al otro: no se
 * apilan dos tarjetas); la hoja, que sube desde abajo, en el resto. Solo en el Inicio y el catálogo.
 */
export function avisoAlEntrar(s: Situacion, pagina: string, hayAvisoDelClub: boolean): AvisoAlEntrar {
  if (!PAGINAS_DEL_AVISO.includes(pagina) || !puedeOfrecerSola(s)) return null;
  return hayAvisoDelClub ? "franja" : "hoja";
}

export type EstadoDeLaFila = "oculta" | "ya-la-tienes" | "anadir" | "como";

/** La fila fija de «Mi perfil»: no insiste nunca (ignora los «Ahora no») y es adonde llega quien cambió de idea. */
export function estadoDeLaFila(s: Situacion): EstadoDeLaFila {
  if (s.yaEsApp) return "oculta";
  const como = comoInstalar(s.plataforma, s.hayEvento);
  if (como === "ninguno") return "oculta";
  if (s.registro.instalada) return "ya-la-tienes";
  return como === "evento" ? "anadir" : "como";
}

export type TipoDeGuia = "ios" | "android";

/** Un renglón de la guía: texto con partes en negrita y, a veces, el ícono del botón que se menciona. */
export type PasoDeLaGuia = { partes: readonly (string | { b: string })[]; icono?: "compartir" | "agregar" | "puntos" };

/** Los tres toques de cada camino. No se dice DÓNDE está el botón Compartir (cambia con la versión y el navegador del iPhone): se
 *  muestra su dibujo y, abajo, la pista de qué hacer si no se ve. */
export function pasosDeLaGuia(tipo: TipoDeGuia): readonly PasoDeLaGuia[] {
  if (tipo === "ios") {
    return [
      { partes: ["Toca ", { b: "Compartir" }], icono: "compartir" },
      { partes: ["Elige ", { b: "«Añadir a pantalla de inicio»" }], icono: "agregar" },
      { partes: ["Toca ", { b: "«Añadir»" }, ", arriba a la derecha"] },
    ];
  }
  return [
    { partes: ["Toca el menú del navegador"], icono: "puntos" },
    { partes: ["Elige ", { b: "«Instalar aplicación»" }, " o ", { b: "«Añadir a pantalla de inicio»" }] },
    { partes: ["Confirma con ", { b: "«Instalar»" }] },
  ];
}

/** Una pista bajo los pasos: el botón del iPhone a veces está dentro del menú «⋯». */
export const ayudaDeLaGuia = (tipo: TipoDeGuia): string | null =>
  tipo === "ios" ? "Compartir es el cuadro con la flecha hacia arriba. Si no lo ves, toca primero «⋯»." : null;

export const tituloDeLaGuia = (tipo: TipoDeGuia) => (tipo === "ios" ? "Añade CAYLA a tu iPhone" : "Añade CAYLA a tu celular");

/** Lo que dice el botón de la hoja, la tarjeta y la fila: donde un toque instala, «Añadir»; donde hay que seguir pasos, «Ver cómo». */
export const textoDelBoton = (como: ComoInstalar): string => (como === "evento" ? "Añadir a mi celular" : "Ver cómo añadirla");
