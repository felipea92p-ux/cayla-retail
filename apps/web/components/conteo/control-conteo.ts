// Rutas relativas a propósito: la prueba de este archivo (`control-conteo.test.ts`) corre en vitest, que no resuelve `@/` para valores.
import {
  contarLinea,
  crearAgrupadorDeGuardado,
  crearColaEnSerie,
  estadoDeLinea,
  lineaDesdeJson,
  resumirLineas,
  type LineaConteo,
  type ResumenConteo,
} from "../../lib/conteo-reglas";

/* ====================================================================
   ControlConteo · el estado vivo de la pantalla Contar, fuera de React
   (Inventario ▸ Conteo, rediseño 2026-09-29)

   El problema que resuelve: un conteo de una tienda grande tiene ~1.100 variantes en pantalla y la persona escribe una
   cantidad, escanea una ráfaga o recibe la respuesta de la base en cualquier fila. Si ese estado viviera en un
   `useState` de la pantalla, CADA tecla y CADA respuesta volverían a dibujar las 1.100 filas. Acá vive en un almacén
   con suscripción por variante: cuando cambia una línea solo se entera la fila de esa variante (y el resumen del pie),
   y la pantalla solo vuelve a agrupar la lista cuando una línea APARECE o DESAPARECE (una variante que no estaba en la
   foto, o una a la que se le borra la cantidad). Es la analogía del taller: cada operaria mira su propia ficha; nadie
   reimprime el tablero entero porque una ficha cambió.

   Lo que hace por cada cantidad (`contar`), en orden:
     1. Pinta la línea YA (`contarLinea`, la misma cuenta que hace la base) — quien escanea no espera a la red.
     2. Junta los cambios seguidos de la MISMA variante (600 ms sin novedades → un solo viaje): una ráfaga de 12 blusas
        es un guardado con «12», no doce.
     3. Los guardados salen EN FILA (`crearColaEnSerie`): cada uno manda el TOTAL de la variante, y si dos salieran a la
        vez y el «2» llegara después del «3», la variante quedaría en 2.
     4. La respuesta de la base MANDA (`conteo_contar` devuelve la línea con su «Debe haber» vigente: si entre abrir y
        contar salió una venta, ya está descontada). Con una excepción: si mientras tanto la persona cambió de nuevo esa
        variante, de la respuesta solo valen los hechos de la base (debe haber, foto, stock vivo) y NO la cantidad —
        pisarla con la respuesta vieja haría parpadear la cifra hacia atrás.
     5. Si la base rechaza, la línea vuelve a lo último que la base confirmó (nada queda «contado» en pantalla y perdido
        en la base) y se avisa para que la persona reintente.

   No llama a la red (recibe `guardar`), no sabe de React (expone `suscribir…`/snapshots para `useSyncExternalStore`) y
   no sabe de textos: quien lo usa decide qué decir de cada fallo.
   ==================================================================== */

/** Lo que se le manda a la base por una variante. */
export type PeticionGuardado = { varianteId: string; cantidad: number | null; confirmoFuera: boolean };

/** La forma del error de supabase-js, sin acoplarnos a su tipo. */
export type ErrorGuardado = { message: string; code?: string | null; details?: string | null; hint?: string | null };

export type FalloDeGuardado = PeticionGuardado & {
  error: ErrorGuardado;
  /** ¿La línea volvió a lo último que la base confirmó? `false` si ya había una edición más nueva en camino: esa decidirá. */
  revertida: boolean;
};

export type EstadoGuardado = "quieto" | "guardando" | "guardado" | "error";

export type OpcionesControl = {
  /** Las líneas con que arranca la pantalla (lo que la base tiene ahora). */
  lineas: readonly LineaConteo[];
  /** El id de la categoría cuando el conteo es «Solo …»; `null` si es todo. */
  categoriaDelConteo: string | null;
  ahora?: () => string;
  esperaMs?: number;
};

/**
 * Lo que el almacén necesita de afuera y que CAMBIA con cada dibujo de la pantalla (el responsable vigente, el catálogo
 * con lo dado de alta al vuelo): la pantalla lo vuelve a conectar en cada dibujo y los guardados que salen segundos
 * después usan siempre lo más reciente. Por eso no se pasa al crear el almacén.
 */
