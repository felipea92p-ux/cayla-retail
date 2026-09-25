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
import { CabeceraBloque, CampoFin, GuiaVacia, Herramientas, InputFin, ListaDatos, OpcionesFin, PieTabla, RadiosFin, SelectFin, Superficie } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { fechaCorta, solesRedondo, type UbicacionGastos, type Ver } from "@/lib/gastos-reglas";
import {
  MEDIOS_COBRO,
  OPCIONES_QUE_PASO,
  TEXTO_MEDIO_COBRO,
  TEXTO_MOVIMIENTO,
  TEXTO_SIN_CUENTA,
  agruparCuentas,
  cuadra,
  cuentasPara,
  cuentasVisibles,
  deudaConDueno,
  diaYNumero,
  explicacionCuenta,
  hoyEnPalabras,
  horaLima,
  insigniaCuenta,
  leerEgresoParaMovimiento,
  opcionQuePaso,
  otrosDelCajon,
  resumenConciliacion,
  tipoDeMovimiento,
  validarMovimiento,
  type BorradorMovimiento,
  type CierreConDiferencia,
  type Conciliacion,
  type ConciliacionCuenta,
  type CuentaDinero,
  type EfectivoFila,
  type EgresoParaMovimiento,
  type FilaMedio,
  type MovimientoDinero,
  type MovimientoDueno,
  type QuePaso,
  type SinCuenta,
} from "@/lib/cuentas-dinero-reglas";

// Finanzas ▸ Cuentas y dinero (ADR-0195 F3), dibujada como el spike aprobado (docs/maquetas/finanzas-2026-09/,
// `vista-dinero.js`): cabecera con «Ver» y «+ Registrar movimiento» → pestañas (una ruta cada una) → el cuerpo de la
// pestaña. La cabecera = dónde trabajas; «Ver» = qué miras. Los saldos llegan SUMADOS por la base; la pantalla no los
// recalcula. Escribe por RPC firmando con el responsable (ADR-0161).

/** Una consulta a la base SIN ejecutar: `firmar` le agrega el responsable antes de mandarla. */
type Consulta = PromiseLike<{ error: unknown }>;
const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

// ---- La pantalla: cabecera, «Ver» y el modal de registrar, compartidos por las tres pestañas ------------------------------

