"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { RectificarPedidos } from "@/components/plan-compra/RectificarPedidos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BotonVerMas } from "@/components/ui/VerMas";
import { soles } from "@/lib/compras-reglas";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { RPC_CONFIRMAR_PEDIDO, RPC_CAMBIAR_FECHA_PEDIDO, RPC_LINEAS_PEDIDO, agruparLineas, alCostoDelPedido, argsCambiarFecha, argsConfirmar, avisoDePlazo, leerLineasDePedido, limiteParaPedir, pendientesPorCampana, type LineaDePedido, type PedidoDeCampana } from "@/lib/pedidos-campana-reglas";
import { PEDIR_YA, conCuando, fraseDeCuando, llegaTarde, problemaDeLaFecha, type Elegido } from "@/lib/plan-compra-envio";
import { fechaCortaES } from "@/lib/plan-compra-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Pendientes de campaña» de Compras ▸ Órdenes de compra (ADR-0530, spike ⑦): los pedidos que el Plan de campaña mandó a Compras. Cada uno dice quién lo surte, qué campaña y categoría, cuántas prendas y a qué costo,
// cuándo piensa pedirlo quien lo envió y en qué estado está. Aquí se CONFIRMA (se crea la orden de compra, el único paso que de verdad pide la mercadería), se cambia la fecha o se rectifica. Nada se pide antes
// de confirmar. Lo ya pedido o rectificado hace poco se queda a la vista unos días para ver en qué quedó cada uno.
//
// CAÍDA EXTERNA. Si la base no responde al confirmar, no se sabe si la orden se creó: volver a pulsar «Crear la orden» no crea otra (confirmar dos veces devuelve la MISMA orden).

const BORDE = { pendiente: "border-l-ambar", pedido: "border-l-verde", rectificado: "border-l-taupe" } as const;

type Accion = { tipo: "confirmar" | "fecha" | "rectificar"; pedido: PedidoDeCampana };

export function PendientesDeCampana({ pedidos, hoy, falla = false }: { pedidos: readonly PedidoDeCampana[]; hoy: string; falla?: boolean }) {
  const router = useRouter();
  const [accion, setAccion] = useState<Accion | null>(null);
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set());
  const cuenta = pendientesPorCampana(pedidos);
  if (pedidos.length === 0 && !falla) return null;

  const masProxima = cuenta.porCampana[0] ?? null;
  const unaCampana = cuenta.porCampana.length === 1;
  const refrescar = () => router.refresh();
  const alternar = (id: string, abierto: boolean) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (abierto) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <section className="space-y-3" data-guia="ordenes.pendientes-campana">
      {falla && (
        <Aviso tono="atencion" titulo="No se pudieron leer los pedidos de campaña">
          La base no respondió. Puede haber pedidos esperando tu confirmación que no se ven ahora; vuelve a cargar la página en un momento. Las órdenes de abajo no cambian.
        </Aviso>
      )}
      {masProxima && (
        <Aviso
          tono="atencion"
          titulo={
            unaCampana
              ? `${cuenta.total} ${cuenta.total === 1 ? "pedido" : "pedidos"} de ${masProxima.nombre} ${cuenta.total === 1 ? "espera" : "esperan"} tu confirmación`
              : `${cuenta.total} pedidos de campaña esperan tu confirmación`
          }
        >
          Nada se ha pedido todavía.{" "}
          {masProxima.limite >= hoy
            ? `Pide antes del ${fechaCortaES(masProxima.limite)} para que llegue a las tiendas el ${fechaCortaES(masProxima.desde)}${unaCampana ? "" : ` (${masProxima.nombre})`}.`
            : `El plazo para pedir ${unaCampana ? "" : `${masProxima.nombre} `}era el ${fechaCortaES(masProxima.limite)}: lo que pidas hoy llega después del inicio de la campaña.`}
        </Aviso>
      )}
      {pedidos.length > 0 && (
        <TituloSeccion cuenta={cuenta.total > 0 ? cuenta.total : undefined} dato="vienen del Plan de campaña; se confirman aquí" nivel={2}>
          {cuenta.total > 0 ? "Pendientes de campaña" : "Pedidos de campaña recientes"}
        </TituloSeccion>
      )}
      {pedidos.map((p, i) => (
        <TarjetaDePedido
          key={p.id}
          p={p}
          hoy={hoy}
          abierto={abiertos.has(p.id)}
          guia={i === 0 && p.estado === "pendiente" ? "ordenes.pendiente-confirmar" : undefined}
          onAbrir={(a) => alternar(p.id, a)}
          onAccion={(tipo) => setAccion({ tipo, pedido: p })}
        />
      ))}

      {accion?.tipo === "confirmar" && <ConfirmarPedido p={accion.pedido} hoy={hoy} onClose={() => setAccion(null)} onHecho={refrescar} />}
      {accion?.tipo === "fecha" && <CambiarFecha p={accion.pedido} hoy={hoy} onClose={() => setAccion(null)} onHecho={refrescar} />}
      {accion?.tipo === "rectificar" && (
        <RectificarPedidos
          titulo={`Rectificar el pedido de ${accion.pedido.proveedor.nombre}`}
          pendientes={[{ id: accion.pedido.id, proveedor: accion.pedido.proveedor.nombre }]}
          yaSonOrden={[]}
          onClose={() => setAccion(null)}
          onHecho={refrescar}
        />
      )}
    </section>
  );
}

