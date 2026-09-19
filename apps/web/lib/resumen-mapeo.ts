import type { EstadoCosto, FilaResumen, OrigenAbastecimiento, TipoUbicacion, UbicacionRed } from "./resumen-reglas";
import { calcularUtilizable } from "./resumen-reglas";

// De lo que devuelve `fn_resumen_variantes` (nombres de columna, nulos por
// todos lados) a la fila que entienden las reglas. Puro, para poder probar que
// un nulo nunca se cuela como «NaN» ni como un cero inventado donde importa la
// diferencia entre «no hay dato» y «cero».

type Num = number | null | undefined;

export type EnRedCrudo = {
  ubicacion_id: string;
  nombre: string;
  tipo: string;
  separa_piso_almacen?: boolean;
  disponible?: Num;
  utilizable?: Num;
  piso?: Num;
  almacen?: Num;
  dias_observables?: Num;
  dias_con_stock?: Num;
  ledger_consistente?: boolean | null;
  ventas_ventana?: Num;
  devoluciones_ventana?: Num;
  en_camino?: Num;
};

export type FilaCruda = {
  variante_id: string;
  producto_id: string;
  referencia: string;
  categoria_id?: string | null;
  categoria_nombre?: string | null;
  producto_estado?: string | null;
  producto_codigo?: string | null;
  sku?: string | null;
  codigo?: string | null;
  codigos_barras?: string[] | null;
  talla?: string | null;
  color_codigo?: string | null;
  color_nombre?: string | null;
  color_hex?: string | null;
  foto_url?: string | null;
  precio?: Num;
  costo?: Num;
  estado_costo?: string | null;
  stock_minimo?: Num;
  separa_piso_almacen?: boolean | null;
  piso?: Num;
  almacen?: Num;
  sin_sububicacion?: Num;
  cuarentena?: Num;
  disponible?: Num;
  primer_ingreso?: string | null;
  dias_observables?: Num;
  dias_con_stock?: Num;
  ledger_consistente?: boolean | null;
  stock_inicial?: Num;
  ventas_ventana?: Num;
  devoluciones_ventana?: Num;
  ultima_venta?: string | null;
  entradas_ventana?: Num;
  mermas_ventana?: Num;
  traslados_salida_ventana?: Num;
  ventas_cmp?: Num;
  devoluciones_cmp?: Num;
  dias_con_stock_cmp?: Num;
  en_camino?: Num;
  en_camino_a_tiempo?: Num;
  en_camino_atrasado?: boolean | null;
  proxima_llegada?: string | null;
  proximo_traslado_id?: string | null;
  origen_abastecimiento?: string | null;
  en_red?: unknown;
};

/** Un entero que faltó es 0 (no hay unidades); PostgREST devuelve numeric como número o texto. */
const n = (v: Num): number => (v === null || v === undefined ? 0 : Number(v));
/** Un número que faltó es «no hay dato»: NO se convierte en 0. */
const nn = (v: Num): number | null => (v === null || v === undefined ? null : Number(v));

const TIPOS: TipoUbicacion[] = ["tienda", "almacen", "taller"];
const ESTADOS_COSTO: EstadoCosto[] = ["oficial", "declarado", "alterado", "sin_costo"];
const ORIGENES: OrigenAbastecimiento[] = ["compra", "produccion", "ambos"];

export function mapearEnRed(crudo: unknown): UbicacionRed[] {
  if (!Array.isArray(crudo)) return [];
  return (crudo as EnRedCrudo[]).map((o) => {
    const separa = o.separa_piso_almacen ?? false;
    const disponible = n(o.disponible);
    const piso = n(o.piso);
    const almacen = n(o.almacen);
    return {
      ubicacionId: o.ubicacion_id,
      nombre: o.nombre,
      tipo: (TIPOS as string[]).includes(o.tipo) ? (o.tipo as TipoUbicacion) : "tienda",
      separaPisoAlmacen: separa,
      disponible,
      utilizable: o.utilizable === null || o.utilizable === undefined ? calcularUtilizable(separa, piso, almacen, disponible) : n(o.utilizable),
      piso,
      almacen,
      diasObservables: nn(o.dias_observables),
      diasConStock: nn(o.dias_con_stock),
      ledgerConsistente: o.ledger_consistente ?? true,
      ventasVentana: n(o.ventas_ventana),
      devolucionesVentana: n(o.devoluciones_ventana),
      enCamino: n(o.en_camino),
    };
  });
}

export function mapearFila(f: FilaCruda): FilaResumen {
  const separa = f.separa_piso_almacen ?? false;
  const piso = n(f.piso);
  const almacen = n(f.almacen);
  const disponible = n(f.disponible);
  return {
    varianteId: f.variante_id,
    productoId: f.producto_id,
    productoCodigo: f.producto_codigo ?? null,
    productoEstado: f.producto_estado ?? "activo",
    referencia: f.referencia,
    categoriaId: f.categoria_id ?? null,
    categoria: f.categoria_nombre ?? null,
    sku: f.sku ?? "",
    codigo: f.codigo ?? null,
    codigosBarras: f.codigos_barras ?? [],
    talla: f.talla ?? null,
    colorCodigo: f.color_codigo ?? null,
    color: f.color_nombre ?? null,
    colorHex: f.color_hex ?? null,
    fotoUrl: f.foto_url ?? null,
    precio: nn(f.precio),
    costo: nn(f.costo),
    estadoCosto: (ESTADOS_COSTO as string[]).includes(f.estado_costo ?? "") ? (f.estado_costo as EstadoCosto) : null,
    stockMinimo: nn(f.stock_minimo),
    separaPisoAlmacen: separa,
    piso,
    almacen,
    sinUbicar: n(f.sin_sububicacion),
    cuarentena: n(f.cuarentena),
    disponible,
    utilizable: calcularUtilizable(separa, piso, almacen, disponible),
    primerIngreso: f.primer_ingreso ?? null,
    diasObservables: nn(f.dias_observables),
    diasConStock: nn(f.dias_con_stock),
    ledgerConsistente: f.ledger_consistente ?? true,
    stockInicial: n(f.stock_inicial),
    ventas: n(f.ventas_ventana),
    devoluciones: n(f.devoluciones_ventana),
    ultimaVenta: f.ultima_venta ?? null,
    entradas: n(f.entradas_ventana),
    mermas: n(f.mermas_ventana),
    trasladosSalida: n(f.traslados_salida_ventana),
    ventasCmp: n(f.ventas_cmp),
    devolucionesCmp: n(f.devoluciones_cmp),
    diasConStockCmp: nn(f.dias_con_stock_cmp),
    enCamino: n(f.en_camino),
    enCaminoATiempo: n(f.en_camino_a_tiempo),
    enCaminoAtrasado: f.en_camino_atrasado ?? false,
    proximaLlegada: f.proxima_llegada ?? null,
    proximoTrasladoId: f.proximo_traslado_id ?? null,
    origenAbastecimiento: (ORIGENES as string[]).includes(f.origen_abastecimiento ?? "") ? (f.origen_abastecimiento as OrigenAbastecimiento) : null,
    enRed: mapearEnRed(f.en_red),
  };
}
