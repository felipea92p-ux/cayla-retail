"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Tabla, Encabezado, celda, fila } from "@/components/ui/Tabla";
import { Campo, CampoTexto, SelectNativo, Segmentado, Interruptor } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ProveedorGasto } from "@/components/RegistrarGastoModal";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import {
  TEXTO_COMPROBANTE,
  TEXTO_ESTADO_ACTIVO,
  TEXTO_ESTADO_FIJO,
  TIPOS_COMPROBANTE,
  puedeAnularActivo,
  resumenFijos,
  textoMes,
  textoVidaUtil,
  totalesActivos,
  validarFijo,
  type ActivoFila,
  type BorradorFijo,
  type CategoriaGasto,
  type FijoSugerido,
  type GastoFijoMes,
  type UbicacionGastos,
} from "@/lib/gastos-reglas";

// Finanzas ▸ Gastos, pestañas «Fijos del mes» y «Activos fijos» (ADR-0195 F2b). Lo que se paga todos los meses (con lo
// que ya se registró, lo que viene y lo que falta) y lo que sirve varios años (con su depreciación a hoy).

const PLANTILLA_FIJOS = "sm:grid-cols-[4rem_minmax(0,1.8fr)_minmax(0,1fr)_7rem_8rem_minmax(0,11rem)]";
const PLANTILLA_ACTIVOS = "sm:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_6rem_7rem_6rem_7rem_7rem]";

// ---------------------------------------------------------------------------------------------------------------------
// Fijos del mes