function TarjetaDePedido({
  p,
  hoy,
  abierto,
  guia,
  onAbrir,
  onAccion,
}: {
  p: PedidoDeCampana;
  hoy: string;
  abierto: boolean;
  guia?: string;
  onAbrir: (abierto: boolean) => void;
  onAccion: (tipo: Accion["tipo"]) => void;
}) {
  const aviso = avisoDePlazo(p, hoy, fechaCortaES);
  const pendiente = p.estado === "pendiente";
  return (
    <article className={`card-cayla space-y-3 border-l-[6px] p-4 sm:px-5 ${BORDE[p.estado]}`} data-estado={p.estado}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-display text-[19px] leading-tight text-tinta">{p.proveedor.nombre}</p>
        {pendiente ? (
          <Chip tono="ambar" versalitas={false}>
            Pendiente de campaña · falta confirmar
          </Chip>
        ) : p.estado === "pedido" ? (
          <Chip tono="verde" versalitas={false}>
            Pedido{p.orden ? ` · ${p.orden.texto ?? "orden creada"}` : ""}
          </Chip>
        ) : (
          <Chip tono="neutro" versalitas={false}>
            Rectificado
          </Chip>
        )}
      </div>
      <p className="text-sm text-taupe">
        {p.plan.nombre} · {p.categoria.nombre} · {p.modelos} {p.modelos === 1 ? "modelo" : "modelos"} · <b className="font-semibold text-tinta">{p.unidades.toLocaleString("es-PE")} prendas</b> · {soles(alCostoDelPedido(p))} al costo
        {p.enviadoPor ? ` · enviado por ${p.enviadoPor}` : ""}
        {p.enviadoEn ? ` el ${diaYHoraLima(p.enviadoEn).dia}` : ""}
      </p>
      {pendiente && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip tono="neutro" versalitas={false}>
            {fraseDeCuando(p.cuando, p.fechaPrevista)}
          </Chip>
          {aviso && (
            <Chip tono="ambar" versalitas={false} title={aviso.tipo === "plazo-vencido" ? aviso.texto : "Con esa fecha, la mercadería llega a las tiendas después de que empiece la campaña"}>
              {aviso.tipo === "plazo-vencido" ? "El plazo ya pasó" : aviso.texto}
            </Chip>
          )}
          {p.desactualizado && (
            <Chip tono="ambar" versalitas={false} title="El paso 2 se guardó otra vez después de enviar este pedido: lo de aquí es lo de antes">
              Cambió el plan
            </Chip>
          )}
          {p.cambioElProveedor && (
            <Chip tono="rojo" versalitas={false} title="Un modelo de este pedido ya es de otro proveedor: no se puede confirmar">
              Cambió el proveedor de un modelo
            </Chip>
          )}
        </div>
      )}
      {p.estado === "pedido" && p.orden && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-taupe">
          <span>
            Pedido{p.orden.en ? ` el ${diaYHoraLima(p.orden.en).dia}` : ""}
            {p.orden.por ? ` por ${p.orden.por}` : ""}. Para deshacerlo, anula la orden aquí en Órdenes (no se rectifica desde el Plan).
          </span>
          <EnlaceVer href={`/compras/ordenes/ver/${p.orden.id}`}>Ver la orden</EnlaceVer>
        </p>
      )}
      {p.estado === "rectificado" && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-taupe">
          <span>
            {p.rectificado?.por ?? "Alguien"} lo rectificó{p.rectificado?.en ? ` el ${diaYHoraLima(p.rectificado.en).dia}` : ""}
            {p.rectificado?.motivo ? `: ${p.rectificado.motivo}` : ""}. Volvió al Plan como «por enviar».
          </span>
          <EnlaceVer href={`/compras/plan?plan=${p.plan.id}`}>Volver a enviar desde el Plan</EnlaceVer>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {pendiente && (
          <>
            <Boton type="button" peso="primario" disabled={p.cambioElProveedor} title={p.cambioElProveedor ? "Un modelo ya es de otro proveedor: rectifica este pedido y vuelve a enviarlo desde el Plan" : undefined} data-guia={guia} onClick={() => onAccion("confirmar")}>
              Confirmar y pedir
            </Boton>
            <Boton type="button" onClick={() => onAccion("fecha")}>
              Cambiar fecha
            </Boton>
            <Boton type="button" onClick={() => onAccion("rectificar")}>
              Rectificar
            </Boton>
          </>
        )}
        <BotonVerMas forma="enlace" abierto={abierto} onCambiar={onAbrir} texto="Ver las líneas" controla={`lineas-${p.id}`} />
      </div>
      {abierto && <LineasDelPedido id={`lineas-${p.id}`} pedidoId={p.id} />}
    </article>
  );
}

