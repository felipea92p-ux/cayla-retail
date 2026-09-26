import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getProveedores } from "@/lib/proveedores";
import type { FacturaParaNota, FiltroFacturas, FilaTablero, MovimientoFavor } from "@/lib/notas-credito-reglas";

/* ====================================================================
   Notas de crédito de compra — las LECTURAS (2026-09-19)

   El módulo `/compras/notas-credito` es dinero de Compras: solo líder (ADR-0126). El candado real no
   está acá sino en la base —`fn_puede_ver_dinero_de_compras()` dentro de las funciones y la RLS de
   `compra_notas_credito` y `proveedor_creditos`—; el `redirect` del layout de Compras es la cortesía
   que evita que alguien llegue por URL a una pantalla que igual le llegaría vacía.

   Solo LEE. Registrar una nota, pedir un reembolso y usar el saldo en un pago son escrituras y pasan
   por sus RPC desde los componentes cliente (`registrar_nota_credito_compra`,
   `registrar_reembolso_proveedor`, `registrar_pago_compras`).

   TOLERANCIA A QUE LA BASE TODAVÍA NO ESTÉ (principio 9). `notas_credito_tablero()` y
   `fn_facturas_para_nota_credito()` son funciones NUEVAS: mientras la migración no esté aplicada,
   PostgREST responde «no existe esa función» (PGRST202 / 42883). En ese caso la pantalla no revienta:
   se dibuja con un aviso que dice exactamente qué falta. Cualquier OTRO error sí revienta —una consulta
   de dinero que falla y muestra 0 es peor que una pantalla caída (`lib/resultado.ts`).
   ==================================================================== */

const n = (v: unknown): number => (v == null ? 0 : Number(v));