export type Puertos = {
  /** La categoría de una variante según el catálogo; `null` si no se sabe (la base lo decide al guardar). */
  categoriaDe: (varianteId: string) => string | null;
  /** Manda UNA cantidad a la base (`conteo_contar`). No debe lanzar: los errores van en `error`. */
  guardar: (p: PeticionGuardado) => Promise<{ data: unknown; error: ErrorGuardado | null }>;
  alFallar?: (f: FalloDeGuardado) => void;
};

export type ResultadoContar = "aplicada" | "sin_cambio" | "fuera_de_alcance";

/** Una variante que no estaba en la foto y se acaba de encontrar: sin nada esperado en este lugar (regla D3: «foto 0»). */
function lineaNueva(varianteId: string): LineaConteo {
  return {
    varianteId,
    debeHaber: 0,
    foto: 0,
    contada: null,
    anterior: null,
    verificadoEn: null,
    confirmadaEn: null,
    actual: 0,
    ajusteMovimientoId: null,
    ajustadoTotal: 0,
    ajustadoAntes: 0,
    diferencia: null,
    estado: "pendiente",
  };
}

/** ¿Dos líneas se ven igual? (`verificadoEn` no cuenta: la hora del navegador y la de la base nunca coinciden.) */
function seVenIguales(a: LineaConteo, b: LineaConteo): boolean {
  return (
    a.debeHaber === b.debeHaber &&
    a.foto === b.foto &&
    a.contada === b.contada &&
    a.anterior === b.anterior &&
    a.actual === b.actual &&
    a.ajustadoAntes === b.ajustadoAntes &&
    a.estado === b.estado &&
    a.confirmadaEn === b.confirmadaEn &&
    a.diferencia === b.diferencia
  );
}

export class ControlConteo {
  private readonly entradas = new Map<string, LineaConteo>();
  /** Lo último que la base dijo de cada variante. Sin entrada = la base no tiene esa línea. Es a lo que se vuelve si un guardado falla. */
  private readonly confirmadas = new Map<string, LineaConteo>();
  /** Cuántas veces la persona cambió cada variante. Un guardado sabe si hay algo más nuevo comparando este número. */
  private readonly ediciones = new Map<string, number>();
  /** Variantes fuera de alcance que la persona ya dijo «agregar igual»: sus siguientes guardados llevan la confirmación. */
  private readonly fueraConfirmadas = new Set<string>();

  private readonly oyentesLinea = new Map<string, Set<() => void>>();
  private readonly oyentesResumen = new Set<() => void>();
  private readonly oyentesEstructura = new Set<() => void>();
  private readonly oyentesGuardado = new Set<() => void>();

  private version = 0;
  private resumenVigente: ResumenConteo;
  private resumenSucio = false;
  private guardado: EstadoGuardado = "quieto";
  private fallos = 0;

  private readonly cola = crearColaEnSerie();
  private readonly agrupador: ReturnType<typeof crearAgrupadorDeGuardado<PeticionGuardado>>;
  private puertos: Puertos = {
    categoriaDe: () => null,
    guardar: async () => ({ data: null, error: { message: "El conteo todavía no está conectado." } }),
  };

  constructor(private readonly opciones: OpcionesControl) {
    for (const l of opciones.lineas) {
      this.entradas.set(l.varianteId, l);
      this.confirmadas.set(l.varianteId, l);
    }
    this.resumenVigente = resumirLineas(opciones.lineas);
    this.agrupador = crearAgrupadorDeGuardado<PeticionGuardado>((_id, peticion) => {
      void this.cola.agregar(() => this.enviar(peticion)).then(() => this.reevaluarGuardado());
    }, opciones.esperaMs);
  }

  /** Conecta (o reconecta) lo que viene de afuera. Barato: solo guarda la referencia. */
  conectar(puertos: Puertos): void {
    this.puertos = puertos;
  }

  // ---- Lo que lee la pantalla (compatible con `useSyncExternalStore`) ------------------------------------------------

  /** La línea de una variante (`undefined` si no está en el conteo). Mismo objeto mientras no cambie. */
  linea = (varianteId: string): LineaConteo | undefined => this.entradas.get(varianteId);

