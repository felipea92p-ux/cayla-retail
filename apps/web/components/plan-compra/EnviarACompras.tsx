"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { RectificarPedidos } from "@/components/plan-compra/RectificarPedidos";
import { useEnvioDeLaCategoria } from "@/components/plan-compra/useEnvioDeLaCategoria";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Boton } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Chip } from "@/components/ui/Chip";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";
import {
  PEDIR_YA,
  RPC_ENVIAR,
  argsEnviar,
  conCuando,
  fraseDeCuando,
  llegaTarde,
  paso2PorRevisar,
  porEnviar,
  problemaDeLaFecha,
  queNoSeEnvia,
  estadoDeLosGrupos,
  type BaseDeEnvio,
  type Elegido,
  type EstadoDelGrupo,
  type LecturaEnvio,
} from "@/lib/plan-compra-envio";
import { enteroES, fechaCortaES, solesES, type FilaPlan } from "@/lib/plan-compra-reglas";

// La pestaña «3 · Enviar a Compras» de la hoja de una categoría del Plan (ADR-0530, spike ⑦): lo que el paso 2 guardado nombró (modelo, color y talla) se manda a Compras agrupado por proveedor, como
// pedidos PENDIENTES con la fecha en que la persona piensa pedirlos. Enviar NO pide nada: la orden de compra solo nace cuando alguien la confirma en Compras ▸ Órdenes. Lo que no se puede enviar todavía (sin
// marca, sin proveedor, modelos nuevos, lo del Taller) se dice, no se calla. La cuenta es de `lib/plan-compra-envio.ts`; la base, de `enviar_plan_compra_a_compras`.
//
// CAÍDA EXTERNA. Si la base no responde, la pestaña lo dice y los pasos 1 y 2 siguen intactos. Si se corta la red al enviar, no se sabe si llegó: volver a pulsar «Enviar» no duplica nada (lo idéntico a
// lo ya enviado responde «ya estaba»).

const PLANTILLA = "sm:grid-cols-[minmax(0,1.5fr)_72px_104px_minmax(0,2.4fr)]";

export function EnviarACompras({
  planId,
  planNombre,
  fila: filaPlan,
  hoy,
  limite,
  onIrAlPaso2,
  onCancelar,
}: {
  planId: string;
  planNombre: string;
  fila: FilaPlan;
  /** Hoy en Lima (`aaaa-mm-dd`). */
  hoy: string;
  /** El último día para pedir y que llegue al inicio de la campaña; null = la campaña ya empezó. */
  limite: string | null;
  onIrAlPaso2: () => void;
  onCancelar: () => void;
}) {
  const { estado, recargar } = useEnvioDeLaCategoria(planId, filaPlan.c.id, true);
  if (estado.fase === "cargando") {
    return (
      <Vacio tamano="chico" icono={<Send />} titulo="Mirando lo que se puede enviar">
        Leyendo el paso 2 de {filaPlan.c.nombre} y sus pedidos en Compras.
      </Vacio>
    );
  }
  if (estado.fase === "sin-soporte") {
    return (
      <Aviso tono="info" titulo="Enviar a Compras todavía no está disponible">
        La base aún no sabe de pedidos de campaña. Tu plan de {filaPlan.c.nombre} (pasos 1 y 2) sigue igual.
      </Aviso>
    );
  }
  if (estado.fase === "error") {
    return (
      <Aviso
        tono="atencion"
        titulo="No se pudo leer lo que hay en Compras"
        accion={
          <Boton type="button" peso="fantasma" onClick={recargar}>
            Reintentar
          </Boton>
        }
      >
        La base no respondió. Tus pasos 1 y 2 de {filaPlan.c.nombre} siguen igual; vuelve a intentarlo en un momento.
      </Aviso>
    );
  }
  const { base, pedidos } = estado.lectura;
  if (base === null) {
    return (
      <Aviso
        tono="info"
        titulo={`${filaPlan.c.nombre} todavía no tiene su paso 2 guardado`}
        accion={
          <Boton type="button" peso="fantasma" onClick={onIrAlPaso2}>
            Ir al paso 2
          </Boton>
        }
      >
        Solo se envía a Compras lo que ya está repartido en modelos, colores y tallas.
      </Aviso>
    );
  }
  return <EnvioConBase planId={planId} planNombre={planNombre} fila={filaPlan} hoy={hoy} limite={limite} base={base} pedidos={pedidos} recargar={recargar} onIrAlPaso2={onIrAlPaso2} onCancelar={onCancelar} />;
}