export function FijosDelMes({
  fijos,
  sugeridos,
  mes,
  verTodas,
  onRegistrar,
  onEditar,
  onNuevoDesdeSugerido,
}: {
  fijos: GastoFijoMes[];
  sugeridos: FijoSugerido[];
  mes: string;
  verTodas: boolean;
  onRegistrar: (f: GastoFijoMes) => void;
  onEditar: (f: GastoFijoMes) => void;
  onNuevoDesdeSugerido: (s: FijoSugerido) => void;
}) {
  const r = resumenFijos(fijos);
  return (
    <>
      {sugeridos.length > 0 && (
        <section className="card-cayla px-5 py-4">
          <h2 className="text-sm font-semibold text-tinta">Se repiten cada mes: ¿los guardas como fijos?</h2>
          <p className="mt-0.5 text-[13px] text-taupe">Aparecieron en {sugeridos.length === 1 ? "este caso" : "estos casos"} al menos dos de los últimos tres meses. Guardarlos hace que el sistema te avise cuando falten.</p>
          <ul className="mt-3 divide-y divide-sand">
            {sugeridos.map((s) => (
              <li key={`${s.ubicacionId}-${s.categoria}-${s.proveedorId}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <b className="font-semibold text-tinta">{s.descripcion}</b> · {s.ubicacionNombre}
                  <span className="block text-[12px] text-taupe">
                    {s.categoriaNombre}
                    {s.proveedorNombre ? ` · ${s.proveedorNombre}` : ""} · {s.meses} de 3 meses · cerca del día {s.diaDelMes} · ~{soles(s.monto)}
                  </span>
                </span>
                <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => onNuevoDesdeSugerido(s)}>
                  Guardar como fijo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fijos.length === 0 ? (
        <div className="card-cayla px-6 py-8 text-center">
          <p className="font-display text-xl text-tinta">Todavía no hay gastos fijos</p>
          <p className="mt-1 text-sm text-taupe">El alquiler, la luz o el contador: guárdalos una vez y cada mes el sistema te dice si ya se registraron.</p>
        </div>
      ) : (
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA_FIJOS}
            columnas={[{ titulo: "Día" }, { titulo: "Gasto fijo" }, { titulo: verTodas ? "Tienda" : "Categoría" }, { titulo: "Monto", alinear: "der" }, { titulo: "Estado" }, { titulo: "" }]}
          />
          {fijos.map((f) => {
            const e = TEXTO_ESTADO_FIJO[f.estado];
            return (
              <div key={f.id} className={fila(PLANTILLA_FIJOS)}>
                <span className={celda()}>{diaMes(f.fechaEsperada)}</span>
                <span className={celda()}>
                  <b className="font-semibold text-tinta">{f.descripcion}</b>
                  <span className="block truncate text-[12px] text-taupe">
                    {f.proveedorNombre ?? "Sin proveedor"} · {TEXTO_COMPROBANTE[f.comprobanteTipo]}
                  </span>
                </span>
                <span className={celda()}>{verTodas ? f.ubicacionNombre : f.categoriaNombre}</span>
                <span className={celda("der")}>
                  {f.gastoMonto !== null ? (
                    <b className="font-semibold text-tinta">{soles(f.gastoMonto)}</b>
                  ) : (
                    <span className="text-tinta">
                      {f.montoVariable ? "~" : ""}
                      {soles(f.monto)}
                    </span>
                  )}
                </span>
                <span className={celda()}>
                  <Chip tono={e.tono}>{e.texto}</Chip>
                </span>
                <span className={celda("der")}>
                  <span className="inline-flex gap-2">
                    {f.estado !== "registrado" && (
                      <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => onRegistrar(f)}>
                        Registrar
                      </button>
                    )}
                    <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => onEditar(f)}>
                      Editar
                    </button>
                  </span>
                </span>
              </div>
            );
          })}
          <p className="px-5 py-2.5 text-xs text-taupe">
            {textoMes(mes)}: {r.registrados} registrados · {r.vienen} vienen · {r.faltan} faltan · quedan ~{soles(r.montoPendiente)} por registrar
          </p>
        </Tabla>
      )}
      <p className="nota-cayla">
        Un gasto fijo es un recordatorio, no un gasto: <b>solo cuenta cuando se registra</b> con lo que llegó de verdad. Si su día pasó y no hay gasto, sale «Falta registrar».
      </p>
    </>
  );
}

export function GastoFijoModal({
  fijo,
  inicial,
  categorias,
  ubicaciones,
  proveedores,
  esLider,
  ubicacionInicial,
  onCerrar,
}: {
  /** Editar este fijo; sin él, uno nuevo. */
  fijo?: GastoFijoMes;
  /** Uno nuevo que parte de una sugerencia. */
  inicial?: FijoSugerido;
  categorias: CategoriaGasto[];
  ubicaciones: UbicacionGastos[];
  proveedores: ProveedorGasto[];
  esLider: boolean;
  ubicacionInicial: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const base = fijo ?? inicial;
  const [b, setB] = useState<BorradorFijo>(() => ({
    ubicacion: base ? (base.ubicacionId ?? "empresa") : ubicacionInicial,
    categoria: base?.categoria ?? "",
    descripcion: base?.descripcion ?? "",
    proveedorId: base?.proveedorId ?? "",
    comprobante: base?.comprobanteTipo ?? "factura",
    monto: base ? String(base.monto) : "",
    variable: fijo?.montoVariable ?? false,
    dia: base ? String(base.diaDelMes) : "",
  }));
  const poner = <K extends keyof BorradorFijo>(k: K, v: BorradorFijo[K]) => setB((x) => ({ ...x, [k]: v }));

  async function ejecutar(accion: "guardar" | "archivar") {
    const v = validarFijo(b);
    if (accion === "guardar" && !v.ok) return avisar.error(v.error);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { error } = await firmar(
      accion === "archivar"
        ? supabase.rpc("archivar_gasto_fijo" as never, { p_id: fijo!.id } as never)
        : supabase.rpc("guardar_gasto_fijo" as never, { p_id: fijo?.id ?? null, ...(v.ok ? v.valor : {}) } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, accion === "archivar" ? "archivar el gasto fijo" : "guardar el gasto fijo"));
    avisar.exito(accion === "archivar" ? "Gasto fijo archivado" : fijo ? "Gasto fijo guardado" : "Gasto fijo creado", {
      detalle: accion === "archivar" ? "Deja de aparecer desde este mes; sus gastos registrados se quedan." : "Cada mes te dirá si ya se registró.",
    });
    onCerrar();
    router.refresh();
  }

  const opcionesUbicacion = [...ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre })), ...(esLider ? [{ valor: "empresa", texto: "De la empresa (no es de una tienda)" }] : [])];
  return (
    <Modal titulo={fijo ? "Editar gasto fijo" : "Nuevo gasto fijo"} subtitulo="Lo que se paga todos los meses. Solo es un recordatorio: cuenta cuando se registra con lo que llegó." onClose={onCerrar} ancho="max-w-xl">
      <div className="space-y-4">
        <CampoTexto etiqueta="Qué se paga" value={b.descripcion} onChange={(e) => poner("descripcion", e.target.value)} placeholder="Alquiler del local" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Categoría" htmlFor="fijo-categoria">
            <SelectNativo id="fijo-categoria" value={b.categoria} onChange={(e) => poner("categoria", e.target.value)}>
              <option value="">Elige…</option>
              {categorias.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.nombre}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo etiqueta="A quién se le carga" htmlFor="fijo-ubicacion">
            <SelectNativo id="fijo-ubicacion" value={b.ubicacion} disabled={opcionesUbicacion.length < 2} onChange={(e) => poner("ubicacion", e.target.value)}>
              {opcionesUbicacion.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </SelectNativo>
          </Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Proveedor (opcional)" htmlFor="fijo-proveedor">
            <SelectNativo id="fijo-proveedor" value={b.proveedorId} onChange={(e) => poner("proveedorId", e.target.value)}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Segmentado
            etiqueta="Llega con"
            valor={b.comprobante}
            onValor={(v) => poner("comprobante", v)}
            opciones={TIPOS_COMPROBANTE.map((t) => ({ valor: t, texto: t === "recibo_por_honorarios" ? "Rec. honorarios" : TEXTO_COMPROBANTE[t] }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <CampoTexto etiqueta="Monto de siempre" inputMode="decimal" value={b.monto} onChange={(e) => poner("monto", e.target.value)} placeholder="0.00" />
          <CampoTexto etiqueta="Día del mes (1 a 28)" inputMode="numeric" value={b.dia} onChange={(e) => poner("dia", e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="10" />
          <Interruptor activo={b.variable} onActivo={(v) => poner("variable", v)} etiqueta="El monto cambia" pie="La luz o el agua: se muestra «~» y se escribe al registrar." />
        </div>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
        <div className="flex flex-wrap justify-end gap-2">
          {fijo && (
            <button type="button" className="btn-cayla btn-sutil mr-auto" disabled={guardando} onClick={() => ejecutar("archivar")}>
              Archivar
            </button>
          )}
          <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="btn-cayla btn-primario" onClick={() => ejecutar("guardar")} disabled={guardando || !responsable.listo}>
            {guardando ? "Guardando…" : fijo ? "Guardar" : "Crear gasto fijo"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Activos fijos

export function TablaActivos({ activos, verTodas, onAbrir }: { activos: ActivoFila[]; verTodas: boolean; onAbrir: (a: ActivoFila) => void }) {
  const t = totalesActivos(activos);
  if (activos.length === 0) {
    return (
      <>
        <div className="card-cayla px-6 py-8 text-center">
          <p className="font-display text-xl text-tinta">Sin activos fijos registrados</p>
          <p className="mt-1 text-sm text-taupe">Un mostrador, una laptop, una máquina del Taller: regístralos con «Registrar activo» y el sistema los deprecia cada mes.</p>
        </div>
        <NotaActivos />
      </>
    );
  }
  return (
    <>
      <Tabla>
        <Encabezado
          plantilla={PLANTILLA_ACTIVOS}
          columnas={[
            { titulo: "Bien" },
            { titulo: verTodas ? "Dónde está" : "Tipo" },
            { titulo: "Comprado" },
            { titulo: "Costo", alinear: "der", subtitulo: "sin IGV" },
            { titulo: "Vida útil" },
            { titulo: "Al mes", alinear: "der", subtitulo: "depreciación" },
            { titulo: "Vale hoy", alinear: "der" },
          ]}
        />
        {activos.map((a) => {
          const e = TEXTO_ESTADO_ACTIVO[a.estado];
          const pct = a.costo > 0 ? Math.max(0, Math.min(100, (a.valorHoy / a.costo) * 100)) : 0;
          return (
            <button key={a.id} type="button" onClick={() => onAbrir(a)} className={`${fila(PLANTILLA_ACTIVOS, "w-full text-left hover:bg-hueso/60")} ${a.estado !== "activo" ? "opacity-60" : ""}`}>
              <span className={celda()}>
                <b className="font-semibold text-tinta">{a.nombre}</b>
                <span className="block truncate text-[12px] text-taupe">
                  {a.proveedorNombre ?? "Sin comprobante"}
                  {a.comprobante ? ` · ${a.comprobante}` : ""}
                </span>
                {a.estado !== "activo" && (
                  <span className="mt-1 block">
                    <Chip tono={e.tono}>{e.texto}</Chip>
                  </span>
                )}
              </span>
              <span className={celda()}>{verTodas ? a.ubicacionNombre : (a.tipoNombre ?? "—")}</span>
              <span className={celda()}>{diaMes(a.fechaAdquisicion)} {a.fechaAdquisicion.slice(0, 4)}</span>
              <span className={celda("der")}>{soles(a.costo)}</span>
              <span className={celda()}>{textoVidaUtil(a.vidaUtilMeses)}</span>
              <span className={celda("der")}>{a.estado === "activo" && a.mesesDepreciados < a.vidaUtilMeses ? soles(a.depreciacionMensual) : "—"}</span>
              <span className={celda("der")}>
                <b className="font-semibold text-tinta">{soles(a.valorHoy)}</b>
                <span className="mt-1 ml-auto block h-1.5 w-20 overflow-hidden rounded-full bg-sand">
                  <span className="block h-full rounded-full bg-tinta/70" style={{ width: `${pct}%` }} />
                </span>
              </span>
            </button>
          );
        })}
        <p className="px-5 py-2.5 text-xs text-taupe">
          {t.enUso} en uso · costaron {soles(t.costo)} · depreciado {soles(t.depreciado)} · valen hoy {soles(t.valorHoy)} · se deprecian {soles(t.alMes)} al mes
        </p>
      </Tabla>
      <NotaActivos />
    </>
  );
}

function NotaActivos() {
  return (
    <p className="nota-cayla">
      Un activo no se resta entero del mes en que se compra: se reparte en su vida útil (<b>depreciación</b>), desde el mes siguiente. El IGV de su factura se descuenta aparte. Las vidas útiles las confirma el contador.
    </p>
  );
}

export function ActivoDetalleModal({ activo: a, hoy, onCerrar }: { activo: ActivoFila; hoy: string; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [accion, setAccion] = useState<"baja" | "anular" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  const e = TEXTO_ESTADO_ACTIVO[a.estado];

  async function confirmar() {
    if (!motivo.trim()) return avisar.error(accion === "baja" ? "Di por qué se da de baja." : "Di por qué se anula.");
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { error } = await firmar(
      accion === "baja"
        ? supabase.rpc("dar_de_baja_activo" as never, { p_activo_id: a.id, p_fecha: fecha, p_motivo: motivo } as never)
        : supabase.rpc("anular_activo" as never, { p_activo_id: a.id, p_motivo: motivo } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, accion === "baja" ? "dar de baja el activo" : "anular el activo"));
    avisar.exito(accion === "baja" ? "Activo dado de baja" : "Activo anulado", {
      detalle: accion === "baja" ? "Deja de depreciarse; lo que faltaba depreciar es una pérdida de ese mes." : a.cajaMovimientoId ? "El egreso de caja vuelve a «por clasificar»: la plata sí salió del cajón." : undefined,
    });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal titulo={a.nombre} subtitulo={`${a.ubicacionNombre} · ${a.tipoNombre ?? "Activo"} · cuenta ${a.cuenta ?? "—"}`} onClose={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <dl className="divide-y divide-sand rounded-md border border-sand text-sm">
          {[
            ["Comprado", `${diaMes(a.fechaAdquisicion)} ${a.fechaAdquisicion.slice(0, 4)}`],
            ["Costo (sin IGV)", soles(a.costo)],
            ["Comprobante", a.comprobante ? `${a.comprobante}${a.proveedorNombre ? ` · ${a.proveedorNombre}` : ""}` : "Sin comprobante"],
            ["Vida útil", textoVidaUtil(a.vidaUtilMeses)],
            ["Se deprecia al mes", soles(a.depreciacionMensual)],
            ["Depreciado", `${soles(a.depreciacionAcumulada)} · ${a.mesesDepreciados} de ${a.vidaUtilMeses} meses`],
            ["Vale hoy", soles(a.valorHoy)],
            ...(a.saldo !== null && a.saldo > 0 && a.estado === "activo" ? [["Falta pagar", `${soles(a.saldo)} · en Compras ▸ Por pagar`]] : []),
            ...(a.serie ? [["N.° de serie", a.serie]] : []),
            ...(a.fechaBaja ? [["Dado de baja", `${diaMes(a.fechaBaja)} · ${a.motivoBaja ?? ""}`]] : []),
            ...(a.motivoAnulacion ? [["Anulado", a.motivoAnulacion]] : []),
            ...(a.registradoPor ? [["Lo registró", a.registradoPor]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2">
              <dt className="text-taupe">{k}</dt>
              <dd className="text-right text-tinta">{v}</dd>
            </div>
          ))}
        </dl>
        <Chip tono={e.tono}>{e.texto}</Chip>

        {accion ? (
          <div className="space-y-3" data-sin-cascada>
            {accion === "baja" && <CampoTexto etiqueta="Desde cuándo ya no se usa" type="date" min={a.fechaAdquisicion} max={hoy} value={fecha} onChange={(ev) => setFecha(ev.target.value)} />}
            <CampoTexto etiqueta={accion === "baja" ? "Por qué (se malogró, se regaló, se botó)" : "Por qué se anula"} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
            <p className="text-[13px] text-taupe">
              {accion === "baja"
                ? "No se borra: queda en la lista como dado de baja. Desde ese mes deja de depreciarse."
                : `No se borra: queda a la vista como anulado.${a.compraId ? " Su comprobante se anula con él." : ""}`}
            </p>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-cayla btn-secundario" onClick={() => setAccion(null)} disabled={guardando}>
                Volver
              </button>
              <button type="button" className="btn-cayla btn-peligro" onClick={confirmar} disabled={guardando || !responsable.listo}>
                {guardando ? "Guardando…" : accion === "baja" ? "Dar de baja" : "Anular activo"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {a.estado === "activo" && puedeAnularActivo(a) && (
              <button type="button" className="btn-cayla btn-sutil" onClick={() => setAccion("anular")}>
                Se registró por error…
              </button>
            )}
            {a.estado === "activo" && (
              <button type="button" className="btn-cayla btn-sutil" onClick={() => setAccion("baja")}>
                Dar de baja…
              </button>
            )}
            <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
