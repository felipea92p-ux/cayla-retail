import { contarProductosPorProveedor, filtroDeMarcaOProveedor, type FilaReposicion, type ReposicionProveedor } from "@/lib/marcas";
import { unstable_cache } from "next/cache";
import { createClient as crearClienteSupabase, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@cayla-retail/database";
import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import { leerExistenciasProductos, type ExistenciasProducto } from "@/lib/productos-stock";
import { fotoDeVariante, type FotoCruda } from "@/lib/producto-fotos-reglas";
import { agruparSinTemporada, type Temporada, type TemporadaEfectiva } from "@/lib/temporada-reglas";
import { temporadasPropiasPorColor } from "@/lib/temporada-ficha-reglas";
import { disponibilidadDeUrl, estadoDeUrl, estadoParaBase, faltaDeUrl, listaDeUrl, temporadaDeUrl, type Disponibilidad, type Falta } from "@/lib/productos-filtros";
import { FAMILIAS_COLOR } from "@/lib/colores-familias";
import { leerMonto } from "@/lib/productos-filtro-precio";
import { leerFacetas, type FacetasProductos } from "@/lib/productos-facetas";
import { leerOrdenProductos, type OrdenProductos } from "@/lib/productos-orden";

// Catálogo V2: `productos` + `variantes` + `categorias` + `colores` +
// `codigos_barras`. No es una edición de `catalogo.ts` (V1) — ese archivo
// depende de `stock_almacen`, `marca` y `foto_url`, ninguno de los cuales
// existe en el esquema V2 (más simple a propósito, ver
// `supabase/migrations/0002_esquema.sql`). `productos.stock_minimo` sí se
// sumó (20260915160000_productos_listado_filtros.sql, decisión de Felipe)
// como umbral de "stock bajo" en /productos — lo usan `listarProductos`/
// `getFacetasProductos` más abajo, y se edita desde `ProductoForm.tsx`.
export type VarianteCatalogo = {
  varianteId: string;
  sku: string;
  /** Código de etiqueta (`variantes.codigo`) — lo que lee la pistola. El `sku` es
   *  legado y las prendas del censo nacen sin él. */
  codigo: string | null;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  /** Foto de ESTA variante, por su color (20260917190000) — null si ese
   *  color todavía no tiene foto. El cliente cae a un tinte del color (o
   *  al dibujo de su categoría, en Vender) cuando falta, nunca a un ícono de "sin foto". */
  fotoUrl: string | null;
  precio: number;
  activo: boolean;
  productoId: string;
  referencia: string;
  categoria: string | null;
  /** Prefijo y familia de su categoría: dibujan su ícono (`IconoCategoria`, por prefijo, nunca por nombre) donde la
   *  prenda no tiene foto, como la tarjeta de Vender. Opcionales: un catálogo guardado antes de este cambio no los trae. */
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  /** De qué marca es (ADR-0109). Opcional: la caja la usa solo para BUSCAR («adidas»); un catálogo guardado antes de este cambio no la trae. */
  marca?: string | null;
  codigosBarras: string[];
};

/** Todo el catálogo activo, para la pantalla de Productos y para Vender/Cambios/
 *  Devoluciones/Buscar (todo lo que lista `getCatalogo()`).
 *
 *  Guardado ENTRE visitas (2026-09-23, opción A de Felipe): ocho pantallas lo leían entero en cada visita (~0,7 s de
 *  una base limitada por CPU). La copia se identifica por la versión que la BASE sube con cada escritura en las tablas
 *  del catálogo (`fn_catalogo_version`, 20260923184300): si alguien cambió un precio, una foto o un código —desde donde
 *  sea—, la versión ya es otra y se lee fresco. Nunca se sirve un catálogo viejo. Y por despliegue: un cambio en la forma
 *  de `VarianteCatalogo` no se encuentra con una copia armada por el código anterior.
 *
 *  Es la misma para todas las cuentas: las 8 tablas se leen igual con cualquier sesión (`auth.role() = 'authenticated'`,
 *  verificado 2026-09-23), así que compartirla no muestra nada que la cuenta no pudiera leer. Si esa regla cambia (p. ej.
 *  esconder `costo` a quien no es líder), esta copia deja de poder compartirse. Desde 20260923193700 el costo YA
 *  NO es parte del catálogo: se pide aparte con `getCostosVariantes()`, solo donde se usa y solo a quien lo ve. */
export async function getCatalogo(): Promise<VarianteCatalogo[]> {
  const supabase = await createClient();
  const [{ data: version, error }, { data: sesion }] = await Promise.all([supabase.rpc("fn_catalogo_version"), supabase.auth.getSession()]);
  const token = sesion.session?.access_token;
  // Sin versión (la migración aún no está, o falló la lectura) se lee en vivo: más lento, nunca viejo.
  if (error || version === null || !token) return leerCatalogo(supabase);
  // La copia no puede leer cookies: la consulta que la llena usa el token de esta sesión (PostgREST lo valida igual).
  return unstable_cache(() => leerCatalogo(clienteConToken(token)), ["catalogo-v2", String(version), process.env.VERCEL_GIT_COMMIT_SHA ?? "local"], {
    // ponytail: la copia vive en la caché de datos de Vercel (tope ~2 MB por entrada; hoy ~0,5 MB con 1.295 variantes).
    // Pasadas ~5.000 variantes ya no entra y se lee en vivo en cada visita: entonces, adelgazar lo que se guarda.
    revalidate: 3600,
  })();
}

/** Una variante del listado de /productos: la del catálogo más su costo, que `fn_productos` entrega vacío (null) a quien
 *  no tiene permiso de ver el dinero (20260923193700). */
export type VarianteListado = VarianteCatalogo & { costo: number | null };

/**
 * El costo de las prendas, para las pantallas que lo usan (Conteo, Compras ▸ Nueva, la ficha de producto, Etiquetas).
 * `null` = esta cuenta no ve el dinero (`fn_puede_ver_dinero_de_compras`: líder, o un rol con Facturas de compra, Por
 * pagar o Notas de crédito) — la pantalla no muestra el costo, nunca un 0. La base ya no deja leer `variantes.costo`
 * directo (20260923193700): esta es la única puerta. Sin `ids`, todo el catálogo (una fila jsonb, sin tope de 1.000).
 *
 * Si la función todavía no existe (web publicada antes que la migración) también da `null`: la pantalla sigue viva
 * sin costos, en vez de caerse.
 */
export async function getCostosVariantes(ids?: string[]): Promise<Map<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_costos_variantes_json", { p_ids: ids });
  if (error || data === null || typeof data !== "object") return null;
  return new Map(Object.entries(data as Record<string, number | string>).map(([id, costo]) => [id, Number(costo)]));
}

