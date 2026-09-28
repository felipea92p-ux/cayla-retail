// Qué puede hacer la persona desde el detalle de una prenda en Existencias (tarea #11 del análisis `/pantalla`).
//
// Vivía como cuatro líneas sueltas dentro de `InventarioPanel.tsx`, sin prueba: un cambio ahí (quitar un `&&`) volvía a
// abrir «Reponer al piso» a un rol sin «Bajada al piso», que es exactamente el hueco que cerró ADR-0240. Aquí es una
// función pura con su prueba; la pantalla solo la lee.
//
// Las tres reglas que se cruzan:
//   · Sede ACTIVA: todo lo que escribe firma con el Responsable de la sede activa (ADR-0162). Mirando otra sede con
//     `?ubicacion=`, nada que escriba ni nada que trabaje sobre la sede activa (etiquetas, historial) se ofrece.
//   · Módulo: cada escritura es del módulo que la nombra (ADR-0240, opción A; ADR-0250 sumó el último): reponer y
//     retirar → «Bajada al piso», apartar y pedir a otra sede → «Apartados», trasladar → «Traslados», ajustar →
//     «Ajustar stock». La base pide lo mismo.
//   · Piso y almacén: reponer, retirar y apartar necesitan saber de dónde; solo donde la ubicación los separa.
//   · Eliminar el producto (ADR-0252, actualización): el mismo permiso que en Catálogo ▸ Productos (Líder; un Admin es un
//     Líder), y solo mirando la sede activa como todo lo que escribe. La ventana le pregunta a la base si se puede y
//     con qué (sin historia: Líder o Admin; con historia de stock: solo Admin; con documentos: nadie).

export type EntradaPermisos = {
  /** La ubicación separa piso y almacén y sus dos sububicaciones existen. */
  separaPisoAlmacen: boolean;
  /** Lo que se mira es la sede activa de la cabecera. */
  enSedeActiva: boolean;
  /** Su rol ve «Bajada al piso» (y la página ya comprobó que es su sede y que separa piso y almacén). */
  puedeBajarAlPiso: boolean;
  /** Su rol ve «Apartados». */
  veApartados: boolean;
  /** Puede ajustar stock (`puede(persona, "ajustarStock")`; ADR-0250: módulo propio, ya no ve Existencias/Conteos/Traslados). */
  puedeAjustar: boolean;
  /** Su rol ve «Traslados». */
  veTraslados: boolean;
  /** Es una tienda (vende): solo entre tiendas se pide una prenda para una clienta (ADR-0233). */
  esTienda: boolean;
  /** `colaboradores.rol = 'lider'` (un Admin también lo es): quien ve «Eliminar» en Catálogo ▸ Productos. */
  esLider: boolean;
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
  /** En su sede, con piso y almacén, pero sin «Bajada al piso»: la talla por colgar lo explica en vez de callar. */
  explicarSinModuloBajada: boolean;
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
    explicarSinModuloBajada: conPiso && !e.puedeBajarAlPiso,
    eliminar: aqui && e.esLider,
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
