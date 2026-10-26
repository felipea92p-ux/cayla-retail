import { HandCoins, ShoppingBag } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getBancosParaPlata, getMiPlata, getMisEnvios } from "@/lib/mi-plata";
import { codigosPorCompra, enviosDeLaRonda, rondasConEnvios } from "@/lib/mis-envios-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { PASOS_DE_LA_RONDA, desdeRonda, historialDeLaCompradora, movimientosDeLaCompradora, pasoDeLaRonda, tituloDeLaLista } from "@/lib/mi-plata-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Aviso } from "@/components/ui/Aviso";
import { AbrirRonda } from "@/components/mi-plata/AbrirRonda";
import { AccionDelDia } from "@/components/mi-plata/AccionDelDia";
import { AnotarPlata } from "@/components/mi-plata/AnotarPlata";
import { AnotarGasto } from "@/components/mi-plata/AnotarGasto";
import { Billetera } from "@/components/mi-plata/Billetera";
import { CaminoDePasos } from "@/components/mi-plata/CaminoDePasos";
import { EnviosDeLaRonda } from "@/components/mi-plata/EnviosDeLaRonda";
import { ListaDelDia, RondasAnteriores } from "@/components/mi-plata/ListaDelDia";
import { MandarATienda } from "@/components/mi-plata/MandarATienda";
import { TerminarDia } from "@/components/mi-plata/TerminarDia";

// Compras ▸ Mis compras (ADR-0480, Compras simple): la pantalla de quien compra, hecha para el celular. Rediseño aprobado por
// Felipe el 2026-10-24: docs/maquetas/mis-compras-rediseno-2026-10/ (antes, 2026-10-23: compras-formidable-2026-10/).
//
// Arriba, el camino de la ronda (abre · anota · manda · ciérrala: en cuál va) y la billetera: cuánto tiene para comprar (su fondo más lo
// que Compras todavía revisa, menos lo comprado y gastado que Compras todavía no completa) con la cuenta de la ronda en tres columnas. Todo pasa dentro de una RONDA DE COMPRAS (20261023183000, Felipe 2026-10-23): sin una abierta, la
// pantalla pide abrirla y solo deja anotar la plata que le dieron. Con la ronda abierta, «¿Qué hiciste?»: «Compré ropa» en grande y, a
// su lado, «Me dieron plata» y «Gasté en otra cosa». Si falta mandar algo, una franja lo dice. Después «En esta ronda», todo en una sola
// lista, y al final «Cerrar mi ronda». En escritorio, la lista va a la derecha. Si la lectura falla, lo dice (principio 9): nunca «tienes S/ 0» inventado. Una terminal no
// tiene «tu plata». `?mandar=1` (desde «Compra guardada») abre «Mandar a la tienda».
export default async function MiPlataPage({ searchParams }: { searchParams: Promise<{ mandar?: string }> }) {
  const persona = await exigirModulo("ordenes_compra");
  const [plata, bancos, envios, { mandar }] = await Promise.all([getMiPlata(), getBancosParaPlata(), getMisEnvios(), searchParams]);
  // Arriba lo de la ronda abierta; lo anterior, agrupado por ronda (Felipe 2026-10-23). Cada compra ya mandada dice el código de su envío
  // (Felipe 2026-10-26); si «Mis envíos» no se pudo leer, Mis compras sigue sin ellos.
  const lista = plata?.persona ? movimientosDeLaCompradora(plata, codigosPorCompra(envios ?? [])) : null;
  const rondaAbierta = plata?.persona ? plata.ronda.abierta : null;
  const hoy = hoyLima();
  const anteriores = plata?.persona ? historialDeLaCompradora(lista?.antes ?? [], plata.ronda.cerradas ?? []) : [];

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Mis compras"
        subtitulo="Lo que tienes para comprar, lo que compraste y lo que mandas a la tienda."
        // Con la ronda abierta, «Envíos de esta ronda» ya trae su «Ver todos»; sin ella (ronda cerrada), Mis envíos sigue a un toque aquí arriba: ahí viven los códigos de antes.
        acciones={
          plata?.persona && !plata.ronda.abierta && envios !== null && envios.length > 0 ? (
            <BotonVer href="/compras/mi-plata/envios" guia="mi-plata.mis-envios">
              Mis envíos
            </BotonVer>
          ) : undefined
        }
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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_auto_auto_1fr] lg:gap-x-8">
          <div className="flex flex-col gap-3.5 lg:col-start-1">
            <CaminoDePasos pasos={PASOS_DE_LA_RONDA} ahora={pasoDeLaRonda(plata)} etiqueta="Tu ronda, paso a paso" guia="mi-plata.camino" />
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
              <AnotarPlata puedeYaTenia={plata.puedeYaTenia} bancos={bancos} />
              <AnotarGasto />
            </section>
          ) : (
            // Sin ronda: abrirla es lo único que se pide. La plata que le dieron se puede anotar igual (Compras a veces la manda antes).
            <div className="flex flex-col gap-2.5 lg:col-start-1">
              <AbrirRonda ultimaCerrada={plata.ronda.ultimaCerrada} />
              <div className="grid grid-cols-2 gap-2.5">
                <AnotarPlata puedeYaTenia={plata.puedeYaTenia} bancos={bancos} ancha />
              </div>
            </div>
          )}
          <MandarATienda porMandar={plata.porMandar} abrirAlCargar={mandar === "1"} className="lg:col-start-1" />
          {/* Los envíos van pegados a «Falta mandar»: es el mismo paso del camino (Manda). En el celular quedan antes de la lista larga de la
              ronda, donde no se pierden; en escritorio, en la columna de las acciones. */}
          {rondaAbierta && envios !== null && (
            <div className="lg:col-start-1">
              <EnviosDeLaRonda envios={enviosDeLaRonda(envios, rondaAbierta.id)} texto={rondaAbierta.texto} hoy={hoy} />
            </div>
          )}
          <div className="min-w-0 lg:col-start-2 lg:row-span-6 lg:row-start-1">
            <ListaDelDia
              actuales={lista?.actuales ?? []}
              titulo={tituloDeLaLista(plata.ronda)}
              desde={plata.ronda.abierta ? desdeRonda(plata.ronda.abierta.abiertaEn, plata.hoy.fecha) : null}
            />
          </div>
          <div className="lg:col-start-1">
            <TerminarDia plata={plata} envios={envios === null ? null : enviosDeLaRonda(envios, rondaAbierta?.id ?? null)} hoy={hoy} />
          </div>
          {anteriores.length > 0 && (
            <div className="lg:col-start-1">
              <RondasAnteriores historial={anteriores} envios={envios === null ? null : rondasConEnvios(envios, rondaAbierta?.id ?? null)} hoy={hoy} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
