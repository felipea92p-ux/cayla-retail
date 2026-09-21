import type { Comprobante, SerieComprobante, TipoComprobante } from "./comprobantes-reglas";
import { ETIQUETA_TIPO } from "./comprobantes-reglas";
import { anulacionEnTramite, chipDelComprobante, textoDelNumero } from "./facturacion-actividad";
import { tiendasOperativas } from "./facturacion-reglas";
import { nombreCorto } from "./resumen-formato";

// Reglas de la vista Comprobantes (spec §6 y §9, ADR-0124): qué series le faltan a cada tienda,
// cuánto se facturó de verdad este mes y por qué una fila dice lo que dice. Puras y sin servidor.

/** Los tipos que cada TIENDA debe tener registrados: boleta y factura para vender, y nota de crédito
 *  para las devoluciones (ADR-0100: aprobar una devolución de un comprobante aceptado emite una nota
 *  de crédito y, sin serie, la devolución no se puede aprobar). Las notas de débito no se emiten. */
export const TIPOS_CON_SERIE: TipoComprobante[] = ["boleta", "factura", "nota_credito"];

/** Lo que SUNAT exige de la serie (RS 117-2017, Anexo N.° 3, y lo mismo para boletas y facturas): cuatro
 *  caracteres, letras o números, y la primera letra según el documento —B una boleta, F una factura, y una
 *  nota de crédito la del documento que corrige (B si corrige boletas, F si corrige facturas)—. `null` si
 *  está bien; si no, el texto que se le muestra a la persona. Se comprueba al REGISTRAR: una serie mal
 *  escrita queda guardada y todos sus comprobantes se rechazan, cada intento quemando un número. */
export function errorDeSerie(tipo: TipoComprobante, texto: string): string | null {
  const serie = texto.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(serie)) return "La serie tiene cuatro caracteres, solo letras y números (por ejemplo B001).";
  if (tipo === "boleta" && serie[0] !== "B") return "La serie de una boleta empieza con B (por ejemplo B001).";
  if (tipo === "factura" && serie[0] !== "F") return "La serie de una factura empieza con F (por ejemplo F001).";
  if ((tipo === "nota_credito" || tipo === "nota_debito") && serie[0] !== "B" && serie[0] !== "F") {
    return `La serie de una ${ETIQUETA_TIPO[tipo].toLowerCase()} empieza con B si corrige boletas o con F si corrige facturas (por ejemplo BC01).`;
  }
  return null;
}

export type GrupoSeriesFaltantes = { tipo: TipoComprobante; tiendas: { id: string; nombre: string }[] };

/** Las series que faltan, agrupadas por tipo (en el orden boleta, factura, nota de crédito) y con
 *  las tiendas a las que les falta. Solo las tiendas emiten: el Taller y los almacenes nunca
 *  necesitan una serie. Un tipo con todas sus tiendas al día no aparece. */
export function seriesFaltantes(
  series: Pick<SerieComprobante, "ubicacion_id" | "tipo">[],
  ubicaciones: { id: string; nombre: string; tipo: "tienda" | "almacen" | "taller" }[]
): GrupoSeriesFaltantes[] {
  const tiendas = tiendasOperativas(ubicaciones);
  const registradas = new Set(series.map((s) => `${s.ubicacion_id}|${s.tipo}`));
  return TIPOS_CON_SERIE.map((tipo) => ({
    tipo,
    tiendas: tiendas.filter((t) => !registradas.has(`${t.id}|${tipo}`)).map(({ id, nombre }) => ({ id, nombre })),
  })).filter((g) => g.tiendas.length > 0);
}

