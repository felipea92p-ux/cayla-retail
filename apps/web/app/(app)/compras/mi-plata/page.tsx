import { HandCoins } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getBancosParaPlata, getMiPlata, getMisEnvios } from "@/lib/mi-plata";
import { codigosPorCompra, enviosDeLaFila, rondasConEnvios } from "@/lib/mis-envios-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { PASOS_DE_LA_RONDA, historialDeLaCompradora, movimientosDeLaCompradora, pasoDeLaRonda, tituloDeLaLista, ultimaRondaDelHistorial } from "@/lib/mi-plata-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Aviso } from "@/components/ui/Aviso";
import { AbrirRonda } from "@/components/mi-plata/AbrirRonda";
import { AnotarPlata } from "@/components/mi-plata/AnotarPlata";
import { PrimeraRonda } from "@/components/mi-plata/RondaVacia";
import { Billetera } from "@/components/mi-plata/Billetera";
import { CaminoDePasos } from "@/components/mi-plata/CaminoDePasos";
import { ListaDelDia, RondasAnteriores } from "@/components/mi-plata/ListaDelDia";
import { UltimaRonda } from "@/components/mi-plata/UltimaRonda";
import { MandarATienda } from "@/components/mi-plata/MandarATienda";
import { ParaMandar } from "@/components/mi-plata/ParaMandar";
import { MesaDeLaRonda } from "@/components/mi-plata/MesaDeLaRonda";

// Compras ▸ Mis compras (ADR-0480, Compras simple): la pantalla de quien compra. Todo pasa dentro de una RONDA DE COMPRAS (20261023183000,
// Felipe 2026-10-23): sin una abierta, la pantalla pide abrirla (y cuenta cómo terminó la última) y solo deja anotar la plata que le dieron.
// Con la ronda abierta es «La mesa de la ronda» (`MesaDeLaRonda`, maqueta docs/maquetas/mis-compras-pc-mesa-2026-10/, Felipe 2026-10-28, ADR-0559):
// el camino de la ronda, su plata y lo que hace («Apunte de compras», «Me dieron plata», «Gasté en otra cosa»), lo que pasó en la ronda y lo que
// falta mandar, «Cerrar mi ronda» y las rondas anteriores; en el celular una sola columna y en PC una rejilla. Si la lectura falla, lo dice
// (principio 9): nunca «tienes S/ 0» inventado. Una terminal no tiene «tu plata». `?mandar=1` (desde «Compra guardada») abre «Mandar a la tienda».
export default async function MiPlataPage({ searchParams }: { searchParams: Promise<{ mandar?: string }> }) {
  const persona = await exigirModulo("ordenes_compra");
  const [plata, bancos, envios, { mandar }] = await Promise.all([getMiPlata(), getBancosParaPlata(), getMisEnvios(), searchParams]);
  // Arriba lo de la ronda abierta; lo anterior, agrupado por ronda (Felipe 2026-10-23). Cada compra ya mandada dice el código de su envío
  // (Felipe 2026-10-26); si «Mis envíos» no se pudo leer, Mis compras sigue sin ellos.
  const lista = plata?.persona ? movimientosDeLaCompradora(plata, codigosPorCompra(envios ?? [])) : null;
  const rondaAbierta = plata?.persona ? plata.ronda.abierta : null;
  const hoy = hoyLima();
  // «Manda» (lo que falta mandar) sin ronda abierta: solo si hay prendas por mandar de una ronda ya cerrada; baja sobre el registro (Felipe 2026-10-26).
  const conManda = plata?.persona === true && plata.porMandar.length > 0;
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
        // Con la ronda abierta, «Para mandar» ya trae su «Ver todos»; sin ella (ronda cerrada), Mis envíos sigue a un toque aquí arriba: ahí viven los códigos de antes.
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
      ) : plata.ronda.abierta ? (
        <MesaDeLaRonda
          plata={plata}
          ronda={plata.ronda.abierta}
          bancos={bancos}
          actuales={lista?.actuales ?? []}
          anteriores={anteriores}
          envios={envios}
          rondasEnvios={rondasEnvios}
          hoy={hoy}
          mandar={mandar === "1"}
        />
      ) : (
        // Sin ronda abierta: a la izquierda tu plata y abrir la ronda; a la derecha cómo terminó la última (o la lista de lo anotado) y las
        // rondas anteriores. En el celular una sola columna, en el mismo orden. Con prendas por mandar de una ronda cerrada, «Para mandar» baja
        // sobre el registro (Felipe 2026-10-26: no desaparece en PC mientras en el celular sí se ve).
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-x-7">
          <div className="contents lg:flex lg:flex-col lg:gap-4">
            <div className="flex flex-col gap-3.5">
              <CaminoDePasos pasos={PASOS_DE_LA_RONDA} ahora={pasoDeLaRonda(plata)} etiqueta="Tu ronda, paso a paso" guia="mi-plata.camino" />
              <Billetera plata={plata} />
            </div>
            {/* Sin ronda: abrirla es lo único que se pide. La plata que le dieron se puede anotar igual (Compras a veces la manda antes). */}
            <div className="flex flex-col gap-2.5">
              <AbrirRonda ultimaCerrada={plata.ronda.ultimaCerrada} />
              <div className="grid grid-cols-2 gap-2.5">
                <AnotarPlata puedeYaTenia={plata.puedeYaTenia} bancos={bancos} ancha />
              </div>
            </div>
          </div>
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            {/* La hoja «Mandar a la tienda» vive aquí sin su franja: la tarjeta de abajo trae el botón que la abre. */}
            <MandarATienda porMandar={plata.porMandar} abrirAlCargar={mandar === "1"} sinFranja />
            {conManda && <ParaMandar porMandar={plata.porMandar} envios={null} texto={null} hoy={hoy} />}
            {ultima && (
              <div className="min-w-0">
                <UltimaRonda u={ultima} envios={enviosDeLaFila(rondasEnvios, ultima.ronda.clave)} hoy={hoy} />
              </div>
            )}
            {sinHistoria && <PrimeraRonda />}
            {/* Sin nada anotado, la lista no dibuja nada: tampoco su caja, que sumaba un hueco de más entre las tarjetas. */}
            {(lista?.actuales.length ?? 0) > 0 && (
              <div className="min-w-0">
                <ListaDelDia actuales={lista?.actuales ?? []} titulo={tituloDeLaLista(plata.ronda)} desde={null} ocultarSiVacia />
              </div>
            )}
            {(ultima ? ultima.resto : anteriores).length > 0 && (
              <RondasAnteriores historial={ultima ? ultima.resto : anteriores} envios={rondasEnvios} hoy={hoy} visibles={4} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
