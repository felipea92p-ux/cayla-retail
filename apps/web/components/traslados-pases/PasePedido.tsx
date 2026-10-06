"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, PackageOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { AvisarAlClienteModal, SigueEnPieModal, SubirPedidoAlAlmacenModal } from "@/components/PedidoClienteModales";
import { YaNoLaEnvioModal } from "@/components/ParaEnviar";
import { PaseTraslado, usePase } from "@/components/traslados-pases/PaseTraslado";
import { RUTA_TRASLADOS } from "@/components/traslados-pases/Billetera";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { hoyLima } from "@/lib/apartados-reglas";
import {
  etiquetaLinea,
  faltaEnOrigen,
  llegadaIso,
  motivoCancelacion,
  opcionesLlegada,
  textoPrendas,
  totalPrendas,
  type OpcionLlegada,
  type PedidoEntreSedes,
} from "@/lib/pedidos-entre-sedes-reglas";
import { accionesDe, avisoAlCliente, estadoVisibleConCliente, paraSubirDe, type ClientePedido } from "@/lib/pedidos-con-cliente-reglas";
import { estadoVisiblePedido } from "@/lib/pedidos-entre-sedes-reglas";
import { avisoNoEstaCompleta, esperaParaEnviar, etiquetaParaEnviar, noEstaCompleta, urlArmarEnvio, type GrupoParaEnviar, type PrendaParaEnviar } from "@/lib/para-enviar-reglas";
import { camposDelPedido } from "@/lib/traslados-pedidos-pases-reglas";
import type { VistaPase } from "@/lib/traslados-pases-reglas";

// Un pedido entre sedes como pase (ADR-0355, actividad 4; maqueta D: «LIM te pide una prenda»). Al frente, de quién a quién y
// los botones de siempre (`accionesDe`): «No la tengo» y «Enviar», «Subir al almacén», «Avisar al cliente», «¿Sigue en pie?». Al
// reverso, lo que antes eran las ventanas «Enviar» y «No la tengo»: la lista, cuándo llega y quién lo hace. Al terminar, el sello
// (ENVIADO, NO LA TENGO) y la siguiente caja que te toca. Las RPC son las mismas que usaba la tarjeta «Pedidos y envíos entre sedes».

type Sede = { ubicacionId: string; etiqueta: string };
type Modo = "enviar" | "cancelar" | "ver";
const conCliente = (p: PedidoEntreSedes): p is PedidoEntreSedes & { cliente: ClientePedido } => !!p.cliente;

export function PasePedido({ pedido: p, vista, sede, ahoraIso }: { pedido: PedidoEntreSedes; vista: VistaPase; sede: Sede; ahoraIso: string }) {
  const [modo, setModo] = useState<Modo>("ver");
  const [ventana, setVentana] = useState<null | "subir" | "avisar" | "sigue">(null);
  const aviso = avisoAlCliente(p);
  return (
    <>
      <PaseTraslado
        key={vista.id}
        vista={vista}
        accion={<FrentePedido pedido={p} vista={vista} ahoraIso={ahoraIso} onModo={setModo} onVentana={setVentana} />}
        reverso={<ReversoPedido pedido={p} modo={modo} sede={sede} onModo={setModo} />}
      />
      {ventana === "subir" && conCliente(p) && <SubirPedidoAlAlmacenModal pedido={paraSubirDe(p)} ubicacion={sede} onClose={() => setVentana(null)} />}
      {ventana === "avisar" && conCliente(p) && aviso && <AvisarAlClienteModal pedido={p} aviso={aviso} sede={sede} onClose={() => setVentana(null)} />}
      {ventana === "sigue" && conCliente(p) && <SigueEnPieModal pedido={p} sede={sede} ahoraIso={ahoraIso} onClose={() => setVentana(null)} />}
    </>
  );
}

