// Qué prendas se ven en cada sede según su EMPRESA (ADR-0505). Lógica pura, sin React ni Supabase; la lectura vive en
// `lib/empresas-de-sede.ts`.
//
// EL PROBLEMA. CLAURE es otra empresa que solo opera en Lima (ADR-0463). Las prendas de CLAURE salían en Vender, Catálogo,
// Existencias y Recibir de Trujillo y Arequipa, con otro nombre y otro precio que la misma blusa de CAYLA, y las colaboradoras
// no sabían cuál era la suya (Felipe, 2026-10-24). La base ya no deja moverlas fuera de Lima (disparador de `movimientos`,
// 20261024232000); esto es lo que la pantalla esconde para que nadie las vea donde no se pueden vender.
//
// LA REGLA. «Las empresas de aquí» son las de la sede elegida (`fn_empresas_de_sede`, la misma regla que el alta y la tienda
// online) o, en la vista CAYLA Global, todas (`fn_empresas`). Una prenda se ve si su empresa está entre ellas. La insignia con
// el nombre de la empresa sale solo donde conviven dos o más (Lima, Global) y nunca para la de la casa: marcar CAYLA en 450
// prendas sería ruido.
//
// SE DEGRADA, NUNCA ESCONDE DE MÁS. Sin la lista (la base no respondió, o es una base sin empresas) o sin la empresa de una
// prenda (una copia del catálogo armada antes de esto), se ve todo, como antes: la base sigue rechazando lo que no corresponde.

/** Una empresa que opera aquí: `clave` estable (`cayla`, `claure`) y `nombre` como se escribe en pantalla. */
export type EmpresaDeSede = { id: string; clave: string; nombre: string };

/** Las empresas que se ven aquí, o `null` si no se pudo saber (entonces no se esconde nada). */
export type EmpresasAqui = EmpresaDeSede[] | null;

/** La empresa de la casa: la que no lleva insignia (ADR-0463, `fn_empresa_casa_id`). */
const CLAVE_CASA = "cayla";

/** ¿Esta prenda se ve aquí? Sin lista o sin la empresa de la prenda, sí (se degrada a mostrar). */
export function seVeAqui(empresaId: string | null | undefined, empresas: EmpresasAqui): boolean {
  if (!empresas || !empresaId) return true;
  return empresas.some((e) => e.id === empresaId);
}

/** Solo las filas cuya empresa opera aquí (Vender, Recibir, Existencias, Contar…). */
export function soloLasDeAqui<T extends { empresaId?: string | null }>(filas: T[], empresas: EmpresasAqui): T[] {
  if (!empresas) return filas;
  return filas.filter((f) => seVeAqui(f.empresaId, empresas));
}

/** El nombre que va en la insignia de la prenda, o `null`: solo donde se ven dos o más empresas y si no es la de la casa. */
export function insigniaDeEmpresa(empresaId: string | null | undefined, empresas: EmpresasAqui): string | null {
  if (!empresas || empresas.length < 2 || !empresaId) return null;
  const empresa = empresas.find((e) => e.id === empresaId);
  return empresa && empresa.clave !== CLAVE_CASA ? empresa.nombre : null;
}

/**
 * Con qué empresa se pide la lista de Catálogo ▸ Productos (`p_empresa_id`). En una sede con UNA empresa (Trujillo), esa,
 * aunque la URL diga otra: así CLAURE no sale ni pegando el enlace. Donde hay dos o más (Lima, Global), la que se eligió en la
 * píldora «Tienda» si es una de ellas; si no, ninguna y la lista las trae todas. Hoy las dos de Lima son todas las que hay; si
 * llega una tercera que no opere en Lima, la base tendría que recibir la lista entera en vez de una sola empresa.
 */
export function empresaDelListado(elegida: string | undefined, empresas: EmpresasAqui): string | undefined {
  if (!empresas || empresas.length === 0) return elegida;
  if (empresas.length === 1) return empresas[0].id;
  return elegida && empresas.some((e) => e.id === elegida) ? elegida : undefined;
}

/** Las opciones de la píldora «Tienda»: solo donde hay más de una empresa; si no, la píldora no aparece (`null`). */
export function opcionesDeEmpresa(empresas: EmpresasAqui): { id: string; nombre: string }[] | null {
  if (!empresas || empresas.length < 2) return null;
  return empresas.map((e) => ({ id: e.id, nombre: e.nombre }));
}
