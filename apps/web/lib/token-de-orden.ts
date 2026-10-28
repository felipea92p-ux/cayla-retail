// El token de idempotencia de «Nueva orden» (el «ticket» que evita dos órdenes iguales), ADR-0509.
//
// QUÉ RESUELVE. `abrir_orden_produccion` recibe un token: si el Taller pierde la red a mitad del clic y reintenta con el MISMO token, la base devuelve la misma orden en vez de abrir dos
// (mismo mecanismo que `registrar_venta`, p_token). Mientras el formulario era una hoja, el token «nacía con la hoja»: al cerrarla se desmontaba y la siguiente apertura traía uno nuevo, por
// accidente. Un formulario que se queda montado en la página (el compositor sobre la lista) abriría la segunda orden del día con el token de la primera: con otro contenido, la base
// respondería «lo que mandas ahora no es lo que se mandó la primera vez»; con el mismo, devolvería la anterior sin avisar.
//
// CONTRATO
//   PROMETE: que `actual()` no cambia mientras no haya una orden abierta (un reintento tras un corte lleva el mismo token) y que `renovar()` —que se llama SOLO cuando la base confirmó la
//            orden— da uno distinto: la orden siguiente es otra orden.
//   ASUME: quien llama renueva después de un guardado confirmado y nunca después de un error o de una respuesta perdida (ahí el reintento necesita el mismo token).
//   NO HACE: no guarda nada ni habla con la base; el token vive solo en memoria de la pantalla.

export type TokenDeOrden = {
  /** El que viaja en la apertura. */
  actual: () => string;
  /** La orden quedó abierta: la siguiente lleva otro. Devuelve el nuevo. */
  renovar: () => string;
};

export function crearTokenDeOrden(generar: () => string = () => crypto.randomUUID()): TokenDeOrden {
  let valor = generar();
  return {
    actual: () => valor,
    renovar: () => (valor = generar()),
  };
}
