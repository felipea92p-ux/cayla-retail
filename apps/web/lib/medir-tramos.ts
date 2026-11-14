/* ====================================================================
   medir-tramos · cuánto tarda cada lectura de una pantalla, en UNA línea del registro (2026-11-13)

   EL PROBLEMA. Existencias tarda 2,9–4,0 s de clic a contenido en producción (el cronómetro del clic, ADR-0654) y no se sabía en
   qué se iban: la base, el tamaño de la página o el dibujo. La página lanza una docena de lecturas a la vez; sin medir cada una, la
   lenta se esconde detrás del total. Este archivo mide cada lectura (cuándo empezó, cuándo terminó, contado desde que empezó la
   pantalla) y arma la línea que se escribe en el registro del servidor, como `finanzas_resumen_ms`.

   QUÉ NO LLEVA (ADR-0424). Solo nombres de tramo, milisegundos, bytes y el id de la sede: ni la persona, ni lo que respondió cada
   lectura, ni la búsqueda. La línea la arma `lineaDeTramos`, y su prueba exige que no se cuele otra cosa.

   La medición nunca cambia lo que la pantalla hace: `medir` devuelve una promesa que responde lo mismo y falla igual que la lectura.
   ==================================================================== */

/** El reloj, en milisegundos. En el servidor, `performance.now()`; en la prueba, uno que se mueve a mano. */
export type Reloj = () => number;

/** Una lectura medida, contada desde que empezó la pantalla. `hasta` es `null` mientras no termina. */
export type Tramo = { nombre: string; desde: number; hasta: number | null; fallo: boolean };

/** Lo que una lectura de adentro necesita para partir su tramo en pedazos (el plan: su RPC, su lectura y su motor). Sin medidor, `SIN_CRONOMETRO`:
 *  hace lo mismo y no anota nada. */
export type Cronometro = {
  /** Mide una lectura que YA empezó (se llama con la promesa recién creada). Devuelve una promesa que responde lo mismo, o falla igual. */
  medir<T>(nombre: string, lectura: PromiseLike<T>): Promise<T>;
  /** Mide un trabajo que corre de un tirón en el servidor (un cálculo, no una espera) y devuelve lo que devuelve. */
  medirAhora<T>(nombre: string, trabajo: () => T): T;
  /** Guarda una respuesta para pesarla al final (`bytes`), sin costo mientras la pantalla se arma: el peso se calcula después de responder. */
  pesar(nombre: string, valor: unknown): void;
};

export const SIN_CRONOMETRO: Cronometro = {
  medir: <T>(_nombre: string, lectura: PromiseLike<T>) => Promise.resolve(lectura),
  medirAhora: <T>(_nombre: string, trabajo: () => T) => trabajo(),
  pesar: () => {},
};

export type Medidor = Cronometro & {
  /** Marca un momento con nombre (p. ej. «lista»: lo que se dibuja primero ya está). */
  marcar(nombre: string): void;
  /** Espera a que terminen todas las lecturas medidas, también las que arrancaron mientras se esperaba y las que fallan. Nunca lanza. */
  todas(): Promise<void>;
  /** Lo medido hasta ahora: los tramos y las marcas, en ms desde el origen. */
  foto(): { tramos: Tramo[]; marcas: Record<string, number>; ahora: number };
  /** Lo guardado con `pesar`, para calcular su peso al final. */
  pesados(): Record<string, unknown>;
};

export function crearMedidor(reloj: Reloj = () => performance.now()): Medidor {
  const origen = reloj();
  const tramos: Tramo[] = [];
  const marcas: Record<string, number> = {};
  const pendientes: Promise<void>[] = [];
  const guardados: Record<string, unknown> = {};
  const desdeOrigen = () => reloj() - origen;

  return {
    medir<T>(nombre: string, lectura: PromiseLike<T>): Promise<T> {
      const tramo: Tramo = { nombre, desde: desdeOrigen(), hasta: null, fallo: false };
      tramos.push(tramo);
      const medida = Promise.resolve(lectura).then(
        (valor) => {
          tramo.hasta = desdeOrigen();
          return valor;
        },
        (error: unknown) => {
          tramo.hasta = desdeOrigen();
          tramo.fallo = true;
          throw error;
        }
      );
      pendientes.push(medida.then(nada, nada));
      return medida;
    },
    medirAhora<T>(nombre: string, trabajo: () => T): T {
      const tramo: Tramo = { nombre, desde: desdeOrigen(), hasta: null, fallo: false };
      tramos.push(tramo);
      try {
        return trabajo();
      } catch (error) {
        tramo.fallo = true;
        throw error;
      } finally {
        tramo.hasta = desdeOrigen();
      }
    },
    pesar(nombre: string, valor: unknown) {
      guardados[nombre] = valor;
    },
    marcar(nombre: string) {
      marcas[nombre] = desdeOrigen();
    },
    async todas() {
      // Una lectura encadenada (el ritmo, que arranca cuando llegan las prendas) se suma a la lista mientras se espera: se vuelve a
      // mirar hasta que no aparece ninguna nueva.
      let vistas = -1;
      while (vistas !== pendientes.length) {
        vistas = pendientes.length;
        await Promise.all(pendientes.slice());
      }
    },
    foto() {
      return { tramos: tramos.map((t) => ({ ...t })), marcas: { ...marcas }, ahora: desdeOrigen() };
    },
    pesados() {
      return { ...guardados };
    },
  };
}

