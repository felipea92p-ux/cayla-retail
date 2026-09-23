import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { MoverMercaderiaFormV2 } from "@/components/MoverMercaderiaFormV2";
import { parsearLineasPrellenadas } from "@/lib/produccion-reglas";
import { InventarioHero, fotoHeroPorPantalla } from "@/components/InventarioHero";

// Fase UI 1.1 (2026-09-12): pantalla nueva sobre `transferir` (V2). Ver
// `MoverMercaderiaFormV2.tsx` para el porqué el origen no es un campo del
// formulario y el destino sale siempre de `retail.ubicaciones`.
//
// Prellenado desde Resumen (2026-09-17, ADR-0101): `?origen=&destino=&variante=&cantidad=`.
// Resumen solo SUGIERE — el traslado se crea por este mismo formulario, con
// la misma RPC y la misma decisión humana. El origen por URL solo lo respeta
// un líder (puede operar cualquier sede); un integrante siempre despacha
// desde la suya. Todo lo que no calce (destino inexistente, variante sin
// stock movible en el origen) se ignora en silencio y el formulario arranca
// como siempre.
//
// Prellenado desde Producción (2026-09-22, ADR-0133 F8): `?origen=<Taller>&lineas=<variante>:<cantidad>,…` — «Siguiente paso: llevarlas a las tiendas» de una orden
// cerrada. Varias líneas en vez de una; mismas reglas (solo se respeta lo que tiene stock movible en el origen, cada cantidad se topa al stock, y el destino
// lo elige quien traslada). `variante`/`cantidad` (una sola línea) siguen funcionando como antes.
export default async function MoverMercaderiaPage({
  searchParams,
}: {
  searchParams: Promise<{ origen?: string; destino?: string; variante?: string; cantidad?: string; lineas?: string }>;
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
  // `f.almacen === null`), el tope sigue siendo el total, como siempre. En ambos casos solo cuenta
  // lo DISPONIBLE: lo apartado para una clienta tampoco se puede mover (ADR-0141).
  const variantesMovibles = stockOrigen
    .map((f) => ({
      varianteId: f.varianteId,
      sku: f.sku,
      referencia: f.referencia,
      talla: f.talla,
      color: f.color,
      cantidad: f.almacenDisponible ?? f.disponible,
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
  const lineasIniciales = prellenar
    ? parsearLineasPrellenadas(params.lineas)
        .filter((l) => variantesMovibles.some((v) => v.varianteId === l.varianteId))
        .map((l) => ({ varianteId: l.varianteId, cantidad: Math.min(l.cantidad, variantesMovibles.find((v) => v.varianteId === l.varianteId)?.cantidad ?? l.cantidad) }))
    : [];

  return (
    <div className="space-y-6">
      <InventarioHero
        eyebrow={`Inventario · ${origen.nombre}`}
        titulo="Mover mercadería"
        descripcion="Cada traslado queda registrado como movimiento — no se edita el stock a mano."
        foto={fotoHeroPorPantalla("mover")}
        variante="integrado"
      />

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
          lineasIniciales={lineasIniciales}
        />
      )}
    </div>
  );
}