/** Los botones del frente. El principal lleva `tp-boton` (a él vuelve el foco al girar de vuelta). */
function FrentePedido({
  pedido: p,
  vista,
  ahoraIso,
  onModo,
  onVentana,
}: {
  pedido: PedidoEntreSedes;
  vista: VistaPase;
  ahoraIso: string;
  onModo: (m: Modo) => void;
  onVentana: (v: "subir" | "avisar" | "sigue") => void;
}) {
  const pase = usePase();
  const a = accionesDe(p, ahoraIso);
  const girarA = (m: Modo) => {
    onModo(m);
    pase.girar(true);
  };
  const flecha = <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={1.8} />;
  const botones: ReactNode[] = [];
  if (a.noLaTengo) {
    botones.push(
      <button key="no" type="button" onClick={() => girarA("cancelar")} className="btn-cayla btn-secundario">
        No la tengo
      </button>,
    );
  }
  if (a.subirAlAlmacen) {
    botones.push(
      <button key="subir" type="button" onClick={() => onVentana("subir")} className={`btn-cayla ${a.enviar ? "btn-secundario" : "btn-primario tp-boton"} `}>
        Subir al almacén
      </button>,
    );
  }
  if (a.enviar) {
    botones.push(
      <button key="enviar" type="button" onClick={() => girarA("enviar")} className="btn-cayla btn-primario tp-boton">
        {vista.boton.texto} {flecha}
      </button>,
    );
  }
  if (a.sigueEnPie) {
    botones.push(
      <button key="sigue" type="button" onClick={() => onVentana("sigue")} className="btn-cayla btn-primario tp-boton">
        ¿Sigue en pie?
      </button>,
    );
  }
  if (a.avisar) {
    botones.push(
      <button key="avisar" type="button" onClick={() => onVentana("avisar")} className={`btn-cayla ${p.cliente?.avisadoEn ? "btn-secundario" : "btn-primario"} ${a.sigueEnPie ? "" : "tp-boton"}`}>
        {p.cliente?.avisadoEn ? "Avisar otra vez" : avisoAlCliente(p) === "no_llego" ? "Avisar que no llegó" : "Avisar al cliente"}
      </button>,
    );
  }
  if (!a.enviar && !a.noLaTengo && !a.subirAlAlmacen) {
    botones.push(
      <button key="ver" type="button" onClick={() => girarA("ver")} className={`btn-cayla btn-secundario ${botones.length === 0 ? "tp-boton" : ""}`}>
        {p.direccion === "pedi" ? "Ver lo que pediste" : "Ver el pedido"} {flecha}
      </button>,
    );
  }
  if (a.verTraslado && p.trasladoId) {
    botones.push(
      <Link key="caja" href={`${RUTA_TRASLADOS}/${p.trasladoId}`} scroll={false} className="btn-cayla btn-enlace">
        {p.trasladoNumero != null ? `Caja Nº ${p.trasladoNumero}` : "Ver la caja"}
      </Link>,
    );
  }
  return <div className="tp-acciones">{botones}</div>;
}

