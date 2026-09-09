import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { RecibirLoteForm } from "@/components/RecibirLoteForm";
import { Ayuda } from "@/components/Ayuda";
import { InventarioNav } from "@/components/InventarioNav";

export default async function RecibirLotePage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  // Ninguna de estas depende del resultado de otra — antes iban en varias rondas
  // secuenciales esperando cada una a la anterior sin motivo. Una sola ronda.
  // (El almacén ya no es una sede aparte: es el contenedor tipo='almacen' de la
  // propia sede, por eso la consulta de `contenedores` va aquí directo con
  // persona.sedeId, sin necesitar resolver ninguna sede-almacén primero.)
  const [resContenedores, resProductos, resCategorias, resProveedores, variantes, resOrdenes] =
    await Promise.all([
      supabase.from("contenedores").select("id, codigo, tipo").eq("sede_id", persona.sedeId).order("codigo"),
      supabase.from("productos").select("id, referencia, categoria_id").eq("estado", "activa"),
      supabase.from("categorias").select("id, familia, nombre, tallas_sugeridas").order("familia").order("nombre"),
      supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
      getCatalogoConStock(persona),
      supabase
        .from("ordenes_compra")
        .select("id, proveedor, monto_estimado")
        .eq("sede_destino_id", persona.sedeId)
        .in("estado", ["pendiente", "confirmada"])
        .order("created_at", { ascending: false }),
    ]);

  // El caso feo de esta pantalla: si la consulta de contenedores falla y nadie lo revisa,
  // `contenedorAlmacen` queda en null y la pantalla dice «tu sede no tiene un almacen
  // configurado» — un mensaje FALSO que manda a configurar lo que ya estaba, con el fardo
  // abierto en el mostrador. Un error se entiende; ese mensaje engana.
  const contenedores = exigir(resContenedores, "los contenedores de la sede");
  const productos = exigir(resProductos, "los productos del catalogo");
  const categoriasRows = exigir(resCategorias, "las categorias");
  const proveedoresRows = exigir(resProveedores, "el directorio de proveedores");
  const ordenesRows = exigir(resOrdenes, "las ordenes de compra pendientes");

  const contenedorAlmacen = contenedores.find((c) => c.tipo === "almacen") ?? null;

  if (!contenedorAlmacen) {
    return (
      <div className="space-y-6">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
        </div>
        <InventarioNav />
        <p className="card-cayla p-5 text-sm text-tinta/75">
          Tu sede ({persona.sedeCodigo}) no tiene un almacén configurado — esta pantalla es solo para sedes con inventario.
        </p>
      </div>
    );
  }

  // Producciones del Taller en camino a esta tienda: DESACTIVADO a propósito.
  // `ordenes_produccion` es el modelo viejo; `producciones` (desde 0025-0029) lo
  // reemplazó, pero nunca se propagó — `lotes` no tiene columna para ligar una
  // producción nueva, así que "ya recibida" no se puede calcular hoy. Reconciliar
  // los dos modelos es tarea aparte, decidida con Felipe 2026-09-03 (ver
  // docs/BACKLOG.md, ADR-0004). Mientras tanto, vacío en vez de mostrar datos que
  // no distinguen pendiente de ya recibida.
  const produccionesPendientes: { id: string; descripcion: string }[] = [];

  const variantesExistentes = variantes.map((v) => ({
    varianteId: v.varianteId,
    sku: v.sku,
    referencia: v.referencia,
    talla: v.talla,
    color: v.color,
  }));

  const productosExistentes = productos.map((p) => ({
    id: p.id,
    referencia: p.referencia,
    categoriaId: p.categoria_id,
  }));

  const categorias = categoriasRows.map((c) => ({
    id: c.id,
    familia: c.familia,
    nombre: c.nombre,
    tallasSugeridas: c.tallas_sugeridas,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Recibir mercadería
          <Ayuda titulo="Recibir mercadería">
            Es el momento en que un fardo se vuelve inventario. Con las prendas en la mano cuentas
            cuántas llegaron de cada talla y color, y el sistema las suma al ALMACÉN de tu sede, no
            al piso de venta: para venderlas hay que bajarlas después con «Bajar a tienda». Lo que
            entra se registra el día que entra — si se deja para después, el stock deja de servir
            para decidir nada.
          </Ayuda>
        </h1>
      </div>

      <InventarioNav />

      <RecibirLoteForm
        sedeId={persona.sedeId}
        sedeCodigo={persona.sedeCodigo}
        contenedorAlmacenId={contenedorAlmacen.id}
        contenedores={contenedores ?? []}
        productosExistentes={productosExistentes}
        variantesExistentes={variantesExistentes}
        categorias={categorias}
        proveedoresDirectorio={proveedoresRows ?? []}
        ordenesPendientes={(ordenesRows ?? []).map((o) => ({
          id: o.id,
          proveedor: o.proveedor,
          montoEstimado: o.monto_estimado != null ? Number(o.monto_estimado) : null,
        }))}
        produccionesPendientes={produccionesPendientes}
      />
    </div>
  );
}
