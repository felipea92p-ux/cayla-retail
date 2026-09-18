import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { MoverMercaderiaFormV2 } from "@/components/MoverMercaderiaFormV2";

// Fase UI 1.1 (2026-09-12): pantalla nueva sobre `transferir` (V2). Ver
// `MoverMercaderiaFormV2.tsx` para el porqué el origen no es un campo del
// formulario y el destino sale siempre de `retail.ubicaciones`.
//
// Prellenado desde Resumen (2026-09-17, ADR-0097): `?origen=&destino=&variante=&cantidad=`.
// Resumen solo SUGIERE — el traslado se crea por este mismo formulario, con
// la misma RPC y la misma decisión humana. El origen por URL solo lo respeta
// un líder (puede operar cualquier sede); un integrante siempre despacha
// desde la suya. Todo lo que no calce (destino inexistente, variante sin
// stock movible en el origen) se ignora en silencio y el formulario arranca
// como siempre.
export default async function MoverMercaderiaPage({
  searchParams,
}: {
  searchParams: Promise<{ origen?: string; destino?: string; variante?: string; cantidad?: string }>;
}) {
  const [persona, params, ubicaciones] = await Promise.all([requirePersonaActualV2(), searchParams, getUbicaciones()]);

  const origen =
    persona.rol === "lider" && params.origen && ubicaciones.some((u) => u.id === params.origen)
      ? ubicaciones.find((u) => u.id === params.origen)!
      : { id: persona.ubicacionId, nombre: persona.ubicacionEtiqueta };

  const stockOrigen = await getStockPorUbicacion(origen.id);
  const destinos = ubicaciones.filter((u) => u.id !== origen.id);

  // `transferir()` sale del almacén de tienda, nunca del piso (mandar
  // mercadería a otra sede no debe tocar lo que la clienta ve hoy) —
  // 20260914210000_inventario_piso_almacen.sql. El tope que ve el
  // formulario tiene que ser ese mismo número, o dejaría pasar cantidades
  // que el RPC va a rechazar. En una ubicación sin piso/almacén (Taller,
  // `f.almacen === null`), el tope sigue siendo el total, como siempre.
  const variantesMovibles = stockOrigen
    .map((f) => ({
      varianteId: f.varianteId,
      sku: f.sku,
      referencia: f.referencia,
      talla: f.talla,
      color: f.color,
      cantidad: f.almacen ?? f.total,
    }))
    .filter((v) => v.cantidad > 0);

  // Si la sugerencia venía con un origen que esta persona no puede usar (un
  // integrante siempre despacha desde su sede), no se prellena NADA: sin esto
  // el destino "su propia sede" caería en silencio al primero de la lista y la
  // sugerencia quedaría invertida.
  const prellenar = !params.origen || params.origen === origen.id;
  const destinoInicialId = prellenar && params.destino && destinos.some((d) => d.id === params.destino) ? params.destino : undefined;
  const cantidadPedida = Number(params.cantidad);
  const lineaInicial =
    prellenar && params.variante && variantesMovibles.some((v) => v.varianteId === params.variante)
      ? { varianteId: params.variante, cantidad: Number.isInteger(cantidadPedida) && cantidadPedida > 0 ? cantidadPedida : 1 }
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · {origen.nombre}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Mover mercadería</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Cada traslado queda registrado como movimiento — no se edita el stock a mano.
        </p>
      </div>

      {destinos.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          No hay otra ubicación registrada todavía — un traslado necesita al menos dos.
        </p>
      ) : (
        <MoverMercaderiaFormV2
          origenId={origen.id}
          origenEtiqueta={origen.nombre}
          destinos={destinos}
          variantes={variantesMovibles}
          destinoInicialId={destinoInicialId}
          lineaInicial={lineaInicial}
        />
      )}
    </div>
  );
}
