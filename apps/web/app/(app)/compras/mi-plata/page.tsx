import { HandCoins, ShoppingBag } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getBancosParaPlata, getMiPlata, getMisEnvios } from "@/lib/mi-plata";
import { codigosPorCompra, enviosDeLaFila, enviosDeLaRonda, rondasConEnvios } from "@/lib/mis-envios-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { PASOS_DE_LA_RONDA, desdeRonda, historialDeLaCompradora, movimientosDeLaCompradora, pasoDeLaRonda, tituloDeLaLista, ultimaRondaDelHistorial } from "@/lib/mi-plata-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Aviso } from "@/components/ui/Aviso";
import { AbrirRonda } from "@/components/mi-plata/AbrirRonda";
import { AccionDelDia } from "@/components/mi-plata/AccionDelDia";
import { AnotarPlata } from "@/components/mi-plata/AnotarPlata";
import { AnotarGasto } from "@/components/mi-plata/AnotarGasto";
import { PrimeraRonda, RondaVacia } from "@/components/mi-plata/RondaVacia";
import { Billetera } from "@/components/mi-plata/Billetera";
import { CaminoDePasos } from "@/components/mi-plata/CaminoDePasos";
import { EnviosDeLaRonda } from "@/components/mi-plata/EnviosDeLaRonda";
import { ListaDelDia, RondasAnteriores } from "@/components/mi-plata/ListaDelDia";
import { UltimaRonda } from "@/components/mi-plata/UltimaRonda";
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
  // Una ronda recién abierta, sin nada: en PC, un solo bloque que dice cómo sigue (en vez de dos columnas con un renglón cada una).
  const rondaVacia =
    rondaAbierta !== null &&
    (lista?.actuales.length ?? 0) === 0 &&
    (plata?.porMandar.length ?? 0) === 0 &&
    envios !== null &&
    enviosDeLaRonda(envios, rondaAbierta.id).length === 0;
  // «Manda» (lo que falta mandar y los envíos con su código) en PC solo se dibuja si tiene algo que mostrar; el celular siempre lo trae en su
  // lugar (si está vacío no ocupa nada). Con prendas por mandar y la ronda ya cerrada, «Manda» baja sobre el registro (segunda columna): no
  // desaparece en PC mientras en el celular sí se ve.
  const conManda = plata?.persona === true && !rondaVacia && (plata.porMandar.length > 0 || (rondaAbierta !== null && envios !== null));
  // Tres columnas solo con la ronda abierta y algo en «Manda»; desde 1280 px (de 1024 a 1279, «Manda» y el registro se apilan en la segunda).
  const tres = conManda && rondaAbierta !== null;
  const anteriores = plata?.persona ? historialDeLaCompradora(lista?.antes ?? [], plata.ronda.cerradas ?? []) : [];
  // Sin ronda abierta (Felipe 2026-10-27, «muy básico»): lo primero es cómo terminó la última, y el resto del historial se ve de una vez en
  // vez de plegado tras un «Ver 2». La lista de «Antes de abrir tu ronda» solo se dibuja si hay algo anotado.
  const ultima = plata?.persona && !rondaAbierta ? ultimaRondaDelHistorial(anteriores) : null;
  const rondasEnvios = envios === null ? null : rondasConEnvios(envios, rondaAbierta?.id ?? null);
  const sinHistoria = plata?.persona === true && !rondaAbierta && !ultima && (lista?.actuales.length ?? 0) === 0 && anteriores.length === 0;

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
        // Una sola columna en el celular, en este orden: camino y plata · acciones · falta mandar · envíos · lista de la ronda · cerrar ·
        // rondas anteriores. En escritorio (Felipe 2026-10-26, «A · tres columnas», docs/maquetas/mis-compras-envios-pc-2026-10/) el mismo
        // contenido se reparte como se trabaja: tu plata y lo que haces (con «Cerrar mi ronda» debajo) · «Manda» · el registro de la ronda y las
        // anteriores. Las cajas de cada columna «desaparecen» en el celular (`contents`) y en PC se colocan por su columna y su fila: el DOM
        // —y con él el teclado y el lector de pantalla— sigue el orden del celular, sin `order`, salvo UN par (abajo). «Cerrar mi ronda» va en
        // la segunda fila (`1fr`) de su columna: las cajas de la derecha cruzan las dos filas y su alto no la empuja hacia abajo.
        // El par: «Rondas anteriores» vive dentro de la columna del registro (debajo de la lista, en PC) y por eso, en el DOM, va antes que
        // «Cerrar mi ronda»; en el celular `order-1` la deja después, como siempre. Las dos son lo último de la pantalla.
        <div
          className={`grid gap-4 lg:items-start lg:gap-x-7 ${rondaAbierta ? "lg:grid-rows-[auto_1fr]" : "lg:grid-rows-[auto]"} ${
            tres
              ? "lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)_minmax(0,1fr)]"
              : rondaVacia
                ? "lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]"
                : "lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
          }`}
        >
          <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-4">
            <div className="flex flex-col gap-3.5">
              <CaminoDePasos pasos={PASOS_DE_LA_RONDA} ahora={pasoDeLaRonda(plata)} etiqueta="Tu ronda, paso a paso" guia="mi-plata.camino" />
              <Billetera plata={plata} />
            </div>
            {plata.ronda.abierta ? (
              <section aria-label="¿Qué hiciste?" className="grid grid-cols-2 gap-2.5">
                <AccionDelDia
                  grande
                  href="/compras/mi-plata/compra"
                  guia="mi-plata.compre"
                  titulo="Apunte de compras"
                  detalle="A un proveedor, en la calle o por pedido"
                  icono={<ShoppingBag className="h-5 w-5" aria-hidden />}
                />
                <AnotarPlata puedeYaTenia={plata.puedeYaTenia} bancos={bancos} />
                <AnotarGasto />
              </section>
            ) : (
              // Sin ronda: abrirla es lo único que se pide. La plata que le dieron se puede anotar igual (Compras a veces la manda antes).
              <div className="flex flex-col gap-2.5">
                <AbrirRonda ultimaCerrada={plata.ronda.ultimaCerrada} />
                <div className="grid grid-cols-2 gap-2.5">
                  <AnotarPlata puedeYaTenia={plata.puedeYaTenia} bancos={bancos} ancha />
                </div>
              </div>
            )}
          </div>
          {/* La columna de la derecha (y, de 1024 a 1279 px con «Manda», la segunda): «Manda» arriba y el registro debajo. A 1280 px o más con
              la ronda abierta cada una es su propia columna. */}
          <div className={`contents lg:row-span-full lg:col-start-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-4 ${tres ? "xl:contents" : ""}`}>
            {/* Los envíos van pegados a «Falta mandar»: es el mismo paso del camino (Manda). */}
            <div className={conManda ? `contents lg:flex lg:flex-col lg:gap-4 ${tres ? "xl:col-start-2 xl:row-span-full" : ""}` : "contents lg:hidden"}>
              <MandarATienda porMandar={plata.porMandar} abrirAlCargar={mandar === "1"} />
              {rondaAbierta && envios !== null && <EnviosDeLaRonda envios={enviosDeLaRonda(envios, rondaAbierta.id)} texto={rondaAbierta.texto} hoy={hoy} />}
            </div>
            <div className={`contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4 ${tres ? "xl:col-start-3 xl:row-span-full" : ""}`}>
              {rondaAbierta && rondaVacia && <RondaVacia texto={rondaAbierta.texto} />}
              {ultima && (
                <div className="min-w-0">
                  <UltimaRonda u={ultima} envios={enviosDeLaFila(rondasEnvios, ultima.ronda.clave)} hoy={hoy} />
                </div>
              )}
              {sinHistoria && <PrimeraRonda />}
              {/* Sin ronda abierta y nada anotado, la lista no dibuja nada: tampoco su caja, que sumaba un hueco de más entre las tarjetas. */}
              {(rondaAbierta || (lista?.actuales.length ?? 0) > 0) && (
                <div className={`min-w-0 ${rondaVacia ? "lg:hidden" : ""}`}>
                  <ListaDelDia
                    actuales={lista?.actuales ?? []}
                    titulo={tituloDeLaLista(plata.ronda)}
                    desde={plata.ronda.abierta ? desdeRonda(plata.ronda.abierta.abiertaEn, plata.hoy.fecha) : null}
                    ocultarSiVacia={!rondaAbierta}
                  />
                </div>
              )}
              {(ultima ? ultima.resto : anteriores).length > 0 && (
                <div className="order-1 lg:order-none">
                  <RondasAnteriores historial={ultima ? ultima.resto : anteriores} envios={rondasEnvios} hoy={hoy} visibles={rondaAbierta ? undefined : 4} />
                </div>
              )}
            </div>
          </div>
          {rondaAbierta && (
            <div className="lg:col-start-1 lg:row-start-2">
              <TerminarDia plata={plata} envios={envios === null ? null : enviosDeLaRonda(envios, rondaAbierta.id)} hoy={hoy} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