type AbrirMovimiento = (que?: QuePaso) => void;
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
  const [modal, setModal] = useState<QuePaso | null>(null);
  const nombreSede = ver.ubicacionId ? (ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "tu tienda") : "Todas las tiendas";

  const irA = (v: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("ver", v);
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };

  return (
    <ContextoMovimiento.Provider value={(que) => setModal(que ?? "deposito")}>
      <div className="space-y-6">
        <CabeceraDinero
          pestana={pestana}
          esLider={esLider}
          conteos={conteos}
          acciones={
            <>
              {deCaylaEntera ? (
                <Chip tono="neutro">CAYLA entera</Chip>
              ) : esLider ? (
                <label className="fin-ver">
                  <span className="label-cayla text-[11px] text-taupe">Ver</span>
                  <SelectFin value={ver.clave} onChange={(e) => irA(e.target.value)} aria-label="Qué mirar">
                    <option value="todas">Todas las tiendas</option>
                    {ubicaciones.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </SelectFin>
                </label>
              ) : (
                <Chip versalitas={false}>{nombreSede}</Chip>
              )}
              <button type="button" className="btn-cayla btn-primario" onClick={() => setModal("deposito")}>
                + Registrar movimiento
              </button>
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
          inicial={modal}
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
  ubicaciones,
  talleres,
  ver,
  esLider,
  hoy,
}: {
  cuentas: CuentaDinero[];
  movimientos: MovimientoDinero[];
  medios: FilaMedio[];
  plata: MovimientoDueno[];
  sinCuenta: SinCuenta[];
  ubicaciones: UbicacionGastos[];
  /** Las sedes que son el Taller (su cajón es un fondo fijo). */
  talleres: string[];
  ver: Ver;
  esLider: boolean;
  hoy: string;
}) {
  const abrir = useContext(ContextoMovimiento);
  const [detalle, setDetalle] = useState<MovimientoDinero | null>(null);
  const verTodas = !ver.ubicacionId;
  const visibles = cuentasVisibles(cuentas, ver.ubicacionId);
  const grupos = agruparCuentas(visibles);
  const nombreSede = ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "tu tienda";
  const dueno = deudaConDueno(plata);
  const totalSinCuenta = sinCuenta.reduce((a, s) => a + s.monto, 0);

  return (
    <>
      {esLider && !verTodas && (
        <p className="nota-cayla anim-sube">
          Los bancos son de CAYLA entera: se ven igual en cualquier tienda. El cajón y la caja fuerte son los de {nombreSede}.
        </p>
      )}

      {grupos.length === 0 ? (
        <GuiaVacia sobre="Todavía no hay cuentas" titulo="Agrega los bancos de CAYLA">
          Los cajones y las cajas fuertes nacen con cada tienda. Los bancos, las billeteras, el POS y la tarjeta se agregan en Configuración ▸ Cuentas y cobros.
        </GuiaVacia>
      ) : (
        grupos.map((g, i) => (
          <section key={g.clave} {...entra(i + 1)}>
            <p className="fin-etq">
              {g.titulo} · cuenta {g.cuenta}
            </p>
            <div className="fin-cuentas">
              {g.cuentas.map((c) => {
                const insignia = insigniaCuenta(c, hoy);
                return (
                  <article key={c.id} className="fin-cuenta">
                    <div className="fin-cuenta-cab">
                      <b>{c.nombre}</b>
                      {insignia && <Chip tono={insignia.tono}>{insignia.texto}</Chip>}
                    </div>
                    {c.saldo === null ? (
                      <div className="fin-cuenta-saldo" data-oculto>
                        Lo ve quien cierra la caja
                      </div>
                    ) : (
                      <div className="fin-cuenta-saldo" data-debe={c.saldo < 0 ? "" : undefined}>
                        {c.saldo < 0 ? `−${solesRedondo(-c.saldo)}` : solesRedondo(c.saldo)}
                      </div>
                    )}
                    <p>{explicacionCuenta(c, medios, c.ubicacionId !== null && talleres.includes(c.ubicacionId))}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}

      {esLider && verTodas && (
        <Superficie pad className="anim-sube">
          <CabeceraBloque
            titulo="Plata del dueño"
            bajada={
              <>
                Cuando pones plata en un mal momento, eliges si es un <b className="font-semibold text-tinta">aporte</b> (se queda en CAYLA) o un <b className="font-semibold text-tinta">préstamo</b> (CAYLA te lo devuelve).
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => abrir("dueno_pone")}>
                Poner plata
              </button>
              <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => abrir("dueno_saca")}>
                Sacar plata
              </button>
            </div>
          </CabeceraBloque>
          <div className="fin-dueno-cifras">
            <div>
              <span className="fin-etq block">CAYLA te debe</span>
              <div className="fin-cuenta-saldo">{solesRedondo(dueno.deuda)}</div>
            </div>
            <ul className="fin-lista-mov min-w-0 flex-1">
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
        <Superficie className="anim-sube">
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
                    <td data-l="Efectivo">{cuentas.find((c) => c.tipo === "cajon" && c.ubicacionId === f.ubicacionId)?.nombre ?? "Su cajón"}</td>
                    {MEDIOS_COBRO.map((m) => (
                      <td key={m} data-l={TEXTO_MEDIO_COBRO[m]} className={f.porMedio[m] ? undefined : "fin-tenue"}>
                        {f.porMedio[m] ?? "Sin cuenta"}
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
        <p className="nota-cayla anim-sube">
          Este mes, <b>{soles(Math.abs(totalSinCuenta))}</b> movieron plata sin decir de qué cuenta:{" "}
          {sinCuenta.map((s) => `${s.n} ${TEXTO_SIN_CUENTA[s.origen] ?? s.origen} (${soles(Math.abs(s.monto))})`).join(", ")}. No suman en ningún saldo hasta que digan su cuenta.
        </p>
      )}

      <Superficie className="anim-sube">
        <Herramientas>
          <b className="text-sm font-semibold text-tinta">Movimientos entre cuentas</b>
          <span className="text-[12.5px] text-taupe">Depósitos, abonos de tarjeta, transferencias y retiros. No son ventas ni gastos: la plata cambia de lugar.</span>
        </Herramientas>
        {movimientos.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-taupe">Sin movimientos todavía. Un depósito del cajón o un abono de tarjeta se registra con «+ Registrar movimiento».</p>
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
                    onClick={() => setDetalle(m)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setDetalle(m);
                      }
                    }}
                  >
                    <td data-l="Fecha">{fechaCorta(m.fecha)}</td>
                    <td className="fin-ancha" data-l="Qué">
                      <b>{TEXTO_MOVIMIENTO[m.tipo]}</b>
                      <span className="fin-sub">
                        {[m.referencia, m.comision > 0 ? `comisión ${soles(m.comision)} → gasto 639` : null, m.estado === "anulado" ? `anulado: ${m.motivoAnulacion}` : null].filter(Boolean).join(" · ") || " "}
                      </span>
                    </td>
                    <td data-l="De">{m.origenNombre ?? <span className="fin-tenue">El dueño</span>}</td>
                    <td data-l="A">{m.destinoNombre ?? <span className="fin-tenue">Sale del negocio</span>}</td>
                    <td className="fin-num" data-l="Monto">
                      {soles(m.monto)}
                    </td>
                    <td data-l="Responsable">{m.registradoPor ?? "—"}</td>
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

// ---- Pestaña «Efectivo por tienda» -------------------------------------------------------------------------------------

export function EfectivoPanel({ filas, cierres, hoy }: { filas: EfectivoFila[]; cierres: CierreConDiferencia[]; hoy: string }) {
  const hayOtros = filas.some((f) => f.abierta && otrosDelCajon(f) !== 0);
  const ocultos = filas.some((f) => f.abierta && f.esperado === null);
  return (
    <>
      <Superficie className="anim-sube">
        <Herramientas className="justify-between">
          <div className="fin-herramientas-titulo min-w-0">
            <b>{hoyEnPalabras(hoy)}</b>
            <p>Lo que debería haber en cada cajón ahora mismo. El conteo lo hace cada tienda al cerrar su caja.</p>
          </div>
        </Herramientas>
        {filas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-taupe">No hay tiendas que mirar.</p>
        ) : (
          <div className="fin-tabla-wrap">
            <table className="fin-tabla">
              <thead>
                <tr>
                  <th>Tienda</th>
                  <th>Caja</th>
                  <th className="fin-num">Apertura</th>
                  <th className="fin-num">+ Ventas en efectivo</th>
                  {hayOtros && <th className="fin-num">± Otros</th>}
                  <th className="fin-num">− Egresos</th>
                  <th className="fin-num">− Depósitos</th>
                  <th className="fin-num">Debería haber</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.ubicacionId} className={f.abierta ? undefined : "fin-suave"}>
                    <td className="fin-ancha" data-l="Tienda">
                      <b>{f.ubicacionNombre}</b>
                    </td>
                    <td data-l="Caja">
                      {f.abierta ? (
                        <>
                          <Chip tono="verde">abierta {f.abiertaEn ? horaLima(f.abiertaEn) : ""}</Chip>
                          {f.abiertaPor && <span className="fin-sub">{f.abiertaPor}</span>}
                        </>
                      ) : (
                        <>
                          <Chip tono="neutro">cerrada</Chip>
                          {f.cerradaEn && <span className="fin-sub">desde el {diaYNumero(f.cerradaEn)}</span>}
                        </>
                      )}
                    </td>
                    <td className="fin-num" data-l="Apertura">
                      {f.abierta ? solesRedondo(f.apertura) : "—"}
                    </td>
                    <td className="fin-num" data-l="Ventas en efectivo">
                      {f.abierta ? solesRedondo(f.ventasEfectivo) : "—"}
                    </td>
                    {hayOtros && (
                      <td className="fin-num" data-l="Otros">
                        {f.abierta ? solesRedondo(otrosDelCajon(f)) : "—"}
                      </td>
                    )}
                    <td className="fin-num" data-l="Egresos">
                      {f.abierta ? solesRedondo(f.egresos) : "—"}
                    </td>
                    <td className="fin-num" data-l="Depósitos">
                      {f.abierta ? solesRedondo(f.depositos) : "—"}
                    </td>
                    <td className="fin-num" data-l={f.abierta ? "Debería haber" : "Quedó en el cajón"}>
                      {f.abierta ? (
                        f.esperado === null ? (
                          <span className="fin-tenue">lo ve quien cierra</span>
                        ) : (
                          <b className="font-display text-[19px]">{solesRedondo(f.esperado)}</b>
                        )
                      ) : (
                        <span className="font-display text-[19px]">{f.fondo === null ? "—" : solesRedondo(f.fondo)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(hayOtros || ocultos) && (
          <PieTabla>
            <span>
              {hayOtros ? "«± Otros» son los ingresos al cajón, las devoluciones y los cambios pagados en efectivo. " : ""}
              {ocultos ? "Lo que debería haber lo ve solo quien puede cerrar la caja (el mismo candado que el cierre)." : ""}
            </span>
          </PieTabla>
        )}
      </Superficie>

      {cierres.length > 0 && (
        <Superficie className="anim-sube">
          <Herramientas>
            <b className="text-sm font-semibold text-tinta">Últimos cierres con diferencia</b>
          </Herramientas>
          <ul className="fin-lista-mov px-[14px] pb-1.5">
            {cierres.map((c) => (
              <li key={c.cajaId}>
                <span>
                  {c.ubicacionNombre} · {diaYNumero(c.cerradaEn)} · {c.diferencia < 0 ? "faltaron" : "sobraron"} {soles(Math.abs(c.diferencia))}
                </span>
                <span>{c.cerradaPor ? `Lo cerró ${c.cerradaPor}.` : ""}</span>
              </li>
            ))}
          </ul>
        </Superficie>
      )}

      <p className="nota-cayla anim-sube">
        Esto ya lo calcula Caja, tienda por tienda: es la misma cuenta del cierre. Finanzas solo lo junta. Los gastos pagados con plata del cajón y los depósitos al banco bajan este número el mismo día.
      </p>
    </>
  );
}

// ---- Pestaña «Conciliación» (solo el líder) ----------------------------------------------------------------------------

export function ConciliacionPanel({ cuentas, actual, hoy }: { cuentas: ConciliacionCuenta[]; actual: Conciliacion | null; hoy: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const responsable = useResponsable();
  const [saldo, setSaldo] = useState("");
  const [fecha, setFecha] = useState(actual?.hasta ?? hoy);
  const [guardando, setGuardando] = useState(false);
  const [anulando, setAnulando] = useState(false);

  if (!actual) {
    return (
      <GuiaVacia sobre="Conciliación" titulo="No hay bancos que conciliar">
        Agrega los bancos, el POS y la tarjeta en Configuración ▸ Cuentas y cobros. Cada viernes se anota lo que dice el banco y el sistema dice si coincide.
      </GuiaVacia>
    );
  }
  const r = resumenConciliacion(actual.lineas);
  const k = actual.conciliacion;
  const otras = cuentas.filter((c) => c.id !== actual.cuenta.id);
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
    const n = Number(saldo.replace(/s\/|\s|,/gi, ""));
    if (saldo.trim() === "" || !Number.isFinite(n)) return avisar.error("Escribe el saldo que dice el banco, por ejemplo 38420.50.");
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
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-md text-[13px] text-taupe">Cada viernes, anota el saldo que muestra la banca por internet: el sistema dice si coincide y qué movimientos del período faltan revisar.</p>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>

      <Superficie className="anim-sube">
        <Herramientas className="justify-between">
          <div className="fin-herramientas-titulo min-w-0">
            <b>
              {actual.cuenta.nombre} · movimientos {periodo}
            </b>
            <p>
              El sistema dice <b className="font-semibold text-tinta">{soles(actual.saldoSistema)}</b> al {fechaCorta(actual.hasta)}. Marca cada línea cuando la veas en el extracto.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip tono={r.total > 0 && r.revisadas === r.total ? "verde" : "pizarra"}>
                {r.revisadas} de {r.total} revisadas
              </Chip>
              {r.porRevisar.length > 0 && (
                <button type="button" className="btn-cayla btn-primario btn-chico" disabled={guardando} onClick={() => marcar(r.porRevisar.map((l) => ({ clave: l.clave, monto: l.monto })), true)}>
                  Marcar las {r.porRevisar.length} como revisadas
                </button>
              )}
            </div>
          </div>
        </Herramientas>
        {actual.lineas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-taupe">Nada entró ni salió de esta cuenta {periodo}.</p>
        ) : (
          <div className="fin-tabla-wrap">
            <table className="fin-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Lo que registró el sistema</th>
                  <th className="fin-num">Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {actual.lineas.map((l) => (
                  <tr key={l.clave} className={l.revisado ? "fin-hecha" : undefined}>
                    <td data-l="Fecha">{fechaCorta(l.fecha)}</td>
                    <td className="fin-ancha" data-l="Movimiento">
                      <b>{l.detalle}</b>
                      {l.montoRevisado !== null && <span className="fin-sub fin-cambio">Cambió desde que se revisó (era {soles(l.montoRevisado)}): revísala otra vez.</span>}
                      {l.revisado && l.revisadoPor && <span className="fin-sub">revisada por {l.revisadoPor}</span>}
                    </td>
                    <td className={`fin-num ${l.monto < 0 ? "fin-sale" : ""}`} data-l="Monto">
                      {l.monto < 0 ? "−" : "+"}
                      {soles(Math.abs(l.monto))}
                    </td>
                    <td className="fin-num">
                      {l.revisado ? (
                        <button type="button" className="btn-enlace text-[12.5px]" disabled={guardando} onClick={() => marcar([{ clave: l.clave, monto: l.monto }], false)}>
                          <Chip tono="verde">revisada</Chip>
                        </button>
                      ) : (
                        <button type="button" className="btn-cayla btn-secundario btn-chico" disabled={guardando} onClick={() => marcar([{ clave: l.clave, monto: l.monto }], true)}>
                          Revisada
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        <Superficie pad className="anim-sube">
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
            <button type="button" className="btn-cayla btn-primario" disabled={guardando || !responsable.listo} onClick={anotar}>
              {guardando ? "Guardando…" : "Anotar"}
            </button>
          </div>
        </Superficie>
      )}

      {actual.historial.length > 0 && (
        <Superficie className="anim-sube">
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

      {otras.map((c) => (
        <Superficie key={c.id} pad className="anim-sube">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <b className="text-sm font-semibold text-tinta">{c.nombre}</b>
              <p className="mt-0.5 text-[12.5px] text-taupe">
                {c.ultimaFecha ? `Conciliada el ${fechaCorta(c.ultimaFecha)}` : "Nunca conciliada"}. El sistema dice {soles(c.saldoHoy)}.
                {c.pendientes > 0 ? ` ${c.pendientes} ${c.pendientes === 1 ? "línea" : "líneas"} por revisar.` : ""}
              </p>
            </div>
            <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => ir(c.id)}>
              Conciliar
            </button>
          </div>
        </Superficie>
      ))}

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
  cuentas,
  esLider,
  ubicacionId,
  deuda,
  hoy,
  onCerrar,
}: {
  inicial: QuePaso;
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
  const [b, setB] = useState<BorradorMovimiento>(() => inicialDe(inicial, cuentas, ubicacionId, deuda, hoy));
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

  function elegirQue(que: QuePaso) {
    setB(inicialDe(que, cuentas, ubicacionId, deuda, hoy, b));
  }

  async function guardar() {
    const v = validarMovimiento(b, { cuentas, egresos, deuda, hoy });
    if (!v.ok) return avisar.error(v.error);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
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

  const conSaldo = (c: CuentaDinero) => (c.saldo === null ? c.nombre : `${c.nombre} · ${solesRedondo(c.saldo)}`);

  return (
    <Modal variante="hoja" titulo="Registrar movimiento" subtitulo={`La plata cambia de lugar: no es venta ni gasto.${esLider ? "" : " Tu rol registra los depósitos de tu tienda al banco."}`} onClose={onCerrar} ancho="max-w-[580px]">
      <CampoFin etiqueta="Qué pasó" htmlFor="mov-que">
        <SelectFin id="mov-que" value={b.que} onChange={(e) => elegirQue(e.target.value as QuePaso)}>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </SelectFin>
      </CampoFin>

      {b.que === "dueno_pone" && (
        <div data-sin-cascada>
          <span className="fin-etiqueta mb-1.5 block text-xs text-taupe">¿Cómo entra esta plata?</span>
          <OpcionesFin
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

      <div className="fin-dos-campos" data-sin-cascada>
        {op.origen && (
          <CampoFin etiqueta="De" htmlFor="mov-de" className={op.destino ? undefined : "col-span-2"}>
            <SelectFin id="mov-de" value={b.origen} onChange={(e) => cambiar({ origen: e.target.value, egresoId: "", fuente: fuenteInicial(cuentas.find((c) => c.id === e.target.value)) })}>
              {origenes.length === 0 && <option value="">No hay cuentas de ese tipo</option>}
              {origenes.map((c) => (
                <option key={c.id} value={c.id}>
                  {conSaldo(c)}
                </option>
              ))}
            </SelectFin>
          </CampoFin>
        )}
        {op.destino && (
          <CampoFin etiqueta="A" htmlFor="mov-a" className={op.origen ? undefined : "col-span-2"}>
            <SelectFin id="mov-a" value={b.destino} onChange={(e) => cambiar({ destino: e.target.value })}>
              {destinos.length === 0 && <option value="">No hay cuentas de ese tipo</option>}
              {destinos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </SelectFin>
          </CampoFin>
        )}
      </div>

      {esCajon && (
        <div data-sin-cascada>
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
              <SelectFin id="mov-egreso" value={b.egresoId} onChange={(e) => cambiar({ egresoId: e.target.value })}>
                <option value="">Elige…</option>
                {egresosDelTipo.map((e) => (
                  <option key={e.id} value={e.id}>
                    {fechaCorta(e.creadoEn.slice(0, 10))} · {soles(e.monto)} · {e.motivo}
                    {e.nota ? ` — ${e.nota}` : ""}
                    {e.marca ? " (marcado «no es gasto»)" : ""}
                  </option>
                ))}
              </SelectFin>
            </CampoFin>
          )}
        </div>
      )}

      <div className="fin-dos-campos">
        <CampoFin etiqueta={tipo === "abono_tarjeta" ? "Monto que llegó al banco" : "Monto"} htmlFor="mov-monto">
          {esCajon && b.fuente === "egreso" ? (
            <InputFin id="mov-monto" readOnly value={egresos.find((e) => e.id === b.egresoId) ? soles(egresos.find((e) => e.id === b.egresoId)!.monto) : "—"} />
          ) : (
            <InputFin id="mov-monto" inputMode="decimal" value={b.monto} onChange={(e) => cambiar({ monto: e.target.value })} placeholder="1,500.00" />
          )}
        </CampoFin>
        <CampoFin etiqueta="Voucher o nota" htmlFor="mov-ref">
          <InputFin id="mov-ref" value={b.referencia} onChange={(e) => cambiar({ referencia: e.target.value })} placeholder={tipo === "abono_tarjeta" ? "Liquidación Niubiz 20-sep" : "Voucher 120441"} />
        </CampoFin>
      </div>

      {!esCajon && (
        <div className="fin-dos-campos" data-sin-cascada>
          <CampoFin etiqueta="Fecha" htmlFor="mov-fecha">
            <InputFin id="mov-fecha" type="date" max={hoy} value={b.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
          </CampoFin>
          {tipo === "abono_tarjeta" && (
            <CampoFin etiqueta="Comisión del POS" htmlFor="mov-comision" ayuda="Queda como gasto bancario (639) de la empresa.">
              <InputFin id="mov-comision" inputMode="decimal" value={b.comision} onChange={(e) => cambiar({ comision: e.target.value })} placeholder="0.00" />
            </CampoFin>
          )}
        </div>
      )}

      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={guardar} disabled={guardando || !responsable.listo}>
          {guardando ? "Registrando…" : "Registrar"}
        </button>
      </div>
    </Modal>
  );
}

function fuenteInicial(c: CuentaDinero | undefined): "caja" | "egreso" {
  return c?.tipo === "cajon" && !c.cajaAbierta ? "egreso" : "caja";
}

/** El borrador de cada «Qué pasó»: propone el cajón de la sede que se mira (o el primero abierto) y el primer banco. */
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
    <Modal
      variante="hoja"
      titulo={TEXTO_MOVIMIENTO[m.tipo]}
      subtitulo={[fechaCorta(m.fecha, true), m.referencia].filter(Boolean).join(" · ")}
      onClose={onCerrar}
      ancho="max-w-[520px]"
    >
      <ListaDatos
        filas={[
          { dato: "De", valor: m.origenNombre ?? "El dueño" },
          { dato: "A", valor: m.destinoNombre ?? "Sale del negocio" },
          { dato: m.tipo === "abono_tarjeta" ? "Llegó al banco" : "Monto", valor: soles(m.monto) },
          ...(m.comision > 0 ? [{ dato: "Comisión del POS (gasto 639)", valor: soles(m.comision) }] : []),
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
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar}>
          Cerrar
        </button>
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
    <Modal variante="hoja" titulo={titulo} subtitulo={subtitulo} onClose={onCerrar} ancho="max-w-[520px]">
      <CampoFin etiqueta="Motivo" htmlFor="anular-motivo">
        <InputFin id="anular-motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej. se registró dos veces" />
      </CampoFin>
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Volver
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={anular} disabled={guardando || !responsable.listo}>
          {guardando ? "Anulando…" : accion}
        </button>
      </div>
    </Modal>
  );
}
