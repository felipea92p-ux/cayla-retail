import { HandCoins, ShoppingBag } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getMiPlata } from "@/lib/mi-plata";
import { historialDeLaCompradora, movimientosDeLaCompradora, tituloDeLaLista } from "@/lib/mi-plata-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { AbrirRonda } from "@/components/mi-plata/AbrirRonda";
import { AccionDelDia } from "@/components/mi-plata/AccionDelDia";
import { AnotarPlata } from "@/components/mi-plata/AnotarPlata";
import { AnotarGasto } from "@/components/mi-plata/AnotarGasto";
import { Billetera } from "@/components/mi-plata/Billetera";
import { ListaDelDia } from "@/components/mi-plata/ListaDelDia";
import { MandarATienda } from "@/components/mi-plata/MandarATienda";
import { TerminarDia } from "@/components/mi-plata/TerminarDia";

// Compras ▸ Mis compras (ADR-0480, Compras simple): la pantalla de quien compra, hecha para el celular. Rediseño aprobado por
// Felipe el 2026-10-23: docs/maquetas/compras-formidable-2026-10/.
//
// Arriba, la billetera: cuánto tiene para comprar (su fondo más lo que Compras todavía revisa, menos lo comprado y gastado que Compras
// todavía no completa) y de dónde sale. Todo pasa dentro de una RONDA DE COMPRAS (20261023183000, Felipe 2026-10-23): sin una abierta, la
// pantalla pide abrirla y solo deja anotar la plata que le dieron. Con la ronda abierta, «¿Qué hiciste?»: «Compré ropa» en grande y, a
// su lado, «Me dieron plata» y «Gasté en otra cosa». Si falta mandar algo, una franja lo dice. Después «En esta ronda», todo en una sola
// lista, y al final «Cerrar mi ronda». En escritorio, la lista va a la derecha. Si la lectura falla, lo dice (principio 9): nunca «tienes S/ 0» inventado. Una terminal no
// tiene «tu plata». `?mandar=1` (desde «Compra guardada») abre «Mandar a la tienda».
export default async function MiPlataPage({ searchParams }: { searchParams: Promise<{ mandar?: string }> }) {
  const persona = await exigirModulo("ordenes_compra");
  const [plata, { mandar }] = await Promise.all([getMiPlata(), searchParams]);
  // Arriba lo de la ronda abierta; lo anterior, agrupado por ronda (Felipe 2026-10-23).
  const lista = plata?.persona ? movimientosDeLaCompradora(plata) : null;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Mis compras"
        subtitulo="Lo que tienes para comprar, lo que compraste y lo que mandas a la tienda."
      />

      {plata === null ? (
        <Aviso tono="error" titulo="No se pudo leer tu plata">
          Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.
        </Aviso>
      ) : !plata.persona ? (
        <Vacio icono={<HandCoins aria-hidden />} titulo="Entra con tu cuenta" guia="mi-plata.vacio">
          La plata para compras es de cada persona: desde una terminal no hay «tu plata». Entra con tu correo para anotarla.
        </Vacio>
      ) : (
        // Una sola columna en el celular; en escritorio, «Hoy» ocupa la derecha a todo lo alto y la última fila (1fr) se lleva el aire,
        // así las piezas de la izquierda no se separan.
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_auto_1fr] lg:gap-x-8">
          <div className="lg:col-start-1">
            <Billetera plata={plata} />
          </div>
          {plata.ronda.abierta ? (
            <section aria-label="¿Qué hiciste?" className="grid grid-cols-2 gap-2.5 lg:col-start-1">
              <AccionDelDia
                grande
                href="/compras/mi-plata/compra"
                guia="mi-plata.compre"
                titulo="Compré ropa"
                detalle="A un proveedor, en la calle o por pedido"
                icono={<ShoppingBag className="h-5 w-5" aria-hidden />}
              />
              <AnotarPlata puedeYaTenia={plata.puedeYaTenia} />
              <AnotarGasto />
            </section>
          ) : (
            // Sin ronda: abrirla es lo único que se pide. La plata que le dieron se puede anotar igual (Compras a veces la manda antes).
            <div className="flex flex-col gap-2.5 lg:col-start-1">
              <AbrirRonda ultimaCerrada={plata.ronda.ultimaCerrada} />
              <div className="grid grid-cols-2 gap-2.5">
                <AnotarPlata puedeYaTenia={plata.puedeYaTenia} ancha />
              </div>
            </div>
          )}
          {plata.porMandar.length > 0 && (
            <div className="lg:col-start-1">
              <MandarATienda porMandar={plata.porMandar} abrirAlCargar={mandar === "1"} />
            </div>
          )}
          <div className="min-w-0 lg:col-start-2 lg:row-span-5 lg:row-start-1">
            <ListaDelDia
              actuales={lista?.actuales ?? []}
              historial={historialDeLaCompradora(lista?.antes ?? [], plata.ronda.cerradas ?? [])}
              titulo={tituloDeLaLista(plata.ronda)}
            />
          </div>
          <div className="lg:col-start-1">
            <TerminarDia plata={plata} />
          </div>
        </div>
      )}
    </div>
  );
}
