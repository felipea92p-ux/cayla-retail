// La hoja «Registrar gasto» de El telar (ADR-0493, maqueta docs/maquetas/finanzas-telar-2026-10/): lo de todos los días en cinco
// toques —monto, sede, en qué, ¿tiene comprobante?, ¿ya lo pagaste?— y lo demás aparece solo cuando el comprobante lo pide.
//
// PROMETE: traducir lo que la persona llenó en la hoja al MISMO borrador que valida `validarGasto` (lib/gastos-reglas.ts) y que guarda
//   `registrar_gasto`. Esta hoja no inventa reglas de negocio: lo que «falta» sale de lo que `validarGasto` ya bloquea (lo cruza la
//   prueba), el IGV de `igvDeFactura` y el aviso de bancarización de `avisoBancarizacion`.
// ASUME: el proveedor de un comprobante se conoce por su RUC; si es nuevo, la hoja lo suma con `registrar_proveedor_de_gasto` (que no
//   duplica por RUC) justo antes de guardar.
// Lógica pura, probada en `hoja-gasto-reglas.test.ts`.
import { soloDigitos, validarRuc } from "@cayla-retail/shared";
import type { CampoDeGuia } from "./guia-campos";
import { cuentaDeSalida, cuentasDeLaClase, usable, type CuentaElegible } from "./cuenta-sellada-reglas";
import { igvDeFactura, montoDentroDelTope, parsearMonto, partirSerieNumero, validarGasto, type BorradorGasto, type MedioGasto, type PayloadGasto, type ProveedorGasto, type TipoComprobante } from "./gastos-reglas";
import { soles } from "./compras-reglas";

export type HojaGasto = {
  monto: string;
  /** El id de la ubicación o «empresa». Vacío: todavía no se eligió. */
  sede: string;
  categoria: string;
  /** «Qué fue»: lo que se pagó, en palabras de la tienda. */
  descripcion: string;
  fecha: string;
  /** Vacío: todavía no se dijo si tiene comprobante. */
  comprobante: TipoComprobante | "";
  ruc: string;
  razonSocial: string;
  /** La serie y el número en un solo campo, escrito como sea («f001 2231», «F001-002231»). */
  serieNumero: string;
  pagado: "si" | "no";
  vence: string;
};

export const hojaVacia = (hoy: string, sede = ""): HojaGasto => ({
  monto: "",
  sede,
  categoria: "",
  descripcion: "",
  fecha: hoy,
  comprobante: "",
  ruc: "",
  razonSocial: "",
  serieNumero: "",
  pagado: "si",
  vence: "",
});

/** «Guardar y registrar otro»: lo de recién se limpia, pero la sede y la fecha se quedan (el siguiente casi siempre es igual). */
export const hojaSiguiente = (h: HojaGasto): HojaGasto => ({ ...hojaVacia(h.fecha, h.sede) });

/** «f001 2231» → «F001-2231». null si todavía no se puede leer como serie y número. */
export function serieNumeroLegible(texto: string): string | null {
  const { serie, numero } = partirSerieNumero(texto);
  return serie && numero ? `${serie}-${numero}` : null;
}

/** El proveedor que ya está en el directorio con ese RUC, si hay. */
export function proveedorDelRuc(ruc: string, proveedores: readonly ProveedorGasto[]): ProveedorGasto | null {
  const n = soloDigitos(ruc);
  if (n.length !== 11) return null;
  return proveedores.find((p) => soloDigitos(p.ruc ?? "") === n) ?? null;
}

export const conComprobante = (h: Pick<HojaGasto, "comprobante">) => h.comprobante !== "" && h.comprobante !== "sin_comprobante";
/** A crédito solo con comprobante: sin papel no hay a quién deberle en Por pagar. */
export const aCredito = (h: Pick<HojaGasto, "comprobante" | "pagado">) => conComprobante(h) && h.pagado === "no";

/** De dónde salió la plata, ya resuelto por la hoja con las cuentas de la tienda (`cuentaDeSalida`) o con el medio elegido. */
export type SalidaDeLaHoja = { medio: MedioGasto | ""; cuentaId?: string; cajaId: string; referencia: string };

