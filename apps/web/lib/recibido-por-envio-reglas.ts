import { fechaCorta, notaSinEnvio } from "./compras-reglas";
import type { LineaRecepcion, RecepcionReciente } from "./compras-reglas";
import { matricesDeRecepcion, type MatrizModelo } from "./recepcion-matriz-reglas";

/**
 * «Terminados» por ENVÍO (Felipe 2026-10-28): un fardo puede traer prendas de dos proveedores y la base guarda un lote por proveedor
 * (`lotes_despacho_proveedor_unico`). La lista de lo recibido junta esos lotes en una sola fila por envío; una llegada sin envío
 * (Llegó mercadería, sin aviso) queda como fila propia, para que no desaparezca nada de lo recibido.
 */
export type EnvioRecibido = {
  /** El `despachoId`, o el `loteId` de una llegada sin envío. */
  clave: string;
  /** «ENV-000254»; `null` en una llegada sin envío. */
  numero: string | null;
  fecha: string;
  /** Cuándo la sede abrió el envío para recibirlo (`despachos.abierto_en`); `null` en una llegada sin envío o si la base no lo dio. */
  llegoEn: string | null;
  ubicacion: string;
  /** Sin repetir, en el orden en que aparecen. */
  proveedores: string[];
  recibidoPor: string | null;
  unidades: number;
  lineas: number;
  lotes: RecepcionReciente[];
};

export function agruparPorEnvio(recepciones: readonly RecepcionReciente[]): EnvioRecibido[] {
  const porClave = new Map<string, EnvioRecibido>();
  for (const r of recepciones) {
    const clave = r.despachoId ?? r.loteId;
    const e = porClave.get(clave);
    const nombre = r.proveedorNombre || notaSinEnvio(r.nota) || "Sin proveedor";
    if (!e) {
      porClave.set(clave, {
        clave,
        numero: r.despachoId ? r.envioNumero : null,
        fecha: r.fecha,
        llegoEn: r.llegoEn ?? null,
        ubicacion: r.ubicacion,
        proveedores: [nombre],
        recibidoPor: r.recibidoPor,
        unidades: r.unidades,
        lineas: r.lineas,
        lotes: [r],
      });
      continue;
    }
    if (!e.proveedores.includes(nombre)) e.proveedores.push(nombre);
    if (r.fecha > e.fecha) e.fecha = r.fecha;
    if (r.llegoEn && (!e.llegoEn || r.llegoEn < e.llegoEn)) e.llegoEn = r.llegoEn;
    e.recibidoPor ??= r.recibidoPor;
    e.unidades += r.unidades;
    e.lineas += r.lineas;
    e.lotes.push(r);
  }
  return [...porClave.values()];
}

/** Una prenda de un envío (de un lote, o sea de un proveedor): cuántas entraron y su matriz de colores y tallas. */
export type PrendaRecibida = {
  clave: string;
  modelo: string;
  sku: string | null;
  loteId: string;
  proveedor: string;
  /** La marca de la prenda; `null` si la prenda no tiene marca en Catálogo. */
  marca: string | null;
  unidades: number;
  matriz: MatrizModelo;
};

export function prendasDelEnvio(e: EnvioRecibido): PrendaRecibida[] {
  return e.lotes.flatMap((l) =>
    matricesDeRecepcion(l.detalle).map((m) => {
      const primera: LineaRecepcion | undefined = l.detalle.find((d) => d.referencia === m.modelo);
      return {
        clave: `${l.loteId}|${m.modelo}`,
        modelo: m.modelo,
        sku: primera?.sku ? primera.sku.replace(/-[^-]+-[^-]+$/, "") : null,
        loteId: l.loteId,
        proveedor: l.proveedorNombre || notaSinEnvio(l.nota) || "Sin proveedor",
        marca: primera?.marca?.trim() || null,
        unidades: m.total,
        matriz: m,
      };
    }),
  );
}

/**
 * «Las marcas al frente» (Felipe 2026-11-10, propuesta B de docs/maquetas/recibidos-marca-2026-11): la marca es lo que la tienda reconoce y
 * vende, y un proveedor puede traer muchas (un envío de «CAYLA SAC» trajo 10). Cada envío se lee por sus marcas, de la que más unidades
 * trajo a la que menos; las prendas sin marca van juntas al final (`marca: null`), porque son un dato por completar en Catálogo.
 */
export type MarcaDelEnvio = {
  /** `null`: las prendas que llegaron sin marca. */
  marca: string | null;
  unidades: number;
  /** Quién trajo esa marca en este envío, sin repetir. */
  proveedores: string[];
  prendas: PrendaRecibida[];
};

