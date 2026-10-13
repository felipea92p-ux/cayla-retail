// Enviar una orden a una sede (ADR-0362, fase 3): la lógica pura de la pantalla. Sin React ni red: se importa desde el cliente y se prueba
// sola (`envio-orden-reglas.test.ts`).
//
//   PROMETE: precargar lo que le queda por enviar a cada línea de la orden; decir qué le falta a la guía con las MISMAS reglas que
//   `crear_envio` (de aquí sale la guía de foco: si la base rechaza algo que esto dejaba pasar, la prueba lo atrapa); armar lo que viaja
//   a la base (`p_lineas` solo con las cantidades mayores a cero); y leer lo que vuelve (el número «ENV-000012» y la sede).
//   NO HACE: no habla con la base ni decide permisos (el módulo «Órdenes de compra» y quién firma los decide la función).
//
// El contrato con la base: docs/compras/ordenes-de-compra-2026-10/contrato-envio-a-sede.md.
//
// Una guía lleva lo de UNA orden a UNA sede (la base acepta líneas de varias órdenes; esta pantalla arranca desde una orden). Las
// cantidades se escriben como texto, igual que en la orden: vacío es cero, y cero es «esta línea no va en esta guía».

import type { CampoDeGuia } from "./guia-campos";
import { leerNumero, textoParaBase } from "./orden-compra-alta";
import { numeroEnvio, type EnvioDeOrden, type LineaDetalle } from "./ordenes-compra-reglas";

/** Lo que la base acepta (los topes de `crear_envio` y `anular_envio`). */
export const TOPES_ENVIO = { guia: 40, nota: 500, motivo: 300 } as const;

/** La línea de la orden como la necesita el envío: su id, su lugar en la orden y lo que le queda por enviar. */
export type LineaParaEnviar = Pick<LineaDetalle, "id" | "posicion" | "porEnviar">;

/** ¿Esta línea puede ir en una guía? Tiene id (la base la nombra por él) y algo por enviar. */
export const esEnviable = (l: LineaParaEnviar): boolean => l.id !== null && (l.porEnviar ?? 0) > 0;

/** Lo que la pantalla le llena a `crear_envio`. */
export type BorradorEnvio = {
  /** La sede a la que va. Vacía = sin elegir. En una orden «directo a la tienda» no se mira: manda `ContextoEnvio.sedeFija`. */
  sedeId: string;
  /** Cuántas van de cada línea de la orden, tal como se escribió (clave: el id de la línea pedida). Vacío o ausente = no va. */
  cantidades: Readonly<Record<string, string>>;
  guia: string;
  nota: string;
};

/** Lo que la pantalla sabe y el borrador no. */
export type ContextoEnvio = {
  lineas: readonly LineaParaEnviar[];
  /** Las sedes a las que se puede enviar (las activas). */
  sedes: ReadonlySet<string>;
  /** La sede de una orden «directo a la tienda»: la mercadería solo va ahí. `null` en una «Por repartir», donde se elige. */
  sedeFija: string | null;
};

/** Qué decir cuando se corta la señal al enviar. El pedido pudo llegar a la base y perderse solo la respuesta: reintentar sin cambiar nada
 *  es seguro (el mismo token con los mismos datos devuelve el mismo envío, sin repetir nada). */
export const AVISO_DE_CORTE_ENVIO =
  "Se cortó la conexión y no sabemos si el envío llegó a registrarse. Vuelve a pulsar «Enviar» sin cambiar nada: si ya se registró, no se repite.";

export const AVISO_DE_CORTE_ANULAR_ENVIO =
  "Se cortó la conexión y no sabemos si el envío llegó a anularse. Vuelve a pulsar «Anular envío» con el mismo motivo: si ya se anuló, no se repite.";

/** Lo que la base contesta cuando el mismo token vuelve con otros datos (la pantalla ofrece «Recargar»). */
export function esEnvioConOtrosDatos(mensaje: string | null | undefined): boolean {
  return !!mensaje && /ya se (guard|registr)[óo] con otros datos/i.test(mensaje);
}

/** ¿Conviene recargar la orden? Lo que quedaba por enviar pudo cambiar mientras se miraba (otra persona envió, o se anuló un envío). */
export function sugiereRecargar(mensaje: string | null | undefined): boolean {
  return esEnvioConOtrosDatos(mensaje) || (!!mensaje && /por enviar|ya se envi|otra persona|cambi[óo]/i.test(mensaje));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que ya viene puesto
// ---------------------------------------------------------------------------------------------------------------------------------

/** Cada línea con algo por enviar arranca con TODO lo que le queda (las demás no llevan caja). Es lo que pide el contrato: en una orden
 *  «directo» casi siempre se manda todo; en una «Por repartir» se baja a lo que va a esta sede (0 = no va). */
export function precargarCantidades(orden: { lineas: readonly LineaParaEnviar[] }): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const l of orden.lineas) if (esEnviable(l)) salida[l.id!] = String(l.porEnviar);
  return salida;
}

