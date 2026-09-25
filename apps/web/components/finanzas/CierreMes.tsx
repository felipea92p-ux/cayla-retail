"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CabeceraBloque, CampoFin, InputFin, SelectFin, Superficie } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { fechaCorta } from "@/lib/gastos-reglas";
import {
  avisosPendientes,
  bajadaUnidad,
  deUnidad,
  deUnidadLarga,
  diaDe,
  enlaceChequeo,
  estadoConsolidado,
  estadoTarjeta,
  historiaDe,
  huellaCorta,
  nombreMes,
  primerNombre,
  puedeCerrar,
  textoBotonCerrar,
  textoChequeo,
  textoOpcionMes,
  tituloPantalla,
  tituloUnidad,
  unidadInicial,
  validarMotivo,
  type PanelCierre,
  type Unidad,
} from "@/lib/cierre-reglas";

// Finanzas ▸ Cierre de mes (ADR-0195 F9, ADR-0198), dibujada como el spike aprobado (docs/maquetas/finanzas-2026-09/,
// `vista-cierre.js`): cabecera con «CAYLA entera» y el mes → la matriz de unidades con su estado y su huella → los chequeos
// de la unidad elegida con «Cerrar {mes} de {unidad}» o «Reabrir…» | la rutina de fin de mes. Solo el líder llega aquí
// (`exigirModulo("cierre_mes")`, no delegable). Todo lo decide la base: qué está cerrado, qué chequeos aplican y si pasan;
// `cerrar_periodo` los vuelve a medir. La pantalla solo lee, pone en palabras y firma con el responsable.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

type Accion = { tipo: "cerrar"; unidad: Unidad } | { tipo: "consolidado" } | { tipo: "reabrir"; unidad: Unidad } | null;

export function CierreMes({ panel, falla, unidadPedida }: { panel: PanelCierre | null; falla: string | null; unidadPedida: string | null }) {
  if (!panel) {
    return (
      <div className="space-y-6">
        <CabeceraPantalla sobretitulo="Finanzas · Cierre de mes" titulo="Cierre de mes" />
        <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla ?? "No se pudo leer el cierre de mes."}</p>
      </div>
    );
  }
  return <Pantalla panel={panel} unidadPedida={unidadPedida} />;
}

