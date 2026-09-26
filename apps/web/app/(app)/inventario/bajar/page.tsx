import Link from "next/link";
import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { encontrarPorTipo, getSububicaciones } from "@/lib/sububicaciones";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { aPrendasBajables } from "@/lib/bajada-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { BajarAlPisoForm } from "@/components/BajarAlPisoForm";

// «Bajar prendas al piso» (ADR-0208, paso 1): Frescura del piso solo mide algo si la bajada se registra al colgar la
// prenda, no al cobrarla. La tienda es siempre la sede activa (quien baja está parada ahí); la lista se arma en el
// navegador y la base se toca una sola vez, al confirmar (`bajar_al_piso`, todo o nada).
// Se llega por el botón «Bajar al piso» de Existencias (Felipe, 2026-09-25): el lateral no tiene entrada propia.
export default async function BajarAlPisoPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("bajada_piso");
  const sede = persona.ubicacionEtiqueta;
  // En paralelo: casi siempre es una tienda que separa piso y almacén, y así no se espera dos viajes a la base.
  const [sububicaciones, filas] = await Promise.all([getSububicaciones(persona.ubicacionId), getStockPorUbicacion(persona.ubicacionId)]);
  const separaPisoYAlmacen = encontrarPorTipo(sububicaciones, "piso_venta") !== null && encontrarPorTipo(sububicaciones, "almacen_tienda") !== null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo="Bajar prendas al piso"
        subtitulo="Escanea cada prenda que vas a colgar. Al final confirmas y queda registrado de una vez."
        // La vuelta es un botón de la cabecera, como «← Traslados» y «← Conteos» en sus detalles. Solo si puede entrar a
        // Existencias: a quien no la ve, el enlace lo dejaría en «Sin acceso».
        pie={
          veModulo(persona, "existencias") && (
            <Link href="/inventario" className="btn-cayla btn-secundario">
              ← Existencias
            </Link>
          )
        }
      />

      {separaPisoYAlmacen ? (
        // `key`: si el líder cambia de sede, la lista de la otra tienda no se arrastra a esta.
        <BajarAlPisoForm key={persona.ubicacionId} ubicacionId={persona.ubicacionId} sede={sede} prendas={aPrendasBajables(filas)} />
      ) : (
        <p className="nota-cayla">{sede} todavía no separa piso y almacén, así que aquí no hay nada que bajar.</p>
      )}
    </div>
  );
}
