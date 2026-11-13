// Leer el QR de una factura o boleta electrónica (ADR-0588, actividad 4). El QR que SUNAT pide en la representación impresa trae, separado por
// «|»: RUC del emisor | tipo (01 factura, 03 boleta) | serie | número | IGV | total | fecha de emisión | tipo de documento del comprador |
// número del comprador | … (el resto —resumen, firma— no se usa). Es el mismo orden en que CAYLA arma el suyo (`textoQrSunat`, recibo-reglas).
// Con él la hoja se llena sin errores de tipeo y dice, a tiempo, si el papel está a nombre de otro. Lógica pura: la cámara o la pistola solo
// entregan el texto.
import { validarRuc } from "@cayla-retail/shared";
import { soles } from "./compras-reglas";

export type QrComprobante = {
  rucEmisor: string;
  tipo: "factura" | "boleta";
  serie: string;
  numero: string;
  igv: number;
  total: number;
  /** AAAA-MM-DD. */
  fecha: string;
  /** Quién figura como comprador: tipo del catálogo 06 de SUNAT («6» RUC, «1» DNI…) y su número; `null` si el QR no lo trae o dice «-». */
  comprador: { tipo: string; numero: string } | null;
};

const TIPOS: Record<string, QrComprobante["tipo"]> = { "01": "factura", "03": "boleta" };

function monto(t: string | undefined): number | null {
  if (t === undefined) return null;
  const n = Number(t.trim().replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** «2026-10-29» o «29/10/2026» → «2026-10-29»; cualquier otra cosa, `null`. */
function fecha(t: string | undefined): string | null {
  const s = (t ?? "").trim();
  let a: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const pe = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (pe) [a, m, d] = [Number(pe[3]), Number(pe[2]), Number(pe[1])];
  else return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** El QR de una factura o boleta electrónica, o `null` si el texto no es uno (una etiqueta, un enlace, un QR de pago). */
export function leerQrComprobante(texto: string): QrComprobante | null {
  const partes = texto.trim().split("|").map((p) => p.trim());
  if (partes.length < 7) return null;
  const [ruc, codTipo, serieCruda, numeroCrudo, igvCrudo, totalCrudo, fechaCruda, tipoComprador, numeroComprador] = partes;
  const tipo = TIPOS[codTipo ?? ""];
  if (!ruc || !validarRuc(ruc).valido || !tipo) return null;
  const serie = (serieCruda ?? "").toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(serie)) return null;
  if (!/^\d{1,8}$/.test(numeroCrudo ?? "")) return null;
  const igv = monto(igvCrudo);
  const total = monto(totalCrudo);
  const f = fecha(fechaCruda);
  if (igv === null || total === null || total <= 0 || igv >= total || !f) return null;
  const comprador = tipoComprador && tipoComprador !== "-" && numeroComprador && numeroComprador !== "-" ? { tipo: tipoComprador, numero: numeroComprador } : null;
  return { rucEmisor: ruc, tipo, serie, numero: String(Number(numeroCrudo)), igv, total, fecha: f, comprador };
}

/** «F001-288», como lo escribe la hoja. */
export function serieNumeroDelQr(qr: QrComprobante): string {
  return `${qr.serie}-${qr.numero}`;
}

export type AvisoDelQr = { tono: "atencion" | "info"; titulo: string; texto: string };

/**
 * Lo que el QR dice que hay que mirar, antes de guardar (Felipe: avisa sin frenar).
 *   · el total del papel no es el del gasto: probablemente no es este comprobante;
 *   · una factura a nombre de otro RUC (o de una persona): su IGV no le sirve a CAYLA. La base solo guarda el RUC de CAYLA; una compra de CLAURE
 *     en Lima va a su nombre y está bien, y así se dice.
 * Sin el RUC de la empresa (`rucEmpresa` nulo) no se compara el comprador.
 */
export function avisosDelQr(qr: QrComprobante, ctx: { monto: number | null; rucEmpresa: string | null }): AvisoDelQr[] {
  const avisos: AvisoDelQr[] = [];
  if (ctx.monto !== null && Math.abs(qr.total - ctx.monto) >= 0.01) {
    avisos.push({
      tono: "atencion",
      titulo: "El monto no coincide",
      texto: `El QR dice ${soles(qr.total)} y el gasto es de ${soles(ctx.monto)}: revisa que sea este comprobante.`,
    });
  }
  if (qr.tipo === "factura" && ctx.rucEmpresa) {
    const deLaEmpresa = qr.comprador?.tipo === "6" && qr.comprador.numero === ctx.rucEmpresa;
    if (!deLaEmpresa) {
      const quien = !qr.comprador ? "no dice a nombre de quién" : qr.comprador.tipo === "6" ? `está a nombre del RUC ${qr.comprador.numero}` : `está a nombre de una persona (${qr.comprador.numero})`;
      avisos.push({
        tono: "atencion",
        titulo: "No está a nombre de CAYLA",
        texto: `Esta factura ${quien}, no del RUC de CAYLA (${ctx.rucEmpresa}): su IGV no le sirve a CAYLA. Pide que la emitan a ese RUC. Si es una compra de CLAURE en Lima, está bien.`,
      });
    }
  }
  return avisos;
}

/** Lo que se leyó, en una línea: «Factura F001-288 · S/ 472.00 · IGV S/ 72.00 · 29 oct». */
export function resumenDelQr(qr: QrComprobante, fechaCorta: (iso: string) => string): string {
  const papel = qr.tipo === "factura" ? "Factura" : "Boleta";
  return [`${papel} ${serieNumeroDelQr(qr)}`, soles(qr.total), qr.tipo === "factura" ? `IGV ${soles(qr.igv)}` : null, fechaCorta(qr.fecha)].filter(Boolean).join(" · ");
}