/** La hoja → el borrador de siempre. `proveedorId` es el del RUC (el que ya estaba o el recién sumado). */
export function borradorDeLaHoja(h: HojaGasto, proveedorId: string, salida: SalidaDeLaHoja): BorradorGasto {
  const { serie, numero } = partirSerieNumero(h.serieNumero);
  const credito = aCredito(h);
  return {
    ubicacion: h.sede,
    categoria: h.categoria,
    descripcion: h.descripcion,
    fecha: h.fecha,
    monto: h.monto,
    comprobante: h.comprobante || "sin_comprobante",
    proveedorId: conComprobante(h) ? proveedorId : "",
    serie: conComprobante(h) ? serie : "",
    numero: conComprobante(h) ? numero : "",
    condicion: credito ? "credito" : "contado",
    vence: credito ? h.vence : "",
    medio: credito ? "" : salida.medio,
    cajaId: credito ? "" : salida.cajaId,
    egresoId: "",
    referencia: credito ? "" : salida.referencia,
    ...(salida.cuentaId && !credito ? { cuentaId: salida.cuentaId } : {}),
  };
}

/**
 * Lo que la hoja deja guardar: lo de `validarGasto` y, antes, que se haya contestado «¿tiene comprobante?». No es una regla de negocio
 * nueva (sin contestar, la base lo guardaría como «sin comprobante»): es que la hoja no contesta por la persona.
 */
export function validarHoja(
  h: HojaGasto,
  proveedorId: string,
  salida: SalidaDeLaHoja,
  hoy: string,
  /** ¿El RUC ya tiene proveedor (del directorio o la razón social para sumarlo)? Sin decirlo, se da por sí. */
  proveedorListo = true,
): { ok: true; valor: PayloadGasto } | { ok: false; error: string } {
  // En el orden de la guía (el /chaos del 2026-10-23 vio «Di si tiene comprobante» con la hoja vacía, cuando la guía marcaba el monto):
  // el primer aviso es el primer campo que la guía enciende. Los textos son los de `camposDeLaHoja`.
  const monto = montoDentroDelTope(parsearMonto(h.monto));
  if (!monto.ok) return { ok: false, error: h.monto.trim() ? monto.error : "Escribe cuánto se pagó." };
  if (!h.sede) return { ok: false, error: "Elige a qué sede se le carga." };
  if (!h.categoria) return { ok: false, error: "Elige en qué se gastó." };
  if (!h.descripcion.trim()) return { ok: false, error: "Escribe qué se pagó." };
  if (!h.comprobante) return { ok: false, error: "Di si tiene comprobante." };
  if (conComprobante(h) && !proveedorListo) return { ok: false, error: validarRuc(h.ruc).valido ? "Escribe la razón social." : "Escribe el RUC del comprobante." };
  if (conComprobante(h) && !serieNumeroLegible(h.serieNumero)) return { ok: false, error: "Escribe la serie y el número, como F001-2231." };
  return validarGasto(borradorDeLaHoja(h, proveedorId, salida), hoy);
}

export type ContextoGuia = {
  /** El RUC escrito ya tiene un proveedor (del directorio, o la razón social para sumarlo). */
  proveedorListo: boolean;
  /** Ya se sabe de dónde salió la plata (una cuenta o un medio). */
  salidaLista: boolean;
  responsableListo: boolean;
  responsableMotivo: string | null;
};

/**
 * Los campos de la guía de foco, en el orden de la hoja. Lo que es «requerido» aquí es exactamente lo que `validarGasto` exige para
 * ESTE borrador; la prueba lo recorre en todos los caminos. «¿Ya lo pagaste?» llega respondido en «Sí» y no se lista.
 */
