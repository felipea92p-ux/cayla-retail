import { Volver } from "@/components/ui/Volver";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { CuadrarPisoForm } from "@/components/cuadre-piso/CuadrarPisoForm";
import { exigirModulo } from "@/lib/persona-actual";
import { encontrarPorTipo, getSububicaciones } from "@/lib/sububicaciones";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { getCatalogoConteo } from "@/lib/conteos";
import { getCuadrePisoEstado } from "@/lib/cuadre-piso";
import type { PrendaCuadre, StockLibre } from "@/lib/cuadre-piso-reglas";

// «Cuadrar el piso» (ADR-0328, decisión técnica 4). TRU tiene en el sistema 138 colgadas y 635 guardadas; en la tienda cuelgan
// 600–750 y hay más de 200 guardadas. Se arregla una vez por sede: se escanea lo que de verdad está GUARDADO y lo que el sistema
// tiene en el almacén y nadie escaneó pasa al piso en un solo movimiento (`cuadrar_piso`, todo o nada). La sede es siempre la
// activa de quien entra, como en «Bajar al piso»; la lista se arma en el navegador y la base se toca para revisar y una vez para
// confirmar. Se llega por el botón «Cuadrar el piso» de Existencias (lo ve quien ve Existencias: escanea la cuenta Almacén y confirma
// un líder en el mismo equipo); el lateral no tiene entrada propia.
export default async function CuadrarPisoPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("existencias");
  const sede = persona.ubicacionEtiqueta;
  const sububicaciones = await getSububicaciones(persona.ubicacionId);
  const separaPisoYAlmacen = encontrarPorTipo(sububicaciones, "piso_venta") !== null && encontrarPorTipo(sububicaciones, "almacen_tienda") !== null;

  const encabezado = (
    <EncabezadoPagina
      sede={sede}
      titulo="Cuadrar el piso"
      subtitulo="Escanea lo que de verdad está guardado. Lo que el sistema tiene en el almacén y nadie escaneó pasa al piso, en un solo movimiento."
      volver={<Volver forma="flecha" href="/inventario" a="Existencias" />}
    />
  );

  if (!separaPisoYAlmacen) {
    return (
      <div className="space-y-6">
        {encabezado}
        <p className="nota-cayla">{sede} todavía no separa piso y almacén, así que aquí no hay piso que cuadrar.</p>
      </div>
    );
  }

  // En paralelo: el catálogo ENTERO (una prenda guardada que el sistema no tiene en la sede también se escanea: es una «no
  // cargada»), lo libre de la sede para el aviso «no cargada» mientras se escanea, y la fecha del último cuadre.
  const [catalogo, filas, cuadre] = await Promise.all([getCatalogoConteo(), getStockPorUbicacion(persona.ubicacionId), getCuadrePisoEstado(persona.ubicacionId)]);
  const prendas: PrendaCuadre[] = catalogo.map((p) => ({
    varianteId: p.varianteId,
    sku: p.sku,
    referencia: p.referencia,
    talla: p.talla,
    color: p.color,
    codigosBarras: p.codigosBarras,
    fotoUrl: p.fotoUrl,
    activo: p.activo,
  }));
  const libre: Record<string, StockLibre> = Object.fromEntries(
    filas.map((f) => [f.varianteId, { almacen: Math.max(0, f.almacenDisponible ?? 0), piso: Math.max(0, f.pisoDisponible ?? 0) }]),
  );

  return (
    <div className="space-y-6 pb-32 sm:pb-24">
      {encabezado}
      {cuadre.estado ? (
        // `key`: si el líder cambia de sede, lo escaneado en otra tienda no se arrastra a esta (el borrador es por sede).
        <CuadrarPisoForm
          key={persona.ubicacionId}
          ubicacionId={persona.ubicacionId}
          sede={sede}
          prendas={prendas}
          libre={libre}
          estado={cuadre.estado}
          esLider={persona.rol === "lider"}
          ahoraServidor={new Date().toISOString()}
        />
      ) : (
        <p role="alert" className="nota-cayla">
          {cuadre.fallo}
        </p>
      )}
    </div>
  );
}