// Las líneas de un pedido (modelo × color × talla), tal como se enviaron. Se piden al abrir: son decenas de líneas y casi nadie las abre.
function LineasDelPedido({ id, pedidoId }: { id: string; pedidoId: string }) {
  const [estado, setEstado] = useState<{ fase: "cargando" } | { fase: "lista"; lineas: LineaDePedido[] } | { fase: "error" }>({ fase: "cargando" });
  useEffect(() => {
    let vigente = true;
    void createClient()
      .rpc(RPC_LINEAS_PEDIDO as never, { p_pedido_id: pedidoId } as never)
      .then(({ data, error }) => {
        if (!vigente) return;
        const lineas = error ? null : leerLineasDePedido(data);
        setEstado(lineas === null ? { fase: "error" } : { fase: "lista", lineas });
      });
    return () => {
      vigente = false;
    };
  }, [pedidoId]);
  return (
    <div id={id} className="space-y-3 border-t border-sand pt-3">
      {estado.fase === "cargando" && <p className="text-sm text-taupe">Leyendo las líneas…</p>}
      {estado.fase === "error" && <p className="text-sm text-taupe">No se pudieron leer las líneas. Vuelve a abrirlas en un momento.</p>}
      {estado.fase === "lista" &&
        agruparLineas(estado.lineas).map((m) => (
          <div key={m.modelo} className="space-y-1">
            <p className="text-sm font-semibold text-tinta">
              {m.modelo}
              {m.marca ? <span className="font-normal text-taupe"> · {m.marca}</span> : null} <span className="font-normal tabular-nums text-taupe">· {m.total}</span>
            </p>
            {m.colores.map((c) => (
              <div key={c.color} className="ml-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="min-w-24 text-tinta">{c.colorNombre}</span>
                <span className="flex flex-wrap gap-1">
                  {c.tallas.map((t) => (
                    <span key={t.talla ?? "sin"} className="rounded-lg bg-hueso px-2 py-0.5 text-xs font-semibold tabular-nums text-tinta">
                      {t.talla ?? "—"} {t.n}
                    </span>
                  ))}
                </span>
                <b className="font-semibold tabular-nums text-tinta">{c.total}</b>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

// Confirmar y pedir: el único paso que crea la orden de compra. La hoja dice cuánto es, a nombre de quién y qué cambia en Finanzas; avisa si la fecha llegaría tarde.
function ConfirmarPedido({ p, hoy, onClose, onHecho }: { p: PedidoDeCampana; hoy: string; onClose: () => void; onHecho: () => void }) {
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviando = useRef(false);
  const aviso = avisoDePlazo(p, hoy, fechaCortaES);

  async function confirmar(cerrar: () => void) {
    if (enviando.current || p.cambioElProveedor) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    enviando.current = true;
    setGuardando(true);
    setError(null);
    const firma = responsable.firma();
    const { data, error: falla } = await firmar(createClient().rpc(RPC_CONFIRMAR_PEDIDO as never, argsConfirmar(p.id) as never), firma);
    responsable.despues(falla);
    setGuardando(false);
    enviando.current = false;
    if (falla) {
      // Se cortó la red: puede que la orden ya se haya creado. Volver a pulsar devuelve la MISMA orden, no crea otra.
      if (esFalloDeRed(falla)) return void setError("Se cortó la conexión: no sabemos si la orden se creó. Vuelve a pulsar «Crear la orden»; si ya existe, te muestra la misma, no crea otra.");
      return void setError(traducirError(falla, "crear la orden de compra"));
    }
    const resultado = data as { numero?: unknown; sin_cambios?: unknown } | null;
    const numero = Number(resultado?.numero ?? 0);
    avisar.exito(numero > 0 ? `Orden OC-${String(numero).padStart(6, "0")} creada` : "Orden creada", {
      detalle: resultado?.sin_cambios === true ? "Ese pedido ya se había confirmado: es la misma orden." : `${p.proveedor.nombre} · ${p.unidades.toLocaleString("es-PE")} prendas.`,
    });
    onHecho();
    cerrar();
  }

  return (
    <Modal titulo={`Confirmar y pedir: ${p.proveedor.nombre}`} subtitulo={`${p.plan.nombre} · ${p.unidades.toLocaleString("es-PE")} prendas de ${p.modelos} ${p.modelos === 1 ? "modelo" : "modelos"}.`} onClose={onClose} variante="hoja" tamano="mediana">
      {(cerrar) => (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TarjetaCifra etiqueta="Al costo del plan" valor={soles(alCostoDelPedido(p))}>
              {p.unidades.toLocaleString("es-PE")} prendas a {soles(p.costoUnitario)}
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Cuándo pensabas pedirlo" valor={fraseDeCuando(p.cuando, p.fechaPrevista).replace("Pedir ", "")}>
              Lo dijo {p.enviadoPor ?? "quien lo envió"}
            </TarjetaCifra>
          </div>
          <p className="nota-cayla">
            Se crea la <b className="font-semibold">orden de compra</b> con estas líneas, a nombre de {p.proveedor.nombre}. Es el paso que sí pide la mercadería. En Finanzas, este pedido pasa de «falta pedir» a «pedido sin pagar».
          </p>
          {aviso && (
            <Aviso tono="atencion" titulo={aviso.tipo === "plazo-vencido" ? "El plazo para pedir ya pasó" : "Con la fecha que tenías pensada llegaría tarde"}>
              {aviso.tipo === "plazo-vencido"
                ? `Lo que pidas hoy llega a las tiendas después del inicio de ${p.plan.nombre} (el ${fechaCortaES(p.plan.desde)}). Aun así puedes pedirlo.`
                : `Pedir después del ${fechaCortaES(limiteParaPedir(p))} llega a las tiendas después del ${fechaCortaES(p.plan.desde)}. Si quieres pedirlo ya, cambia la fecha primero (o confirma igual).`}
            </Aviso>
          )}
          {p.desactualizado && (
            <Aviso tono="atencion" titulo="El plan cambió después de enviar este pedido">
              Esto es lo que se envió, no lo último que quedó en el paso 2. Confirma solo si es lo que quieres pedir; si no, rectifícalo y vuélvelo a enviar desde el Plan.
            </Aviso>
          )}
          {p.cambioElProveedor && (
            <Aviso tono="error" titulo="Un modelo ya es de otro proveedor">
              No se le puede pedir a {p.proveedor.nombre} lo que ahora surte otro. Rectifica este pedido y vuelve a enviarlo desde el Plan.
            </Aviso>
          )}
          {error && (
            <Aviso tono="error" titulo="No se pudo crear la orden" enfocable>
              {error}
            </Aviso>
          )}
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          <PieAcciones>
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="button" peso="primario" cargando={guardando} textoCargando="Creando la orden…" disabled={p.cambioElProveedor} onClick={() => void confirmar(cerrar)}>
              Crear la orden y pedir
            </Boton>
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}

// Cambiar la fecha: solo cambia cuándo piensa pedir quien lo envió; no pide nada.
function CambiarFecha({ p, hoy, onClose, onHecho }: { p: PedidoDeCampana; hoy: string; onClose: () => void; onHecho: () => void }) {
  const responsable = useResponsable();
  const limite = limiteParaPedir(p);
  const [elegido, setElegido] = useState<Elegido>(() => (p.cuando === "fecha" && p.fechaPrevista ? { cuando: "fecha", fecha: p.fechaPrevista } : PEDIR_YA));
  const [guardando, setGuardando] = useState(false);
  const enviando = useRef(false);
  const problema = problemaDeLaFecha(elegido, hoy);
  const igual = elegido.cuando === p.cuando && (elegido.cuando === "ya" || elegido.fecha === p.fechaPrevista);

  async function guardar(cerrar: () => void) {
    if (enviando.current || problema !== null || igual) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    enviando.current = true;
    setGuardando(true);
    const firma = responsable.firma();
    const { error } = await firmar(createClient().rpc(RPC_CAMBIAR_FECHA_PEDIDO as never, argsCambiarFecha(p.id, elegido) as never), firma);
    responsable.despues(error);
    setGuardando(false);
    enviando.current = false;
    if (error) {
      if (esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras se guardaba la fecha: no sabemos si llegó. Vuelve a pulsar «Guardar la fecha»; guardar lo mismo dos veces no cambia nada.");
      return void avisar.error(traducirError(error, "guardar la fecha"));
    }
    avisar.exito(`Fecha guardada: ${fraseDeCuando(elegido.cuando, elegido.fecha)}`, { detalle: "Solo cambia cuándo piensas pedir; no se pidió nada." });
    onHecho();
    cerrar();
  }

  return (
    <Modal titulo={`¿Cuándo piensas pedir a ${p.proveedor.nombre}?`} subtitulo="Solo cambia la fecha prevista; no pide nada." onClose={onClose} variante="hoja" tamano="angosta">
      {(cerrar) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <SegmentoDeslizante
              etiqueta={`Cuándo pedir a ${p.proveedor.nombre}`}
              valor={elegido.cuando}
              onCambio={(c) => setElegido(conCuando(elegido, c === "fecha" ? "fecha" : "ya", hoy, limite >= hoy ? limite : null))}
              opciones={[
                { clave: "ya", etiqueta: "Pedir ya" },
                { clave: "fecha", etiqueta: "Pedir el…" },
              ]}
            />
            {elegido.cuando === "fecha" && (
              <span className="w-44">
                <CampoFecha
                  etiqueta={<span className="sr-only">Fecha en que pedir a {p.proveedor.nombre}</span>}
                  caja
                  estricto
                  disabled={guardando}
                  valor={elegido.fecha}
                  onValor={(iso) => setElegido({ cuando: "fecha", fecha: iso })}
                  {...(problema && elegido.fecha !== "" ? { tono: "error" as const, pie: problema } : {})}
                />
              </span>
            )}
            {llegaTarde(elegido, limite) && (
              <Chip tono="ambar" versalitas={false} title="Con esa fecha, la mercadería llega a las tiendas después de que empiece la campaña">
                Llega tarde: después del {fechaCortaES(limite)}
              </Chip>
            )}
          </div>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          <PieAcciones>
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="button" peso="primario" cargando={guardando} disabled={problema !== null || igual} title={igual ? "No cambiaste nada" : (problema ?? undefined)} onClick={() => void guardar(cerrar)}>
              Guardar la fecha
            </Boton>
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}
