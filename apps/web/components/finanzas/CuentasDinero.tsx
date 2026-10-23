"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CabeceraDinero, type PestanaDinero } from "@/components/finanzas/CabeceraDinero";
import { PagosSinCuentaModal } from "@/components/finanzas/PagosSinCuenta";
import { CabeceraBloque, CampoFin, Herramientas, InputFin, ListaDatos, OpcionesFin, PieTabla, RadiosFin, SalidaFin, SelectFin, Superficie } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { fechaCorta, solesRedondo, type UbicacionGastos, type Ver } from "@/lib/gastos-reglas";
import { leerMontoPlata, MONTO_ILEGIBLE } from "@/lib/monto-plata-reglas";
import {
  MEDIOS_COBRO,
  OPCIONES_QUE_PASO,
  TEXTO_MEDIO_COBRO,
  TEXTO_MOVIMIENTO,
  TEXTO_SIN_CUENTA,
  avisosDeMaquinas,
  cuadra,
  cuentasPara,
  deudaConDueno,
  ejemploMontoDeposito,
  ejemploReferenciaDeposito,
  leerEgresoParaMovimiento,
  leerLotePendiente,
  lotesPorDefecto,
  nombreCorto,
  nombreDeMaquinaDeLaPuente,
  saldoConCentimos,
  tituloDelMovimiento,
  opcionQuePaso,
  resumenAbono,
  resumenConciliacion,
  textoLote,
  textoSalida,
  tipoDeMovimiento,
  validarAbonoPos,
  validarMovimiento,
  type AlertaPos,
  type BorradorMovimiento,
  type Conciliacion,
  type ConciliacionCuenta,
  type CuentaDinero,
  type EgresoParaMovimiento,
  type FilaMedio,
  type LotePendiente,
  type MovimientoDinero,
  type MovimientoDueno,
  type QuePaso,
  type SinCuenta,
} from "@/lib/cuentas-dinero-reglas";
import { Boton } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { ArrowLeftRight, Landmark } from "lucide-react";
import { Globito } from "@/components/ui/Globito";
import { Volver } from "@/components/ui/Volver";
import { bancosParaCuadrar, estadoPar, respuestaCuadre, textoLadoBanco } from "@/lib/cuadrar-reglas";
import { MAX_REFERENCIA_MOVIMIENTO } from "@/lib/finanzas-topes";

// Finanzas ▸ Cuentas y dinero (ADR-0195 F3), dibujada como el spike aprobado (docs/maquetas/finanzas-2026-09/,
// `vista-dinero.js`): cabecera con «Ver» y «+ Registrar movimiento» → pestañas (una ruta cada una) → el cuerpo de la
// pestaña. La cabecera = dónde trabajas; «Ver» = qué miras. Los saldos llegan SUMADOS por la base; la pantalla no los
// recalcula. Escribe por RPC firmando con el responsable (ADR-0161).

/** Una consulta a la base SIN ejecutar: `firmar` le agrega el responsable antes de mandarla. */
type Consulta = PromiseLike<{ error: unknown }>;

// ---- La pantalla: cabecera, «Ver» y el modal de registrar, compartidos por las tres pestañas ------------------------------

/** `origenId`: la cuenta de la que sale la plata, si quien abre ya lo sabe (el aviso de una máquina atrasada abre SU depósito). */
type AbrirMovimiento = (que?: QuePaso, origenId?: string) => void;
const ContextoMovimiento = createContext<AbrirMovimiento>(() => {});

export function PantallaDinero({
  pestana,
  esLider,
  conteos,
  ubicaciones,
  ver,
  deCaylaEntera = false,
  cuentas,
  deuda,
  hoy,
  fallas,
  children,
}: {
  pestana: PestanaDinero;
  esLider: boolean;
  conteos?: Partial<Record<PestanaDinero, number>>;
  ubicaciones: UbicacionGastos[];
  ver: Ver;
  /** Conciliación es de CAYLA entera: en lugar de «Ver», lo dice. */
  deCaylaEntera?: boolean;
  /** Las cuentas que el modal ofrece (con su saldo si la cuenta lo ve). */
  cuentas: CuentaDinero[];
  /** Lo que CAYLA le debe al dueño (tope de una devolución). */
  deuda: number;
  hoy: string;
  fallas: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [modal, setModal] = useState<{ que: QuePaso; origenId?: string } | null>(null);
  const nombreSede = ver.ubicacionId ? (ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "tu tienda") : "Todas las tiendas";

  const irA = (v: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("ver", v);
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };

  return (
    <ContextoMovimiento.Provider value={(que, origenId) => setModal({ que: que ?? "deposito", origenId })}>
      <div className="space-y-6">
        <CabeceraDinero
          pestana={pestana}
          esLider={esLider}
          conteos={conteos}
          acciones={
            <>
              {deCaylaEntera ? (
                <Chip tono="neutro" versalitas={false}>
                  CAYLA entera
                </Chip>
              ) : esLider ? (
                <label className="fin-ver" data-guia="fin-ver.combo">
                  <span className="label-cayla text-[11px] text-taupe">Ver</span>
                  <SelectFin
                    etiqueta="Qué mirar"
                    valor={ver.clave}
                    onValor={irA}
                    opciones={[{ valor: "todas", texto: "Todas las tiendas" }, ...ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))]}
                  />
                </label>
              ) : (
                <Chip versalitas={false}>{nombreSede}</Chip>
              )}
              <Boton type="button" peso="primario" onClick={() => setModal({ que: "deposito" })} aria-haspopup="dialog" data-guia="fin-dinero.registrar">
                + Registrar movimiento
              </Boton>
            </>
          }
        />
        {fallas.map((f) => (
          <p key={f} className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">
            {f}
          </p>
        ))}
        {children}
      </div>
      {modal && (
        <RegistrarMovimientoModal
          inicial={modal.que}
          origenInicial={modal.origenId}
          cuentas={cuentas}
          esLider={esLider}
          ubicacionId={ver.ubicacionId}
          deuda={deuda}
          hoy={hoy}
          onCerrar={() => setModal(null)}
        />
      )}
    </ContextoMovimiento.Provider>
  );
}

