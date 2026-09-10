import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional } from "@/lib/resultado";
import type { PersonaActual } from "@/lib/persona";
import { resumirVarianza, type Varianza } from "@/lib/conteo-varianza";

// Se re-exportan para que las pantallas sigan importando todo lo del conteo de un solo
// sitio: la separación es por poder probar, no una frontera de dominio.
export { resumirVarianza } from "@/lib/conteo-varianza";
export type { Varianza, LineaVarianza, FilaPrevisualizacion } from "@/lib/conteo-varianza";

/**
 * Lecturas del conteo físico — la pantalla del censo.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE Y NO SE REUSA `catalogo.ts`.
 * `getCatalogoConStock` trae `variantes` + `productos` + `categorias` + `stock` +
 * `stock_almacen` de TODAS las sedes, con foto, marca, estado, costo y mínimos. Con
 * las ~19 variantes de hoy da igual; con las 300-900 del censo son ~1,1 MB por render,
 * y encima viaja como prop a un componente cliente. En la pantalla donde una Encargada
 * escanea 500 prendas seguidas desde el celular de la tienda, eso es la diferencia
 * entre usable y rota.
 *
 * Acá se traen ~90 bytes por fila en vez de ~600: lo justo para reconocer la prenda en
 * pantalla y para buscarla por texto cuando no hay código que escanear. Ni costo (no se
 * usa al contar y es información sensible), ni foto, ni categoría, ni las otras sedes.
 *
 * LAS ESCRITURAS NO VIVEN ACÁ. Como en todo el repo, el componente cliente llama
 * `supabase.rpc(...)` directo — acá solo se lee (docs/ARQUITECTURA.md §"lib").
 */

/** Una prenda, con lo mínimo para reconocerla y contarla. */
export type VarianteParaConteo = {
  varianteId: string;
  codigo: string | null; // el corto (BLU-0042-AZM-M); null si su color aún no está normalizado
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  precio: number | null;
  /** Lo que el sistema cree que hay en ESTA sede. La pantalla lo oculta hasta que la
   *  persona guarda su número: un conteo a ciegas, como el cierre de caja. */
  enSistema: number;
};

/** Una prenda ya contada en la sesión abierta. */
export type LineaContada = {
  lineaId: string;
  varianteId: string;
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  contada: number;
  /** Lo que el sistema decía CUANDO se contó, congelado (ADR-0027). No se recalcula. */
  sistema: number;
  contadaEn: string;
};

export type ConteoAbierto = {
  id: string;
  ubicacion: "piso" | "almacen";
  alcance: string;
  nombre: string | null;
  abiertoEn: string;
  lineas: LineaContada[];
  /** Suma de lo contado. Es el número que sube mientras se cuenta. */
  unidadesContadas: number;
  /** Cuántas prendas distintas se tocaron. */
  variantesContadas: number;
  /**
   * Variantes que el sistema cree que están en esta sede y que nadie contó todavía.
   *
   * Se muestran DOS números verdaderos ("143 contadas · faltan 87") en vez de una
   * fracción "143 de ~500": al empezar el censo casi nada existe en el catálogo, así
   * que cualquier denominador sería inventado — y un progreso falso desmoraliza más
   * que no tener progreso.
   */
  faltanPorContar: number;
};

export type CatalogoParaConteo = {
  variantes: VarianteParaConteo[];
  /**
   * Todo código que encuentra una prenda → su variante: el corto de CAYLA, el sku
   * anterior (etiquetas ya impresas) y el que la prenda trae de fábrica (ADR-0025).
   *
   * Va al cliente para que el escaneo muestre la prenda AL INSTANTE, sin esperar el
   * viaje a São Paulo (~322 ms, ADR-0013). La escritura sí va al servidor, pero
   * después: quien escanea ya está levantando la prenda siguiente.
   */
  porCodigo: Record<string, string>;
};

type ProductoAnidado = { referencia: string | null } | { referencia: string | null }[] | null;

function referenciaDe(producto: ProductoAnidado): string {
  const p = Array.isArray(producto) ? producto[0] : producto;
  return p?.referencia ?? "(sin referencia)";
}