  /** Todas las líneas que hoy cuentan. */
  lineas = (): LineaConteo[] => [...this.entradas.values()];

  /** Sube cada vez que una línea aparece o desaparece: es la señal para volver a agrupar la lista. */
  versionEstructura = (): number => this.version;

  /** El resumen del conteo. Misma referencia mientras nada cambie. */
  resumen = (): ResumenConteo => {
    if (this.resumenSucio) {
      this.resumenVigente = resumirLineas([...this.entradas.values()]);
      this.resumenSucio = false;
    }
    return this.resumenVigente;
  };

  estadoGuardado = (): EstadoGuardado => this.guardado;

  /** Hay algo esperando para guardarse o guardándose: al salir de la página se le avisa a la persona. */
  hayPendientes = (): boolean => this.agrupador.pendientes > 0 || this.cola.pendientes > 0;

  suscribirLinea(varianteId: string, avisar: () => void): () => void {
    let set = this.oyentesLinea.get(varianteId);
    if (!set) this.oyentesLinea.set(varianteId, (set = new Set()));
    set.add(avisar);
    return () => {
      set.delete(avisar);
      if (set.size === 0 && this.oyentesLinea.get(varianteId) === set) this.oyentesLinea.delete(varianteId);
    };
  }
  suscribirResumen = (avisar: () => void): (() => void) => {
    this.oyentesResumen.add(avisar);
    return () => void this.oyentesResumen.delete(avisar);
  };
  suscribirEstructura = (avisar: () => void): (() => void) => {
    this.oyentesEstructura.add(avisar);
    return () => void this.oyentesEstructura.delete(avisar);
  };
  suscribirGuardado = (avisar: () => void): (() => void) => {
    this.oyentesGuardado.add(avisar);
    return () => void this.oyentesGuardado.delete(avisar);
  };

  // ---- Lo que hace la persona ---------------------------------------------------------------------------------------

  /**
   * Anota `cantidad` para una variante: la pinta YA y la manda a guardar. `null` = borrar lo contado (vuelve a
   * pendiente, NUNCA a 0). Devuelve `fuera_de_alcance` —sin tocar nada— cuando la variante no estaba en el conteo, el
   * conteo es «Solo …» y la variante es de otra categoría y todavía nadie dijo «agregar igual».
   */
  contar(varianteId: string, cantidad: number | null, { confirmoFuera = false }: { confirmoFuera?: boolean } = {}): ResultadoContar {
    const previa = this.entradas.get(varianteId);
    if (!previa) {
      if (cantidad === null) return "sin_cambio";
      const categoria = this.opciones.categoriaDelConteo;
      if (categoria !== null && !confirmoFuera && !this.fueraConfirmadas.has(varianteId)) {
        const deLaVariante = this.puertos.categoriaDe(varianteId);
        if (deLaVariante !== null && deLaVariante !== categoria) return "fuera_de_alcance";
      }
    }
    if (previa && previa.contada === cantidad) return "sin_cambio";

    const siguiente = contarLinea(previa ?? lineaNueva(varianteId), cantidad, this.ahora());
    this.ediciones.set(varianteId, (this.ediciones.get(varianteId) ?? 0) + 1);
    if (confirmoFuera) this.fueraConfirmadas.add(varianteId);
    if (siguiente) this.poner(varianteId, siguiente);
    else this.quitar(varianteId);

    this.fijarGuardado("guardando");
    this.agrupador.programar(varianteId, { varianteId, cantidad, confirmoFuera: this.fueraConfirmadas.has(varianteId) });
    return "aplicada";
  }

  /** Manda YA lo que espera su turno (al salir de la pantalla). No espera la respuesta. */
  soltar(): void {
    this.agrupador.soltarTodo();
  }

  /**
   * Manda todo lo pendiente y espera a que la base responda: lo que va a ver la pantalla de revisar sale de la base,
   * así que antes se termina de escribir. `true` = todo quedó guardado; `false` = algún guardado falló (la línea volvió
   * a lo último confirmado y el aviso ya se dio): quien navega debe quedarse y dejar que la persona reintente.
   */
  async terminar(): Promise<boolean> {
    const antes = this.fallos;
    this.agrupador.soltarTodo();
    await this.cola.vaciar();
    return this.fallos === antes;
  }

