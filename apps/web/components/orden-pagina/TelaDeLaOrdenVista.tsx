"use client";

import { useState } from "react";
import { Scissors } from "lucide-react";
import { EditarTelaModal } from "@/components/orden-pagina/EditarTelaModal";
import { TelaUsadaModal } from "@/components/orden-pagina/TelaUsadaModal";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { corteTerminado, filasDeTela, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import type { DatosEditarTela } from "@/lib/orden-tela-editar-reglas";
import { telasDeLaOrden, type ModoDeTela } from "@/lib/orden-tela-usada-reglas";
import { urlPedirInsumo } from "@/lib/pedir-insumo-reglas";

// La tela de la orden (ADR-0400, decisión 6; vista D): por tela y color, lo que pide el plan, lo que ya se usó y si lo que queda en el estante alcanza para lo que falta. «Alcanza» y
// «Faltan N m» salen del mismo veredicto de la hoja de Nueva orden (`filasDeTela` → `veredictoTela`). Una orden sin tela declarada lo dice, no se dibuja vacía.
// «Alcanza» cuenta también lo que otras órdenes abiertas ya reservan y lo que viene en camino (`fn_tela_pendiente_de_la_orden`: lo que falta recibir de los pedidos, sin los atrasados; regla de
// Felipe del 2026-10-16). Con el corte terminado, la tela que sobra de su plan ya no se va a usar: no falta nada por usar. Si falta, «Pedir N m» lleva a Órdenes de insumos (solo a quien ve ese módulo).
// Debajo, «Anotar lo que usaste» y «Devolver lo que sobró» (actividad 7): lo que se usa sale del estante y queda en la orden; el costo de la tela lo calcula la base. Solo se ofrecen a quien puede operar la orden.

const PLANTILLA = "@min-[28rem]:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem]";
const EN_COLUMNAS = "hidden @min-[28rem]:block";

export function TelaDeLaOrdenVista({ datos, puedePedir = false, edicion = null, edicionFalla = false }: { datos: OrdenPagina; /** La cuenta ve el módulo «Órdenes de insumos»: puede pedir lo que falta. */ puedePedir?: boolean; /** Lo que la hoja «Editar tela y avíos» necesita; null si la cuenta no puede operar la orden o la orden ya no está en proceso. */ edicion?: DatosEditarTela | null; /** No se pudo preparar la edición (no se leyó el estante de Insumos): se dice, en vez de esconder el botón. */ edicionFalla?: boolean }) {
  const filas = filasDeTela(datos.insumos, corteTerminado(datos));
  const [hoja, setHoja] = useState<ModoDeTela | null>(null);
  const [editando, setEditando] = useState(false);
  const telas = telasDeLaOrden(datos.insumos);
  const puedeAnotar = datos.permisos.puedeOperar && datos.orden.estado === "en_proceso" && telas.length > 0;
  const hayQueDevolver = telas.some((t) => t.usado > 0);
  return (
    <section data-guia="prod-orden.tela" aria-label="Tela y avíos de la orden" className="@container op-bloque">
      <TituloSeccion dato={datos.orden.producto.tejidoNombre ?? undefined} accion={edicion && filas.length > 0 ? <BotonEditar chico guia="prod-orden.editar-tela" onClick={() => setEditando(true)}>Editar</BotonEditar> : undefined}>
        Tela y avíos
      </TituloSeccion>
      {filas.length === 0 ? (
        <div className="card-cayla">
          <Vacio tamano="chico" icono={<Scissors />}>
            Esta orden no declaró qué tela ni qué avíos lleva.
          </Vacio>
          {edicion && (
            <div className="flex justify-center px-4 pb-4">
              <Boton peso="primario" aria-haspopup="dialog" data-guia="prod-orden.editar-tela" onClick={() => setEditando(true)}>
                Declarar tela y avíos
              </Boton>
            </div>
          )}
        </div>
      ) : (
        <Tabla>
          <div className={EN_COLUMNAS}>
            <Encabezado plantilla={PLANTILLA} visible="grid" columnas={[{ titulo: "Tela" }, { titulo: "Plan", alinear: "der" }, { titulo: "Usado", alinear: "der" }, { titulo: "Estante", alinear: "der" }]} />
          </div>
          {filas.map((f, i) => (
            <div key={f.id} className={fila(PLANTILLA)}>
              <span className={celda("izq", "whitespace-normal")}>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-tinta">
                  {f.nombre}
                  {f.tipo === "avio" && (
                    <Chip versalitas={false} title="Un avío: botones, cierres, etiquetas o hilo">
                      Avío
                    </Chip>
                  )}
                </span>
                {f.detalle && <span className="op-sub">{f.detalle}</span>}
                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                  {f.alcanza && f.conLoQueViene ? (
                    <Chip tono="ambar" versalitas={false}>
                      Alcanza si llega lo pedido
                    </Chip>
                  ) : f.alcanza ? (
                    <Chip tono="verde" versalitas={false}>
                      {f.yaCortada ? "Ya se cortó" : "Alcanza"}
                    </Chip>
                  ) : (
                    <Chip tono="ambar" versalitas={false}>
                      Faltan {f.faltan}
                    </Chip>
                  )}
                  {!f.alcanza && puedePedir && datos.orden.estado === "en_proceso" && (
                    <BotonEnlace href={urlPedirInsumo(f.id, f.faltanNumero)} peso="discreto" data-guia={i === 0 ? "prod-orden.pedir-tela" : undefined}>
                      Pedir {f.faltan}
                    </BotonEnlace>
                  )}
                </span>
                {f.reservadoPorOtras && <span className="op-sub">{f.reservadoPorOtras}</span>}
                {f.pedidos.map((p) => (
                  <span key={p} className="op-sub">
                    En camino: {p}
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
      {edicionFalla && <p className="op-sub">No se pudo preparar la edición de la tela: recarga la página para volver a intentarlo.</p>}
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
      {editando && edicion && <EditarTelaModal datos={datos} edicion={edicion} onClose={() => setEditando(false)} />}
    </section>
  );
}