/** De estas variantes, las que ya tienen costo de Compras o del Taller (20260927190000): su costo ya no se corrige a mano.
 *  `null` si no se pudo preguntar (la migración aún no está en esta base). */
async function getVariantesConCostoOficial(ids: string[]): Promise<Set<string> | null> {
  if (ids.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_variantes_con_costo_oficial", { p_ids: ids });
  if (error || !Array.isArray(data)) return null;
  return new Set(data as string[]);
}

/** Un cliente sin cookies para usar dentro de la copia guardada, con la sesión de quien la llena. */
function clienteConToken(token: string) {
  return crearClienteSupabase<Database, "retail">(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    db: { schema: "retail" },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function leerCatalogo(supabase: SupabaseClient<Database, "retail">): Promise<VarianteCatalogo[]> {
  const [resVariantes, resMarcas] = await Promise.all([
    // Más de 1.000 variantes desde sep-2026: se lee por páginas (`leerTodas`). `id` desempata el
    // orden — `sku` está vacío en casi todas, y sin desempate las páginas se pisan.
    leerTodas((desde, hasta) =>
      supabase
        .from("variantes")
        .select(
          `id, sku, codigo, color_codigo, precio, activo,
           talla:tallas ( valor ),
           producto:productos ( id, referencia, categoria:categorias ( nombre, prefijo, familia ), producto_fotos ( url, color_codigo, orden, es_principal ) ),
           color:colores ( nombre, hex ),
           codigos_barras ( codigo )`
        )
        .order("sku")
        .order("id")
        .range(desde, hasta)
    ),
    // La marca va en una consulta APARTE y tolerante, no anidada arriba: `getCatalogo()` lo
    // leen la caja, cambios, buscar, compras, recepción, conteo y traslados. Un embed que la
    // base todavía no conoce (el SQL de marcas, 20260918231000, aún sin pegar en producción)
    // haría fallar TODA esa consulta y con ella siete pantallas. Sin la marca, la caja
    // sigue vendiendo: solo deja de encontrar por «adidas» hasta que el SQL entre.
    leerTodas((desde, hasta) => supabase.from("productos").select("id, marca:marcas ( nombre )").order("id").range(desde, hasta)),
  ]);
  const filas = exigir(resVariantes, "el catálogo");
  const marcaPorProducto = new Map<string, string>();
  for (const p of resMarcas.error ? [] : (resMarcas.data ?? [])) {
    if (p.marca?.nombre) marcaPorProducto.set(p.id, p.marca.nombre);
  }

  return filas.map((v) => ({
    varianteId: v.id,
    sku: v.sku ?? "",
    codigo: v.codigo,
    talla: v.talla?.valor ?? null,
    color: v.color?.nombre ?? null,
    colorHex: v.color?.hex ?? null,
    // La foto de su color y, si ese color no tiene, la GENERAL de la prenda (sin color). Nunca la de otro color. Una
    // foto General alcanza para todos los colores: así se decidió con Felipe el 2026-09-26 («una foto por prenda y
    // luego elegir la gama de colores»). Misma regla que Traslados (`fotoDeVariante`) y que `listarProductos`.
    fotoUrl: fotoDeVariante(v.producto?.producto_fotos ?? [], v.color_codigo),
    precio: Number(v.precio),
    activo: v.activo,
    productoId: v.producto?.id ?? "",
    referencia: v.producto?.referencia ?? "(sin referencia)",
    categoria: v.producto?.categoria?.nombre ?? null,
    categoriaPrefijo: v.producto?.categoria?.prefijo ?? null,
    categoriaFamilia: v.producto?.categoria?.familia ?? null,
    marca: marcaPorProducto.get(v.producto?.id ?? "") ?? null,
    codigosBarras: (v.codigos_barras ?? []).map((c) => c.codigo),
  }));
}

// ============================================================================
// Listado filtrado y paginado de /productos (2026-09-15).
//
// `getCatalogo()` arriba sigue existiendo tal cual — trae TODO sin filtrar,
// y lo siguen usando flujos que de verdad necesitan el catálogo entero (el
// escáner de Vender). Esto es aparte: filtros en la URL, resueltos en
// Postgres (nació en `fn_productos`/`fn_productos_resumen`, 20260915160000; desde el
// 2026-10-02 `fn_productos_listado`/`fn_productos_facetas`, ADR-0308), paginado por PRODUCTO
// (no por fila de variante) y por número de página — no cursor, decisión de
// Felipe documentada en la migración: el catálogo no crece como un ledger.
// ============================================================================

export type FiltrosProductos = {
  busqueda?: string;
  categoriaId?: string;
  /** De qué marca y/o qué proveedor lo trae (20260918231300). Los dos se pueden combinar: la base solo deja parejas válidas. */
  marcaId?: string;
  proveedorId?: string;
  /** Varios colores y familias a la vez (ADR-0308): la prenda pasa si tiene UNA variante de alguno de esos colores o de
   *  alguna de esas familias, que además cumpla talla, precio y stock (`fn_productos_listado`, 20261002200000). */
  colores: string[];
  familias: string[];
  tallas: string[];
  /** Clave de `fn_temporadas()` o `sin`: la temporada de cada color (la del color, si no la del producto, si no la de su
   *  categoría), exigida a la misma variante que los demás filtros. */
  temporada?: string;
  /** Lo que le falta a la ficha («Por completar»). */
  falta?: Falta;
  estado?: "activo" | "descontinuado";
  precioMin?: number;
  precioMax?: number;
  /** Disponibilidad (ADR-0308): en la sede elegida (`en_sede`, `sin_sede`) o en la red (`sin_red`, `bajo`, `reponer`). «reponer» =
   *  punto de reorden (20260916100000): demanda × tiempo de entrega + stock_minimo. */
  stock?: Disponibilidad;
  /** La sede elegida arriba: la que miran `en_sede` y `sin_sede`. La pone la página (no viene de la URL). */
  ubicacionId?: string;
  /** Orden del catálogo (20260917180000; recientes, antiguos y vendidos: 20260929180000) — null/undefined = por
   *  referencia, el de siempre. Solo lo entiende el listado; los conteos (`fn_productos_facetas`) no paginan, así que
   *  nunca les llega. Las opciones y sus rótulos: `lib/productos-orden.ts`. */
  orden?: OrdenProductos;
};

/** Parámetros de URL de /productos (ver `FiltrosProductos.tsx`). */
export type ParamsProductosListado = {
  q?: string;
  cat?: string;
  marca?: string;
  proveedor?: string;
  /** Una o varias, separadas por coma (`color=NEG,AZM`); lo mismo `familia` y `talla` (ids). */
  color?: string;
  familia?: string;
  talla?: string;
  temporada?: string;
  falta?: string;
  estado?: string;
  precioMin?: string;
  precioMax?: string;
  stock?: string;
  pagina?: string;
  /** Grilla ⇄ tabla (ADR-0077) — no es un filtro, no pasa por `fn_productos`. */
  vista?: string;
  orden?: string;
};

// 20 por página (Felipe, 2026-09-29; eran 24): con el catálogo real la lista crece y una página corta se lee y carga más rápido.
export const PRODUCTOS_POR_PAGINA = 20;

const esUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

/** La sede elegida, para los filtros que la miran. Sin sede (CAYLA Global), «Hay en …» y «Sin stock en …» no se aplican. */
export function conSede(filtros: FiltrosProductos, ubicacionId: string | null): FiltrosProductos {
  if (ubicacionId) return { ...filtros, ubicacionId };
  return filtros.stock === "en_sede" || filtros.stock === "sin_sede" ? { ...filtros, stock: undefined } : filtros;
}

/** Traduce la URL a filtros, descartando cualquier valor que no calce con su forma. */
export function filtrosProductosDesdeParams(p: ParamsProductosListado): FiltrosProductos {
  return {
    busqueda: p.q?.trim() || undefined,
    categoriaId: esUuid(p.cat) ? p.cat : undefined,
    // `sin` = los que no tienen (ADR-0283): a la base llega como el uuid nulo, que `fn_productos` entiende como «sin marca».
    marcaId: filtroDeMarcaOProveedor(p.marca),
    proveedorId: filtroDeMarcaOProveedor(p.proveedor),
    colores: listaDeUrl(p.color).filter((c) => /^[A-Za-z0-9_-]{1,20}$/.test(c)),
    familias: listaDeUrl(p.familia).filter((f) => FAMILIAS_COLOR.some((x) => x.valor === f)),
    tallas: listaDeUrl(p.talla).filter(esUuid),
    temporada: temporadaDeUrl(p.temporada),
    falta: faltaDeUrl(p.falta),
    // Sin `estado` en la URL = solo activas (Felipe, 2026-10-02); `todos` = activas y descontinuadas (`lib/productos-filtros.ts`).
    estado: estadoParaBase(estadoDeUrl(p.estado)),
    // La misma regla que el cliente (`leerMonto`): el chip, el contador y la lista leen el precio igual.
    precioMin: leerMonto(p.precioMin ?? "") ?? undefined,
    precioMax: leerMonto(p.precioMax ?? "") ?? undefined,
    // Las de la sede se validan otra vez en la página, que sabe si hay sede elegida (`conSede`).
    stock: disponibilidadDeUrl(p.stock, true),
    orden: leerOrdenProductos(p.orden),
  };
}

export function paginaProductosDesdeParams(p: ParamsProductosListado): number {
  const n = Number(p.pagina);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export type ProductoListado = {
  productoId: string;
  referencia: string;
  codigo: string | null;
  categoriaId: string | null;
  categoria: string | null;
  /** De quién es y quién lo trae (20260918231000). `null` = todavía sin registrar (ADR-0283). */
  marca: string | null;
  proveedor: string | null;
  estado: string;
  stockMinimo: number | null;
  stockTotal: number;
  /** Ventas/día promedio de los últimos 30 días, todas las sedes (20260916100000). */
  demandaDiaria: number;
  /** Proxy factura→recepción, en días; 14 si nunca hubo una recepción con factura. */
  leadTimeDias: number;
  /** ceil(demandaDiaria × leadTimeDias) + stockMinimo. */
  puntoReorden: number;
  /** stockTotal <= puntoReorden, demandaDiaria > 0 y la prenda está ACTIVA (una descontinuada no se repone, 20260922120000) — la señal "Pedir a proveedor". */
  reponerDeProveedor: boolean;
  variantes: VarianteListado[];
};

export type PaginaProductos = {
  productos: ProductoListado[];
  totalProductos: number;
  totalPaginas: number;
  pagina: number;
};





/** Los `p_*` de `fn_productos_listado` (20261002200000, ADR-0308): el listado que filtra por VARIANTE (color, precio y
 *  stock se exigen a la misma), sin variantes desactivadas. Se omite la clave en vez de mandar `null` (Args opcionales). */
function paramsListado(filtros: FiltrosProductos) {
  return {
    ...(filtros.busqueda ? { p_busqueda: filtros.busqueda } : {}),
    ...(filtros.categoriaId ? { p_categoria_id: filtros.categoriaId } : {}),
    ...(filtros.marcaId ? { p_marca_id: filtros.marcaId } : {}),
    ...(filtros.proveedorId ? { p_proveedor_id: filtros.proveedorId } : {}),
    ...(filtros.colores.length ? { p_colores: filtros.colores } : {}),
    ...(filtros.familias.length ? { p_familias: filtros.familias } : {}),
    ...(filtros.tallas.length ? { p_tallas: filtros.tallas } : {}),
    ...(filtros.temporada ? { p_temporada: filtros.temporada } : {}),
    ...(filtros.falta ? { p_falta: filtros.falta } : {}),
    ...(filtros.estado ? { p_estado: filtros.estado } : {}),
    ...(filtros.precioMin != null ? { p_precio_min: filtros.precioMin } : {}),
    ...(filtros.precioMax != null ? { p_precio_max: filtros.precioMax } : {}),
    ...(filtros.stock ? { p_disponibilidad: filtros.stock } : {}),
    ...(filtros.ubicacionId ? { p_ubicacion_id: filtros.ubicacionId } : {}),
  };
}

/** Cuántas prendas hay en cada opción del filtro, el rango real del precio y sus tramos (`fn_productos_facetas`,
 *  20261002200100; ADR-0308), con los MISMOS filtros que la lista. Reemplaza al resumen viejo (`fn_productos_resumen`) y a
 *  la consulta provisoria de los límites de precio. `null` si no se pudo: la pantalla muestra todas las opciones sin número
 *  y el precio solo con sus cajas (se degrada, nunca se cae). */
export async function getFacetasProductos(filtros: FiltrosProductos): Promise<FacetasProductos | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_productos_facetas", paramsListado(filtros));
  if (error) return null;
  return leerFacetas(data);
}

/** Catálogo filtrado y paginado (por producto) server-side, para /productos. */
export async function listarProductos(filtros: FiltrosProductos, pagina: number): Promise<PaginaProductos> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.rpc("fn_productos_listado", {
      ...paramsListado(filtros),
      ...(filtros.orden ? { p_orden: filtros.orden } : {}),
      p_pagina: pagina,
      p_por_pagina: PRODUCTOS_POR_PAGINA,
    }),
    "el catálogo de productos"
  );

  const porProducto = new Map<string, ProductoListado>();
  let totalProductos = 0;
  for (const f of filas) {
    totalProductos = f.total_productos;
    let p = porProducto.get(f.producto_id);
    if (!p) {
      p = {
        productoId: f.producto_id,
        referencia: f.referencia,
        codigo: f.codigo,
        categoriaId: f.categoria_id,
        categoria: f.categoria_nombre,
        marca: f.marca_nombre,
        proveedor: f.proveedor_nombre,
        estado: f.estado,
        stockMinimo: f.stock_minimo,
        stockTotal: f.stock_total,
        demandaDiaria: Number(f.demanda_diaria),
        leadTimeDias: Number(f.lead_time_dias),
        puntoReorden: f.punto_reorden,
        reponerDeProveedor: f.reponer_de_proveedor,
        variantes: [],
      };
      porProducto.set(f.producto_id, p);
    }
    p.variantes.push({
      varianteId: f.variante_id,
      sku: f.sku,
      codigo: f.variante_codigo,
      talla: f.talla,
      color: f.color_nombre,
      colorHex: f.color_hex,
      fotoUrl: f.foto_url,
      precio: Number(f.precio),
      costo: f.costo === null ? null : Number(f.costo),
      activo: f.activo,
      productoId: f.producto_id,
      referencia: f.referencia,
      categoria: f.categoria_nombre,
      codigosBarras: f.codigos_barras ?? [],
    });
  }

  // `fn_productos` trae solo la foto del color EXACTO. Una prenda fotografiada una sola vez lleva su foto en General
  // (sin color) y sus colores sin foto propia: sin esto, cada color salía con el gancho vacío aunque la prenda sí
  // tuviera foto (pasó con «Blusa V», 2026-09-26). Se completa con la General de la prenda, nunca con la de otro color
  // — la misma regla de `fotoDeVariante`. Una consulta más, solo si en la página falta alguna foto.
  const sinFoto = [...porProducto.values()].filter((p) => p.variantes.some((v) => v.fotoUrl === null)).map((p) => p.productoId);
  if (sinFoto.length > 0) {
    const { data: generales } = await supabase
      .from("producto_fotos")
      .select("producto_id, url, orden, es_principal, color_codigo")
      .in("producto_id", sinFoto)
      .is("color_codigo", null);
    // Si esta consulta falla, la página se dibuja igual con lo que trajo `fn_productos`: la foto es un extra.
    const porId = new Map<string, FotoCruda[]>();
    for (const f of generales ?? []) porId.set(f.producto_id, [...(porId.get(f.producto_id) ?? []), f]);
    for (const id of sinFoto) {
      const general = fotoDeVariante(porId.get(id) ?? [], null);
      if (!general) continue;
      for (const v of porProducto.get(id)!.variantes) if (v.fotoUrl === null) v.fotoUrl = general;
    }
  }

  return {
    productos: [...porProducto.values()],
    totalProductos,
    totalPaginas: Math.max(1, Math.ceil(totalProductos / PRODUCTOS_POR_PAGINA)),
    pagina,
  };
}

/** "A quién pedirle" (ADR-0109): los productos que hoy cumplen la señal «Pedir a proveedor»,
 *  agrupados por proveedor, de más a menos. NO recalcula la señal: le pregunta a `fn_productos_listado`
 *  con la disponibilidad `reponer` (demanda × tiempo de entrega + mínimo, 20260916100000), así hay UNA sola
 *  definición de "hay que reponer".
 *
 *  Recibe LOS MISMOS filtros que el conteo «Pedir a proveedor» del filtro (`getFacetasProductos`), para que
 *  la suma de este bloque sea exactamente ese número: dos cifras distintas para lo mismo en una misma
 *  pantalla es lo que hace que nadie confíe en ninguna.
 *
 *  Es un complemento de la pantalla, no la pantalla: si la consulta falla (p. ej. el SQL de
 *  proveedores todavía no está en producción y `fn_productos` no devuelve `proveedor_id`), el bloque
 *  se omite en vez de tumbar Productos. Trae hasta 300 productos (3 páginas de 100): el catálogo
 *  activo es de decenas, no de miles; si algún día pasara de eso, los números serían un piso. */
export async function getReposicionPorProveedor(
  filtros: Omit<FiltrosProductos, "stock" | "orden">
): Promise<ReposicionProveedor[]> {
  const supabase = await createClient();
  const filas: FilaReposicion[] = [];
  for (let pagina = 1; pagina <= 3; pagina++) {
    const { data, error } = await supabase.rpc("fn_productos_listado", {
      ...paramsListado({ ...filtros, stock: undefined }),
      p_disponibilidad: "reponer",
      p_pagina: pagina,
      p_por_pagina: 100,
    });
    if (error) return [];
    const pag = data ?? [];
    if (pag.length === 0) break;
    filas.push(...pag);
    if (Number(pag[0].total_productos) <= pagina * 100) break;
  }
  return contarProductosPorProveedor(filas);
}

/**
 * Lo de la sede elegida, las otras tiendas, el Taller y lo que viene en camino, por producto de la página (ADR-0270):
 * la tarjeta del Catálogo dice lo mismo que Existencias. `null` si no se pudo leer (p. ej. la función todavía no está
 * pegada en producción): la tarjeta vuelve a «Stock total N» en vez de romperse o inventar un cero.
 */
export async function getExistenciasProductos(productoIds: string[], ubicacionId: string | null): Promise<Map<string, ExistenciasProducto> | null> {
  if (productoIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_existencias_productos" as never,
    { p_producto_ids: productoIds, p_ubicacion_id: ubicacionId } as never
  );
  if (error) return null;
  return leerExistenciasProductos(data);
}


/** Una variante dentro de la ficha de edición — a diferencia de
 *  `VarianteCatalogo`, trae `colorCodigo`/`codigo` (hacen falta para
 *  precargar el form) y no aplana el nombre del producto. */
export type VarianteDetalle = {
  id: string;
  colorCodigo: string | null;
  color: string | null;
  tallaId: string | null;
  talla: string | null;
  sku: string;
  precio: number;
  /** null = quien mira no tiene permiso de ver el dinero (20260923193700): la ficha no muestra ni toca el costo. */
  costo: number | null;
  /** true = ya entró por Compras o por el Taller: su costo es el promedio ponderado y no se corrige a mano. false =
   *  costo declarado (alta o carga inicial), se puede corregir. null = no se pudo saber (la migración 20260927190000
   *  aún no está): la ficha lo trata como oficial, que es lo seguro. */
  costoOficial: boolean | null;
  activo: boolean;
  codigo: string | null;
  codigosBarras: string[];
  /** Etiquetas de catálogo aplicadas a ESTA variante puntual (ADR-0095) —
   *  distinto del vocabulario en sí, que vive en `retail.etiquetas`. */
  etiquetaIds: string[];
};

/** Una foto de la galería del producto (20260915224500). `id` ausente =
 *  recién subida en esta sesión de edición, todavía no tiene fila.
 *  `colorCodigo` (20260917190000): a qué color pertenece — null = sin
 *  color (accesorio, o foto general sin etiquetar). */
export type FotoProducto = {
  id: string | null;
  url: string;
  esPrincipal: boolean;
  colorCodigo: string | null;
};

export type ProductoDetalle = {
  id: string;
  categoriaId: string | null;
  referencia: string;
  descripcion: string | null;
  estado: "activo" | "descontinuado";
  codigo: string | null;
  /** Dimensión aparte de `estado` (20260918): 'pendiente' = dado de alta al
   *  vuelo durante un conteo por alguien que no es Líder, todavía sin
   *  revisar — sigue activo y contable mientras tanto. */
  estadoAlta: "pendiente" | "aprobado" | "rechazado";
  /** Umbral de "stock bajo" en /productos (20260915160000). Null = sin umbral. */
  stockMinimo: number | null;
  /** Clave de la lista cerrada (`verano`, `otono_invierno`…, ADR-0246). Null = sin temporada propia: hereda la de su
   *  categoría (y si tampoco tiene, la prenda queda «Sin temporada»). Antes del 2026-09-26 era texto libre. */
  temporada: string | null;
  /** Lo que la ficha necesita para elegir la temporada (ADR-0246). `null` = la base todavía no tiene la lista (el SQL
   *  de temporadas sin pegar): la ficha lo dice en una nota y no toca la temporada. */
  temporadas: FichaTemporadas | null;
  /** Si es true, el producto puede venderse aunque el stock marque 0 (20260915224500). */
  permitirVentaSinStock: boolean;
  /** Atributo del producto, no de la variante — no cambia entre tallas (20260917100100). */
  tejidoId: string | null;
  tejido: string | null;
  patronId: string | null;
  patron: string | null;
  /** De quién es y quién lo trae (20260918231000). «» = todavía sin registrar (ADR-0283: pueden faltar, cada uno por separado;
   *  si están los dos, son una pareja registrada). */
  marcaId: string;
  marcaNombre: string;
  proveedorId: string;
  proveedorNombre: string;
  /** Ya en el orden de la galería (`orden` ascendente). */
  fotos: FotoProducto[];
  variantes: VarianteDetalle[];
  /** ADR-0193: la versión de la fila al abrir la ficha. Se manda al guardar (`p_version_esperada`): si otra persona
   *  guardó entre medio, la base rechaza en vez de pisar sus precios. Sube con cada escritura del producto. */
  version: number;
};

/** El producto y sus variantes, para `/productos/[id]/editar`. `null` si no existe. */
export async function getProducto(id: string): Promise<ProductoDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productos")
    .select(
      `id, categoria_id, referencia, descripcion, estado, estado_alta, codigo, stock_minimo, temporada, permitir_venta_sin_stock,
       tejido_id, patron_id, marca_id, proveedor_id, version,
       tejido:tejidos ( nombre ), patron:patrones ( nombre ),
       marca:marcas ( nombre ), proveedor:proveedores ( nombre ),
       variantes ( id, color_codigo, talla_id, sku, precio, activo, codigo,
         color:colores ( nombre ),
         talla:tallas ( valor ),
         codigos_barras ( codigo ),
         variante_etiquetas ( etiqueta_id ) ),
       producto_fotos ( id, url, orden, es_principal, color_codigo )`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el producto: ${error.message}`);
  if (!data) return null;
  const ids = (data.variantes ?? []).map((v) => v.id);
  const [costos, conCostoOficial, temporadas] = await Promise.all([
    getCostosVariantes(ids),
    getVariantesConCostoOficial(ids),
    getFichaTemporadas(id),
  ]);

  return {
    id: data.id,
    categoriaId: data.categoria_id,
    referencia: data.referencia,
    descripcion: data.descripcion,
    estado: data.estado as ProductoDetalle["estado"],
    estadoAlta: data.estado_alta as ProductoDetalle["estadoAlta"],
    codigo: data.codigo,
    stockMinimo: data.stock_minimo,
    temporada: data.temporada,
    temporadas,
    permitirVentaSinStock: data.permitir_venta_sin_stock,
    tejidoId: data.tejido_id,
    tejido: data.tejido?.nombre ?? null,
    patronId: data.patron_id,
    patron: data.patron?.nombre ?? null,
    marcaId: data.marca_id ?? "",
    marcaNombre: data.marca?.nombre ?? "",
    proveedorId: data.proveedor_id ?? "",
    proveedorNombre: data.proveedor?.nombre ?? "",
    fotos: [...(data.producto_fotos ?? [])]
      .sort((a, b) => a.orden - b.orden)
      .map((f) => ({ id: f.id, url: f.url, esPrincipal: f.es_principal, colorCodigo: f.color_codigo })),
    variantes: (data.variantes ?? []).map((v) => ({
      id: v.id,
      colorCodigo: v.color_codigo,
      color: v.color?.nombre ?? null,
      tallaId: v.talla_id,
      talla: v.talla?.valor ?? null,
      sku: v.sku ?? "",
      precio: Number(v.precio),
      costo: costos ? (costos.get(v.id) ?? 0) : null,
      costoOficial: conCostoOficial ? conCostoOficial.has(v.id) : null,
      activo: v.activo,
      codigo: v.codigo,
      codigosBarras: (v.codigos_barras ?? []).map((c) => c.codigo),
      etiquetaIds: (v.variante_etiquetas ?? []).map((e) => e.etiqueta_id),
    })),
    version: data.version,
  };
}

// ============================================================================
// Temporadas (ADR-0246). Todo se lee por RPC `security definer` (las tablas nuevas no tienen privilegios para la web)
// y TODO es tolerante: la web puede publicarse antes que el SQL, y una lectura de temporadas que falla deja la pantalla
// sin temporadas —con una nota—, nunca la tumba. La regla de cuál es la temporada de una prenda (color → producto →
// categoría) NO se calcula aquí: la resuelve `fn_temporada_efectiva` y aquí solo se lee.
// ============================================================================

/** La lista cerrada y la temporada por defecto de cada categoría: lo que necesita cualquier desplegable de temporada. */
export type TemporadasCatalogo = {
  /** Las 9 temporadas, en su orden (`fn_temporadas`). */
  lista: Temporada[];
  /** categoriaId → clave de su temporada por defecto. Solo las categorías que tienen una. */
  porCategoria: Record<string, string>;
};

/** Lo de temporadas que la ficha de UNA prenda necesita, además de la lista. */
export type FichaTemporadas = TemporadasCatalogo & {
  /** color → clave de su temporada propia (la excepción ya guardada). Un color que sigue a su prenda no está.
   *  `null` = no se pudo leer (`fn_temporada_efectiva` falló): la ficha no ofrece la temporada por color, porque sin
   *  saber lo guardado mostraría «Igual que su prenda» sobre una excepción que sí existe. */
  porColor: Record<string, string> | null;
};

/**
 * `null` si la base todavía no tiene la lista (SQL de temporadas sin pegar) o CUALQUIERA de las dos lecturas falló.
 * Las dos o ninguna: sin la temporada de las categorías, la ficha y el alta ofrecerían «Sin temporada» en vez de «Igual
 * que su categoría (Verano)», y quien lo viera le pondría una a mano a una prenda que ya heredaba la suya.
 */
export async function getTemporadasCatalogo(): Promise<TemporadasCatalogo | null> {
  const supabase = await createClient();
  const [resLista, resCategorias] = await Promise.all([
    supabase.rpc("fn_temporadas"),
    // Aparte de la consulta de categorías de cada pantalla: si esta columna aún no existe, falla SOLO esta lectura.
    supabase.from("categorias").select("id, temporada").not("temporada", "is", null),
  ]);
  if (resLista.error || !resLista.data || resLista.data.length === 0) return null;
  if (resCategorias.error || !resCategorias.data) return null;
  const porCategoria: Record<string, string> = {};
  for (const c of resCategorias.data) if (c.temporada) porCategoria[c.id] = c.temporada;
  return { lista: resLista.data as Temporada[], porCategoria };
}

async function getFichaTemporadas(productoId: string): Promise<FichaTemporadas | null> {
  const supabase = await createClient();
  const [catalogo, resEfectiva] = await Promise.all([getTemporadasCatalogo(), supabase.rpc("fn_temporada_efectiva", { p_producto_id: productoId })]);
  if (!catalogo) return null;
  return {
    ...catalogo,
    porColor: resEfectiva.error || !resEfectiva.data ? null : temporadasPropiasPorColor(resEfectiva.data as TemporadaEfectiva[]),
  };
}

/**
 * Cuántas prendas activas no tienen temporada (ni propia, ni en algún color, ni por su categoría): el aviso plegado de
 * /productos para quien edita el catálogo. `null` si no se pudo saber (SQL sin pegar, o la lectura falló): entonces el
 * aviso no se muestra, en vez de decir «0» sin saberlo.
 *
 * Números: una fila por modelo+color activo — hoy unas 400 (1.295 variantes / ~3 tallas), en 3 años unas 3.000. Pasa
 * de las 1.000 que entrega PostgREST por página: se lee paginado, en serie (casi siempre cabe en una).
 */
export async function getSinTemporadaResumen(): Promise<{ prendas: number } | null> {
  const supabase = await createClient();
  const res = await leerTodas(
    (desde, hasta) => supabase.rpc("fn_temporada_efectiva").order("producto_id").order("color_codigo").range(desde, hasta),
    { enParalelo: 1 },
  );
  if (res.error || !res.data) return null;
  return { prendas: agruparSinTemporada(res.data as TemporadaEfectiva[]).length };
}

export type ValorVocabulario = { id: string; texto: string };

/** id → la imagen que un Líder eligió en Atributos para un tejido o un patrón (foto o dibujo generado, ADR-0256). Sin
 *  entrada = el dibujo automático por nombre. Aparte de `ValorVocabulario` para no ensanchar el tipo que también usan
 *  las tallas. La leen el alta y la ficha del producto: UNA sola lectura para las dos. */
export type ImagenesMuestra = { tejidos: Record<string, string>; patrones: Record<string, string> };

export async function getImagenesMuestra(): Promise<ImagenesMuestra> {
  const supabase = await createClient();
  const [tejidos, patrones] = await Promise.all([
    supabase.from("tejidos").select("id, imagen_muestra_url").not("imagen_muestra_url", "is", null),
    supabase.from("patrones").select("id, imagen_muestra_url").not("imagen_muestra_url", "is", null),
  ]);
  const mapa = (filas: { id: string; imagen_muestra_url: string | null }[]) =>
    Object.fromEntries(filas.flatMap((f) => (f.imagen_muestra_url ? [[f.id, f.imagen_muestra_url]] : [])));
  return { tejidos: mapa(exigir(tejidos, "las imágenes de los tejidos")), patrones: mapa(exigir(patrones, "las imágenes de los patrones")) };
}

/** Qué tallas/tejidos/patrones ofrece el formulario según la categoría
 *  elegida (20260917100400) — reemplaza `categorias.tallas_sugeridas`.
 *  Cada tabla puente reemplaza, no hereda, entre categoría y subcategoría
 *  (decisión de Felipe, 2026-09-17): la fila vive contra la categoría
 *  exacta, así que agrupar por `categoria_id` ya respeta eso solo. */
export type EjesPorCategoria = {
  tallas: Record<string, ValorVocabulario[]>;
  /** Ids de talla que vienen MARCADAS al elegir la categoría (la curva habitual,
   *  `categoria_tallas.habitual`, 20260918230100). Siempre un subconjunto de `tallas`. */
  habituales: Record<string, string[]>;
  tejidos: Record<string, ValorVocabulario[]>;
  patrones: Record<string, ValorVocabulario[]>;
};

function agrupar(filas: { categoria_id: string; id: string; texto: string }[]): Record<string, ValorVocabulario[]> {
  const out: Record<string, ValorVocabulario[]> = {};
  for (const f of filas) (out[f.categoria_id] ??= []).push({ id: f.id, texto: f.texto });
  return out;
}

/** Solo vocabulario `aprobado` y `activo` — un valor pendiente todavía no
 *  se ofrece para elegir en el alta (a diferencia de colores/etiquetas, que
 *  sí se ofrecen pendientes; decisión explícita del 2026-09-17: acá el
 *  colaborador que arma el catálogo real es siempre un Líder). */
export async function getEjesPorCategoria(): Promise<EjesPorCategoria> {
  const supabase = await createClient();
  const [tallas, tejidos, patrones] = await Promise.all([
    exigir(
      await supabase.from("categoria_tallas").select("categoria_id, habitual, talla:tallas!inner ( id, valor )").eq("tallas.activo", true).eq("tallas.estado", "aprobado"),
      "las tallas por categoría"
    ),
    exigir(
      await supabase.from("categoria_tejidos").select("categoria_id, tejido:tejidos!inner ( id, nombre )").eq("tejidos.activo", true).eq("tejidos.estado", "aprobado"),
      "los tejidos por categoría"
    ),
    exigir(
      await supabase.from("categoria_patrones").select("categoria_id, patron:patrones!inner ( id, nombre )").eq("patrones.activo", true).eq("patrones.estado", "aprobado"),
      "los patrones por categoría"
    ),
  ]);

  const habituales: Record<string, string[]> = {};
  for (const f of tallas) if (f.habitual) (habituales[f.categoria_id] ??= []).push(f.talla.id);

  return {
    tallas: agrupar(tallas.map((f) => ({ categoria_id: f.categoria_id, id: f.talla.id, texto: f.talla.valor }))),
    habituales,
    tejidos: agrupar(tejidos.map((f) => ({ categoria_id: f.categoria_id, id: f.tejido.id, texto: f.tejido.nombre }))),
    patrones: agrupar(patrones.map((f) => ({ categoria_id: f.categoria_id, id: f.patron.id, texto: f.patron.nombre }))),
  };
}
