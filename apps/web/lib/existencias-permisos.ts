// Qué puede hacer la persona desde el detalle de una prenda en Existencias (tarea #11 del análisis `/pantalla`).
//
// Vivía como cuatro líneas sueltas dentro de `InventarioPanel.tsx`, sin prueba: un cambio ahí (quitar un `&&`) volvía a
// abrir «Reponer al piso» a una cuenta que no ve Existencias (ADR-0240; ADR-0306 quitó el módulo «Bajada al piso»). Aquí es una
// función pura con su prueba; la pantalla solo la lee.
//
// Las tres reglas que se cruzan:
//   · Sede ACTIVA: todo lo que escribe firma con el Responsable de la sede activa (ADR-0162). Mirando otra sede con
//     `?ubicacion=`, nada que escriba ni nada que trabaje sobre la sede activa (etiquetas, historial) se ofrece.
//   · Módulo (ADR-0306): quien ve un módulo hace todo lo que hay dentro. Reponer, retirar y ajustar → Existencias
//     (ajustar también Conteos o Traslados); apartar y pedir a otra sede → «Apartados» y trasladar → «Traslados»,
//     que sí tienen entrada propia en el menú. La base pide lo mismo.
//   · Piso y almacén: reponer, retirar y apartar necesitan saber de dónde; solo donde la ubicación los separa.
//   · Eliminar el producto (ADR-0252, actualización): SOLO un Admin, y solo mirando la sede activa como todo lo que
//     escribe. En Catálogo ▸ Productos lo ve también un Líder porque allí hay productos que nunca se movieron; aquí no:
//     toda fila de Existencias sale de `stock`, que solo escribe un movimiento, así que todo lo que se ve ya tiene
//     historia, y con historia la base solo deja borrar a un Admin. Un Líder vería un botón que nunca funciona.

export type EntradaPermisos = {
  /** La ubicación separa piso y almacén y sus dos sububicaciones existen. */
  separaPisoAlmacen: boolean;
  /** Lo que se mira es la sede activa de la cabecera. */
  enSedeActiva: boolean;
  /** Su rol ve Existencias (ADR-0306: bajar al piso es una función suya) (y la página ya comprobó que es su sede y que separa piso y almacén). */
  puedeBajarAlPiso: boolean;
  /** Su rol ve «Apartados». */
  veApartados: boolean;
  /** Puede ajustar stock (`puede(persona, "ajustarStock")`; ADR-0306: función de Existencias, Conteos y Traslados, no un módulo). */
  puedeAjustar: boolean;
  /** Su rol ve «Traslados». */
  veTraslados: boolean;
  /** Es una tienda (vende): solo entre tiendas se pide una prenda para una clienta (ADR-0233). */
  esTienda: boolean;
  /** Es Admin (`fn_es_admin()`, ADR-0178): el único que puede eliminar un producto con historia de stock (ADR-0252). */
  esAdmin: boolean;
};

export type PermisosDelDetalle = {
  reponerYRetirar: boolean;
  apartar: boolean;
  ajustar: boolean;
  trasladar: boolean;
  /** Etiquetas e historial: trabajan sobre la sede activa (sus pantallas no reciben otra). */
  etiquetasEHistorial: boolean;
  /** «Pedir para una clienta» a otra tienda (ADR-0233, `pedir_prenda_para_apartar`). */
  pedirAOtraSede: boolean;
  /** «Eliminar el producto» (ADR-0252): abre la ventana que pregunta a la base; borra el producto entero, en todas las sedes. */
  eliminar: boolean;
};

export function permisosDelDetalle(e: EntradaPermisos): PermisosDelDetalle {
  const aqui = e.enSedeActiva;
  const conPiso = e.separaPisoAlmacen && aqui;
  return {
    reponerYRetirar: conPiso && e.puedeBajarAlPiso,
    apartar: conPiso && e.veApartados,
    ajustar: aqui && e.puedeAjustar,
    trasladar: aqui && e.veTraslados,
    etiquetasEHistorial: aqui,
    pedirAOtraSede: aqui && e.esTienda && e.veApartados,
    eliminar: aqui && e.esAdmin,
  };
}

/** Marcar una prenda es marcar sus tallas; si ya estaban todas, se desmarcan. Las marcas de otras prendas no se tocan. */
export function alternarMarcasDePrenda(previas: ReadonlySet<string>, varianteIds: readonly string[]): Set<string> {
  const siguientes = new Set(previas);
  const todas = varianteIds.length > 0 && varianteIds.every((id) => previas.has(id));
  for (const id of varianteIds) {
    if (todas) siguientes.delete(id);
    else siguientes.add(id);
  }
  return siguientes;
}