function nada(): void {}

/** Un tramo en la línea: cuánto duró (`ms`) y en qué momento terminó desde que empezó la pantalla (`fin`); las dos, enteras. Con
 *  `fin` se ve qué lectura estuvo en el camino largo: dos que duran 300 ms no pesan igual si una empezó cuando terminó otra. */
export type TramoEnLinea = { ms: number | null; fin: number | null };

export type LineaTramos = {
  evento: string;
  sede_id: string | null;
  /** Cuándo estuvo lo que se dibuja primero (la marca «lista»), en ms desde que empezó la pantalla. */
  lista_ms: number | null;
  /** Cuándo terminó la última lectura: el total del servidor. */
  total_ms: number;
  tramos: Record<string, TramoEnLinea>;
  /** Cuántos bytes pesa cada pieza: lo que viaja al navegador y lo que respondió la base (aproximado: el largo del JSON en UTF-8). */
  bytes: Record<string, number | null>;
  /** Cuánto llegó a estar trabado el servidor mientras armaba la pantalla (`monitorEventLoopDelay`): si una respuesta de la base ya llegó
   *  pero el servidor estaba ocupado calculando otra cosa, su tramo crece aunque la base haya sido rápida. Solo si se midió. */
  bucle?: { max_ms: number; p99_ms: number };
  /** Las lecturas que fallaron, por nombre. Solo si alguna falló. */
  fallaron?: string[];
};

const entero = (n: number | null) => (n === null ? null : Math.round(n));

/**
 * Arma la línea del registro con lo medido. Pura: no lee el reloj (el total es el fin del tramo que terminó último, o `ahora` si
 * alguno no terminó). Un nombre repetido suma un sufijo (`plan_2`) en vez de pisar el primero.
 */
export function lineaDeTramos(
  evento: string,
  m: {
    sedeId: string | null;
    tramos: readonly Tramo[];
    marcas: Readonly<Record<string, number>>;
    ahora: number;
    bytes?: Readonly<Record<string, number | null>>;
    bucle?: { maxMs: number; p99Ms: number } | null;
  }
): LineaTramos {
  const tramos: Record<string, TramoEnLinea> = {};
  const fallaron: string[] = [];
  for (const t of m.tramos) {
    let clave = t.nombre;
    for (let n = 2; clave in tramos; n++) clave = `${t.nombre}_${n}`;
    tramos[clave] = { ms: t.hasta === null ? null : entero(t.hasta - t.desde), fin: entero(t.hasta) };
    if (t.fallo) fallaron.push(clave);
  }
  const algunoAbierto = m.tramos.some((t) => t.hasta === null);
  const ultimo = m.tramos.reduce((max, t) => Math.max(max, t.hasta ?? 0), 0);
  return {
    evento,
    sede_id: m.sedeId,
    lista_ms: entero(m.marcas.lista ?? null),
    total_ms: entero(algunoAbierto ? m.ahora : Math.max(ultimo, m.marcas.lista ?? 0)) ?? 0,
    tramos,
    bytes: { ...(m.bytes ?? {}) },
    ...(m.bucle ? { bucle: { max_ms: entero(m.bucle.maxMs) ?? 0, p99_ms: entero(m.bucle.p99Ms) ?? 0 } } : {}),
    ...(fallaron.length ? { fallaron } : {}),
  };
}

/**
 * Cuánto pesa un valor al viajar, aproximado: los bytes UTF-8 de su JSON (un `Map` cuenta como sus pares y un `Set` como su lista;
 * una función o una promesa no cuentan). `null` si no se puede serializar. Es una aproximación de lo que React manda al navegador,
 * no la cifra exacta del paquete.
 */
export function tamanoJson(valor: unknown): number | null {
  try {
    const texto = JSON.stringify(valor, (_clave, v: unknown) => {
      if (v instanceof Map) return [...v.entries()];
      if (v instanceof Set) return [...v.values()];
      if (typeof v === "function" || (v !== null && typeof v === "object" && typeof (v as { then?: unknown }).then === "function")) return undefined;
      return v;
    });
    return texto === undefined ? 0 : new TextEncoder().encode(texto).length;
  } catch {
    return null;
  }
}