/**
 * El conteo abierto de la sede donde está parada la persona, o null si no hay ninguno.
 *
 * "No hay conteo abierto" es una respuesta legítima, no un fallo — por eso
 * `exigirOpcional`: con `const { data }` a secas un error de red y un "no hay conteo"
 * llegan idénticos, y la pantalla ofrecería abrir uno nuevo sobre uno que sí existe.
 */
export async function getConteoAbierto(
  persona: PersonaActual,
  ubicacion: "piso" | "almacen" = "piso"
): Promise<ConteoAbierto | null> {
  const supabase = await createClient();

  const resConteo = await supabase
    .from("conteos")
    .select("id, ubicacion, alcance, nombre, abierto_en")
    .eq("sede_id", persona.sedeId)
    .eq("ubicacion", ubicacion)
    .eq("estado", "abierto")
    .maybeSingle();

  const conteo = exigirOpcional(resConteo, "el conteo abierto de esta tienda");
  if (!conteo) return null;

  const tabla = ubicacion === "almacen" ? "stock_almacen" : "stock";

  const [resLineas, resConStock] = await Promise.all([
    supabase
      .from("conteo_lineas")
      .select(
        "id, variante_id, cantidad_contada, cantidad_sistema, contado_en, variantes(codigo, talla, color, productos(referencia))"
      )
      .eq("conteo_id", conteo.id)
      .order("contado_en", { ascending: false }),
    // Para "faltan por contar": lo que el sistema cree que hay acá, ahora mismo.
    supabase.from(tabla).select("variante_id").eq("sede_id", persona.sedeId).gt("cantidad", 0),
  ]);

  const filas = exigir(resLineas, "lo que ya se contó");
  const conStock = exigir(resConStock, "el stock de esta tienda");

  const lineas: LineaContada[] = filas.map((f) => {
    const v = (Array.isArray(f.variantes) ? f.variantes[0] : f.variantes) as
      | { codigo: string | null; talla: string | null; color: string | null; productos: ProductoAnidado }
      | null;
    return {
      lineaId: f.id,
      varianteId: f.variante_id,
      codigo: v?.codigo ?? null,
      referencia: referenciaDe(v?.productos ?? null),
      talla: v?.talla ?? null,
      color: v?.color ?? null,
      contada: f.cantidad_contada,
      sistema: f.cantidad_sistema,
      contadaEn: f.contado_en,
    };
  });

  const yaContadas = new Set(lineas.map((l) => l.varianteId));
  const faltanPorContar = conStock.filter((s) => !yaContadas.has(s.variante_id)).length;

  return {
    id: conteo.id,
    ubicacion: conteo.ubicacion as "piso" | "almacen",
    alcance: conteo.alcance,
    nombre: conteo.nombre,
    abiertoEn: conteo.abierto_en,
    lineas,
    unidadesContadas: lineas.reduce((suma, l) => suma + l.contada, 0),
    variantesContadas: lineas.length,
    faltanPorContar,
  };
}

/**
 * El catálogo delgado para contar: lo justo para reconocer una prenda y encontrarla,
 * por escaneo o por texto.
 *
 * Trae el catálogo ENTERO (no solo lo que tiene stock acá) a propósito: contar es
 * justamente descubrir que hay algo donde el sistema decía que no había.
 */