/** «Trujillo, Arequipa y Lima». */
function listaConY(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** «Faltan 3 series: nota de crédito en Trujillo, Arequipa y Lima.» (vacío si no falta ninguna). */
export function textoDeSeriesFaltantes(grupos: GrupoSeriesFaltantes[]): string {
  const cuantas = grupos.reduce((suma, g) => suma + g.tiendas.length, 0);
  if (cuantas === 0) return "";
  const detalle = grupos.map((g) => `${ETIQUETA_TIPO[g.tipo].toLowerCase()} en ${listaConY(g.tiendas.map((t) => nombreCorto(t.nombre)))}`).join("; ");
  return `${cuantas === 1 ? "Falta 1 serie" : `Faltan ${cuantas} series`}: ${detalle}.`;
}

const aCentimos = (n: number) => Math.round(n * 100) / 100;

export type MontosDelMes = {
  /** Lo emitido de verdad: sin los que se liberaron antes de transmitirse (`no_emitido`). */
  emitidos: number;
  /** Neto: lo aceptado por SUNAT en producción, restadas las notas de crédito. */
  facturado: number;
  /** Lo que las notas de crédito aceptadas le quitaron a `facturado`. */
  notasDeCredito: number;
  /** Lo aceptado en el entorno de pruebas (neto: una nota de crédito resta). */
  dePrueba: number;
  /** Lo que falta transmitir o volver a transmitir: `pendiente` y `rechazado` (neto). */
  sinEnviar: number;
  /** Lo que no se puede dar por facturado ni por de prueba: `enviado` (SUNAT todavía no respondió), una
   *  baja en trámite (SUNAT no confirmó) y un `aceptado` sin entorno registrado (una boleta anterior a
   *  la columna `entorno_transmision`, cuyo entorno la migración no adivina). Neto. */
  porConfirmar: number;
  cuantosDePrueba: number;
};

/** Cuánto vale de verdad lo emitido en el mes, dicho en cubos que no se pisan. «Monto facturado» solo
 *  suma lo aceptado por SUNAT en producción y sin baja en trámite: un comprobante de prueba tiene número
 *  y PDF pero no vale como comprobante de pago, y uno por enviar todavía no es de nadie. Una nota de
 *  crédito guarda su total en positivo (es el monto que devuelve) pero RESTA en todos los cubos: SUNAT la
 *  toma como IGV que ya no se debe. `cuantosDePrueba` cuenta los transmitidos al sandbox, en el estado
 *  que estén. Anulados y no emitidos no cuentan en ningún cubo. */
export function montosDelMes(comprobantes: Comprobante[]): MontosDelMes {
  let facturado = 0;
  let notasDeCredito = 0;
  let dePrueba = 0;
  let sinEnviar = 0;
  let porConfirmar = 0;
  let cuantosDePrueba = 0;
  let emitidos = 0;
  for (const c of comprobantes) {
    const total = Number(c.total);
    const firmado = c.tipo === "nota_credito" ? -total : total;
    if (c.estado !== "no_emitido") emitidos += 1;
    if (c.entorno_transmision === "sandbox") cuantosDePrueba += 1;
    if (c.estado === "aceptado") {
      if (c.entorno_transmision === "sandbox") dePrueba += firmado;
      else if (c.entorno_transmision === "produccion" && !anulacionEnTramite(c)) {
        facturado += firmado;
        if (c.tipo === "nota_credito") notasDeCredito += total;
      } else porConfirmar += firmado;
    } else if (c.estado === "pendiente" || c.estado === "rechazado") sinEnviar += firmado;
    else if (c.estado === "enviado") porConfirmar += firmado;
  }
  return {
    emitidos,
    facturado: aCentimos(facturado),
    notasDeCredito: aCentimos(notasDeCredito),
    dePrueba: aCentimos(dePrueba),
    sinEnviar: aCentimos(sinEnviar),
    porConfirmar: aCentimos(porConfirmar),
    cuantosDePrueba,
  };
}

export type AccionDelComprobante = "transmitir" | "reintentar" | "liberar" | "anular" | "consultar";

/** Los botones que le tocan a un comprobante, en el orden en que se dibujan. ADR-0093: «liberar» solo
 *  para un `pendiente` —nunca se transmitió, así que soltar el correlativo no le avisa nada a SUNAT—; un
 *  `rechazado` SÍ llegó a SUNAT y tiene una respuesta real: su único camino es reintentar con el mismo
 *  número. Un `pendiente` puede transmitir Y liberar (decisión de Felipe: «Liberar sin espera» se agrega
 *  JUNTO a Transmitir). Un aceptado se anula; si su baja ya está en trámite, se consulta. `enviado`,
 *  `anulado` y `no_emitido` no tienen botón: no hay nada que hacer con ellos desde acá. */
export function accionesDelComprobante(c: Comprobante): AccionDelComprobante[] {
  if (c.estado === "pendiente") return ["transmitir", "liberar"];
  if (c.estado === "rechazado") return ["reintentar"];
  if (c.estado === "aceptado") return [anulacionEnTramite(c) ? "consultar" : "anular"];
  return [];
}

/** La línea que va bajo el estado de una fila: por qué se rechazó, por qué se liberó o por qué se
 *  anuló. `esRechazo` pide pintarla en rojo (solo el rechazo de SUNAT; sin motivo no se inventa uno). */
export function motivoDelComprobante(c: Comprobante): { motivo: string | null; esRechazo: boolean } {
  const motivo = c.estado === "rechazado" && c.motivo_rechazo ? c.motivo_rechazo : c.estado === "no_emitido" ? c.motivo_no_emitido : c.motivo_anulacion;
  return { motivo, esRechazo: c.estado === "rechazado" && !!c.motivo_rechazo };
}

/** Lo que se puede escribir en el buscador para encontrar este comprobante: el tipo, el número, la
 *  clienta y su documento, el estado, el motivo y el total. Lo consume `coincide`. */
export function camposDeBusquedaDelComprobante(c: Comprobante): (string | null)[] {
  return [
    ETIQUETA_TIPO[c.tipo],
    textoDelNumero(c),
    c.cliente_nombre ?? "Cliente varios",
    c.cliente_num_doc,
    chipDelComprobante(c).texto,
    motivoDelComprobante(c).motivo,
    Number(c.total).toFixed(2),
  ];
}