function Pantalla({ panel, unidadPedida }: { panel: PanelCierre; unidadPedida: string | null }) {
  const router = useRouter();
  const { mes, unidades, consolidado } = panel;
  const [elegida, setElegida] = useState<string | null>(() => unidadInicial(unidades, unidadPedida));
  const [accion, setAccion] = useState<Accion>(null);
  // Si se cambió de mes y la elegida no existe en él, se abre la que corresponde por defecto.
  const u = unidades.find((x) => x.clave === elegida) ?? unidades.find((x) => x.clave === unidadInicial(unidades)) ?? null;
  const cons = estadoConsolidado(panel);
  const irMes = (m: string) => router.push(`/finanzas/cierre?mes=${m}`, { scroll: false });

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Finanzas · Cierre de mes"
        titulo={tituloPantalla(mes)}
        accionesAbajo
        bajada="Cerrar un mes lo congela: nadie puede registrar ni cambiar nada con fecha de ese mes, y el diario queda guardado con su huella. Se cierra cada tienda, el Taller y lo de la empresa; CAYLA entera, cuando cerraron todas (ADR-0198)."
        acciones={
          <>
            <Chip versalitas={false}>CAYLA entera</Chip>
            <SelectFin value={mes} onChange={(e) => irMes(e.target.value)} aria-label="Mes que se cierra" className="w-auto min-w-[150px]">
              {panel.meses.map((m) => (
                <option key={m.mes} value={m.mes}>
                  {textoOpcionMes(m)}
                </option>
              ))}
            </SelectFin>
          </>
        }
      />

      <div className="fin-matriz anim-sube" style={{ ["--n" as string]: Math.min(6, unidades.length + 1) } as CSSProperties}>
        {unidades.map((x) => {
          const e = estadoTarjeta(x);
          return (
            <button key={x.clave} type="button" className="fin-unidad" aria-pressed={u?.clave === x.clave} onClick={() => setElegida(x.clave)}>
              <span className="fin-unidad-n">{x.nombre}</span>
              <Chip tono={e.tono} className="self-start">
                {e.texto}
              </Chip>
              {x.estado === "cerrado" && x.cierre ? (
                <>
                  <span className="fin-unidad-sub">
                    {fechaCorta(diaDe(x.cierre.cerradoEn))} · {primerNombre(x.cierre.cerradoPor)}
                  </span>
                  <span className="fin-unidad-h" title={x.cierre.huella}>
                    {huellaCorta(x.cierre.huella)}
                  </span>
                </>
              ) : x.estado === "reabierto" && x.cierre?.reabiertoEn ? (
                <span className="fin-unidad-sub">reabierto el {fechaCorta(diaDe(x.cierre.reabiertoEn))}</span>
              ) : null}
            </button>
          );
        })}
        <div className="fin-unidad fin-unidad-cons">
          <span className="fin-unidad-n">CAYLA entera</span>
          {cons.estado === "cerrado" ? (
            <>
              <Chip tono="verde" className="self-start">
                cerrado
              </Chip>
              {consolidado.cierre && (
                <span className="fin-unidad-h" title={consolidado.cierre.huella}>
                  {huellaCorta(consolidado.cierre.huella)}
                </span>
              )}
            </>
          ) : cons.estado === "listo" ? (
            <button type="button" className="btn-cayla btn-primario btn-chico self-start" onClick={() => setAccion({ tipo: "consolidado" })}>
              Cerrar {nombreMes(mes)}
            </button>
          ) : (
            <>
              <Chip tono="neutro" className="self-start">
                faltan {cons.faltan}
              </Chip>
              <span className="fin-unidad-sub">Se habilita cuando cierran todas</span>
            </>
          )}
        </div>
      </div>

      <section className="fin-dos-col fin-cierre-cols">
        {u ? <Chequeos panel={panel} u={u} onCerrar={() => setAccion({ tipo: "cerrar", unidad: u })} onReabrir={() => setAccion({ tipo: "reabrir", unidad: u })} /> : <div />}
        <Superficie pad className="anim-sube">
          <p className="label-cayla text-[11px] text-taupe">La rutina de fin de mes</p>
          <div className="fin-pasos-cierre">
            <div>
              <h3>Día 1 · cada tienda (20 min)</h3>
              <p>Cerrar la última caja del mes, clasificar los egresos (los depósitos incluidos) y regularizar las prendas vendidas sin código.</p>
            </div>
            <div>
              <h3>Día 2 · el líder (40 min)</h3>
              <p>Revisar que estén todos los gastos fijos y las facturas, conciliar el banco y explicar cualquier diferencia de caja.</p>
            </div>
            <div>
              <h3>Día 3 · el sistema (5 min)</h3>
              <p>Mirar el Estado de resultados contra el mes anterior y cerrar. Desde ahí, el mes ya no cambia.</p>
            </div>
          </div>
          <p className="nota-cayla mt-3.5">
            Solo el líder cierra y reabre (el módulo no se puede delegar). Reabrir pide motivo y queda en la historia; reabrir una tienda reabre también CAYLA
            entera. Lo de hoy nunca se bloquea: una devolución o una anulación de hoy sobre una venta de un mes cerrado va al mes de hoy.
          </p>
        </Superficie>
      </section>

      {accion?.tipo === "cerrar" && (
        <CerrarModal
          mes={mes}
          unidad={accion.unidad}
          onCerrar={() => setAccion(null)}
          alCerrar={() => {
            // Como el spike: después de cerrar, se pasa a la siguiente unidad que falta.
            const siguiente = unidades.find((x) => x.clave !== accion.unidad.clave && x.estado !== "cerrado");
            if (siguiente) setElegida(siguiente.clave);
          }}
        />
      )}
      {accion?.tipo === "consolidado" && <CerrarConsolidadoModal mes={mes} onCerrar={() => setAccion(null)} />}
      {accion?.tipo === "reabrir" && <ReabrirModal mes={mes} unidad={accion.unidad} onCerrar={() => setAccion(null)} />}
    </div>
  );
}