export function marcasDelEnvio(e: EnvioRecibido): MarcaDelEnvio[] {
  const porMarca = new Map<string | null, MarcaDelEnvio>();
  for (const p of prendasDelEnvio(e)) {
    const m = porMarca.get(p.marca) ?? { marca: p.marca, unidades: 0, proveedores: [], prendas: [] };
    m.unidades += p.unidades;
    if (!m.proveedores.includes(p.proveedor)) m.proveedores.push(p.proveedor);
    m.prendas.push(p);
    porMarca.set(p.marca, m);
  }
  return [...porMarca.values()].sort(
    (a, b) => Number(a.marca === null) - Number(b.marca === null) || b.unidades - a.unidades || (a.marca ?? "").localeCompare(b.marca ?? "", "es"),
  );
}

/** Cuántas marcas se nombran en la fila de la lista antes del «+N más». */
const MARCAS_EN_LA_FILA = 3;

/** Lo que dice la fila de la lista: las marcas que más unidades trajeron, cuántas más hay y si llegó algo sin marca. */
export function marcasEnLaFila(marcas: readonly MarcaDelEnvio[], max = MARCAS_EN_LA_FILA): { visibles: MarcaDelEnvio[]; mas: number; sinMarca: MarcaDelEnvio | null } {
  const con = marcas.filter((m) => m.marca !== null);
  return { visibles: con.slice(0, max), mas: Math.max(0, con.length - max), sinMarca: marcas.find((m) => m.marca === null) ?? null };
}

/** Los colores de las marcas en la barra (solo tokens): las cuatro con más unidades tienen el suyo, el resto comparte uno tenue y lo sin
 *  marca va en ámbar, como su insignia. La barra no lo dice sola: las etiquetas y la leyenda nombran cada marca. */
const COLORES_DE_MARCA = ["bg-tinta", "bg-taupe", "bg-pizarra", "bg-borde-control"] as const;
/** @internal La prueba la usa para comprobar que la quinta marca en adelante comparte color. */
export const COLOR_OTRAS_MARCAS = "bg-tinta/25";
/** @internal La prueba la usa para comprobar que lo sin marca va en ámbar, como su insignia. */
export const COLOR_SIN_MARCA = "bg-ambar";

export function colorDeMarca(marcas: readonly MarcaDelEnvio[], marca: string | null): string {
  if (marca === null) return COLOR_SIN_MARCA;
  const i = marcas.filter((m) => m.marca !== null).findIndex((m) => m.marca === marca);
  return COLORES_DE_MARCA[i] ?? COLOR_OTRAS_MARCAS;
}

/** «de Rosa Quispe», «de Rosa Quispe y Julio Ramos» o «de 4 proveedores». */
export function deQuienLlego(proveedores: readonly string[]): string {
  if (proveedores.length > 2) return `de ${proveedores.length} proveedores`;
  return `de ${proveedores.join(" y ")}`;
}

/** Cuántas prendas distintas (modelos) trajo el envío: lo que la tienda cuenta, no las líneas de color y talla. */
export function prendasDistintas(e: EnvioRecibido): number {
  return new Set(e.lotes.flatMap((l) => l.detalle.map((d) => d.referencia))).size;
}

/** La nota con que `registrar_alta_con_llegada` (20261028221000) deja el lote de una prenda que entró al crearla. */
const NOTA_ALTA = "Llegó con el alta del producto";

/** Cómo se nombra una llegada sin envío en la columna «Envío»: «Llegó con el alta» si vino al crear la prenda; si no, «Sin envío». */
export function nombreSinEnvio(e: EnvioRecibido): string {
  return e.lotes.some((l) => notaSinEnvio(l.nota) === NOTA_ALTA) ? "Llegó con el alta" : "Sin envío";
}

/** La nota que vale la pena mostrar en la hoja: la del alta ya la dice el título. */
export function esNotaDelAlta(nota: string): boolean {
  return nota === NOTA_ALTA;
}

/** Mismo día de Perú: la lista muestra una sola fecha y «terminó …» solo si fue otro día. */
export function mismoDia(a: string, b: string): boolean {
  return fechaCorta(a) === fechaCorta(b);
}

/**
 * Un envío que ya dejó prendas en el stock pero que todavía se está recibiendo (`despachos.estado = 'abierto'`): sale en «Terminados» con lo
 * que ya entró y, a la vez, en «Envíos por recibir». En «Terminados» no dice «terminó»: dice que sigue abierto (Felipe 2026-11-12).
 */
export function sigueAbierto(e: EnvioRecibido, abiertos: ReadonlySet<string>): boolean {
  return e.numero !== null && abiertos.has(e.clave);
}

/** «terminó 12/11» bajo la fecha de llegada: solo si el envío ya se cerró y no terminó el mismo día que llegó. */
export function textoTermino(e: EnvioRecibido, abiertos: ReadonlySet<string>): string | null {
  if (sigueAbierto(e, abiertos) || !e.llegoEn || mismoDia(e.llegoEn, e.fecha)) return null;
  return `terminó ${fechaCorta(e.fecha).slice(0, 5)}`;
}