// ---- Pestaña «Cuentas» ------------------------------------------------------------------------------------------------

export function CuentasPanel({
  cuentas,
  movimientos,
  medios,
  plata,
  sinCuenta,
  alertas,
  ver,
  esLider,
}: {
  cuentas: CuentaDinero[];
  movimientos: MovimientoDinero[];
  medios: FilaMedio[];
  plata: MovimientoDueno[];
  sinCuenta: SinCuenta[];
  /** Por máquina de cobro, cuánto espera depósito y cuánto ya está atrasado (ADR-0429, act. 4; solo el líder). */
  alertas?: AlertaPos[];
  ver: Ver;
  esLider: boolean;
}) {
  const abrir = useContext(ContextoMovimiento);
  const avisosMaquinas = avisosDeMaquinas(alertas ?? []);
  const [detalle, setDetalle] = useState<MovimientoDinero | null>(null);
  // F3b: lo pasado que no dice su cuenta se completa una vez, desde el aviso.
  const [decirCuenta, setDecirCuenta] = useState(false);
  const verTodas = !ver.ubicacionId;
  const dueno = deudaConDueno(plata);
  const totalSinCuenta = sinCuenta.reduce((a, s) => a + s.monto, 0);

  return (
    <>
      {/* La máquina que no depositó a tiempo (ADR-0429, act. 4): se dice arriba de las cuentas, con el camino para registrarlo. */}
      {avisosMaquinas.map((a) => (
        <Aviso
          key={a.maquina.maquinaId}
          tono="atencion"
          titulo={a.titulo}
          guia="fin-dinero.aviso-maquina"
          accion={
            <button type="button" className="btn-cayla btn-enlace" onClick={() => abrir("abono_tarjeta", a.maquina.cuentaId)} aria-haspopup="dialog" data-guia="fin-dinero.aviso-registrar">
              Registrar el depósito
            </button>
          }
        >
          {a.detalle}
        </Aviso>
      ))}

      {esLider && verTodas && (
        <Superficie pad className="anim-sube" guia="fin-dinero.dueno">
          <CabeceraBloque
            titulo="Plata del dueño"
            bajada={
              <>
                Cuando pones plata en un mal momento, eliges si es un <b className="font-semibold text-tinta">aporte</b> (se queda en CAYLA) o un <b className="font-semibold text-tinta">préstamo</b> (CAYLA te lo devuelve).
              </>
            }
          >
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => abrir("dueno_pone")} aria-haspopup="dialog" data-guia="fin-dinero.poner-plata">
                Poner plata
              </button>
              <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => abrir("dueno_saca")} aria-haspopup="dialog">
                Sacar plata
              </button>
            </div>
          </CabeceraBloque>
          <div className="fin-dueno-cifras">
            <div>
              <span className="fin-etq block">CAYLA te debe</span>
              <div className="fin-cuenta-saldo">{solesRedondo(dueno.deuda)}</div>
            </div>
            <ul className="fin-lista-mov min-w-0 flex-1 border-t border-sand">
              {dueno.prestamos.length === 0 ? (
                <li>
                  <span className="text-taupe">Sin préstamos del dueño.</span>
                  <span />
                </li>
              ) : (
                dueno.prestamos.map((p) => (
                  <li key={p.id}>
                    <span>
                      {fechaCorta(p.fecha)} · préstamo{p.referencia ? ` · ${p.referencia}` : ""}
                    </span>
                    <span>
                      {solesRedondo(p.monto)} · devuelto {solesRedondo(p.devuelto)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </Superficie>
      )}

      {esLider && verTodas && medios.length > 0 && (
        <Superficie className="anim-sube" guia="fin-dinero.medios">
          <Herramientas className="justify-between">
            <div className="fin-herramientas-titulo min-w-0">
              <b>A qué cuenta entra cada cobro</b>
              <p>Por eso Vender no cambia: el cobro guarda el medio y Finanzas sabe a qué cuenta llegó.</p>
            </div>
            <Link href="/configuracion?tab=cuentas" className="btn-cayla btn-sutil btn-chico">
              Cambiar en Configuración
            </Link>
          </Herramientas>
          <div className="fin-tabla-wrap">
            <table className="fin-tabla fin-tabla-medios">
              <thead>
                <tr>
                  <th>Tienda</th>
                  <th>Efectivo</th>
                  {MEDIOS_COBRO.map((m) => (
                    <th key={m}>{TEXTO_MEDIO_COBRO[m]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasMedios(medios).map((f) => (
                  <tr key={f.ubicacionId}>
                    <td data-l="Tienda">
                      <b>{f.ubicacionNombre}</b>
                    </td>
                    <td data-l="Efectivo">
                      <span className="fin-metodo" data-m="efectivo" />
                      {(cuentas.find((c) => c.tipo === "cajon" && c.ubicacionId === f.ubicacionId)?.nombre ?? "Su cajón").replace("Cajón · ", "Cajón ")}
                    </td>
                    {MEDIOS_COBRO.map((m) => (
                      <td key={m} data-l={TEXTO_MEDIO_COBRO[m]} className={f.porMedio[m] ? undefined : "fin-tenue"}>
                        <span className="fin-metodo" data-m={m} />
                        {f.porMedio[m] ? nombreCorto(f.porMedio[m]) : "Sin cuenta"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Superficie>
      )}

      {esLider && verTodas && totalSinCuenta !== 0 && (
        <p className="nota-cayla anim-sube" data-guia="fin-dinero.sin-cuenta">
          Este mes, <b>{soles(Math.abs(totalSinCuenta))}</b> movieron plata sin decir de qué cuenta:{" "}
          {sinCuenta.map((s) => `${s.n} ${TEXTO_SIN_CUENTA[s.origen] ?? s.origen} (${soles(Math.abs(s.monto))})`).join(", ")}. No suman en ningún saldo hasta que digan su cuenta.
          {sinCuenta.some((s) => s.origen !== "cobros") && (
            <>
              {" "}
              <button type="button" className="btn-enlace" onClick={() => setDecirCuenta(true)} aria-haspopup="dialog" data-guia="fin-dinero.decir-cuenta">
                Decir de qué cuenta fue
              </button>
            </>
          )}
        </p>
      )}
      {decirCuenta && <PagosSinCuentaModal onClose={() => setDecirCuenta(false)} />}

      <Superficie className="anim-sube" guia="fin-dinero.movimientos">
        <Herramientas>
          <b className="text-sm font-semibold text-tinta">Movimientos entre cuentas</b>
          <span className="text-[12.5px] text-taupe">Depósitos, abonos de tarjeta, transferencias y retiros. No son ventas ni gastos: la plata cambia de lugar.</span>
        </Herramientas>
        {movimientos.length === 0 ? (
          <Vacio tamano="chico" icono={<ArrowLeftRight />}>
            Sin movimientos todavía. Un depósito del cajón o el depósito de una máquina se registra con «+ Registrar movimiento».
          </Vacio>
        ) : (
          <div className="fin-tabla-wrap">
            <table className="fin-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Qué</th>
                  <th>De</th>
                  <th>A</th>
                  <th className="fin-num">Monto</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr
                    key={m.id}
                    data-clic
                    tabIndex={0}
                    className={m.estado === "anulado" ? "fin-anulada" : undefined}
                    data-guia="fin-dinero.movimiento"
                    onClick={() => setDetalle(m)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setDetalle(m);
                      }
                    }}
                  >
                    <td data-l="Fecha" className="whitespace-nowrap">
                      {fechaCorta(m.fecha)}
                    </td>
                    <td className="fin-ancha" data-l="Qué">
                      <b>{TEXTO_MOVIMIENTO[m.tipo]}</b>
                      <span className="fin-sub">
                        {[m.referencia, m.comision > 0 ? `comisión ${soles(m.comision)} → gasto` : null, m.estado === "anulado" ? `anulado: ${m.motivoAnulacion}` : null].filter(Boolean).join(" · ") || " "}
                      </span>
                    </td>
                    <td data-l="De">{m.origenNombre ? nombreCorto(m.origenNombre) : <span className="fin-tenue">El dueño</span>}</td>
                    <td data-l="A">{m.destinoNombre ? nombreCorto(m.destinoNombre) : <span className="fin-tenue">Sale del negocio</span>}</td>
                    <td className="fin-num" data-l="Monto">
                      {soles(m.monto)}
                    </td>
                    <td data-l="Responsable" className="whitespace-nowrap">
                      {m.registradoPor ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PieTabla>
          <span>Solo se agregan filas; un error se anula con motivo.</span>
        </PieTabla>
      </Superficie>

      {detalle && <MovimientoDetalleModal movimiento={detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}

function filasMedios(medios: readonly FilaMedio[]) {
  const porTienda = new Map<string, { ubicacionId: string; ubicacionNombre: string; porMedio: Partial<Record<string, string>> }>();
  for (const m of medios) {
    const f = porTienda.get(m.ubicacionId) ?? { ubicacionId: m.ubicacionId, ubicacionNombre: m.ubicacionNombre, porMedio: {} };
    if (m.cuentaNombre) f.porMedio[m.medio] = m.cuentaNombre;
    porTienda.set(m.ubicacionId, f);
  }
  return [...porTienda.values()];
}

// ---- Pestaña «Conciliación» (solo el líder) ----------------------------------------------------------------------------

export function ConciliacionPanel({
  cuentas,
  actual,
  hoy,
  deUnaFecha = false,
}: {
  cuentas: ConciliacionCuenta[];
  actual: Conciliacion | null;
  hoy: string;
  /** Se mira una conciliación pasada (`?hasta=`): la flecha vuelve a la de hoy. */
  deUnaFecha?: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const responsable = useResponsable();
  const [saldo, setSaldo] = useState("");
  const [fecha, setFecha] = useState(actual?.hasta ?? hoy);
  const [guardando, setGuardando] = useState(false);
  const [anulando, setAnulando] = useState(false);

  if (!actual) {
    return (
      <Superficie>
        <Vacio guia="fin-conciliacion.vacia" icono={<Landmark />} titulo="No hay bancos que conciliar">
          Agrega los bancos, el POS y la tarjeta en Configuración ▸ Cuentas y cobros. Cada viernes se anota lo que dice el banco y el sistema dice si coincide.
        </Vacio>
      </Superficie>
    );
  }
  const r = resumenConciliacion(actual.lineas);
  const k = actual.conciliacion;
  const bancos = bancosParaCuadrar(cuentas, actual.cuenta.id);
  const respuesta = respuestaCuadre(actual);
  const ir = (cuenta: string, hasta?: string) => router.push(`${ruta}?cuenta=${cuenta}${hasta ? `&hasta=${hasta}` : ""}`, { scroll: false });

  async function ejecutar(hacer: () => Consulta, que: string, listo: string) {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién lo hace (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(hacer() as never, responsable.firma());
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

  const marcar = (lineas: { clave: string; monto: number }[], revisado: boolean) =>
    ejecutar(
      () => createClient().rpc("marcar_revisados_dinero" as never, { p_cuenta_id: actual.cuenta.id, p_lineas: lineas, p_revisado: revisado } as never),
      "marcar las líneas",
      revisado ? `${lineas.length === 1 ? "Línea revisada" : `${lineas.length} líneas revisadas`}.` : "Línea desmarcada.",
    );

  async function anotar() {
    if (saldo.trim() === "") return avisar.error("Escribe el saldo que dice el banco, por ejemplo 38420.50.");
    const n = leerMontoPlata(saldo);
    if (n === null) return avisar.error(MONTO_ILEGIBLE);
    if (fecha > hoy) return avisar.error("La fecha no puede ser futura.");
    const ok = await ejecutar(
      () => createClient().rpc("registrar_conciliacion" as never, { p_cuenta_id: actual!.cuenta.id, p_fecha: fecha, p_saldo_banco: n, p_nota: null } as never),
      "anotar el saldo del banco",
      "Saldo del banco anotado.",
    );
    if (ok) {
      setSaldo("");
      ir(actual!.cuenta.id, fecha);
    }
  }

  const periodo = `del ${fechaCorta(actual.desde)} al ${fechaCorta(actual.hasta)}`;

  return (
    <>
      {/* Qué banco cuadrar: a la vista arriba, con lo que falta revisar de cada uno (antes, tarjetas sueltas al pie). */}
      <div className="din-cuadrar-cab" data-guia="fin-conciliacion.otras">
        <div className="din-cuadrar-bancos" role="group" aria-label="Qué cuenta cuadrar">
          {bancos.map((b) => (
            <button key={b.id} type="button" className="pildora-cayla" aria-pressed={b.elegida} onClick={() => ir(b.id)}>
              {b.nombre}
              {b.pendientes > 0 && <Globito n={b.pendientes} pide etiqueta={`${b.pendientes} por revisar`} />}
            </button>
          ))}
        </div>
        <div className="w-full max-w-xs" data-guia="fin-conciliacion.responsable">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>

      <Superficie className="anim-sube" guia="fin-conciliacion.lineas">
        <Herramientas className="justify-between">
          <div className="fin-herramientas-titulo min-w-0">
            <b className="flex items-center gap-2">
              {deUnaFecha && <Volver onClick={() => ir(actual.cuenta.id)} a="Volver a hoy" />}
              {actual.cuenta.nombre} · movimientos {periodo}
            </b>
            <p>
              A la izquierda, lo que anotó CAYLA; a la derecha, si está en el extracto del banco. El sistema dice{" "}
              <b className="font-semibold text-tinta">{soles(actual.saldoSistema)}</b> al {fechaCorta(actual.hasta)}.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip tono={respuesta.tono}>{respuesta.texto}</Chip>
              {r.porRevisar.length > 0 && (
                <button type="button" className="btn-cayla btn-primario btn-chico" disabled={guardando} onClick={() => marcar(r.porRevisar.map((l) => ({ clave: l.clave, monto: l.monto })), true)}>
                  {r.porRevisar.length === 1 ? "Marcar la que falta como revisada" : `Marcar las ${r.porRevisar.length} como revisadas`}
                </button>
              )}
            </div>
          </div>
        </Herramientas>
        {actual.lineas.length === 0 ? (
          <Vacio tamano="chico" icono={<ArrowLeftRight />}>
            Nada entró ni salió de esta cuenta {periodo}.
          </Vacio>
        ) : (
          <ul className="din-pares" aria-label={`Líneas de ${actual.cuenta.nombre}`}>
            {actual.lineas.map((l, i) => {
              const estado = estadoPar(l);
              return (
                <li key={l.clave} className="din-par anim-entra" data-estado={estado} style={{ ["--i" as string]: Math.min(i, 12) } as CSSProperties}>
                  <div className="din-par-lado">
                    <b className={`din-par-monto ${l.monto < 0 ? "fin-sale" : ""}`}>
                      {l.monto < 0 ? "−" : "+"}
                      {soles(Math.abs(l.monto))}
                    </b>
                    <span>
                      {fechaCorta(l.fecha)} · {l.detalle}
                    </span>
                  </div>
                  <svg className="din-par-hilo" viewBox="0 0 90 24" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M0 12 C30 2, 60 22, 90 12" pathLength={1} />
                  </svg>
                  <div className="din-par-lado">
                    <span className="din-par-banco">{textoLadoBanco(l)}</span>
                  </div>
                  <div className="din-par-accion">
                    {estado === "revisada" ? (
                      <button type="button" className="btn-enlace text-[12.5px]" disabled={guardando} onClick={() => marcar([{ clave: l.clave, monto: l.monto }], false)} aria-label={`Desmarcar ${l.detalle}`}>
                        <Chip tono="verde">revisada</Chip>
                      </button>
                    ) : (
                      <button type="button" className="btn-cayla btn-secundario btn-chico" disabled={guardando} onClick={() => marcar([{ clave: l.clave, monto: l.monto }], true)}>
                        Sí, está
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <PieTabla>
          {k ? (
            cuadra(k.diferencia) ? (
              <span>
                <b className="text-verde">{actual.cuenta.nombre} coincide con el banco</b> al {fechaCorta(actual.hasta)}: {soles(k.saldoBanco)}.
              </span>
            ) : (
              <span>
                El banco dijo <b className="text-tinta">{soles(k.saldoBanco)}</b> y el sistema <b className="text-tinta">{soles(k.saldoSistema)}</b>: la diferencia es{" "}
                <b className="text-rojo-profundo">{soles(k.diferencia)}</b>. Busca en las líneas sin revisar lo que falta registrar.
              </span>
            )
          ) : (
            <span>Cuando todas estén revisadas y anotes el saldo del banco, el sistema dice si coinciden.</span>
          )}
          {k && (
            <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => setAnulando(true)}>
              Anular este saldo…
            </button>
          )}
        </PieTabla>
      </Superficie>

      {!k && (
        <Superficie pad className="anim-sube" guia="fin-conciliacion.anotar">
          <CabeceraBloque titulo="¿Qué saldo dice el banco?" bajada={`Lo que muestra la banca por internet al cierre del día. Se compara con los ${soles(actual.saldoSistema)} que suma el sistema.`} />
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <CampoFin etiqueta="Saldo del banco" htmlFor="conc-saldo" className="!mb-0">
              <InputFin id="conc-saldo" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="38,420.00" />
            </CampoFin>
            <CampoFin etiqueta="Al" htmlFor="conc-fecha" className="!mb-0">
              <InputFin
                id="conc-fecha"
                type="date"
                value={fecha}
                max={hoy}
                onChange={(e) => {
                  setFecha(e.target.value);
                  if (e.target.value) ir(actual.cuenta.id, e.target.value);
                }}
              />
            </CampoFin>
            <Boton peso="primario" cargando={guardando} type="button" disabled={guardando || !responsable.listo} onClick={anotar}>
              Anotar
            </Boton>
          </div>
        </Superficie>
      )}

      {actual.historial.length > 0 && (
        <Superficie className="anim-sube" guia="fin-conciliacion.historial">
          <Herramientas>
            <b className="text-sm font-semibold text-tinta">Conciliaciones de {actual.cuenta.nombre}</b>
          </Herramientas>
          <ul className="fin-lista-mov px-[14px] pb-1.5">
            {actual.historial.map((h) => (
              <li key={h.id}>
                <button type="button" className="btn-enlace text-left text-[13px]" onClick={() => ir(actual.cuenta.id, h.fecha)}>
                  {fechaCorta(h.fecha, true)} · banco {soles(h.saldoBanco)} · sistema {soles(h.saldoSistema)}
                </button>
                <span>{cuadra(h.diferencia) ? "coincide" : `diferencia ${soles(h.diferencia)}`}</span>
              </li>
            ))}
          </ul>
        </Superficie>
      )}

      <p className="nota-cayla anim-sube">
        Si el banco no deja descargar el extracto, se escribe el saldo que muestra la banca por internet y el sistema dice si coincide. Lo ideal es hacerlo <b>cada viernes</b>. Subir el extracto (Excel o CSV) para que el sistema proponga cada pareja queda para después.
      </p>

      {anulando && k && (
        <AnularModal
          titulo="Anular el saldo anotado"
          subtitulo="No se borra: queda en la historia como anulado, con el motivo. Después puedes anotar el correcto."
          accion="Anular saldo"
          onCerrar={() => setAnulando(false)}
          alConfirmar={(motivo) => createClient().rpc("anular_conciliacion" as never, { p_id: k.id, p_motivo: motivo } as never)}
          exito="Saldo del banco anulado."
          que="anular la conciliación"
        />
      )}
    </>
  );
}

// ---- Modales ------------------------------------------------------------------------------------------------------------

function RegistrarMovimientoModal({
  inicial,
  origenInicial,
  cuentas,
  esLider,
  ubicacionId,
  deuda,
  hoy,
  onCerrar,
}: {
  inicial: QuePaso;
  /** La cuenta de origen con que arranca, si una pantalla ya la sabe (solo vale si es una de las que este movimiento ofrece). */
  origenInicial?: string;
  cuentas: CuentaDinero[];
  esLider: boolean;
  ubicacionId: string | null;
  deuda: number;
  hoy: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const opciones = OPCIONES_QUE_PASO.filter((o) => esLider || !o.soloLider);
  const [token] = useState(() => crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const [egresos, setEgresos] = useState<EgresoParaMovimiento[]>([]);
  const [b, setB] = useState<BorradorMovimiento>(() => {
    const base = inicialDe(inicial, cuentas, ubicacionId, deuda, hoy);
    const origenDelAviso = origenDeArranque(inicial, origenInicial, cuentas);
    return origenDelAviso ? { ...base, origen: origenDelAviso.id, fuente: fuenteInicial(origenDelAviso) } : base;
  });
  // Abierto desde el aviso de una máquina atrasada, el título dice de cuál es el depósito; si no, el de siempre.
  const [titulo] = useState(() => tituloDelMovimiento(origenDeArranque(inicial, origenInicial, cuentas)?.nombre));
  const op = opcionQuePaso(b.que);
  const origenes = cuentasPara(cuentas, op.origen, "origen");
  const destinos = cuentasPara(cuentas, op.destino, "destino");
  const origen = cuentas.find((c) => c.id === b.origen) ?? null;
  const esCajon = origen?.tipo === "cajon";
  const tipo = tipoDeMovimiento(b);
  const cambiar = (c: Partial<BorradorMovimiento>) => setB((x) => ({ ...x, ...c }));

  // Del cajón, los egresos que la tienda ya registró y que nada usa todavía (o marcados «no es gasto: depósito»).
  const ubicacionCajon = esCajon ? origen?.ubicacionId ?? null : null;
  useEffect(() => {
    if (!ubicacionCajon) return;
    let vivo = true;
    createClient()
      .rpc("fn_egresos_para_movimiento" as never, { p_ubicacion_id: ubicacionCajon } as never)
      .then(({ data }) => {
        if (vivo) setEgresos(((data ?? []) as Record<string, unknown>[]).map(leerEgresoParaMovimiento));
      });
    return () => {
      vivo = false;
    };
  }, [ubicacionCajon]);
  const egresosDelTipo = egresos.filter((e) => (tipo === "deposito" ? e.marca !== "retiro" : e.marca !== "deposito"));

  // El depósito de una máquina (ADR-0429) se cruza contra los días que todavía no depositó: la lista llega de la base
  // (`fn_pos_pendientes`), se marcan de entrada los días hasta la fecha del depósito y la comisión sale sola.
  const esDepositoMaquina = tipo === "abono_tarjeta";
  const maquinaId = esDepositoMaquina ? b.origen || null : null;
  // Lo leído va con la máquina de la que se leyó: si la persona cambia de máquina, la lista anterior deja de valer sola
  // (sin tocar el estado dentro del efecto) mientras llega la nueva.
  const [leido, setLeido] = useState<{ maquinaId: string; lotes: LotePendiente[]; marcados: string[] } | null>(null);
  useEffect(() => {
    if (!maquinaId) return;
    let vivo = true;
    createClient()
      .rpc("fn_pos_pendientes" as never, { p_cuenta_id: maquinaId } as never)
      .then(({ data, error }) => {
        if (!vivo) return;
        const lista = error ? [] : ((data ?? []) as Record<string, unknown>[]).map(leerLotePendiente);
        setLeido({ maquinaId, lotes: lista, marcados: lotesPorDefecto(lista, b.fecha) });
      });
    return () => {
      vivo = false;
    };
    // La fecha no vuelve a cargar la lista: solo decide qué se marca de entrada al llegar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maquinaId]);
  const lotes = leido && leido.maquinaId === maquinaId ? leido.lotes : null;
  const marcados = leido && leido.maquinaId === maquinaId ? leido.marcados : [];
  const marcar = (clave: string, si: boolean) =>
    setLeido((l) => (l && l.maquinaId === maquinaId ? { ...l, marcados: si ? [...l.marcados.filter((c) => c !== clave), clave] : l.marcados.filter((c) => c !== clave) } : l));
  const cuentaAbono = esDepositoMaquina ? resumenAbono(lotes ?? [], marcados, b.monto) : null;

  function elegirQue(que: QuePaso) {
    setB(inicialDe(que, cuentas, ubicacionId, deuda, hoy, b));
  }

  async function guardar() {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    if (esDepositoMaquina) {
      const v = validarAbonoPos(b, lotes ?? [], marcados, { cuentas, hoy });
      if (!v.ok) return avisar.error(v.error);
      setGuardando(true);
      const { error } = await firmar(createClient().rpc("registrar_abono_pos" as never, { ...v.valor, p_token: token } as never), responsable.firma());
      setGuardando(false);
      responsable.despues(error);
      if (error) return avisar.error(traducirError(error, "registrar el depósito de la máquina"));
      const r = resumenAbono(lotes ?? [], marcados, b.monto);
      avisar.exito("Depósito de la máquina registrado", {
        detalle: r.comision && r.comision > 0 ? `La comisión real, ${soles(r.comision)}, quedó como gasto bancario de la empresa.` : "Llegó completo: sin comisión.",
      });
      onCerrar();
      router.refresh();
      return;
    }
    const v = validarMovimiento(b, { cuentas, egresos, deuda, hoy });
    if (!v.ok) return avisar.error(v.error);
    setGuardando(true);
    const { error } = await firmar(createClient().rpc("registrar_movimiento_dinero" as never, { ...v.valor, p_token: token } as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "registrar el movimiento"));
    avisar.exito(`${TEXTO_MOVIMIENTO[v.valor.p_tipo]} registrado`, {
      detalle: v.valor.p_caja_id ? "Su salida quedó en la caja, con el mismo monto." : v.valor.p_comision > 0 ? "La comisión quedó como gasto bancario de la empresa." : undefined,
    });
    onCerrar();
    router.refresh();
  }

  // En el combo, una máquina se nombra sin «Por depositar» (el campo ya lo dice y con los céntimos no cabría): «Vendemás · S/ 149.90».
  const nombreEnCombo = (c: CuentaDinero) => (saldoConCentimos(c.tipo) ? nombreDeMaquinaDeLaPuente(c.nombre) ?? c.nombre : c.nombre);
  const conSaldo = (c: CuentaDinero) => (c.saldo === null ? nombreEnCombo(c) : `${nombreEnCombo(c)} · ${verSaldo(c, c.saldo)}`);

  return (
    <Modal variante="hoja" titulo={titulo} subtitulo={`La plata cambia de lugar: no es venta ni gasto.${esLider ? "" : " Tu rol registra los depósitos de tu tienda al banco."}`} onClose={onCerrar} tamano="mediana">
      <CampoFin etiqueta="Qué pasó" htmlFor="mov-que" guia="fin-dinero.mov-que">
        <SelectFin<QuePaso> id="mov-que" valor={b.que} onValor={elegirQue} opciones={opciones} />
      </CampoFin>

      {b.que === "dueno_pone" && (
        <div data-sin-cascada>
          <span className="fin-etiqueta mb-1.5 block text-xs text-taupe">¿Cómo entra esta plata?</span>
          <OpcionesFin
            guia="fin-dinero.mov-dueno"
            nombre="mov-dueno"
            etiqueta="Cómo entra esta plata"
            valor={b.clase}
            onValor={(v) => cambiar({ clase: v })}
            opciones={[
              { valor: "aporte", titulo: "Aporte", detalle: "Se queda en CAYLA para siempre. Sube lo que es tuyo en el Balance." },
              { valor: "prestamo", titulo: "Préstamo", detalle: "CAYLA te lo devuelve después. Aparece como deuda de CAYLA contigo." },
            ]}
          />
        </div>
      )}
      {b.que === "dueno_saca" && (
        <div data-sin-cascada>
          <span className="fin-etiqueta mb-1.5 block text-xs text-taupe">¿Qué es esta salida?</span>
          <OpcionesFin
            nombre="mov-saca"
            etiqueta="Qué es esta salida"
            valor={b.clase}
            onValor={(v) => cambiar({ clase: v })}
            opciones={[
              ...(deuda > 0 ? [{ valor: "devolucion_prestamo" as const, titulo: "Devolución de préstamo", detalle: `CAYLA te debe ${solesRedondo(deuda)}. Baja esa deuda.` }] : []),
              { valor: "retiro", titulo: "Retiro de utilidades", detalle: "Te llevas ganancia del negocio. No es un gasto: no baja la utilidad." },
            ]}
          />
        </div>
      )}

      <div className="fin-dos-campos" data-sin-cascada data-guia="fin-dinero.mov-cuentas">
        {op.origen && (
          <CampoFin etiqueta="De" htmlFor="mov-de" className={op.destino ? undefined : "col-span-2"}>
            <SelectFin
              id="mov-de"
              valor={b.origen}
              onValor={(origen) => cambiar({ origen, egresoId: "", fuente: fuenteInicial(cuentas.find((c) => c.id === origen)) })}
              opciones={origenes.map((c) => ({ valor: c.id, texto: conSaldo(c) }))}
              marcador={origenes.length === 0 ? "No hay cuentas de ese tipo" : undefined}
              deshabilitado={origenes.length === 0}
            />
          </CampoFin>
        )}
        {op.destino && (
          <CampoFin etiqueta="A" htmlFor="mov-a" className={op.origen ? undefined : "col-span-2"}>
            <SelectFin
              id="mov-a"
              valor={b.destino}
              onValor={(destino) => cambiar({ destino })}
              opciones={destinos.map((c) => ({ valor: c.id, texto: c.nombre }))}
              marcador={destinos.length === 0 ? "No hay cuentas de ese tipo" : undefined}
              deshabilitado={destinos.length === 0}
            />
          </CampoFin>
        )}
      </div>

      {esCajon && (
        <div data-sin-cascada data-guia="fin-dinero.mov-cajon">
          <CampoFin etiqueta="La plata del cajón">
            <RadiosFin
              nombre="mov-fuente"
              etiqueta="De dónde sale la plata del cajón"
              valor={b.fuente}
              onValor={(v) => cambiar({ fuente: v })}
              opciones={[
                { valor: "caja", texto: origen?.cajaAbierta ? "Sale ahora de la caja abierta" : "La caja está cerrada", deshabilitada: !origen?.cajaAbierta },
                { valor: "egreso", texto: "La tienda ya registró la salida" },
              ]}
            />
          </CampoFin>
          {b.fuente === "egreso" && (
            <CampoFin
              etiqueta="¿Cuál salida?"
              htmlFor="mov-egreso"
              ayuda={egresosDelTipo.length === 0 ? "No hay salidas de este cajón en los últimos 60 días que no digan ya qué fueron." : "El monto es el de la salida."}
              tono={egresosDelTipo.length === 0 ? "aviso" : undefined}
            >
              <SelectFin
                id="mov-egreso"
                valor={b.egresoId}
                onValor={(egresoId) => cambiar({ egresoId })}
                marcador="Elige…"
                opciones={egresosDelTipo.map((e) => ({ valor: e.id, texto: textoSalida(e) }))}
              />
            </CampoFin>
          )}
        </div>
      )}

      {esDepositoMaquina && (
        <div data-sin-cascada data-guia="fin-dinero.mov-lotes">
          <CampoFin
            etiqueta="Qué días cubre este depósito"
            ayuda={
              lotes === null
                ? "Leyendo lo que la máquina todavía no depositó…"
                : lotes.length === 0
                  ? "Esta máquina no tiene nada por depositar."
                  : "Lo cobrado con la máquina que ningún depósito cubre todavía. Vienen marcados los días hasta la fecha del depósito."
            }
            tono={lotes !== null && lotes.length === 0 ? "aviso" : undefined}
          >
            {lotes && lotes.length > 0 && (
              <ul className="fin-lotes">
                {lotes.map((l) => (
                  <li key={l.clave} className="fin-lote">
                    <Casilla marcada={marcados.includes(l.clave)} onCambio={() => marcar(l.clave, !marcados.includes(l.clave))} etiqueta={`${textoLote(l)} · ${soles(l.bruto)}`} />
                    <span className="fin-lote-texto">
                      {textoLote(l)}
                      {l.atrasado && (
                        <>
                          {" "}
                          <Chip tono="ambar">atrasado</Chip>
                        </>
                      )}
                    </span>
                    <span className="fin-lote-dias">
                      {l.dias === 0 ? "hoy" : l.dias === 1 ? "ayer" : `hace ${l.dias} días`}
                      {l.esperado !== null && ` · comisión ≈ ${soles(l.esperado)}`}
                    </span>
                    <span className="fin-lote-monto">{soles(l.bruto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CampoFin>
        </div>
      )}

      <div className="fin-dos-campos" data-guia="fin-dinero.mov-monto">
        <CampoFin etiqueta={tipo === "abono_tarjeta" ? "Monto que llegó al banco" : "Monto"} htmlFor="mov-monto">
          {esCajon && b.fuente === "egreso" ? (
            <InputFin id="mov-monto" readOnly value={egresos.find((e) => e.id === b.egresoId) ? soles(egresos.find((e) => e.id === b.egresoId)!.monto) : "—"} />
          ) : (
            <InputFin id="mov-monto" inputMode="decimal" value={b.monto} onChange={(e) => cambiar({ monto: e.target.value })} placeholder={esDepositoMaquina ? ejemploMontoDeposito(cuentaAbono?.bruto ?? 0, cuentaAbono?.esperado ?? null, cuentaAbono?.dias ?? 0) : "1,500.00" /* sugerir-fijo: el formato de un monto, no depende de nada elegido */} />
          )}
        </CampoFin>
        <CampoFin etiqueta={esDepositoMaquina ? "Número de operación o nota" : "Voucher o nota"} htmlFor="mov-ref">
          <InputFin id="mov-ref" value={b.referencia} onChange={(e) => cambiar({ referencia: e.target.value })} placeholder={tipo === "abono_tarjeta" ? ejemploReferenciaDeposito(origen?.nombre) : "Voucher 120441" /* sugerir-fijo: el formato de un voucher, no depende de nada elegido */} maxLength={MAX_REFERENCIA_MOVIMIENTO} />
        </CampoFin>
      </div>

      {!esCajon && (
        <div className="fin-dos-campos" data-sin-cascada data-guia="fin-dinero.mov-fecha">
          <CampoFin etiqueta="Fecha" htmlFor="mov-fecha">
            <InputFin id="mov-fecha" type="date" max={hoy} value={b.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
          </CampoFin>
          {esDepositoMaquina && cuentaAbono && (
            <CampoFin etiqueta="Comisión real" ayuda="Lo cobrado esos días menos lo que llegó. Queda anotada como gasto de la empresa.">
              <SalidaFin>
                {cuentaAbono.dias === 0
                  ? "Marca los días"
                  : cuentaAbono.comision === null
                    ? `${soles(cuentaAbono.bruto)} cobrados en ${cuentaAbono.dias === 1 ? "1 día" : `${cuentaAbono.dias} días`} · escribe lo que llegó y verás la comisión`
                    : `${soles(cuentaAbono.comision)} · ${soles(cuentaAbono.bruto)} cobrados − ${soles(cuentaAbono.neto ?? 0)} llegaron${cuentaAbono.esperado !== null ? ` · esperada ≈ ${soles(cuentaAbono.esperado)}` : ""}`}
              </SalidaFin>
            </CampoFin>
          )}
        </div>
      )}
      {esDepositoMaquina && cuentaAbono?.comision !== null && cuentaAbono?.comision !== undefined && cuentaAbono.comision < 0 && (
        <Aviso tono="atencion" titulo="Llegó más de lo cobrado en los días marcados" chico>
          Marca los días que faltan (¿la máquina depositó la tarjeta y el QR juntos?) o revisa el monto.
        </Aviso>
      )}

      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4" data-guia="fin-dinero.mov-botones">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <Boton peso="primario" cargando={guardando} textoCargando="Registrando…" type="button" onClick={guardar} disabled={guardando || !responsable.listo}>
          Registrar
        </Boton>
      </div>
    </Modal>
  );
}

function fuenteInicial(c: CuentaDinero | undefined): "caja" | "egreso" {
  return c?.tipo === "cajon" && !c.cajaAbierta ? "egreso" : "caja";
}

/** El borrador de cada «Qué pasó»: propone el cajón de la sede que se mira (o el primero abierto) y el primer banco. */
/** La cuenta de origen que una pantalla ya sabía al abrir el movimiento (el aviso de una máquina), si de verdad es una de las que ese movimiento ofrece. */
function origenDeArranque(que: QuePaso, origenId: string | undefined, cuentas: CuentaDinero[]): CuentaDinero | null {
  if (!origenId) return null;
  return cuentasPara(cuentas, opcionQuePaso(que).origen, "origen").find((c) => c.id === origenId) ?? null;
}

/** El saldo de una cuenta como lo ve la persona: con céntimos en «Por depositar» (se cruza contra un depósito), redondeado en las demás. */
function verSaldo(c: CuentaDinero, n: number): string {
  return saldoConCentimos(c.tipo) ? soles(n) : solesRedondo(n);
}

function inicialDe(que: QuePaso, cuentas: CuentaDinero[], ubicacionId: string | null, deuda: number, hoy: string, antes?: BorradorMovimiento): BorradorMovimiento {
  const op = opcionQuePaso(que);
  const origenes = cuentasPara(cuentas, op.origen, "origen");
  const destinos = cuentasPara(cuentas, op.destino, "destino");
  const preferido =
    origenes.find((c) => c.tipo === "cajon" && c.ubicacionId === ubicacionId && c.cajaAbierta) ??
    origenes.find((c) => c.ubicacionId === ubicacionId) ??
    origenes.find((c) => c.tipo === "cajon" && c.cajaAbierta) ??
    origenes[0];
  const destino = destinos.find((c) => c.id !== preferido?.id) ?? destinos[0];
  return {
    que,
    clase: que === "dueno_pone" ? "aporte" : deuda > 0 ? "devolucion_prestamo" : "retiro",
    origen: preferido?.id ?? "",
    destino: destino?.id ?? "",
    monto: antes?.monto ?? "",
    referencia: antes?.referencia ?? "",
    comision: "",
    fecha: hoy,
    fuente: fuenteInicial(preferido),
    egresoId: "",
  };
}

function MovimientoDetalleModal({ movimiento: m, onCerrar }: { movimiento: MovimientoDinero; onCerrar: () => void }) {
  const [anulando, setAnulando] = useState(false);
  if (anulando) {
    return (
      <AnularModal
        titulo={`Anular ${TEXTO_MOVIMIENTO[m.tipo].toLowerCase()}`}
        subtitulo={`No se borra: queda a la vista como anulado, con el motivo y quién lo hizo.${m.cajaMovimientoId ? " La salida del cajón no vuelve sola: la plata sí salió; queda por clasificar." : ""}${m.comision > 0 ? " Su comisión se anula con él." : ""}`}
        accion="Anular movimiento"
        onCerrar={onCerrar}
        alConfirmar={(motivo) => createClient().rpc("anular_movimiento_dinero" as never, { p_id: m.id, p_motivo: motivo } as never)}
        exito="Movimiento anulado"
        que="anular el movimiento"
      />
    );
  }
  return (
    <Modal conCerrar
      variante="hoja"
      titulo={TEXTO_MOVIMIENTO[m.tipo]}
      subtitulo={[fechaCorta(m.fecha, true), m.referencia].filter(Boolean).join(" · ")}
      onClose={onCerrar}
      tamano="mediana"
    >
      <ListaDatos
        guia="fin-dinero.movimiento-detalle"
        filas={[
          { dato: "De", valor: m.origenNombre ?? "El dueño" },
          { dato: "A", valor: m.destinoNombre ?? "Sale del negocio" },
          { dato: m.tipo === "abono_tarjeta" ? "Llegó al banco" : "Monto", valor: soles(m.monto) },
          ...(m.comision > 0 ? [{ dato: "Comisión de la máquina (queda como gasto)", valor: soles(m.comision) }] : []),
          { dato: "Estado", valor: <Chip tono={m.estado === "anulado" ? "apagado" : "verde"}>{m.estado === "anulado" ? "Anulado" : "Vigente"}</Chip> },
          ...(m.registradoPor ? [{ dato: "Lo registró", valor: m.registradoPor, tenue: true }] : []),
          ...(m.motivoAnulacion ? [{ dato: "Anulado", valor: `${m.motivoAnulacion}${m.anuladoPor ? ` · ${m.anuladoPor}` : ""}`, tenue: true }] : []),
        ]}
      />
      <div className="fin-botones">
        {m.puedeAnular && (
          <button type="button" className="btn-cayla btn-sutil" onClick={() => setAnulando(true)}>
            Anular…
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Anular con motivo, firmado con el responsable (movimiento o saldo del banco). */
function AnularModal({
  titulo,
  subtitulo,
  accion,
  onCerrar,
  alConfirmar,
  exito,
  que,
}: {
  titulo: string;
  subtitulo: string;
  accion: string;
  onCerrar: () => void;
  /** La consulta SIN ejecutar (se le agrega la firma del responsable antes de mandarla). */
  alConfirmar: (motivo: string) => Consulta;
  exito: string;
  que: string;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function anular() {
    if (!motivo.trim()) return avisar.error("Di por qué se anula.");
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(alConfirmar(motivo.trim()) as never, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, que));
    avisar.exito(exito);
    onCerrar();
    router.refresh();
  }

  return (
    <Modal variante="hoja" titulo={titulo} subtitulo={subtitulo} onClose={onCerrar} tamano="mediana">
      <CampoFin etiqueta="Motivo" htmlFor="anular-motivo">
        <InputFin id="anular-motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej. se registró dos veces" />
      </CampoFin>
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Volver
        </button>
        <Boton peso="primario" cargando={guardando} textoCargando="Anulando…" type="button" onClick={anular} disabled={guardando || !responsable.listo}>
          {accion}
        </Boton>
      </div>
    </Modal>
  );
}