/** Todas en cero: la persona escribe solo lo que va a esta sede. */
export function vaciarCantidades(orden: { lineas: readonly LineaParaEnviar[] }): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const l of orden.lineas) if (esEnviable(l)) salida[l.id!] = "0";
  return salida;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Qué le falta (las reglas de `crear_envio`, dichas para quien llena)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lee lo que se escribió en la caja de una línea: un entero de 0 a lo que le queda por enviar. Vacío vale cero. Con un problema, la
 *  cantidad que cuenta es cero (nada de lo mal escrito viaja a la base). */
export function leerCantidad(texto: string, porEnviar: number): { cantidad: number; problema: string | null } {
  const t = texto.replace(/\s+/g, "");
  const n = leerNumero(t, 0);
  if (n.tipo === "vacio") return { cantidad: 0, problema: null };
  if (n.tipo === "mal") {
    // «1.500» y parecidos: en el Perú así se escribe también «mil quinientos». No se adivina (misma costumbre que la orden).
    if (n.motivo === "ambiguo") return { cantidad: 0, problema: `¿«${t}» son ${t.replace(".", "")}? Escribe la cantidad sin punto: ${t.replace(".", "")}.` };
    return { cantidad: 0, problema: `Escribe cuántas van, de 0 a ${porEnviar}, sin decimales.` };
  }
  if (n.escalado > porEnviar) return { cantidad: 0, problema: porEnviar === 1 ? "Solo queda 1 por enviar." : `Solo quedan ${porEnviar} por enviar.` };
  return { cantidad: n.escalado, problema: null };
}

export const problemaDeCantidad = (texto: string, porEnviar: number): string | null => leerCantidad(texto, porEnviar).problema;

/** Cuántas unidades lleva la guía: la suma de las cantidades bien escritas de las líneas con algo por enviar. */
export function unidadesDelEnvio(lineas: readonly LineaParaEnviar[], cantidades: Readonly<Record<string, string>>): number {
  let total = 0;
  for (const l of lineas) if (esEnviable(l)) total += leerCantidad(cantidades[l.id!] ?? "", l.porEnviar!).cantidad;
  return total;
}

/** En cuántas líneas hay algo que enviar (cantidad mayor a cero). */
export function lineasDelEnvio(lineas: readonly LineaParaEnviar[], cantidades: Readonly<Record<string, string>>): number {
  return lineas.filter((l) => esEnviable(l) && leerCantidad(cantidades[l.id!] ?? "", l.porEnviar!).cantidad > 0).length;
}

/** La sede: en una «Por repartir» hay que elegirla entre las activas; en una «directo» es la de la orden y no se elige. */
export function problemaDeSede(sedeId: string, ctx: Pick<ContextoEnvio, "sedes" | "sedeFija">): string | null {
  if (ctx.sedeFija !== null) return null;
  if (!sedeId) return "Elige a qué sede la mandas.";
  if (!ctx.sedes.has(sedeId)) return "Esa sede no está disponible. Elige otra.";
  return null;
}

export const problemaDeGuia = (guia: string): string | null =>
  textoParaBase(guia).length > TOPES_ENVIO.guia ? `El número de guía va hasta ${TOPES_ENVIO.guia} letras.` : null;

export const problemaDeNota = (nota: string): string | null =>
  textoParaBase(nota).length > TOPES_ENVIO.nota ? `La nota va hasta ${TOPES_ENVIO.nota} letras.` : null;

/**
 * Los campos de la guía de foco, en el orden de la pantalla. `hecho` y `requerido` son las reglas de la base: la guía no inventa ninguna.
 * La sede solo es un campo cuando se elige (una «Por repartir»). El número de guía y la nota son opcionales: solo bloquean si se pasan
 * del tope. «Qué lleva» es un campo de grupo: al menos una línea con cantidad, porque una guía no sale vacía.
 */
