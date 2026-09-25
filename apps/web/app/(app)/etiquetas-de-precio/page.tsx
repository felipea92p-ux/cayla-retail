import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getEtiquetasDePrecio, type OrigenEtiquetas } from "@/lib/etiquetas-precio";
import { encabezadoDeEtiquetas, fechaEtiqueta, idsDeParam, type OrigenDeTexto } from "@/lib/etiqueta-precio-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { ImprimirEtiquetasPrecio } from "@/components/ImprimirEtiquetasPrecio";

// Etiquetas de precio (ADR-0180). Se llega desde:
//   - el resultado de Recibir (`?lotes=` con los lotes del envío) o de Ingreso sin comprobante (`?lotes=` con su lote);
//   - una orden cerrada del Taller (`?produccion=`);
//   - una campaña (`?campana=`): sus prendas en la tienda, con el precio de campaña o, si ya terminó, el normal;
//   - un producto (`?producto=`): sus tallas y colores en la tienda.
// La etiqueta dice lo que la caja cobra HOY: con campaña vigente, el precio rebajado (paso 2, ADR-0182).
//
// No es un módulo del menú (ADR-0161): es la salida de otras pantallas que ya tienen su módulo, así que no lleva
// `exigirModulo`. Lo que cuida los datos es la base: `movimientos_select` y `stock_select` solo dejan ver lo de las
// sedes que uno opera, y un id escrito a mano de otra tienda devuelve una lista vacía.
type Params = { lotes?: string | string[]; produccion?: string; campana?: string; producto?: string };

export default async function EtiquetasDePrecioPage({ searchParams }: { searchParams: Promise<Params> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const hoy = hoyLima();
  const lotes = idsDeParam(params.lotes);
  const [produccion] = idsDeParam(params.produccion);
  const [campana] = idsDeParam(params.campana);
  const [producto] = idsDeParam(params.producto);

  const origen: OrigenEtiquetas | null = produccion
    ? { tipo: "produccion", id: produccion }
    : lotes.length > 0
      ? { tipo: "lotes", ids: lotes }
      : campana
        ? { tipo: "campana", id: campana, ubicacionId: persona.ubicacionId }
        : producto
          ? { tipo: "producto", id: producto, ubicacionId: persona.ubicacionId }
          : null;
  const datos = origen ? await getEtiquetasDePrecio(origen, hoy) : { etiquetas: [], sinCodigo: [] };

  const texto: OrigenDeTexto =
    origen?.tipo === "campana"
      ? { tipo: "campana", campana: datos.campana ?? null }
      : origen?.tipo === "producto"
        ? { tipo: "producto", nombre: datos.producto ?? null }
        : origen
          ? { tipo: origen.tipo }
          : { tipo: "ninguno" };
  const cuenta = {
    unidades: datos.etiquetas.reduce((a, e) => a + e.cantidad, 0),
    modelos: new Set(datos.etiquetas.map((e) => e.prenda)).size,
  };

  return (
    <ImprimirEtiquetasPrecio
      encabezado={encabezadoDeEtiquetas(texto, cuenta, persona.ubicacionEtiqueta)}
      etiquetas={datos.etiquetas}
      sinCodigo={datos.sinCodigo}
      impreso={fechaEtiqueta(hoy)}
    />
  );
}
