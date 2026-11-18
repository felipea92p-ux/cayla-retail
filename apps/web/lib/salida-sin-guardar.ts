// Reglas puras del aviso «¿Salir sin guardar?» (2026-09-28) — sin React ni DOM, para probarlas sin abrir la pantalla.
//
// CONTRATO
//   PROMETE: dado un clic sobre un enlace, decir si ese clic saca a la persona de la pantalla actual DENTRO del ERP (y a
//            dónde), que es lo único que el aviso debe frenar; y dadas dos fotos del formulario, decir si hay cambios.
//   ASUME:   quien llama ya sabe que el formulario tiene cambios; esto no mira el estado de la pantalla.
//   NO HACE: no frena abrir en otra pestaña (Ctrl/⌘/Shift/clic del medio, target=_blank): la ficha sigue abierta y nada
//            se pierde; tampoco un enlace a otro sitio ni una descarga — el navegador ya pregunta al salir (beforeunload).
//   Y, al final, cómo se pone la entrada de guardia en el historial sin que retirarla después mueva la página
//   (`empujarGuardia`, `devolverModoDeScroll`): reciben el historial, así se prueban con uno de mentira.

export type ClicEnEnlace = {
  /** `MouseEvent.button`: 0 = principal. */
  boton: number;
  conTecla: boolean;
  yaAtendido: boolean;
  href: string | null;
  target: string | null;
  descarga: boolean;
};

/** Ruta interna (pathname + búsqueda + ancla) a la que llevaría el clic, o `null` si el clic no saca de esta pantalla. */
export function destinoQueSaleDeLaPantalla(clic: ClicEnEnlace, actual: string): string | null {
  if (clic.yaAtendido || clic.boton !== 0 || clic.conTecla || clic.descarga) return null;
  if (clic.target && clic.target !== "_self") return null;
  if (!clic.href) return null;
  let destino: URL;
  let aqui: URL;
  try {
    aqui = new URL(actual);
    destino = new URL(clic.href, aqui);
  } catch {
    return null;
  }
  if (destino.origin !== aqui.origin) return null;
  // Un ancla de la misma pantalla (#fotos) no sale: solo baja hasta esa parte.
  if (destino.pathname === aqui.pathname && destino.search === aqui.search) return null;
  return destino.pathname + destino.search + destino.hash;
}