function Chequeos({ panel, u, onCerrar, onReabrir }: { panel: PanelCierre; u: Unidad; onCerrar: () => void; onReabrir: () => void }) {
  const historia = historiaDe(panel, u);
  const cerrada = u.estado === "cerrado";
  return (
    <Superficie pad className="anim-sube">
      <CabeceraBloque titulo={tituloUnidad(panel.mes, u)} bajada={bajadaUnidad(u)} />
      <ul className="fin-chequeos">
        {u.chequeos.map((c, i) => {
          const t = textoChequeo(c, panel.mes);
          const href = cerrada ? null : enlaceChequeo(c, u, panel.mes);
          return (
            <li key={c.clave} {...entra(i + 1)}>
              <span className="fin-ok-ic" data-tono={c.ok ? undefined : c.bloquea ? "rojo" : "ambar"} aria-label={c.ok ? "listo" : c.bloquea ? "falta (bloquea el cierre)" : "aviso"}>
                {c.ok ? "✓" : "!"}
              </span>
              <div className="min-w-0">
                <b>{t.titulo}</b>
                <p>{t.detalle}</p>
              </div>
              {href ? (
                <Link href={href} className="btn-cayla btn-sutil btn-chico">
                  Resolver
                </Link>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
      {historia.length > 0 && (
        <ul className="fin-historia" aria-label="Historia del mes">
          {historia.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      <div className="fin-botones mt-4">
        {cerrada ? (
          <button type="button" className="btn-cayla btn-secundario" onClick={onReabrir}>
            Reabrir…
          </button>
        ) : (
          <button type="button" className="btn-cayla btn-primario" onClick={onCerrar} disabled={!puedeCerrar(u)}>
            {textoBotonCerrar(panel.mes, u)}
          </button>
        )}
      </div>
    </Superficie>
  );
}

/** Ejecuta una RPC firmada con el responsable; avisa y refresca. Devuelve si salió bien. */
function useEjecutar() {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  async function ejecutar(rpc: string, args: Record<string, unknown>, que: string, listo: string) {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién lo hace (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(createClient().rpc(rpc as never, args as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, que));
      return false;
    }
    avisar.exito(listo);
    router.refresh();
    return true;
  }
  return { responsable, guardando, ejecutar };
}

function CerrarModal({ mes, unidad, onCerrar, alCerrar }: { mes: string; unidad: Unidad; onCerrar: () => void; alCerrar: () => void }) {
  const { responsable, guardando, ejecutar } = useEjecutar();
  const avisos = avisosPendientes(unidad);
  const titulo = `Cerrar ${nombreMes(mes)} ${mes.slice(0, 4)} ${deUnidadLarga(unidad)}`;
  async function cerrar() {
    const ok = await ejecutar(
      "cerrar_periodo",
      { p_mes: `${mes}-01`, p_alcance: unidad.alcance, p_ubicacion_id: unidad.ubicacionId },
      `cerrar ${nombreMes(mes)} ${deUnidad(unidad)}`,
      `${nombreMes(mes).replace(/^./, (l) => l.toUpperCase())} ${deUnidad(unidad)} quedó cerrado.`,
    );
    if (ok) {
      alCerrar();
      onCerrar();
    }
  }
  return (
    <Modal
      variante="hoja"
      titulo={titulo}
      subtitulo={`Desde ahora nadie podrá registrar ni cambiar gastos, facturas, pagos ni movimientos ${deUnidad(unidad)} con fecha de ese mes. Se guarda el diario con su huella.`}
      onClose={onCerrar}
      ancho="max-w-[520px]"
    >
      {avisos.length > 0 && (
        <div className="nota-cayla mb-4">
          <b>Cierras con {avisos.length === 1 ? "un aviso" : `${avisos.length} avisos`}:</b>{" "}
          {avisos.map((c) => textoChequeo(c, mes).titulo.toLowerCase()).join(" · ")}. Quedan guardados en la historia del cierre.
        </div>
      )}
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={cerrar} disabled={guardando || !responsable.listo}>
          {guardando ? "Cerrando…" : "Cerrar el mes"}
        </button>
      </div>
    </Modal>
  );
}

function CerrarConsolidadoModal({ mes, onCerrar }: { mes: string; onCerrar: () => void }) {
  const { responsable, guardando, ejecutar } = useEjecutar();
  async function cerrar() {
    const ok = await ejecutar(
      "cerrar_periodo",
      { p_mes: `${mes}-01`, p_alcance: "consolidado", p_ubicacion_id: null },
      `cerrar ${nombreMes(mes)} de CAYLA entera`,
      `${nombreMes(mes).replace(/^./, (l) => l.toUpperCase())} de CAYLA quedó cerrado.`,
    );
    if (ok) onCerrar();
  }
  return (
    <Modal
      variante="hoja"
      titulo={`Cerrar ${nombreMes(mes)} ${mes.slice(0, 4)} de CAYLA entera`}
      subtitulo="Todas las unidades ya cerraron. El consolidado queda congelado con su huella y es el que se le entrega al contador."
      onClose={onCerrar}
      ancho="max-w-[520px]"
    >
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={cerrar} disabled={guardando || !responsable.listo}>
          {guardando ? "Cerrando…" : "Cerrar consolidado"}
        </button>
      </div>
    </Modal>
  );
}

function ReabrirModal({ mes, unidad, onCerrar }: { mes: string; unidad: Unidad; onCerrar: () => void }) {
  const { responsable, guardando, ejecutar } = useEjecutar();
  const [motivo, setMotivo] = useState("");
  const [tocado, setTocado] = useState(false);
  const error = validarMotivo(motivo);
  async function reabrir() {
    setTocado(true);
    if (error) return avisar.error(error);
    const ok = await ejecutar(
      "reabrir_periodo",
      { p_mes: `${mes}-01`, p_alcance: unidad.alcance, p_ubicacion_id: unidad.ubicacionId, p_motivo: motivo.trim() },
      `reabrir ${nombreMes(mes)} ${deUnidad(unidad)}`,
      "Mes reabierto. El motivo quedó en la historia.",
    );
    if (ok) onCerrar();
  }
  return (
    <Modal
      variante="hoja"
      titulo={`Reabrir ${nombreMes(mes)} ${mes.slice(0, 4)} ${deUnidadLarga(unidad)}`}
      subtitulo="Los números de ese mes pueden volver a cambiar. Queda en la historia quién, cuándo y por qué; CAYLA entera también se reabre."
      onClose={onCerrar}
      ancho="max-w-[520px]"
    >
      <CampoFin etiqueta="Motivo (obligatorio)" htmlFor="reabrir-motivo" ayuda={tocado && error ? error : undefined} tono={tocado && error ? "aviso" : undefined}>
        <InputFin id="reabrir-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={`Ej. llegó una factura de ${nombreMes(mes)} tarde`} />
      </CampoFin>
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={reabrir} disabled={guardando || !responsable.listo}>
          {guardando ? "Reabriendo…" : "Reabrir"}
        </button>
      </div>
    </Modal>
  );
}
