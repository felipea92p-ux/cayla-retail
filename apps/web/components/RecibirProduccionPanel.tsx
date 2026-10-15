"use client";

import { useRef, useState } from "react";
import { diaMes, diaYHoraLima } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { RecibirComprobanteModal } from "@/components/RecibirComprobanteModal";
import { RecibirOrdenInsumoModal } from "@/components/ordenes-insumo/RecibirOrdenInsumoModal";
import { useSedeActiva } from "@/components/SedeActiva";
import { Aviso } from "@/components/ui/Aviso";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { cantidadConUnidad } from "@/lib/ordenes-insumo-reglas";
import { esMiOrden, llegoAlgo, type OrdenInsumoPorRecibir } from "@/lib/recepcion-orden-insumo-reglas";
import { etiquetaTipo } from "@/lib/comprobantes-produccion-reglas";
import { cantidadTexto } from "@/lib/insumos-reglas";
import { agruparPorComprobante, resumenRecepcion, type ComprobantePorRecibir, type LineaPorRecibir } from "@/lib/recibir-produccion-reglas";
import { CircleCheck, PackageOpen } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Recibir insumos (ADR-0133, F4d). Los comprobantes de los proveedores con lo que todavía no llegó, del que lleva más tiempo esperando al
// más nuevo. Solo CANTIDADES: quien recibe en el Taller no ve dinero. Cada línea que llega abre un lote (con el costo de la línea, que la
// base pone sola); lo que no va a llegar se cierra con su motivo. Un mismo comprobante puede recibirse en varias entregas.
//
// Arriba de los papeles, las ÓRDENES DE INSUMOS con algo por recibir (ADR-0362, fase 7 parte 2 · actividad 3): lo de una orden se recibe
// contra la orden aunque su papel no haya llegado (decisión 9), y quien la recibe ve y corrige el costo de ESA orden (decisión 53). Quien
// hizo la orden no la recibe (decisión 17): su «Recibir» no se ofrece y lo dice.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function RecibirProduccionPanel({
  lineas,
  ordenesInsumo = [],
  fallaOrdenes = null,
  tallerId,
  sede,
}: {
  lineas: LineaPorRecibir[];
  /** Las órdenes de insumos con algo por recibir en este taller (fase 7 parte 2). */
  ordenesInsumo?: OrdenInsumoPorRecibir[];
  /** Por qué no se pudieron leer las órdenes (la pantalla lo dice y sigue con los papeles). */
  fallaOrdenes?: string | null;
  tallerId: string;
  /** La sede de la línea de arriba de la cabecera (el Taller). */
  sede: string;
}) {
  const [recibiendo, setRecibiendo] = useState<ComprobantePorRecibir | null>(null);
  const [recibiendoOI, setRecibiendoOI] = useState<OrdenInsumoPorRecibir | null>(null);
  // El botón que abrió la hoja de una orden: al cerrarla, el foco vuelve a él.
  const origenOI = useRef<HTMLElement | null>(null);
  const personaId = useSedeActiva()?.personaSesionId ?? null;
  const grupos = agruparPorComprobante(lineas);
  const abiertos = grupos.filter((g) => g.estado !== "completa");
  const completos = grupos.filter((g) => g.estado === "completa");
  // Las órdenes de insumos también esperan mercadería: suman a las cifras de arriba.
  const papeles = resumenRecepcion(grupos);
  const resumen = {
    porRecibir: papeles.porRecibir + ordenesInsumo.length,
    lineasPendientes: papeles.lineasPendientes + ordenesInsumo.reduce((s, o) => s + o.lineas.length, 0),
    parciales: papeles.parciales + ordenesInsumo.filter(llegoAlgo).length,
  };

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). */}
      <EncabezadoPagina
        sede={sede}
        titulo="Recibir"
        subtitulo="La tela y los avíos que llegan al Taller, contra su orden de insumos o contra el comprobante del proveedor. Cada línea que llega abre un lote; lo que no llegue se cierra con su motivo."
      />

      <div data-guia="prod-recibir.cifras" className="grid gap-3 sm:grid-cols-3">
        <TarjetaCifra
          punto={resumen.porRecibir > 0 ? "ambar" : "verde"}
          etiqueta="Por recibir"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={resumen.porRecibir} alMontar />}
        >
          {resumen.porRecibir > 0 ? plural(resumen.porRecibir, "pedido espera mercadería", "pedidos esperan mercadería") : "nada pendiente"}
        </TarjetaCifra>
        <TarjetaCifra punto="verde" etiqueta="Líneas pendientes" className="anim-entra" style={{ ["--i" as string]: 1 }} valor={<CifraQueCuenta valor={resumen.lineasPendientes} alMontar />}>
          insumos que aún no llegan
        </TarjetaCifra>
        <TarjetaCifra punto="verde" etiqueta="A medio recibir" className="anim-entra" style={{ ["--i" as string]: 2 }} valor={<CifraQueCuenta valor={resumen.parciales} alMontar />}>
          {resumen.parciales > 0 ? "llegaron en parte" : "ninguno a medias"}
        </TarjetaCifra>
      </div>

      {fallaOrdenes && (
        <Aviso tono="atencion" titulo="No se pudieron leer las órdenes de insumos">
          {fallaOrdenes}
        </Aviso>
      )}

      {ordenesInsumo.length > 0 && (
        <section data-guia="prod-recibir.ordenes" className="space-y-3" aria-label="Órdenes de insumos por recibir">
          <TituloSeccion cuenta={ordenesInsumo.length}>Órdenes de insumos</TituloSeccion>
          <ul className="space-y-3">
            {ordenesInsumo.map((o, i) => {
              const mia = esMiOrden(o, personaId);
              // La entrega es una fecha; «pedida el» es un instante y se lee en Lima (de 7 p. m. a medianoche, en UTC ya es mañana).
              const cuando = o.fechaEntregaEstimada ? `llega el ${diaMes(o.fechaEntregaEstimada)}` : o.creadaEn ? `pedida el ${diaYHoraLima(o.creadaEn).dia}` : null;
              return (
                <li key={o.id} data-guia={i === 0 ? "prod-recibir.orden" : undefined} className="card-cayla anim-entra p-4" style={{ ["--i" as string]: Math.min(i, 8) }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] text-tinta">{o.proveedor}</p>
                      <p className="text-xs text-tinta/65">
                        {o.documento}
                        {cuando ? ` · ${cuando}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {llegoAlgo(o) && <Chip tono="ambar">Llegó en parte</Chip>}
                      <Boton
                        peso="primario"
                        disabled={mia}
                        title={mia ? "La hiciste tú: la recibe otra persona del Taller" : undefined}
                        onClick={(e) => {
                          origenOI.current = e.currentTarget;
                          setRecibiendoOI(o);
                        }}
                      >
                        Recibir
                      </Boton>
                    </div>
                  </div>
                  {mia && <p className="mt-2 text-xs text-taupe">La hiciste tú: la recibe otra persona del Taller.</p>}
                  <ul className="mt-3">
                    {o.lineas.map((l) => (
                      <li key={l.itemId} className="flex items-baseline justify-between gap-3 border-t border-tinta/10 py-2 text-[13px]">
                        <span className="min-w-0 truncate text-tinta">
                          {l.insumo}
                          {l.tipo === "papel" && <small className="ml-1.5 text-xs text-taupe">fuera de la orden</small>}
                        </span>
                        <span className="whitespace-nowrap tabular-nums text-tinta/80">
                          quedan <b className="font-semibold text-tinta">{cantidadConUnidad(l.queda, l.unidad)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {grupos.length === 0 ? (
        ordenesInsumo.length === 0 && (
          <div className="card-cayla">
            <Vacio guia="prod-recibir.lista" icono={<PackageOpen />} titulo="No hay insumos por recibir">
              Cuando una orden de insumos esté por llegar, o el líder registre la factura de un proveedor de tela o avíos, aparecerá aquí para que
              anotes lo que llegó.
            </Vacio>
          </div>
        )
      ) : abiertos.length === 0 ? (
        // Con órdenes por recibir, «no hay nada por recibir» no sería cierto: la lista de órdenes ya lo dice todo.
        ordenesInsumo.length === 0 && (
          <div className="card-cayla">
            <Vacio guia="prod-recibir.lista" icono={<CircleCheck />} titulo="Todo lo facturado ya llegó">
              Lo que se compró ya entró al Taller o se cerró. No hay nada por recibir.
            </Vacio>
          </div>
        )
      ) : (
        <section className="space-y-3" aria-label="Facturas por recibir">
          {ordenesInsumo.length > 0 && <TituloSeccion cuenta={abiertos.length}>Facturas sin orden</TituloSeccion>}
          <ul data-guia="prod-recibir.lista" className="space-y-3">
          {abiertos.map((g, i) => (
            <li key={g.comprobanteId} data-guia={i === 0 ? "prod-recibir.factura" : undefined} className="card-cayla anim-entra p-4" style={{ ["--i" as string]: Math.min(i, 8) }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-tinta">{g.proveedor}</p>
                  <p className="text-xs text-tinta/65">
                    {etiquetaTipo(g.tipo, true)} {g.documento} · emitido {diaMes(g.fechaEmision)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {g.estado === "parcial" && <Chip tono="ambar">Llegó en parte</Chip>}
                  <Boton peso="primario" data-guia="prod-recibir.recibir" onClick={() => setRecibiendo(g)}>
                    Recibir
                  </Boton>
                </div>
              </div>
              <ul className="mt-3">
                {g.pendientes.map((l) => (
                  <li key={l.itemId} className="flex items-baseline justify-between gap-3 border-t border-tinta/10 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-tinta">{l.insumo}</span>
                    <span className="whitespace-nowrap tabular-nums text-tinta/80">
                      faltan <b className="font-semibold text-tinta">{cantidadTexto(l.pendiente, l.unidad)}</b>
                      {(l.recibido > 0 || l.cerrado > 0) && <small className="ml-1.5 text-xs text-tinta/60">de {cantidadTexto(l.facturado, l.unidad)}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          </ul>
        </section>
      )}

      {completos.length > 0 && (
        <details data-guia="prod-recibir.recibidos" className="card-cayla p-4">
          <summary className="cursor-pointer text-sm text-tinta/80">Ya recibidos ({completos.length})</summary>
          <ul className="mt-2">
            {completos.map((g) => (
              <li key={g.comprobanteId} className="flex items-baseline justify-between gap-3 border-t border-tinta/10 py-2 text-[13px]">
                <span className="min-w-0 truncate text-tinta">{g.proveedor}</span>
                <span className="whitespace-nowrap text-xs tabular-nums text-tinta/65">
                  {etiquetaTipo(g.tipo, true)} {g.documento} · {diaMes(g.fechaEmision)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {recibiendo && <RecibirComprobanteModal comprobante={recibiendo} tallerId={tallerId} onClose={() => setRecibiendo(null)} />}
      {recibiendoOI && <RecibirOrdenInsumoModal orden={recibiendoOI} tallerId={tallerId} onClose={() => setRecibiendoOI(null)} volverA={origenOI} />}
    </div>
  );
}