/** Foto comparable de un formulario: mismo contenido → mismo texto, sin importar el orden de las claves. */
export function fotoFormulario(valor: unknown): string {
  return JSON.stringify(valor, (_clave, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  );
}

/** Una guardia de «¿Salir sin guardar?» viva en la pantalla: si tiene algo que perder y cómo preguntarlo. */
type GuardiaViva = { debePreguntar: () => boolean; pedirAccion: (hacer: () => void) => void };
const guardiasVivas = new Set<GuardiaViva>();

/** La anota `useSalidaSinGuardar` al montarse; lo que devuelve la saca al desmontarse. */
export function registrarGuardia(g: GuardiaViva): () => void {
  guardiasVivas.add(g);
  return () => void guardiasVivas.delete(g);
}

/** Para lo que rehace la pantalla SIN navegar (el selector de sede, /chaos 2026-10-28): si alguna guardia tiene algo sin guardar, ella
 *  pregunta «¿Salir sin guardar?» y `hacer` corre solo si la persona confirma; si no, corre ya. Ningún enlace pasa por aquí: esos los
 *  frena la guardia sola. */
export function antesDeRehacerLaPantalla(hacer: () => void): void {
  const conCambios = [...guardiasVivas].find((g) => g.debePreguntar());
  if (conCambios) conCambios.pedirAccion(hacer);
  else hacer();
}

/** ¿Algún formulario montado tiene algo sin guardar? Mientras lo haya, una entrada de guardia es la suya y sigue puesta; sin
 *  ninguno, es una que quedó atrás en el historial al navegar. */
export function hayGuardiaConCambios(): boolean {
  return [...guardiasVivas].some((g) => g.debePreguntar());
}

/* ====================================================================
   El scroll al poner y retirar la guardia (2026-11-11)

   El defecto. La guardia de «atrás» es una entrada más del historial, y se retira con un «atrás» propio. Al VOLVER a una entrada,
   el navegador le devuelve a la página el scroll que tenía anotado en ella, si su modo (`history.scrollRestoration`) es «auto». La
   entrada de abajo se dejó en el instante del primer cambio: quien se desplazaba entre ese cambio y el retiro de la guardia (un
   guardado solo, deshacer el cambio, guardar y quedarse) veía la página volver adonde estaba al tocar. Medido con un clic real en
   Recibir ▸ Contar: «Una más», desplazar 250 px, y a los 0,8 s la vista volvía sola. «Atrás» con cambios daba el mismo salto antes
   de preguntar.

   Lo que hace el navegador (medido en Chromium, 2026-11-11):
     · El modo es de CADA entrada, manda el de la entrada de DESTINO, y solo se cambia el de la entrada en la que se está.
     · La entrada nueva de un `pushState` hereda el modo, y el scroll anotado, de la entrada desde la que se empuja.
     · A una entrada a la que se llegó en «manual» no le vuelve a anotar el scroll hasta que la página se desplaza.

   La regla.
     1. Antes de empujar la guardia, la entrada de abajo se deja en «manual». La guardia lo hereda y se queda así, y también lo que
        se abra encima (la entrada de una hoja del teléfono, ADR-0528): ni retirar la guardia ni cerrar esa hoja mueven la página. Si
        la guardia volviera a «auto», una repuesta tras un «atrás» con cambios heredaría un scroll anotado viejo, y cerrar la pregunta
        en el teléfono movía la página (medido a 375 px).
     2. Fuera de una guardia puesta, toda entrada vuelve a «auto»: al terminar cada vuelta por el historial, al soltar la guardia para
        navegar y cuando un formulario se va. Sin eso, la pantalla a la que se navega heredaría «manual», y de ahí todas las
        siguientes: el ERP dejaría de recordar el scroll al volver atrás.
     3. Al devolver «auto», quien llama hace que el navegador anote otra vez dónde está la página (`pasoDeIdaYVuelta`), o la próxima
        vuelta a esa entrada la llevaría al scroll viejo.
   Por eso esta pieza es la única que escribe `history.scrollRestoration` en el ERP (lo vigila su prueba): otra que lo dejara en
   «manual» lo perdería en la regla 2.
   ==================================================================== */

/** Lo justo de `window.history` que la guardia toca. */
export type HistorialDeGuardia = {
  readonly state: unknown;
  scrollRestoration: "auto" | "manual";
  pushState(estado: unknown, sinUso: string, url?: string | URL | null): void;
};

/** La marca de la entrada de guardia en `history.state`. */
export const MARCA_GUARDIA = "__guardiaSalida";
export const esEstadoDeGuardia = (estado: unknown): boolean => Boolean((estado as Record<string, unknown> | null | undefined)?.[MARCA_GUARDIA]);

/** Empuja la entrada de guardia (su `estado`, con la marca, en la misma `url`) de modo que retirarla después no mueva la página. */
export function empujarGuardia(historial: HistorialDeGuardia, estado: Record<string, unknown>, url: string): void {
  historial.scrollRestoration = "manual";
  historial.pushState(estado, "", url);
}

/**
 * Devuelve a «auto» la entrada en la que se está, salvo que sea una guardia puesta (`guardiaPuesta`: hay un formulario con cambios).
 * Dice si la cambió, para que quien llama haga anotar el scroll. Nunca dentro de un `popstate`: hay navegadores que leen el modo
 * después de ese evento, y devolverlo ahí les haría mover la página igual.
 */
export function devolverModoDeScroll(historial: HistorialDeGuardia, guardiaPuesta: boolean): boolean {
  if (historial.scrollRestoration !== "manual") return false;
  if (guardiaPuesta && esEstadoDeGuardia(historial.state)) return false;
  historial.scrollRestoration = "auto";
  return true;
}

/**
 * El navegador anota el scroll de una entrada cuando la página se desplaza: para que lo anote sin que se note, se va a otro punto
 * y se vuelve en el mismo instante. Esto dice a cuál: un píxel hacia donde haya página (`tope` es lo más que baja el scroll), o
 * `null` si la página no se desplaza y no hay nada que anotar.
 */
export function pasoDeIdaYVuelta(y: number, tope: number): number | null {
  if (tope < 1) return null;
  return y >= 1 ? y - 1 : y + 1;
}