/** ¿El error dice «esa función todavía no existe» (y no «falló»)? */
function faltaLaFuncion(error: { code?: string | null; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return code === "PGRST202" || code === "42883" || msg.includes("does not exist") || msg.includes("could not find the function");
}

/** El aviso que la pantalla muestra cuando la migración del módulo todavía no se aplicó. */
export const FALTA_MIGRACION =
  "El tablero de notas de crédito todavía no está en esta base: falta la función de lectura `notas_credito_tablero()`. La pantalla se queda vacía a propósito — no hay nada que inventar.";

/** Lo que la pestaña «Saldos a favor» necesita de cada proveedor: cuánto te debe y cuánto le debes. */
export type ProveedorConSaldo = { id: string; nombre: string; saldoFavor: number; deuda: number };

export type TableroNotasCredito = {
  filas: FilaTablero[];
  saldoPorProveedor: Record<string, number>;
  movimientos: MovimientoFavor[];
  proveedores: ProveedorConSaldo[];
  /** `null` si todo cargó; el texto del aviso si la base todavía no tiene las funciones nuevas. */
  falla: string | null;
};

/**
 * Todo el tablero: las notas ya registradas y los faltantes cerrados que todavía esperan su nota, de
 * TODOS los comprobantes vigentes (`notas_credito_tablero()`, una sola llamada), más el saldo a favor y
 * la deuda de cada proveedor (`fn_proveedores`, que ya los trae juntos) y el libro de los que importan
 * (`fn_proveedor_creditos`). El libro es el que permite decir «Devuelta» sin inventar: un reembolso que
 * nació junto con su nota queda atado a ella por su serie.
 *
 * El libro se pide por proveedor porque la función es por proveedor, y solo de los que aparecen en el
 * tablero o tienen saldo a favor: un puñado (principio 5). El día que sean cientos, se agrega una
 * función que los devuelva juntos y esto no cambia hacia afuera.
 */
export async function getTableroNotasCredito(): Promise<TableroNotasCredito> {
  const supabase = await createClient();
  const [{ data, error }, directorio] = await Promise.all([supabase.rpc("notas_credito_tablero"), getProveedores()]);

  const proveedores: ProveedorConSaldo[] = directorio.map((p) => ({ id: p.id, nombre: p.nombre, saldoFavor: p.saldo_favor ?? 0, deuda: p.saldo ?? 0 }));
  const saldoPorProveedor = Object.fromEntries(proveedores.map((p) => [p.id, p.saldoFavor]));

  if (error) {
    if (faltaLaFuncion(error)) return { filas: [], saldoPorProveedor, movimientos: [], proveedores, falla: FALTA_MIGRACION };
    throw new Error(`No se pudo leer el tablero de notas de crédito: ${error.message}`);
  }

  const filas = (data ?? []).map(mapearFila);
  const conLibro = [...new Set([...filas.map((f) => f.proveedorId), ...proveedores.filter((p) => p.saldoFavor > 0).map((p) => p.id)])];
  const libros = await Promise.all(
    conLibro.map(async (id) => (exigir(await supabase.rpc("fn_proveedor_creditos", { p_proveedor_id: id, p_limite: 200 }), "el libro del saldo a favor") as Record<string, unknown>[]).map((m) => mapearMovimiento(m, id))),
  );

  return { filas, saldoPorProveedor, movimientos: libros.flat(), proveedores, falla: null };
}

// `notas_credito_tablero()` devuelve columnas en snake_case; el resto del módulo trabaja en camelCase.
// Se tipa laxo a propósito: mientras la migración no exista, los tipos generados no la conocen.
type FilaCruda = Record<string, unknown>;

function mapearFila(f: FilaCruda): FilaTablero {
  const t = (k: string) => (f[k] == null ? null : String(f[k]));
  return {
    clase: f.clase === "pendiente" ? "pendiente" : "nota",
    id: String(f.id),
    compraId: String(f.compra_id),
    documento: String(f.documento ?? ""),
    proveedorId: String(f.proveedor_id),
    proveedorNombre: String(f.proveedor_nombre ?? ""),
    serieNumero: t("serie_numero"),
    fecha: String(f.fecha ?? "").slice(0, 10),
    // En una fila «pendiente» el monto de la base es 0: lo que importa es lo que la nota DEBERÍA acreditar.
    monto: f.clase === "pendiente" ? n(f.monto_esperado) : n(f.monto),
    aplicado: n(f.aplicado),
    aFavor: n(f.a_favor),
    igv: n(f.igv),
    motivo: t("motivo"),
    nota: t("nota"),
    cierreId: t("cierre_id"),
    compraTotal: n(f.compra_total),
    compraSaldo: n(f.compra_saldo),
    compraFechaEmision: String(f.compra_fecha_emision ?? "").slice(0, 10),
    compraEstado: String(f.compra_estado ?? ""),
    unidadesCerradas: Math.round(n(f.unidades_cerradas)),
    montoEsperado: n(f.monto_esperado),
    cerradoEn: t("cerrado_en"),
    creadoEn: String(f.created_at ?? ""),
    resuelto: f.resuelto !== false,
  };
}

function mapearMovimiento(m: Record<string, unknown>, proveedorId: string): MovimientoFavor {
  const t = (k: string) => (m[k] == null ? null : String(m[k]));
  const tipo = String(m.tipo);
  return {
    id: String(m.id),
    proveedorId,
    tipo: tipo === "aplicacion" || tipo === "reembolso" ? tipo : "nota_credito",
    monto: n(m.monto),
    fecha: String(m.fecha ?? "").slice(0, 10),
    documento: t("documento"),
    notaSerieNumero: t("nota_serie_numero"),
    metodo: t("metodo"),
    referencia: t("referencia"),
    nota: t("nota"),
  };
}

/**
 * Las facturas contra las que se puede emitir una nota, para el buscador del modal.
 *
 * Se piden TODAS de una vez (no una consulta por tecla): el buscador filtra, resalta y recorre con el
 * teclado sin esperar a la red, que es lo que hace que ↑ ↓ Enter se sientan instantáneos. `fn_facturas_
 * para_nota_credito` busca por documento, proveedor y monto del lado de la base; acá se le pide sin
 * texto y se filtra con las mismas reglas puras (`filtrarFacturas`), que es lo que además se prueba.
 * Si un día el tope se queda corto, la pantalla lo dice en vez de mentir con una lista recortada.
 */
export const TOPE_FACTURAS_BUSCADOR = 200;

export async function getFacturasParaNota(opciones: { texto?: string; proveedorId?: string; filtro?: FiltroFacturas; limite?: number } = {}): Promise<{ facturas: FacturaParaNota[]; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_facturas_para_nota_credito", {
    // Los parámetros opcionales se OMITEN en vez de mandarse en `null`: así la función usa sus propios
    // valores por omisión y la llamada no se rompe si mañana cambian.
    ...(opciones.texto ? { p_texto: opciones.texto } : {}),
    ...(opciones.proveedorId ? { p_proveedor_id: opciones.proveedorId } : {}),
    p_filtro: opciones.filtro ?? "todas",
    p_limite: opciones.limite ?? TOPE_FACTURAS_BUSCADOR,
  });
  if (error) {
    if (faltaLaFuncion(error)) {
      return { facturas: [], falla: "Todavía no se puede elegir la factura de origen: falta la función `fn_facturas_para_nota_credito()` en esta base." };
    }
    throw new Error(`No se pudieron leer las facturas para la nota de crédito: ${error.message}`);
  }
  return {
    facturas: (data ?? []).map((f: Record<string, unknown>) => ({
      id: String(f.id),
      documento: String(f.documento ?? ""),
      proveedorId: String(f.proveedor_id),
      proveedorNombre: String(f.proveedor_nombre ?? ""),
      fechaEmision: String(f.fecha_emision ?? "").slice(0, 10),
      fechaVencimiento: f.fecha_vencimiento == null ? null : String(f.fecha_vencimiento).slice(0, 10),
      total: n(f.total),
      pagado: n(f.pagado),
      saldo: n(f.saldo),
      estado: String(f.estado ?? ""),
      tieneNota: f.tiene_nota === true,
      notasMonto: n(f.notas_monto),
    })),
    falla: null,
  };
}
