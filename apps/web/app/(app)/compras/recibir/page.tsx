import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { listarPorRecibir, getLineasCompra, getRecepcionesRecientes, filtrosDesdeParams, type ParamsCompras } from "@/lib/compras";
import { RecepcionCompraFormV2 } from "@/components/RecepcionCompraFormV2";
import { RecepcionesRecientes } from "@/components/RecepcionesRecientes";
import { Paginacion, leerCursor } from "@/components/Paginacion";

// Recibir mercadería contra facturas (ADR-0035). Reemplaza como camino
// principal a /inventario/recibir, que queda para mercadería SIN factura
// (producción propia, ajustes). Un líder puede recibir en cualquier
// ubicación; una integrante solo en la suya (lo valida la RPC).
//
// Los filtros de URL (`filtrosDesdeParams`) se siguen aceptando por si un
// enlace llega con ?prov=…, pero la pantalla ya no dibuja el panel de
// filtros: el buscador vive dentro de la lista de pendientes del
// componente (2026-09-14, lista + panel), que filtra en memoria la página.
//
// `?vista=recibidas` (2026-09-17): hasta acá, esta pantalla solo mostraba lo
// PENDIENTE — una factura ya recibida por completo desaparecía sin dejar
// rastro visible (más allá del badge suelto en /compras). La pestaña nueva
// reusa `RecepcionesRecientes` (mismo componente que la versión sin
// factura de Inventario) en vez de tocar `RecepcionCompraFormV2` — ese
// componente ya maneja bastante estado (guía en armado, reparto por
// variante) como para sumarle una segunda vista adentro.
export default async function RecibirComprasPage({ searchParams }: { searchParams: Promise<ParamsCompras & { compra?: string; vista?: string }> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const vista = params.vista === "recibidas" ? "recibidas" : "pendientes";
  const encabezado = (
    <div>
      <p className="label-cayla text-[11px] text-tinta/65">Compras · {persona.ubicacionEtiqueta}</p>
      <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
      <p className="mt-1 text-sm text-tinta/65">
        {vista === "pendientes"
          ? "Toca la factura que cubre la guía, confirma lo que llegó y recibe. Cada prenda entra como movimiento — el stock no se edita a mano."
          : "Lo que ya se recibió contra una factura, guía por guía."}
      </p>
      <p className="mt-1 text-xs text-tinta/55">
        ¿Llegó algo sin factura (producción propia, ajuste)?{" "}
        <Link href="/inventario/recibir" className="hover:text-rojo">
          Recibir sin factura
        </Link>
        .
      </p>
    </div>
  );

  if (vista === "recibidas") {
    const recepciones = await getRecepcionesRecientes({ conFactura: true });
    return (
      <div className="space-y-6">
        {encabezado}
        <TabsRecibir activa="recibidas" />
        <RecepcionesRecientes recepciones={recepciones} vacio={`Todavía no se recibió ninguna factura en ${persona.ubicacionEtiqueta}.`} />
      </div>
    );
  }

  const { compra } = params;
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const [{ filas: compras, siguiente }, ubicaciones, catalogo] = await Promise.all([listarPorRecibir(filtros, cursor), getUbicaciones(), getCatalogo()]);
  // Las líneas se traen solo para las facturas de ESTA página (≤ 50).
  const lineas = await getLineasCompra(compras.map((c) => c.id));
  const ubicacionesPermitidas = persona.rol === "lider" ? ubicaciones : ubicaciones.filter((u) => u.id === persona.ubicacionId);

  return (
    <div className="space-y-6">
      {encabezado}
      <TabsRecibir activa="pendientes" />

      {compras.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? "Ninguna factura pendiente de recibir coincide con esos filtros. " : "No hay facturas con mercadería pendiente de recibir. "}
          <Link href="/compras/nueva" className="text-rojo hover:underline">
            Registrar una factura →
          </Link>
        </p>
      ) : (
        <RecepcionCompraFormV2
          compras={compras}
          lineas={lineas}
          variantes={catalogo
            .filter((v) => v.activo)
            .map((v) => ({
              varianteId: v.varianteId,
              sku: v.sku,
              talla: v.talla,
              color: v.color,
              productoId: v.productoId,
              referencia: v.referencia,
            }))}
          ubicaciones={ubicacionesPermitidas.map((u) => ({
            id: u.id,
            nombre: u.nombre,
          }))}
          ubicacionInicialId={persona.ubicacionId}
          compraInicialId={compra ?? null}
        />
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras/recibir" />
    </div>
  );
}

function TabsRecibir({ activa }: { activa: "pendientes" | "recibidas" }) {
  const secciones = [
    { valor: "pendientes" as const, etiqueta: "Pendientes", href: "/compras/recibir" },
    { valor: "recibidas" as const, etiqueta: "Recibidas recientemente", href: "/compras/recibir?vista=recibidas" },
  ];
  return (
    <div className="flex gap-1 border-b border-tinta/10">
      {secciones.map((s) => (
        <Link
          key={s.valor}
          href={s.href}
          aria-current={activa === s.valor ? "page" : undefined}
          className={`label-cayla -mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[11px] transition-colors ${
            activa === s.valor ? "border-rojo text-tinta" : "border-transparent text-tinta/65 hover:text-rojo"
          }`}
        >
          {s.etiqueta}
        </Link>
      ))}
    </div>
  );
}