export function camposDelEnvio(
  b: BorradorEnvio,
  ctx: ContextoEnvio,
  responsable: { pide: boolean; listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (ctx.sedeFija === null) {
    const problema = problemaDeSede(b.sedeId, ctx);
    campos.push({ id: "sede", nombre: "A qué sede va", requerido: true, hecho: problema === null, pendiente: problema ?? "" });
  }
  const problemaGuia = problemaDeGuia(b.guia);
  campos.push({ id: "guia", nombre: "Número de guía", requerido: problemaGuia !== null, hecho: textoParaBase(b.guia).length > 0 && problemaGuia === null, pendiente: problemaGuia ?? "" });
  const problemaNota = problemaDeNota(b.nota);
  campos.push({ id: "nota", nombre: "Nota", requerido: problemaNota !== null, hecho: textoParaBase(b.nota).length > 0 && problemaNota === null, pendiente: problemaNota ?? "" });
  for (const l of ctx.lineas) {
    if (!esEnviable(l)) continue;
    const problema = problemaDeCantidad(b.cantidades[l.id!] ?? "", l.porEnviar!);
    campos.push({ id: `linea-${l.id}`, nombre: `Línea ${l.posicion}`, requerido: true, hecho: problema === null, pendiente: problema ?? "" });
  }
  campos.push({
    id: "lineas",
    nombre: "Qué lleva",
    requerido: true,
    hecho: unidadesDelEnvio(ctx.lineas, b.cantidades) > 0,
    pendiente: "Pon cantidad en al menos una prenda: una guía no sale vacía.",
  });
  if (responsable.pide) {
    campos.push({ id: "responsable", nombre: "Quién envía", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién envía." });
  }
  return campos;
}

/** El primer problema que impide enviar (o null): lo mismo que la guía, dicho de una vez. Es la red de seguridad del botón «Enviar»; la
 *  base vuelve a exigir todo. */
export function primerProblema(b: BorradorEnvio, ctx: ContextoEnvio): string | null {
  const falta = camposDelEnvio(b, ctx, { pide: false, listo: true, motivo: null }).find((c) => c.requerido && !c.hecho);
  return falta ? falta.pendiente : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que viaja a la base
// ---------------------------------------------------------------------------------------------------------------------------------

export type LineaEnvioParaBase = { orden_compra_item_id: string; cantidad: number };

/** `p_lineas`: solo las líneas con cantidad mayor a cero, en el orden de la orden. Solo se llama con la guía lista. */
export function lineasParaBase(lineas: readonly LineaParaEnviar[], cantidades: Readonly<Record<string, string>>): LineaEnvioParaBase[] {
  const salida: LineaEnvioParaBase[] = [];
  for (const l of lineas) {
    if (!esEnviable(l)) continue;
    const { cantidad } = leerCantidad(cantidades[l.id!] ?? "", l.porEnviar!);
    if (cantidad > 0) salida.push({ orden_compra_item_id: l.id!, cantidad });
  }
  return salida;
}

export type ArgsCrearEnvio = {
  p_ubicacion_destino_id: string;
  p_lineas: LineaEnvioParaBase[];
  p_numero_guia?: string;
  p_nota?: string;
  p_token: string;
};

/**
 * Los argumentos de `crear_envio`. El número de guía y la nota viajan solo si se escribieron. `token` se genera una vez y se reusa en cada
 * reintento: la base devuelve el mismo envío si el pedido es el mismo (un corte de señal o un doble clic no lo duplican).
 */
export function argsCrearEnvio(b: BorradorEnvio, ctx: ContextoEnvio, token: string): ArgsCrearEnvio {
  const guia = textoParaBase(b.guia);
  const nota = textoParaBase(b.nota);
  return {
    p_ubicacion_destino_id: ctx.sedeFija ?? b.sedeId,
    p_lineas: lineasParaBase(ctx.lineas, b.cantidades),
    ...(guia ? { p_numero_guia: guia } : {}),
    ...(nota ? { p_nota: nota } : {}),
    p_token: token,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que vuelve de la base
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que la base avisa al enviar y no bloquea: con este envío, una línea sale por más de lo que se pidió (el papel trajo más, decisión 43). */
export type AvisoEnvio = {
  tipo: "de_mas";
  /** «OC-000129». */
  orden: string | null;
  posicion: number | null;
  /** «Polos · Kero · Manga larga». */
  descripcion: string;
  pedido: number;
  /** Lo que sale en total de esa línea con este envío (y los vigentes anteriores). */
  enviado: number;
};

export type ResultadoEnvio = {
  despachoId: string;
  /** «ENV-000012». */
  numero: string;
  /** La sede a la que quedó en camino, por su nombre. `null` si la base no la dice. */
  sede: string | null;
  unidades: number | null;
  avisos: AvisoEnvio[];
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const cifra = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Lee lo que contesta `crear_envio`: `{ despacho_id, numero, sede, unidades, avisos }`. Sin el envío (id y número), `null`. Acepta también
 *  una lista de una fila. Un aviso raro se descarta (no bloquean y no deben tumbar la confirmación). */
export function leerResultadoEnvio(data: unknown): ResultadoEnvio | null {
  const crudo = Array.isArray(data) ? data[0] : data;
  if (!crudo || typeof crudo !== "object") return null;
  const r = crudo as Record<string, unknown>;
  const despachoId = texto(r.despacho_id) ?? texto(r.id);
  const numero = numeroEnvio(r.numero);
  if (!despachoId || !numero) return null;
  const sede = r.sede && typeof r.sede === "object" ? texto((r.sede as Record<string, unknown>).nombre) : texto(r.sede);
  const avisos = (Array.isArray(r.avisos) ? r.avisos : [])
    .map((a): AvisoEnvio | null => {
      if (!a || typeof a !== "object") return null;
      const x = a as Record<string, unknown>;
      const pedido = cifra(x.pedido);
      const enviado = cifra(x.enviado);
      if (x.tipo !== "de_mas" || pedido == null || enviado == null) return null;
      return { tipo: "de_mas", orden: texto(x.orden), posicion: cifra(x.posicion), descripcion: texto(x.descripcion) ?? "Una prenda", pedido, enviado };
    })
    .filter((a): a is AvisoEnvio => a !== null);
  return { despachoId, numero, sede, unidades: cifra(r.unidades), avisos };
}

/** Los avisos de «de más», dichos en una o dos frases para el aviso de la esquina (nunca bloquean: el envío ya salió). */
export function resumenDeAvisosEnvio(avisos: readonly AvisoEnvio[]): { titulo: string; detalle: string } | null {
  if (avisos.length === 0) return null;
  const frases = avisos.map(
    (a) => `${a.descripcion}${a.orden ? ` (${a.orden})` : ""}: pediste ${a.pedido.toLocaleString("es-PE")} y con este envío salen ${a.enviado.toLocaleString("es-PE")} (${(a.enviado - a.pedido).toLocaleString("es-PE")} de más)`,
  );
  const mostradas = frases.slice(0, 3);
  const resto = frases.length - mostradas.length;
  return { titulo: "Este envío lleva más de lo que pediste", detalle: `${mostradas.join(" · ")}${resto > 0 ? ` · y ${resto} más` : ""}. Quedó registrado igual.` };
}

/** «ENV-000012 en camino a Tienda Trujillo»: el aviso de éxito. Si la base no dice la sede, la que se eligió. */
export function tituloDeEnvio(r: Pick<ResultadoEnvio, "numero" | "sede">, sedeElegida: string): string {
  return `${r.numero} en camino a ${r.sede ?? sedeElegida}`;
}

/** «OC-000129 · 12 unidades. No suma al stock hasta que la sede lo reciba.»: lo que quedó, y lo que falta para que cuente. */
export function detalleDeEnvio(nombreOrden: string, unidades: number): string {
  return `${nombreOrden} · ${unidades.toLocaleString("es-PE")} ${unidades === 1 ? "unidad" : "unidades"}. No suma al stock hasta que la sede lo reciba.`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Anular un envío que sigue en camino
// ---------------------------------------------------------------------------------------------------------------------------------

/** El motivo de anular un envío: obligatorio y hasta 300 letras (los mismos topes que `anular_envio`). */
export function problemaDeMotivoEnvio(motivo: string): string | null {
  const limpio = textoParaBase(motivo);
  if (!limpio) return "Escribe por qué se anula el envío.";
  if (limpio.length > TOPES_ENVIO.motivo) return `El motivo va hasta ${TOPES_ENVIO.motivo} letras.`;
  return null;
}

/** ¿Se ofrece «Anular envío»? Solo mientras va en camino: cuando la sede lo abre, ya no se anula aquí. */
export const sePuedeAnularEnvio = (e: Pick<EnvioDeOrden, "estado">): boolean => e.estado === "en_camino";

/** La versión de un envío en lo que contesta `fn_envio_detalle` (en la cabecera o suelta), para anularlo cuando la orden no la trae. */
export function leerVersionDeEnvio(data: unknown): number | null {
  const crudo = Array.isArray(data) ? data[0] : data;
  if (!crudo || typeof crudo !== "object") return null;
  const r = crudo as Record<string, unknown>;
  const cabecera = [r.cabecera, r.despacho, r.envio].find((v): v is Record<string, unknown> => !!v && typeof v === "object");
  return cifra(r.version) ?? cifra(cabecera?.version);
}