export async function getCatalogoParaConteo(
  persona: PersonaActual,
  ubicacion: "piso" | "almacen" = "piso"
): Promise<CatalogoParaConteo> {
  const supabase = await createClient();
  const tabla = ubicacion === "almacen" ? "stock_almacen" : "stock";

  const [resVariantes, resStock, resCodigos] = await Promise.all([
    supabase
      .from("variantes")
      .select("id, codigo, sku, talla, color, precio, productos(referencia)")
      .order("codigo", { nullsFirst: false }),
    supabase.from(tabla).select("variante_id, cantidad").eq("sede_id", persona.sedeId),
    supabase.from("codigos_barras").select("codigo, variante_id"),
  ]);

  // Las tres son `exigir`: contar con un catálogo a medias produce ajustes que
  // descuadran stock real. Si algo falla, mejor no dibujar la pantalla.
  const variantes = exigir(resVariantes, "el catálogo para contar");
  const stock = exigir(resStock, "el stock de esta tienda");
  const codigos = exigir(resCodigos, "los códigos de barras");

  const stockPorVariante = new Map<string, number>(stock.map((s) => [s.variante_id, s.cantidad]));

  const porCodigo: Record<string, string> = {};
  for (const c of codigos) porCodigo[c.codigo] = c.variante_id;

  return {
    variantes: variantes.map((v) => ({
      varianteId: v.id,
      codigo: v.codigo,
      sku: v.sku,
      referencia: referenciaDe(v.productos as ProductoAnidado),
      talla: v.talla,
      color: v.color,
      precio: v.precio,
      enSistema: stockPorVariante.get(v.id) ?? 0,
    })),
    porCodigo,
  };
}

/** Una categoría, para clasificar una prenda que nace durante el conteo. */
export type CategoriaElegible = {
  id: string;
  familia: string;
  nombre: string;
  tallasSugeridas: string[] | null;
};

export async function getCategorias(): Promise<CategoriaElegible[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("categorias")
    .select("id, familia, nombre, tallas_sugeridas")
    .order("familia")
    .order("nombre");
  const filas = exigir(res, "las categorías del catálogo");
  return filas.map((c) => ({
    id: c.id,
    familia: c.familia,
    nombre: c.nombre,
    tallasSugeridas: c.tallas_sugeridas,
  }));
}

/** Los colores que la Encargada puede elegir al crear una prenda durante el conteo. */
export type ColorElegible = { codigo: string; nombre: string; hex: string | null };

export async function getColores(): Promise<ColorElegible[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("colores")
    .select("codigo, nombre, hex")
    .eq("activo", true)
    .order("orden");
  // `exigir` y no `tolerar`: sin colores no se puede crear una prenda (la RPC los exige),
  // así que una lista vacía por un fallo de red se vería como "no hay colores" y dejaría a
  // la Encargada trabada sin entender por qué.
  return exigir(res, "los colores del catálogo");
}

// ==================== EL CIERRE: qué cambiaría, y cuánto es en soles ====================



/**
 * Lo que pasaría si se cerrara el conteo ahora, valorizado.
 *
 * POR QUÉ ESTA FUNCIÓN Y NO LA RPC A SECAS. `previsualizar_cierre_conteo` devuelve
 * unidades, no plata — y con razón: el costo es un dato del catálogo, no del conteo, y
 * meterlo en la RPC ataría el cálculo contable a la mecánica de contar. La conversión
 * a soles vive acá, del lado que ya sabe leer el catálogo.
 *
 * Y ES LA CIFRA QUE DECIDE. Una lista de "faltan 47 unidades" no se puede aprobar: 47
 * medias y 47 abrigos son el mismo número y no el mismo problema. En soles al costo sí
 * se puede — y ese es el gesto que el cierre le pide a Felipe.
 *
 * LAS LÍNEAS SIN COSTO SE CUENTAN APARTE, no se tratan como cero. Durante el censo se
 * crean prendas al vuelo y muchas nacen sin costo; sumarlas como 0 daría una varianza
 * más chica que la real, que es la dirección en la que un número equivocado hace daño.
 */
export async function getVarianza(conteoId: string): Promise<Varianza> {
  const supabase = await createClient();

  const filas = exigir(
    await supabase.rpc("previsualizar_cierre_conteo", { p_conteo_id: conteoId }),
    "las diferencias del conteo"
  );

  const ids = [...new Set(filas.map((f) => f.variante_id).filter(Boolean))] as string[];
  const costos = ids.length
    ? exigir(
        await supabase.from("variantes").select("id, costo").in("id", ids),
        "los costos del catálogo"
      )
    : [];

  return resumirVarianza(filas, new Map(costos.map((c) => [c.id, Number(c.costo)])));
}