export function camposDeLaHoja(h: HojaGasto, ctx: ContextoGuia): CampoDeGuia[] {
  // El mismo tope que `validarGasto` (S/ 1 000 000): sin él la guía decía «listo» a un monto que la base rechaza.
  const monto = montoDentroDelTope(parsearMonto(h.monto));
  const papel = conComprobante(h);
  const credito = aCredito(h);
  const campos: CampoDeGuia[] = [
    { id: "monto", nombre: "Monto", requerido: true, hecho: monto.ok, pendiente: "Escribe cuánto se pagó." },
    { id: "sede", nombre: "Sede", requerido: true, hecho: Boolean(h.sede), pendiente: "Elige a qué sede se le carga." },
    { id: "categoria", nombre: "En qué", requerido: true, hecho: Boolean(h.categoria), pendiente: "Elige en qué se gastó." },
    { id: "descripcion", nombre: "Qué fue", requerido: true, hecho: Boolean(h.descripcion.trim()), pendiente: "Escribe qué se pagó." },
    { id: "comprobante", nombre: "Comprobante", requerido: true, hecho: h.comprobante !== "", pendiente: "Di si tiene comprobante." },
  ];
  if (papel) {
    const ruc = validarRuc(h.ruc);
    campos.push(
      { id: "ruc", nombre: "RUC", requerido: true, hecho: ruc.valido && ctx.proveedorListo, pendiente: ruc.valido ? "Escribe la razón social." : "Escribe el RUC del comprobante." },
      { id: "serie", nombre: "Serie y número", requerido: true, hecho: serieNumeroLegible(h.serieNumero) !== null, pendiente: "Escribe la serie y el número, como F001-2231." },
    );
  }
  if (credito) campos.push({ id: "vence", nombre: "Cuándo vence", requerido: true, hecho: Boolean(h.vence) && h.vence >= h.fecha, pendiente: "Di cuándo vence (no antes de la fecha)." });
  else campos.push({ id: "salida", nombre: "Salió de", requerido: true, hecho: ctx.salidaLista, pendiente: "Di de dónde salió la plata." });
  campos.push({ id: "responsable", nombre: "Responsable", requerido: true, hecho: ctx.responsableListo, pendiente: ctx.responsableMotivo ?? "Elige quién registra." });
  return campos;
}

export type TicketHoja = {
  lineas: { etiqueta: string; valor: string; fuerte?: boolean }[];
  /** Qué va a pasar al guardar, en frases de tienda. */
  pasara: string[];
};

/**
 * «Así queda»: el registro como un ticket de papel, que se arma mientras se llena, y lo que pasa al guardar. Solo dice lo que se sabe:
 * una línea sin dato no se escribe.
 */
export function ticketDeLaHoja(
  h: HojaGasto,
  ctx: { categoriaNombre: string | null; sedeNombre: string | null; salidaNombre: string | null; proveedorNombre: string | null },
): TicketHoja {
  // El mismo tope que `validarGasto` (S/ 1 000 000): sin él la guía decía «listo» a un monto que la base rechaza.
  const monto = montoDentroDelTope(parsearMonto(h.monto));
  const total = monto.ok ? monto.valor : null;
  const lineas: TicketHoja["lineas"] = [];
  const pasara: string[] = [];
  if (h.descripcion.trim()) lineas.push({ etiqueta: "Qué fue", valor: h.descripcion.trim() });
  if (ctx.categoriaNombre) lineas.push({ etiqueta: "En", valor: ctx.categoriaNombre });
  if (ctx.sedeNombre) lineas.push({ etiqueta: "Sede", valor: ctx.sedeNombre });
  if (conComprobante(h)) {
    const papel = h.comprobante === "factura" ? "Factura" : h.comprobante === "boleta" ? "Boleta" : "Recibo por honorarios";
    lineas.push({ etiqueta: papel, valor: serieNumeroLegible(h.serieNumero) ?? "—" });
    if (ctx.proveedorNombre) lineas.push({ etiqueta: "De", valor: ctx.proveedorNombre });
  } else if (h.comprobante === "sin_comprobante") lineas.push({ etiqueta: "Comprobante", valor: "Sin comprobante" });
  if (total !== null && h.comprobante === "factura") {
    const igv = igvDeFactura(total);
    lineas.push({ etiqueta: "Base", valor: soles(total - igv) }, { etiqueta: "IGV 18 %", valor: soles(igv) });
  }
  if (total !== null) lineas.push({ etiqueta: "Total", valor: soles(total), fuerte: true });

  if (total !== null && ctx.categoriaNombre && ctx.sedeNombre) pasara.push(`Se suma a lo gastado en ${ctx.categoriaNombre.toLowerCase()} de ${ctx.sedeNombre}.`);
  if (total !== null && h.comprobante === "factura") pasara.push(`Recuperas ${soles(igvDeFactura(total))} de IGV.`);
  else if (h.comprobante === "boleta") pasara.push("Una boleta no recupera IGV: con factura lo recuperarías.");
  else if (h.comprobante === "sin_comprobante") pasara.push("Sin comprobante no recuperas IGV.");
  if (aCredito(h)) pasara.push(h.vence ? `Queda en Por pagar hasta el ${h.vence.split("-").reverse().join("/")}.` : "Queda en Por pagar.");
  else if (ctx.salidaNombre) pasara.push(`Sale de ${ctx.salidaNombre}.`);
  return { lineas, pasara };
}

