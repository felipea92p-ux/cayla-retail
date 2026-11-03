import { leerCantidad, limpiarCantidad, textoCantidadRechazada } from "./alta-producto";

// Lo que se teclea en una celda de cantidad (Felipe 2026-11-03): «2,5» tecleado quedaba en 25, «1.5» en 15 y «-5» en 5, sin avisar. La coma se borraba al teclearla y el 5 caía junto al 2.
//
// La celda muestra lo que se escribe tal cual, y a la pantalla solo le llega una cantidad de verdad. Lo que no lo es deja en la pantalla lo que había al entrar a la celda: varias pantallas leen como 0 lo que
// no entienden (`enteroDe`, `celdaEntera`), y un «2,5» guardado ahí haría desaparecer esa talla de la orden, también sin avisar. Al salir de la celda vuelve su número, y se dice que lo escrito no se guardó.
//
// CONTRATO
//   PROMETE: que `paraLaPantalla` es siempre una cantidad que la regla del campo acepta, si lo que había antes también lo era; y que lo escrito nunca se transforma en otro número, salvo los miles («1,200» → 1200).
//   ASUME:   que hay una sola celda con el cursor a la vez. `useCantidadEscrita` guarda este estado y las celdas lo dibujan.
//   NO HACE: no decide qué cantidades valen (cada campo trae su `ReglaCantidad`; sin ella, `leerCantidad`) ni guarda nada: la pantalla sigue siendo la dueña del número.

type Escribiendo = { clave: string; texto: string; antes: string };
/** `aviso`: qué se dice de lo último que no se guardó. `frena`: ese aviso todavía no detuvo al botón que sigue (`alQuererSeguir`). */
type EstadoEscrito = { escribiendo: Escribiendo | null; aviso: string | null; frena: boolean };

export const SIN_ESCRIBIR: EstadoEscrito = { escribiendo: null, aviso: null, frena: false };

/** Qué cantidades valen en un campo y qué se dice de lo demás. */
export type ReglaCantidad = {
  /** El número que vale (vacío es 0), o `null` si lo escrito no es una cantidad aquí. */
  leer: (texto: string) => number | null;
  /** Qué decir de lo que no vale: mientras se escribe, o después de salir, cuando ya volvió su número. */
  decir: (escrito: string, alSalir: boolean) => string;
};

/** La de una celda de stock: de 0 a 9999, como la base (`leerCantidad`). */
const REGLA_DE_STOCK: ReglaCantidad = { leer: leerCantidad, decir: textoCantidadRechazada };

/** Un campo con otro tope: un entero sin signo de hasta `maxCifras` cifras, o de cualquier largo si no se pasa. El tope es el que el campo ya tenía: esto no lo decide. */
export function reglaDeEntero(maxCifras?: number): ReglaCantidad {
  const forma = new RegExp(maxCifras === undefined ? "^\\d+$" : `^\\d{1,${maxCifras}}$`);
  const rango = maxCifras === undefined ? "" : `, de 0 a ${"9".repeat(maxCifras)}`;
  return {
    leer(texto) {
      const t = texto.trim();
      if (t === "") return 0;
      return forma.test(t) ? Number(t) : null;
    },
    decir: (escrito, alSalir) => textoCantidadRechazada(escrito, alSalir, rango),
  };
}

/** ¿Lo escrito ahora mismo no es una cantidad? */
export const escritoInvalido = (e: EstadoEscrito, regla = REGLA_DE_STOCK): boolean => e.escribiendo !== null && regla.leer(e.escribiendo.texto) === null;

/** Qué decir bajo la tabla, o `null`. */
export function problemaEscrito(e: EstadoEscrito, regla = REGLA_DE_STOCK): string | null {
  if (e.escribiendo !== null && escritoInvalido(e, regla)) return regla.decir(e.escribiendo.texto, false);
  return e.aviso;
}

/** Una caja con su propio borrador, que fija su número al salir de ella o con Enter (Ajustar stock, el plan de compra): vacía o con el mismo número no cambia nada, y lo que no es una cantidad se rechaza. */
export function leerEscrito(escrito: string, hay: number, regla = REGLA_DE_STOCK): { tipo: "nada" } | { tipo: "fijar"; n: number } | { tipo: "rechazo"; texto: string } {
  const t = escrito.trim();
  if (t === "") return { tipo: "nada" };
  const n = regla.leer(t);
  if (n === null) return { tipo: "rechazo", texto: t };
  return n === hay ? { tipo: "nada" } : { tipo: "fijar", n };
}

/** Entró a la celda: lo que hay es adonde vuelve si lo que escriba no es una cantidad. El aviso de la celda anterior sigue: el Tab acaba de dejarla. */
export const alEntrar = (e: EstadoEscrito, clave: string, valor: string): EstadoEscrito => ({ ...e, escribiendo: { clave, texto: valor, antes: valor } });

/** Una tecla o un pegado. `valor`: lo que la pantalla tiene ahora. */
export function alEscribir(e: EstadoEscrito, clave: string, crudo: string, valor: string, regla = REGLA_DE_STOCK): { estado: EstadoEscrito; paraLaPantalla: string } {
  const texto = limpiarCantidad(crudo);
  const antes = e.escribiendo?.clave === clave ? e.escribiendo.antes : valor;
  return { estado: { escribiendo: { clave, texto, antes }, aviso: null, frena: false }, paraLaPantalla: regla.leer(texto) === null ? antes : texto };
}

/** Lo escrito no se guardó, y se dice: al salir de la celda, o de una caja que no es una celda («Llenar todas con», que trae su propia regla). */
export const alRechazar = (texto: string, regla = REGLA_DE_STOCK): EstadoEscrito => ({ escribiendo: null, aviso: regla.decir(texto, true), frena: true });

/** Salió de la celda: vuelve a mostrarse el número de la pantalla, y si lo escrito no valía, se dice. */
export function alSalir(e: EstadoEscrito, clave: string, regla = REGLA_DE_STOCK): EstadoEscrito {
  if (e.escribiendo?.clave !== clave) return e;
  return escritoInvalido(e, regla) ? alRechazar(e.escribiendo.texto, regla) : { ...e, escribiendo: null };
}

/**
 * El botón que sigue (cerrar la caja, colgar, guardar): sin esto se llevaría lo que acaba de rechazarse, sin que nadie alcance a leer por qué.
 * Con el cursor todavía en la celda (Enter), no sigue hasta que se corrija. Ya fuera de ella frena una vez: el clic que se llevó el cursor es el mismo que quiere seguir, y el aviso sale recién ahí. El segundo clic sigue.
 */
export function alQuererSeguir(e: EstadoEscrito, regla = REGLA_DE_STOCK): { estado: EstadoEscrito; frena: boolean } {
  if (escritoInvalido(e, regla)) return { estado: e, frena: true };
  return { estado: e.frena ? { ...e, frena: false } : e, frena: e.frena };
}
