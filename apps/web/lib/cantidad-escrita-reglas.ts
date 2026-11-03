import { leerCantidad, limpiarCantidad, textoCantidadRechazada } from "./alta-producto";

// Lo que se teclea en una celda de cantidad (Felipe 2026-11-03): «2,5» tecleado quedaba en 25, «1.5» en 15 y «-5» en 5, sin avisar. La coma se borraba al teclearla y el 5 caía junto al 2.
//
// La celda muestra lo que se escribe tal cual, y a la pantalla solo le llega una cantidad de verdad. Lo que no lo es deja en la pantalla lo que había al entrar a la celda: varias pantallas leen como 0 lo que
// no entienden (`enteroDe`, `celdaEntera`), y un «2,5» guardado ahí haría desaparecer esa talla de la orden, también sin avisar. Al salir de la celda vuelve su número, y se dice que lo escrito no se guardó.
//
// CONTRATO
//   PROMETE: que `paraLaPantalla` es siempre una cantidad que `leerCantidad` acepta, si lo que había antes también lo era; y que lo escrito nunca se transforma en otro número, salvo los miles («1,200» → 1200).
//   ASUME:   que hay una sola celda con el cursor a la vez. `useCantidadEscrita` guarda este estado y las celdas lo dibujan.
//   NO HACE: no decide qué cantidades valen (`leerCantidad`) ni guarda nada: la pantalla sigue siendo la dueña del número.

type Escribiendo = { clave: string; texto: string; antes: string };
type EstadoEscrito = { escribiendo: Escribiendo | null; rechazado: string | null };

export const SIN_ESCRIBIR: EstadoEscrito = { escribiendo: null, rechazado: null };

/** ¿Lo escrito ahora mismo no es una cantidad? */
export const escritoInvalido = (e: EstadoEscrito): boolean => e.escribiendo !== null && leerCantidad(e.escribiendo.texto) === null;

/** Qué decir bajo la tabla, o `null`. */
export function problemaEscrito(e: EstadoEscrito): string | null {
  if (e.escribiendo !== null && escritoInvalido(e)) return textoCantidadRechazada(e.escribiendo.texto, false);
  return e.rechazado === null ? null : textoCantidadRechazada(e.rechazado, true);
}

/** Entró a la celda: lo que hay es adonde vuelve si lo que escriba no es una cantidad. El aviso de la celda anterior sigue: el Tab acaba de dejarla. */
export const alEntrar = (e: EstadoEscrito, clave: string, valor: string): EstadoEscrito => ({ ...e, escribiendo: { clave, texto: valor, antes: valor } });

/** Una tecla o un pegado. `valor`: lo que la pantalla tiene ahora. */
export function alEscribir(e: EstadoEscrito, clave: string, crudo: string, valor: string): { estado: EstadoEscrito; paraLaPantalla: string } {
  const texto = limpiarCantidad(crudo);
  const antes = e.escribiendo?.clave === clave ? e.escribiendo.antes : valor;
  return { estado: { escribiendo: { clave, texto, antes }, rechazado: null }, paraLaPantalla: leerCantidad(texto) === null ? antes : texto };
}

/** Salió de la celda: vuelve a mostrarse el número de la pantalla, y si lo escrito no valía, se dice. */
export function alSalir(e: EstadoEscrito, clave: string): EstadoEscrito {
  if (e.escribiendo?.clave !== clave) return e;
  return { escribiendo: null, rechazado: escritoInvalido(e) ? e.escribiendo.texto : e.rechazado };
}
