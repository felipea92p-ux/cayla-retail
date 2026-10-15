"use client";

import { useState } from "react";
import { Scissors } from "lucide-react";
import { TelaUsadaModal } from "@/components/orden-pagina/TelaUsadaModal";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { filasDeTela, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { telasDeLaOrden, type ModoDeTela } from "@/lib/orden-tela-usada-reglas";

// La tela de la orden (ADR-0400, decisión 6; vista D): por tela y color, lo que pide el plan, lo que ya se usó y si lo que queda en el estante alcanza para lo que falta. «Alcanza» y
// «Faltan N m» salen del mismo veredicto de la hoja de Nueva orden (`filasDeTela` → `veredictoTela`). Una orden sin tela declarada lo dice, no se dibuja vacía.
// «Alcanza» cuenta también lo que otras órdenes abiertas ya reservan (`fn_tela_pendiente_de_la_orden`); lo pedido se muestra, no se suma (una orden de insumos no sabe si ya llegó). Si falta, «Pedir N m» lleva a
// Órdenes de insumos (solo a quien ve ese módulo).
// Debajo, «Anotar lo que usaste» y «Devolver lo que sobró» (actividad 7): lo que se usa sale del estante y queda en la orden; el costo de la tela lo calcula la base. Solo se ofrecen a quien puede operar la orden.

const PLANTILLA = "@min-[28rem]:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem]";
const EN_COLUMNAS = "hidden @min-[28rem]:block";

export function TelaDeLaOrdenVista({ datos, puedePedir = false }: { datos: OrdenPagina; /** La cuenta ve el módulo «Órdenes de insumos»: puede pedir lo que falta. */ puedePedir?: boolean }) {
  const filas = filasDeTela(datos.insumos);
  const [hoja, setHoja] = useState<ModoDeTela | null>(null);
  const telas = telasDeLaOrden(datos.insumos);
  const puedeAnotar = datos.permisos.puedeOperar && datos.orden.estado === "en_proceso" && telas.length > 0;
  const hayQueDevolver = telas.some((t) => t.usado > 0);
  return (
    <section data-guia="prod-orden.tela" aria-label="Tela de la orden" className="@container op-bloque">
      <TituloSeccion dato={datos.orden.producto.tejidoNombre ?? undefined}>Tela</TituloSeccion>
      {filas.length === 0 ? (
        <div className="card-cayla">
          <Vacio tamano="chico" icono={<Scissors />}>
            Esta orden no declaró qué tela lleva.
          </Vacio>
        </div>
      ) : (
        <Tabla>
          <div className={EN_COLUMNAS}>
            <Encabezado plantilla={PLANTILLA} visible="grid" columnas={[{ titulo: "Tela" }, { titulo: "Plan", alinear: "der" }, { titulo: "Usado", alinear: "der" }, { titulo: "Estante", alinear: "der" }]} />
          </div>
          {filas.map((f, i) => (
            <div key={f.id} className={fila(PLANTILLA)}>
              <span className={celda("izq", "whitespace-normal")}>
                <span className="block text-tinta">{f.nombre}</span>
                {f.detalle && <span className="op-sub">{f.detalle}</span>}
                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                  {f.alcanza ? (
                    <Chip tono="verde" versalitas={false}>
                      Alcanza
                    </Chip>
                  ) : (
                    <Chip tono="ambar" versalitas={false}>
                      Faltan {f.faltan}
                    </Chip>
                  )}
                  {!f.alcanza && puedePedir && datos.orden.estado === "en_proceso" && (
                    <BotonEnlace href="/ordenes-insumos/nueva" peso="discreto" data-guia={i === 0 ? "prod-orden.pedir-tela" : undefined}>
                      Pedir {f.faltan}
                    </BotonEnlace>
                  )}
                </span>
                {f.reservadoPorOtras && <span className="op-sub">{f.reservadoPorOtras}</span>}
                {f.pedidos.map((p) => (
                  <span key={p} className="op-sub">
                    Pedido: {p}
                  </span>
                ))}
              </span>
              <span className={celda("der", `${EN_COLUMNAS}`)}>{f.plan}</span>
              <span className={celda("der", `${EN_COLUMNAS}`)}>{f.usado}</span>
              <span className={celda("der", `${EN_COLUMNAS}`)}>{f.saldo}</span>
              <span className="op-sub @min-[28rem]:hidden">
                plan {f.plan} · usado {f.usado} · estante {f.saldo}
              </span>
            </div>
          ))}
        </Tabla>
      )}
      {puedeAnotar && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Boton peso="fantasma" aria-haspopup="dialog" data-guia="prod-orden.anotar-tela" onClick={() => setHoja("usar")}>
            Anotar lo que usaste
          </Boton>
          {hayQueDevolver && (
            <Boton peso="discreto" aria-haspopup="dialog" data-guia="prod-orden.devolver-tela" onClick={() => setHoja("devolver")}>
              Devolver lo que sobró
            </Boton>
          )}
        </div>
      )}
      {hoja && <TelaUsadaModal datos={datos} modo={hoja} onClose={() => setHoja(null)} />}
    </section>
  );
}