/** El reverso: enviar (la lista, cuándo llega, quién), cancelar («No la tengo» / «Ya no la necesito») o mirar el pedido. */
function ReversoPedido({ pedido: p, modo, sede, onModo }: { pedido: PedidoEntreSedes; modo: Modo; sede: Sede; onModo: (m: Modo) => void }) {
  const pase = usePase();
  const opciones = opcionesLlegada(hoyLima());
  const [llegada, setLlegada] = useState<OpcionLlegada>(opciones[1]);
  const [trabajando, setTrabajando] = useState(false);
  // Un token por pase abierto: el doble clic (o reintentar tras un corte) no arma dos traslados.
  const token = useRef<string>(crypto.randomUUID());
  const responsable = useResponsable(sede);
  const guia = useGuiaCampos(modo === "ver" ? [] : camposDelPedido(responsable.listo, responsable.motivo), { enModal: false });
  const total = totalPrendas(p);
  const mePiden = p.direccion === "me_piden";
  const faltan = p.lineas.filter(faltaEnOrigen);
  const motivo = p.cliente && !mePiden ? "El cliente ya no la quiere" : motivoCancelacion(p.direccion);
  const estado = conCliente(p) ? estadoVisibleConCliente(p) : estadoVisiblePedido(p);
  const a = accionesDe(p);

  async function enviar() {
    if (!responsable.listo) return;
    setTrabajando(true);
    const supabase = createClient();
    const { error } = await firmar(
      p.cliente
        ? supabase.rpc("enviar_pedido_para_apartar", { p_pedido_id: p.grupoId, p_fecha_estimada_llegada: llegadaIso(llegada.fecha), p_token: token.current })
        : supabase.rpc("enviar_pedido_a_otra_sede", { p_grupo_id: p.grupoId, p_fecha_estimada_llegada: llegadaIso(llegada.fecha), p_token: token.current }),
      responsable.firma(),
    );
    setTrabajando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "enviar el pedido", { confirmarAntesDeRepetir: true }));
    avisar.exito(`Enviado a ${p.otraSede}`, { detalle: `Salió como traslado: ${textoPrendas(total)}, llega ${llegada.etiqueta.toLowerCase()}.` });
    pase.sellar("ENVIADO", "sale", { luego: RUTA_TRASLADOS });
  }

  async function cancelar() {
    if (!responsable.listo) return;
    setTrabajando(true);
    const supabase = createClient();
    const { error } = await firmar(
      p.cliente
        ? supabase.rpc("cancelar_pedido_para_apartar", { p_pedido_id: p.grupoId, p_motivo: motivo })
        : supabase.rpc("cancelar_pedido_a_otra_sede", { p_grupo_id: p.grupoId, p_motivo: motivo }),
      responsable.firma(),
    );
    setTrabajando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "cancelar el pedido"));
    avisar.exito("Pedido cancelado", { detalle: `${p.otraSede} lo verá como «${motivo}».` });
    pase.sellar(mePiden ? "NO LA TENGO" : "CANCELADO", "anulado", { luego: RUTA_TRASLADOS });
  }

  const titulo =
    modo === "enviar" ? `Enviar a ${p.otraSede}` : modo === "cancelar" ? (mePiden ? "¿No la tienes?" : "¿Ya no la necesitas?") : mePiden ? "Lo que te piden" : "Lo que pediste";

  return (
    <>
      <header className="tp-banda tp-banda-atras">
        <button type="button" className="tp-volver" onClick={() => pase.girar(false)} data-foco-reverso>
          <ArrowLeft aria-hidden strokeWidth={2} className="h-4 w-4" /> Volver
        </button>
        <span className="tp-banda-nombre" role="heading" aria-level={2}>
          {titulo}
        </span>
        <span className="tp-banda-num">{textoPrendas(total)}</span>
      </header>
      <div className="tp-reverso-cuerpo">
        <ul className="tp-prendas" aria-label="Prendas del pedido">
          {p.lineas.map((l) => (
            <li key={l.pedidoId || l.varianteId} className="tp-prenda-fila">
              <div className="tp-prenda tp-prenda-sin-foto">
                <span className="tp-prenda-nombre">
                  <b>{etiquetaLinea(l)}</b>
                  <span>{[l.sku, mePiden && faltaEnOrigen(l) ? `te ${l.disponibleEnOrigen === 1 ? "queda 1" : `quedan ${l.disponibleEnOrigen}`}` : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="tp-llegaron">{l.cantidad}</span>
              </div>
            </li>
          ))}
        </ul>
        {p.nota && (
          <blockquote className="tp-cita">
            “{p.nota}”<cite>{p.creadoPorNombre ? `${p.creadoPorNombre}, al pedirla` : "Al pedirla"}</cite>
          </blockquote>
        )}
        {modo === "ver" && (
          <p className="tp-dato">
            {estado.texto}
            {p.canceladoMotivo ? ` · ${p.canceladoMotivo}` : ""}
          </p>
        )}
        {modo === "enviar" && (
          <>
            {faltan.length > 0 && (
              <p className="tp-cita" data-error>
                <AlertTriangle aria-hidden className="mr-1 inline h-3.5 w-3.5" strokeWidth={1.75} />
                Ya no tienes libre todo lo pedido de {faltan.map(etiquetaLinea).join(", ")}. Si no puedes enviarlo completo, vuelve y usa «No la tengo».
              </p>
            )}
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-tinta">¿Cuándo llega?</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="¿Cuándo llega?">
                {opciones.map((o) => (
                  <button key={o.clave} type="button" className="pildora-cayla" aria-pressed={llegada.clave === o.clave} onClick={() => setLlegada(o)} disabled={trabajando}>
                    {o.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <p className="tp-dato">
              {p.cliente
                ? `Está apartada para el pedido de ${p.otraSede}: sale de tu almacén como una caja más y, al llegar, ${p.otraSede} la tiene guardada para su cliente.`
                : `Sale de tu stock como una caja más; queda en camino hasta que ${p.otraSede} la reciba.`}
            </p>
          </>
        )}
        {modo === "cancelar" && (
          <p className="tp-dato">{mePiden ? `Se le avisa a ${p.otraSede} que no se enviará.` : `Se cancela el pedido a ${p.otraSede}.`}</p>
        )}
        {modo !== "ver" && (
          <CampoGuiado id="responsable-pedido" guia={guia} titulo="¿Quién lo hace?">
            <ComboResponsable control={responsable} deshabilitado={trabajando} compacto className="w-full" />
          </CampoGuiado>
        )}
      </div>
      {modo === "ver" ? (
        a.yaNoLaNecesito ? (
          <div className="tp-reverso-pie">
            <button type="button" onClick={() => onModo("cancelar")} className="btn-cayla btn-secundario">
              {p.cliente ? "Ya no la quiere" : "Ya no la necesito"}
            </button>
          </div>
        ) : null
      ) : (
        <div className="tp-reverso-pie">
          <PieGuia guia={guia} listo="Listo." />
          <div className="tp-fila">
            <button type="button" onClick={() => (mePiden || modo === "enviar" ? pase.girar(false) : onModo("ver"))} disabled={trabajando} className="btn-cayla btn-secundario">
              Mejor no
            </button>
            <button
              type="button"
              onClick={() => void (modo === "enviar" ? enviar() : cancelar())}
              disabled={trabajando || !guia.puedeConfirmar}
              title={guia.frase ?? undefined}
              className={`btn-cayla ${modo === "enviar" ? "btn-primario" : "btn-peligro"} tp-grande ${guia.claseConfirmar}`}
            >
              {trabajando ? (modo === "enviar" ? "Enviando…" : "Cancelando…") : modo === "enviar" ? "Enviar por traslado" : motivo}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** «Para enviar a LIM» como pase: al frente, armar el envío (Nuevo traslado ya cargado); al reverso, lo que subiste, cada prenda con
 *  cuánto lleva esperando y «Ya no la envío». */
export function PaseParaEnviar({ grupo: g, vista, sede, ahoraIso }: { grupo: GrupoParaEnviar; vista: VistaPase; sede: Sede; ahoraIso: string }) {
  const [yaNo, setYaNo] = useState<PrendaParaEnviar | null>(null);
  const url = urlArmarEnvio(g);
  return (
    <>
      <PaseTraslado key={vista.id} vista={vista} accion={<FrenteParaEnviar url={url} vista={vista} />} reverso={<ReversoParaEnviar grupo={g} url={url} ahoraIso={ahoraIso} onYaNo={setYaNo} />} />
      {yaNo && <YaNoLaEnvioModal prenda={yaNo} ubicacion={sede} onClose={() => setYaNo(null)} />}
    </>
  );
}

function FrenteParaEnviar({ url, vista }: { url: string | null; vista: VistaPase }) {
  const pase = usePase();
  return (
    <div className="tp-acciones">
      <button type="button" onClick={() => pase.girar(true)} className={`btn-cayla btn-secundario ${url ? "" : "tp-boton"}`}>
        Ver lo que subiste
      </button>
      {url && (
        <Link href={url} className="btn-cayla btn-primario tp-boton">
          <PackageOpen aria-hidden className="h-4 w-4" strokeWidth={1.75} /> {vista.boton.texto}
        </Link>
      )}
    </div>
  );
}

function ReversoParaEnviar({ grupo: g, url, ahoraIso, onYaNo }: { grupo: GrupoParaEnviar; url: string | null; ahoraIso: string; onYaNo: (p: PrendaParaEnviar) => void }) {
  const pase = usePase();
  return (
    <>
      <header className="tp-banda tp-banda-atras">
        <button type="button" className="tp-volver" onClick={() => pase.girar(false)} data-foco-reverso>
          <ArrowLeft aria-hidden strokeWidth={2} className="h-4 w-4" /> Volver
        </button>
        <span className="tp-banda-nombre" role="heading" aria-level={2}>
          Lo que subiste para {g.destino}
        </span>
        <span className="tp-banda-num">{textoPrendas(g.total)}</span>
      </header>
      <div className="tp-reverso-cuerpo">
        <p className="tp-dato">Sale de esta lista cuando sale la caja. Si una ya no va, dilo aquí: sigue en tu almacén.</p>
        <ul className="tp-prendas" aria-label="Prendas para enviar">
          {g.prendas.map((p) => {
            const espera = esperaParaEnviar(p.creadoEn, ahoraIso);
            return (
              <li key={p.id} className="tp-prenda-fila">
                <div className="tp-prenda tp-prenda-sin-foto">
                  <span className="tp-prenda-nombre">
                    <b>{etiquetaParaEnviar(p)}</b>
                    <span data-tarde={espera.tarde ? "" : undefined}>
                      {[espera.texto, p.creadoPorNombre ? `por ${p.creadoPorNombre}` : null, p.sku, p.nota].filter(Boolean).join(" · ")}
                    </span>
                    {noEstaCompleta(p) && <span className="tp-aviso-prenda">{avisoNoEstaCompleta(p)}</span>}
                  </span>
                  <span className="tp-derecha">
                    <span className="tp-llegaron">{p.falta}</span>
                    <button type="button" onClick={() => onYaNo(p)} className="btn-cayla btn-enlace btn-chico">
                      Ya no la envío
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="tp-reverso-pie">
        {url ? (
          <Link href={url} className="btn-cayla btn-primario tp-grande">
            <PackageOpen aria-hidden className="h-4 w-4" strokeWidth={1.75} /> Armar el envío a {g.destino}
          </Link>
        ) : (
          <p className="tp-dato">Nada de esto está libre en tu almacén hoy.</p>
        )}
      </div>
    </>
  );
}