function EnvioConBase({
  planId,
  planNombre,
  fila: filaPlan,
  hoy,
  limite,
  base,
  pedidos,
  recargar,
  onIrAlPaso2,
  onCancelar,
}: {
  planId: string;
  planNombre: string;
  fila: FilaPlan;
  hoy: string;
  limite: string | null;
  base: BaseDeEnvio;
  pedidos: LecturaEnvio["pedidos"];
  recargar: () => void;
  onIrAlPaso2: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [elegidos, setElegidos] = useState<Record<string, Elegido>>({});
  const [enviando, setEnviando] = useState(false);
  const [conflicto, setConflicto] = useState<string | null>(null);
  const [rectificando, setRectificando] = useState(false);
  const enviandoYa = useRef(false);

  const estados = estadoDeLosGrupos(base, pedidos);
  const candidatos = porEnviar(estados);
  const elegidoDe = (proveedorId: string): Elegido => elegidos[proveedorId] ?? PEDIR_YA;
  const problemas = candidatos.map((e) => problemaDeLaFecha(elegidoDe(e.grupo.proveedorId), hoy));
  const costo = base.costo;
  // El total del paso 1 cambió después de guardar el paso 2: lo repartido ya no es lo que se compra. Primero se revisa el paso 2.
  const porRevisar = filaPlan.calculo ? paso2PorRevisar(base.total, filaPlan.calculo.comprar, base.confirmadas) : false;
  const hayPendientes = estados.some((e) => e.vigente?.estado === "pendiente");
  const hayVigentes = estados.some((e) => e.vigente !== null);
  const cambioElPlan = estados.some((e) => e.vigente !== null && e.vigente.version !== base.version);
  const noSeEnvia = queNoSeEnvia(base);
  const puedeEnviar = candidatos.length > 0 && problemas.every((p) => p === null) && !porRevisar && costo !== null;
  const unidadesPorEnviar = candidatos.reduce((s, e) => s + e.grupo.unidades, 0);
  // Lo que puede ir a Compras: las prendas de los proveedores (no las del Taller ni las que no tienen marca o proveedor).
  const enviables = estados.reduce((s, e) => s + e.grupo.unidades, 0);

  const poner = (proveedorId: string, e: Elegido) => setElegidos((x) => ({ ...x, [proveedorId]: e }));
  const todos = (cuando: "ya" | "limite") =>
    setElegidos((x) => {
      const n = { ...x };
      for (const c of candidatos) n[c.grupo.proveedorId] = cuando === "ya" ? PEDIR_YA : { cuando: "fecha", fecha: limite ?? hoy };
      return n;
    });

  async function enviar() {
    if (!puedeEnviar || enviandoYa.current) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    enviandoYa.current = true;
    setEnviando(true);
    setConflicto(null);
    const firma = responsable.firma();
    const { data, error } = await firmar(
      createClient().rpc(RPC_ENVIAR as never, argsEnviar(planId, filaPlan.c.id, base.version, candidatos.map((e) => ({ proveedorId: e.grupo.proveedorId, elegido: elegidoDe(e.grupo.proveedorId) }))) as never),
      firma,
    );
    responsable.despues(error);
    setEnviando(false);
    enviandoYa.current = false;
    if (error) {
      // Otra persona guardó otro paso 2 de esta categoría mientras lo mirabas: lo tuyo no se envió; la base dice quién y a qué hora.
      if (esVersionCambiada(error)) return void setConflicto(error.message);
      // Se cortó la red: puede que la base haya guardado y la respuesta no llegó. Volver a enviar lo mismo no duplica nada.
      if (esFalloDeRed(error)) return void avisar.error(`Se cortó la conexión mientras se enviaba ${filaPlan.c.nombre} a Compras: no sabemos si llegó. Vuelve a pulsar «Enviar»; si ya se había enviado, no se duplica.`);
      return void avisar.error(traducirError(error, "enviar a Compras"));
    }
    const creados = Number((data as { creados?: unknown } | null)?.creados ?? 0);
    avisar.exito(creados === 1 ? "1 pedido quedó pendiente de confirmar en Compras" : `${creados} pedidos quedaron pendientes de confirmar en Compras`, {
      detalle: "Nada se ha pedido todavía: quien compra lo confirma en Compras ▸ Órdenes.",
    });
    // La lectura vuelve a pedirse (los grupos pasan a «pendiente») y la lista de atrás marca la categoría.
    recargar();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {cambioElPlan && (
        <Aviso tono="atencion" titulo="El plan cambió después de enviar">
          Lo que está pendiente en Compras tiene lo de antes (versión anterior del paso 2). Rectifica el envío y vuelve a enviar para que coincidan.
        </Aviso>
      )}
      {porRevisar && (
        <Aviso
          tono="atencion"
          titulo="El paso 2 está por revisar"
          accion={
            <Boton type="button" peso="fantasma" onClick={onIrAlPaso2}>
              Ir al paso 2
            </Boton>
          }
        >
          El total del paso 1 cambió desde que lo guardaste. Revisa el paso 2 antes de enviar: lo que se manda a Compras es lo que está repartido.
        </Aviso>
      )}
      {costo === null && (
        <Aviso tono="atencion" titulo="El plan ya no tiene un costo para esta categoría">
          Sin costo no hay a qué precio pedir. Guarda el paso 1 de {filaPlan.c.nombre} otra vez.
        </Aviso>
      )}

      <p className="text-sm text-tinta/80">
        {planNombre} · <b className="font-semibold text-tinta">{enteroES.format(enviables)} prendas</b> de {filaPlan.c.nombre} con modelo, color, talla y proveedor. Enviar{" "}
        <b className="font-semibold text-tinta">no pide nada</b>: deja cada pedido como «Pendiente de campaña, falta confirmar» en Compras, con la fecha en que piensas pedirlo.
      </p>

      {estados.length === 0 ? (
        <Vacio tamano="chico" icono={<Send />} titulo="Nada para enviar a Compras">
          Ningún modelo de este paso 2 tiene marca y proveedor. {noSeEnvia.length > 0 ? "Abajo está lo que falta." : ""}
        </Vacio>
      ) : (
        <Tabla guia="envio.grupos">
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Quién lo surte" },
              { titulo: "Prendas", alinear: "der" },
              { titulo: "Al costo", subtitulo: "del plan", alinear: "der" },
              { titulo: "¿Cuándo piensas pedirlo?" },
            ]}
          />
          {estados.map((e, i) => (
            <FilaDeProveedor
              key={e.grupo.proveedorId}
              e={e}
              costo={costo}
              baseVersion={base.version}
              elegido={elegidoDe(e.grupo.proveedorId)}
              problema={problemas[candidatos.indexOf(e)] ?? null}
              hoy={hoy}
              limite={limite}
              deshabilitado={enviando}
              guia={i === 0 ? "envio.cuando" : undefined}
              onElegido={(x) => poner(e.grupo.proveedorId, x)}
            />
          ))}
        </Tabla>
      )}

      {candidatos.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Boton type="button" peso="fantasma" className="btn-chico" disabled={enviando} onClick={() => todos("ya")}>
            Todos: pedir ya
          </Boton>
          {limite !== null && limite >= hoy && (
            <Boton type="button" peso="fantasma" className="btn-chico" disabled={enviando} onClick={() => todos("limite")}>
              Todos: el {fechaCortaES(limite)} (último día)
            </Boton>
          )}
        </div>
      )}

      {noSeEnvia.length > 0 && (
        <div className="nota-cayla space-y-1" data-guia="envio.no-se-envia">
          <p className="font-semibold text-tinta">No se envía todavía</p>
          {noSeEnvia.map((l) => (
            <p key={l} className="text-sm text-tinta/80">
              {l}
            </p>
          ))}
        </div>
      )}

      <p className="text-xs text-taupe">En Finanzas, lo pendiente sigue contando como «falta pedir»; al confirmar cada pedido pasa a «pedido sin pagar».</p>

      {conflicto && (
        <Aviso
          tono="atencion"
          titulo="Otra persona guardó otro paso 2"
          accion={
            <Boton
              type="button"
              peso="fantasma"
              onClick={() => {
                setConflicto(null);
                recargar();
                router.refresh();
              }}
            >
              Ver lo que guardó
            </Boton>
          }
        >
          {conflicto}
        </Aviso>
      )}

      <div className="space-y-3 border-t border-sand pt-4">
        {candidatos.length > 0 && <ComboResponsable control={responsable} deshabilitado={enviando} />}
        <PieAcciones
          guia="envio.pie"
          izquierda={
            hayPendientes || hayVigentes ? (
              <>
                {hayPendientes && (
                  <Boton type="button" peso="fantasma" disabled={enviando} onClick={() => setRectificando(true)}>
                    Rectificar el envío
                  </Boton>
                )}
                {hayVigentes && <BotonVer href="/compras/ordenes">Ver en Compras</BotonVer>}
              </>
            ) : undefined
          }
        >
          <Boton type="button" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton
            type="button"
            peso="primario"
            cargando={enviando}
            textoCargando="Enviando…"
            disabled={!puedeEnviar}
            title={
              porRevisar
                ? "Primero revisa el paso 2"
                : candidatos.length === 0
                  ? "No hay nada nuevo que enviar"
                  : (problemas.find((p) => p !== null) ?? `Envía ${enteroES.format(unidadesPorEnviar)} prendas de ${candidatos.length} ${candidatos.length === 1 ? "proveedor" : "proveedores"}`)
            }
            onClick={() => void enviar()}
          >
            Enviar como pendientes de campaña
          </Boton>
        </PieAcciones>
      </div>

      {rectificando && (
        <RectificarPedidos
          titulo={`Rectificar el envío de ${filaPlan.c.nombre}`}
          pendientes={estados.flatMap((e) => (e.vigente?.estado === "pendiente" ? [{ id: e.vigente.id, proveedor: e.grupo.proveedor }] : []))}
          yaSonOrden={estados.filter((e) => e.vigente?.estado === "pedido").map((e) => e.grupo.proveedor)}
          onClose={() => setRectificando(false)}
          onHecho={() => {
            recargar();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FilaDeProveedor({
  e,
  costo,
  baseVersion,
  elegido,
  problema,
  hoy,
  limite,
  deshabilitado,
  guia,
  onElegido,
}: {
  e: EstadoDelGrupo;
  costo: number | null;
  baseVersion: number;
  elegido: Elegido;
  problema: string | null;
  hoy: string;
  limite: string | null;
  deshabilitado: boolean;
  guia?: string;
  onElegido: (x: Elegido) => void;
}) {
  const g = e.grupo;
  const v = e.vigente;
  const tarde = llegaTarde(elegido, limite);
  return (
    <div className={fila(PLANTILLA)} data-proveedor={g.proveedorId}>
      <span className={celda("izq", "min-w-0")}>
        <b className="block truncate font-semibold text-tinta">{g.proveedor}</b>
        <span className="block whitespace-normal text-xs text-taupe">
          {g.modelos} {g.modelos === 1 ? "modelo" : "modelos"} · va a Compras ▸ Órdenes
        </span>
      </span>
      <span className={celda("der", "tabular-nums")}>
        <span className="text-taupe-profundo sm:hidden">Prendas: </span>
        {enteroES.format(g.unidades)}
      </span>
      <span className={celda("der", "tabular-nums")}>
        <span className="text-taupe-profundo sm:hidden">Al costo: </span>
        {costo === null ? "—" : solesES(g.unidades * costo)}
      </span>
      <span className={celda("izq", "min-w-0 overflow-visible! whitespace-normal")} data-guia={guia}>
        {v ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {v.estado === "pendiente" ? (
              <Chip tono="ambar" versalitas={false}>
                Pendiente · falta confirmar
              </Chip>
            ) : (
              <Chip tono="verde" versalitas={false}>
                Pedido · {v.ordenTexto ?? "orden creada"}
              </Chip>
            )}
            {v.estado === "pendiente" && <span className="text-sm text-tinta/80">{fraseDeCuando(v.cuando, v.fechaPrevista)}</span>}
            {v.estado === "pendiente" && v.cuando === "fecha" && limite !== null && v.fechaPrevista !== null && v.fechaPrevista > limite && (
              <Chip tono="ambar" versalitas={false}>
                Llega tarde: después del {fechaCortaES(limite)}
              </Chip>
            )}
            {v.version !== baseVersion && (
              <Chip tono="ambar" versalitas={false} title="El paso 2 se guardó otra vez después de enviar este pedido">
                Cambió el plan
              </Chip>
            )}
          </span>
        ) : e.bloqueo ? (
          <Chip tono="ambar" versalitas={false} title={e.bloqueo}>
            {g.proveedorActivo ? "Marca inactiva" : "Proveedor inactivo"}
          </Chip>
        ) : (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <SegmentoDeslizante
              etiqueta={`Cuándo pedir a ${g.proveedor}`}
              valor={elegido.cuando}
              onCambio={(c) => onElegido(conCuando(elegido, c === "fecha" ? "fecha" : "ya", hoy, limite))}
              opciones={[
                { clave: "ya", etiqueta: "Pedir ya" },
                { clave: "fecha", etiqueta: "Pedir el…" },
              ]}
            />
            {elegido.cuando === "fecha" && (
              <span className="w-40">
                <CampoFecha
                  etiqueta={<span className="sr-only">Fecha en que pedir a {g.proveedor}</span>}
                  caja
                  estricto
                  disabled={deshabilitado}
                  valor={elegido.fecha}
                  onValor={(iso) => onElegido({ cuando: "fecha", fecha: iso })}
                  {...(problema && elegido.fecha !== "" ? { tono: "error" as const, pie: problema } : {})}
                />
              </span>
            )}
            {tarde && limite !== null && (
              <Chip tono="ambar" versalitas={false} title="Con esa fecha, la mercadería llega a las tiendas después de que empiece la campaña">
                Llega tarde: después del {fechaCortaES(limite)}
              </Chip>
            )}
            {e.rectificado && (
              <span className="basis-full text-xs text-taupe">
                Antes se rectificó{e.rectificado.motivo ? `: ${e.rectificado.motivo}` : ""}.
              </span>
            )}
          </span>
        )}
      </span>
    </div>
  );
}