  // ---- Por dentro ---------------------------------------------------------------------------------------------------

  private ahora(): string {
    return (this.opciones.ahora ?? (() => new Date().toISOString()))();
  }

  private async enviar(peticion: PeticionGuardado): Promise<void> {
    const enviada = this.ediciones.get(peticion.varianteId) ?? 0;
    let respuesta: { data: unknown; error: ErrorGuardado | null };
    try {
      respuesta = await this.puertos.guardar(peticion);
    } catch (e) {
      respuesta = { data: null, error: { message: e instanceof Error ? e.message : "No se pudo guardar." } };
    }
    if (respuesta.error) {
      this.fallar(peticion, enviada, respuesta.error);
      return;
    }
    let linea: LineaConteo | null;
    try {
      linea = lineaDesdeJson(respuesta.data);
    } catch {
      this.fallar(peticion, enviada, { message: "La respuesta del conteo llegó mal formada." });
      return;
    }
    this.confirmar(peticion.varianteId, linea, enviada);
  }

  private confirmar(varianteId: string, delServidor: LineaConteo | null, enviada: number): void {
    if (delServidor) this.confirmadas.set(varianteId, delServidor);
    else this.confirmadas.delete(varianteId);

    if ((this.ediciones.get(varianteId) ?? 0) === enviada) {
      // Nada más nuevo desde que se envió: la respuesta de la base manda.
      if (delServidor) this.poner(varianteId, delServidor);
      else this.quitar(varianteId);
      return;
    }
    // Hay una edición más nueva en camino: solo valen los hechos de la base, no la cantidad.
    const local = this.entradas.get(varianteId);
    if (!local || !delServidor) return;
    const mezclada = { ...local, debeHaber: delServidor.debeHaber, foto: delServidor.foto, actual: delServidor.actual };
    const estado = estadoDeLinea(mezclada);
    if (estado === null) this.quitar(varianteId);
    else this.poner(varianteId, { ...mezclada, estado, diferencia: mezclada.contada === null ? null : mezclada.contada - mezclada.debeHaber });
  }

  private fallar(peticion: PeticionGuardado, enviada: number, error: ErrorGuardado): void {
    this.fallos += 1;
    const revertida = (this.ediciones.get(peticion.varianteId) ?? 0) === enviada;
    if (revertida) {
      const confirmada = this.confirmadas.get(peticion.varianteId);
      if (confirmada) this.poner(peticion.varianteId, confirmada);
      else this.quitar(peticion.varianteId);
    }
    this.fijarGuardado("error");
    this.puertos.alFallar?.({ ...peticion, error, revertida });
  }

  private reevaluarGuardado(): void {
    if (this.hayPendientes()) return;
    // Una vez dado el aviso de un fallo, «guardado» solo vuelve cuando algo posterior se guarda bien.
    if (this.guardado === "guardando") this.fijarGuardado("guardado");
  }

  private fijarGuardado(estado: EstadoGuardado): void {
    if (this.guardado === estado) return;
    this.guardado = estado;
    for (const avisar of [...this.oyentesGuardado]) avisar();
  }

  /** Deja la línea como `linea` (sin avisar a nadie si ya se ve igual). */
  private poner(varianteId: string, linea: LineaConteo): void {
    const previa = this.entradas.get(varianteId);
    if (previa && seVenIguales(previa, linea)) return;
    this.entradas.set(varianteId, linea);
    this.resumenSucio = true;
    if (!previa) this.version += 1;
    this.avisarLinea(varianteId);
    for (const avisar of [...this.oyentesResumen]) avisar();
    if (!previa) for (const avisar of [...this.oyentesEstructura]) avisar();
  }

  private quitar(varianteId: string): void {
    if (!this.entradas.delete(varianteId)) return;
    this.resumenSucio = true;
    this.version += 1;
    this.avisarLinea(varianteId);
    for (const avisar of [...this.oyentesResumen]) avisar();
    for (const avisar of [...this.oyentesEstructura]) avisar();
  }

  private avisarLinea(varianteId: string): void {
    const set = this.oyentesLinea.get(varianteId);
    if (set) for (const avisar of [...set]) avisar();
  }
}