export type PlantillaGasto = { clave: string; descripcion: string; categoria: string; sede: string; comprobante: TipoComprobante; ruc: string; razonSocial: string; monto: string };

/**
 * «Repetir uno anterior»: lo último registrado, sin repetir el mismo gasto (misma descripción, categoría y sede), hasta `n`. Se repite
 * todo menos la serie y el número (cada comprobante es otro) y la fecha (es hoy).
 */
export function plantillasDe(
  gastos: readonly { descripcion: string; categoria: string; ubicacionId: string | null; comprobanteTipo: string; proveedorNombre: string | null; proveedorRuc?: string | null; montoTotal: number; estado: string }[],
  n = 5,
): PlantillaGasto[] {
  const vistas = new Set<string>();
  const r: PlantillaGasto[] = [];
  for (const g of gastos) {
    if (g.estado !== "vigente") continue;
    const sede = g.ubicacionId ?? "empresa";
    const clave = `${g.descripcion.trim().toLowerCase()}|${g.categoria}|${sede}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const tipo = (["factura", "boleta", "recibo_por_honorarios", "sin_comprobante"] as const).find((t) => t === g.comprobanteTipo) ?? "sin_comprobante";
    r.push({ clave, descripcion: g.descripcion, categoria: g.categoria, sede, comprobante: tipo, ruc: g.proveedorRuc ?? "", razonSocial: g.proveedorNombre ?? "", monto: String(g.montoTotal) });
    if (r.length >= n) break;
  }
  return r;
}

/** Una plantilla → la hoja: todo lleno como la última vez, salvo la serie (es otro comprobante) y la fecha (la de la hoja). */
export function hojaDePlantilla(p: PlantillaGasto, fecha: string): HojaGasto {
  return { ...hojaVacia(fecha, p.sede), descripcion: p.descripcion, categoria: p.categoria, comprobante: p.comprobante, ruc: p.ruc, razonSocial: p.razonSocial, monto: p.monto };
}

/**
 * De qué cuenta salió la plata, propuesta por la hoja (Felipe 2026-10-23, tras el /chaos: la hoja proponía «Interbank · transferencia»
 * para unas bolsas pagadas del cajón, y al cambiar de sede reemplazaba en silencio el cajón elegido por el banco):
 *   · lo que la persona eligió se queda mientras sirva;
 *   · después de cambiar de sede (`porElegir`), si lo de antes ya no sirve, queda POR ELEGIR (null): la guía lo pide, nadie lo cambia;
 *   · sin comprobante y con la caja de esa sede abierta, el cajón de esa sede (lo de todos los días sale de ahí);
 *   · si no, lo de siempre (`cuentaDeSalida`: la propuesta para una transferencia y, si no hay banco, la de efectivo).
 */
export function salidaDeLaHoja(
  cuentas: readonly CuentaElegible[],
  h: Pick<HojaGasto, "sede" | "comprobante">,
  elegida: string,
  porElegir: boolean,
): string | null {
  const sirven = cuentasDeLaClase(cuentas, "pago").filter(usable);
  if (elegida && sirven.some((c) => c.id === elegida)) return elegida;
  if (porElegir) return null;
  if (!conComprobante(h) && h.sede && h.sede !== "empresa") {
    const cajon = sirven.find((c) => c.tipo === "cajon" && c.ubicacionId === h.sede);
    if (cajon) return cajon.id;
  }
  return cuentaDeSalida(cuentas, "pago", null);
}

/** Por qué el monto escrito no sirve, para el pie de su caja (el /chaos del 2026-10-23 vio que 0, −0.01 o 12.505 no se aceptaban sin
 *  decir por qué). Vacío no regaña: la guía ya dice que falta. Los textos son los de `parsearMonto` y `montoDentroDelTope`. */
export function motivoDelMonto(texto: string): string | null {
  if (!texto.trim()) return null;
  const m = montoDentroDelTope(parsearMonto(texto));
  return m.ok ? null : m.error;
}
