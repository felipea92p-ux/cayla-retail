"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ProveedorGasto } from "@/components/RegistrarGastoModal";
import { CabeceraBloque, CampoFin, GuiaVacia, InputFin, ListaDatos, PieTabla, RadiosFin, SelectFin, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import {
  TEXTO_COMPROBANTE,
  TEXTO_ESTADO_ACTIVO,
  TIPOS_COMPROBANTE,
  fechaCorta,
  puedeAnularActivo,
  solesRedondo,
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

// Finanzas ▸ Gastos, pestañas «Fijos del mes» y «Activos fijos» (ADR-0195 F2b), y la lista de fijos de Configuración,
// dibujadas como el spike (docs/maquetas/finanzas-2026-09/, `vistaFijos`, `tablaActivos`, `cfgFijos`).

// ---------------------------------------------------------------------------------------------------------------------
// Fijos del mes: el sistema propone, el líder confirma.

function FilaFijo({ titulo, detalle, monto, children }: { titulo: ReactNode; detalle: ReactNode; monto: ReactNode; children: ReactNode }) {
  return (
    <li className="fin-fijo">
      <div className="min-w-0">
        <b>{titulo}</b>
        <span className="fin-sub">{detalle}</span>
      </div>
      <span className="fin-monto">{monto}</span>
      {children}
    </li>
  );
}

export function FijosDelMes({
  fijos,
  sugeridos,
  verTodas,
  esLider,
  onRegistrar,
  onMarcarFijo,
  onNoEsFijo,
}: {
  fijos: GastoFijoMes[];
  sugeridos: FijoSugerido[];
  verTodas: boolean;
  esLider: boolean;
  onRegistrar: (f: GastoFijoMes) => void;
  onMarcarFijo: (s: FijoSugerido) => void;
  onNoEsFijo: (s: FijoSugerido) => void;
}) {
  const vienen = fijos.filter((f) => f.estado === "por_llegar");
  const faltan = fijos.filter((f) => f.estado === "falta");
  const registrados = fijos.filter((f) => f.estado === "registrado");
  const nombre = (f: { descripcion: string; ubicacionNombre: string }) => (verTodas ? `${f.descripcion} · ${f.ubicacionNombre}` : f.descripcion);
  const detalle = (f: GastoFijoMes) => `${f.proveedorNombre ?? "Sin proveedor"} · día ${f.diaDelMes}${f.montoVariable ? " · monto variable" : ""}`;
  const monto = (f: GastoFijoMes) => `${f.montoVariable ? "~" : ""}${solesRedondo(f.monto)}`;
  const editar = esLider ? (
    <Link href="/configuracion?tab=fijos" className="btn-cayla btn-sutil btn-chico">
      Editar fijos
    </Link>
  ) : null;

  if (fijos.length === 0 && sugeridos.length === 0) {
    return (
      <>
        <GuiaVacia sobre="Fijos del mes" titulo="Todavía no hay gastos fijos">
          El alquiler, la luz o el contador: se guardan una vez {esLider ? "en Configuración ▸ Gastos fijos" : "(lo hace el líder)"} y cada mes el sistema dice cuáles llegaron y cuáles faltan.
          {esLider && (
            <>
              {" "}
              <Link href="/configuracion?tab=fijos" className="btn-enlace">
                Agregar el primero
              </Link>
            </>
          )}
        </GuiaVacia>
        <NotaFijos />
      </>
    );
  }

  return (
    <>
      <section className="fin-dos-col">
        <Superficie pad className="anim-sube">
          <CabeceraBloque titulo="Para confirmar" bajada="Llegan en los próximos días. «Registrar» abre el gasto lleno con el monto y los datos de siempre." />
          <ul className="fin-fijos">
            {vienen.length === 0 ? (
              <li className="text-[13px] text-taupe">Nada por confirmar.</li>
            ) : (
              vienen.map((f) => (
                <FilaFijo key={f.id} titulo={nombre(f)} detalle={detalle(f)} monto={monto(f)}>
                  <button type="button" className={`btn-cayla btn-chico ${f.montoVariable ? "btn-secundario" : "btn-primario"}`} onClick={() => onRegistrar(f)}>
                    {f.montoVariable ? "Registrar monto" : "Registrar"}
                  </button>
                </FilaFijo>
              ))
            )}
          </ul>
          {faltan.length > 0 && (
            <>
              <div className="mt-[18px]">
                <CabeceraBloque titulo="Faltan" bajada="Deberían haber llegado y no están registrados." />
              </div>
              <ul className="fin-fijos">
                {faltan.map((f) => (
                  <FilaFijo key={f.id} titulo={nombre(f)} detalle={detalle(f)} monto={monto(f)}>
                    <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => onRegistrar(f)}>
                      {f.montoVariable ? "Registrar monto" : "Registrar"}
                    </button>
                  </FilaFijo>
                ))}
              </ul>
            </>
          )}
        </Superficie>

        <div className="fin-columna">
          {sugeridos.length > 0 && (
            <Superficie pad className="anim-sube">
              <CabeceraBloque titulo="Se repiten. ¿Los marco como fijos?" bajada="El sistema los encontró mirando los gastos de los últimos tres meses." />
              <ul className="fin-fijos">
                {sugeridos.map((s) => (
                  <FilaFijo
                    key={`${s.ubicacionId}-${s.categoria}-${s.proveedorId}`}
                    titulo={`${s.proveedorNombre ?? s.descripcion} · ${s.ubicacionNombre}`}
                    detalle={`${s.categoriaNombre} · ${s.meses} de 3 meses, cerca del día ${s.diaDelMes}`}
                    monto={solesRedondo(s.monto)}
                  >
                    <span className="flex items-center gap-2.5">
                      <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => onMarcarFijo(s)}>
                        Marcar fijo
                      </button>
                      <button type="button" className="btn-enlace text-[12.5px]" onClick={() => onNoEsFijo(s)}>
                        No es fijo
                      </button>
                    </span>
                  </FilaFijo>
                ))}
              </ul>
            </Superficie>
          )}
          <Superficie pad className="anim-sube">
            <CabeceraBloque titulo="Ya registrados este mes" bajada={`${registrados.length} de ${fijos.length} fijos.`}>
              {editar}
            </CabeceraBloque>
            <ul className="fin-fijos">
              {registrados.length === 0 ? (
                <li className="text-[13px] text-taupe">Ninguno todavía.</li>
              ) : (
                registrados.map((f) => (
                  <FilaFijo key={f.id} titulo={nombre(f)} detalle={detalle(f)} monto={solesRedondo(f.gastoMonto ?? f.monto)}>
                    <Chip tono="verde">registrado</Chip>
                  </FilaFijo>
                ))
              )}
            </ul>
          </Superficie>
        </div>
      </section>
      <NotaFijos />
    </>
  );
}

function NotaFijos() {
  return (
    <p className="nota-cayla">
      Un gasto fijo es un recordatorio, no un gasto: <b>solo cuenta cuando se registra</b> con lo que llegó de verdad. Si su día pasó y no hay gasto, sale en «Faltan».
    </p>
  );
}

/** «No es fijo»: la sugerencia deja de aparecer (se recuerda por tienda, categoría y proveedor; se puede revertir). */
export function NoEsFijoModal({ sugerido: s, onCerrar }: { sugerido: FijoSugerido; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("descartar_fijo_sugerido" as never, { p_ubicacion_id: s.ubicacionId, p_categoria: s.categoria, p_proveedor_id: s.proveedorId } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "descartar la sugerencia"));
    avisar.exito("Listo: no se volverá a proponer", { detalle: `${s.proveedorNombre ?? s.descripcion} · ${s.ubicacionNombre}` });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal
      variante="hoja"
      titulo="¿No es un gasto fijo?"
      subtitulo={`${s.proveedorNombre ?? s.descripcion} · ${s.ubicacionNombre} · ${s.categoriaNombre}. Se repitió ${s.meses} de los últimos 3 meses, pero si no se paga todos los meses, deja de proponerse. Sus gastos ya registrados no cambian.`}
      onClose={onCerrar}
      ancho="max-w-[520px]"
    >
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={confirmar} disabled={guardando || !responsable.listo}>
          {guardando ? "Guardando…" : "No es fijo"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Configuración ▸ Gastos fijos: la lista de lo que se repite, para agregar, corregir o archivar.

export function TablaGastosFijos({
  fijos,
  categorias,
  ubicaciones,
  proveedores,
}: {
  fijos: GastoFijoMes[];
  categorias: CategoriaGasto[];
  ubicaciones: UbicacionGastos[];
  proveedores: ProveedorGasto[];
}) {
  const [editar, setEditar] = useState<{ fijo?: GastoFijoMes } | null>(null);
  const cuenta = (codigo: string) => categorias.find((c) => c.codigo === codigo)?.cuenta ?? "";
  const total = fijos.reduce((t, f) => t + f.monto, 0);
  return (
    <>
      <Superficie className="anim-sube">
        <TituloDeTarjeta titulo="Gastos que se repiten" bajada="El sistema los propone cada mes en Gastos ▸ Fijos del mes. Los variables (luz, agua) piden el monto del recibo.">
          <button type="button" className="btn-cayla btn-primario btn-chico" onClick={() => setEditar({})}>
            + Agregar fijo
          </button>
        </TituloDeTarjeta>
        {fijos.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-taupe">Todavía no hay gastos fijos. El alquiler, la luz o el contador: agrégalos una vez.</p>
        ) : (
          <div className="fin-tabla-wrap">
            <table className="fin-tabla">
              <thead>
                <tr>
                  <th>Gasto</th>
                  <th>Unidad</th>
                  <th>Proveedor</th>
                  <th>Llega con</th>
                  <th className="fin-num">Monto</th>
                  <th className="fin-num">Día</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fijos.map((f) => (
                  <tr key={f.id}>
                    <td className="fin-ancha" data-l="Gasto">
                      <b>{f.descripcion}</b>
                      <span className="fin-sub">
                        {f.categoriaNombre} · {cuenta(f.categoria)}
                        {f.montoVariable ? " · variable" : ""}
                      </span>
                    </td>
                    <td data-l="Unidad">{f.ubicacionId ? f.ubicacionNombre : "De la empresa"}</td>
                    <td data-l="Proveedor">{f.proveedorNombre ?? <span className="fin-tenue">Sin proveedor</span>}</td>
                    <td data-l="Llega con">{TEXTO_COMPROBANTE[f.comprobanteTipo]}</td>
                    <td className="fin-num" data-l="Monto">
                      {f.montoVariable ? "~" : ""}
                      {solesRedondo(f.monto)}
                    </td>
                    <td className="fin-num" data-l="Día">
                      {f.diaDelMes}
                    </td>
                    <td className="fin-num">
                      <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => setEditar({ fijo: f })}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PieTabla>
          <span>
            {fijos.length} {fijos.length === 1 ? "fijo" : "fijos"} · suman {solesRedondo(total)} al mes · uno que ya no se paga se archiva, no se borra
          </span>
        </PieTabla>
      </Superficie>
      {editar && (
        <GastoFijoModal
          fijo={editar.fijo}
          categorias={categorias}
          ubicaciones={ubicaciones}
          proveedores={proveedores}
          esLider
          ubicacionInicial={ubicaciones[0]?.id ?? "empresa"}
          onCerrar={() => setEditar(null)}
        />
      )}
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
  const cat = categorias.find((c) => c.codigo === b.categoria) ?? null;

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
      detalle: accion === "archivar" ? "Deja de aparecer desde este mes; sus gastos registrados se quedan." : "Cada mes Gastos dirá si ya se registró.",
    });
    onCerrar();
    router.refresh();
  }

  const opcionesUbicacion = [...ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre })), ...(esLider ? [{ valor: "empresa", texto: "De la empresa (no es de una tienda)" }] : [])];
  return (
    <Modal variante="hoja" titulo={fijo ? "Editar gasto fijo" : "Nuevo gasto fijo"} subtitulo="Lo que se paga todos los meses. Es un recordatorio: cuenta cuando se registra con lo que llegó." onClose={onCerrar} ancho="max-w-[600px]">
      <CampoFin etiqueta="Qué se paga" htmlFor="fijo-descripcion">
        <InputFin id="fijo-descripcion" value={b.descripcion} onChange={(e) => poner("descripcion", e.target.value)} placeholder="Alquiler del local" />
      </CampoFin>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Categoría" htmlFor="fijo-categoria" ayuda={cat ? `Va a la cuenta ${cat.cuenta}.` : undefined}>
          <SelectFin id="fijo-categoria" value={b.categoria} onChange={(e) => poner("categoria", e.target.value)}>
            <option value="">Elige…</option>
            {categorias.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nombre}
              </option>
            ))}
          </SelectFin>
        </CampoFin>
        <CampoFin etiqueta="A quién se le carga" htmlFor="fijo-ubicacion">
          <SelectFin id="fijo-ubicacion" value={b.ubicacion} disabled={opcionesUbicacion.length < 2} onChange={(e) => poner("ubicacion", e.target.value)}>
            {opcionesUbicacion.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </SelectFin>
        </CampoFin>
      </div>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Proveedor" htmlFor="fijo-proveedor">
          <SelectFin id="fijo-proveedor" value={b.proveedorId} onChange={(e) => poner("proveedorId", e.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </SelectFin>
        </CampoFin>
        <CampoFin etiqueta="Llega con" htmlFor="fijo-comprobante">
          <SelectFin id="fijo-comprobante" value={b.comprobante} onChange={(e) => poner("comprobante", e.target.value as BorradorFijo["comprobante"])}>
            {TIPOS_COMPROBANTE.map((t) => (
              <option key={t} value={t}>
                {TEXTO_COMPROBANTE[t]}
              </option>
            ))}
          </SelectFin>
        </CampoFin>
      </div>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Monto de siempre (con IGV)" htmlFor="fijo-monto">
          <InputFin id="fijo-monto" inputMode="decimal" value={b.monto} onChange={(e) => poner("monto", e.target.value)} placeholder="0.00" />
        </CampoFin>
        <CampoFin etiqueta="Día del mes en que llega" htmlFor="fijo-dia" ayuda="Del 1 al 28.">
          <InputFin id="fijo-dia" inputMode="numeric" value={b.dia} onChange={(e) => poner("dia", e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="10" />
        </CampoFin>
      </div>
      <CampoFin etiqueta="¿El monto cambia cada mes?" ayuda={b.variable ? "Como la luz o el agua: se muestra con «~» y se escribe el del recibo al registrarlo." : undefined}>
        <RadiosFin
          nombre="fijo-variable"
          etiqueta="El monto cambia"
          valor={b.variable ? "si" : "no"}
          onValor={(v) => poner("variable", v === "si")}
          opciones={[
            { valor: "no", texto: "Siempre el mismo" },
            { valor: "si", texto: "Cambia (luz, agua)" },
          ]}
        />
      </CampoFin>
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        {fijo && (
          <button type="button" className="btn-cayla btn-sutil mr-auto" disabled={guardando} onClick={() => ejecutar("archivar")}>
            Ya no se paga: archivar
          </button>
        )}
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={() => ejecutar("guardar")} disabled={guardando || !responsable.listo}>
          {guardando ? "Guardando…" : fijo ? "Guardar" : "Agregar fijo"}
        </button>
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
        <GuiaVacia sobre="Activos fijos" titulo="Sin activos fijos registrados">
          Un mostrador, una laptop, una máquina del Taller: regístralos con «+ Registrar activo» y el sistema los deprecia cada mes.
        </GuiaVacia>
        <NotaActivos />
      </>
    );
  }
  return (
    <>
      <Superficie className="anim-sube">
        <div className="fin-tabla-wrap">
          <table className="fin-tabla">
            <thead>
              <tr>
                <th>Bien</th>
                {verTodas && <th>Unidad</th>}
                <th>Comprado</th>
                <th>Factura</th>
                <th className="fin-num">Costo</th>
                <th>Vida útil</th>
                <th className="fin-num">Se deprecia al mes</th>
                <th className="fin-num">Vale hoy</th>
              </tr>
            </thead>
            <tbody>
              {activos.map((a) => {
                const e = TEXTO_ESTADO_ACTIVO[a.estado];
                const pct = a.costo > 0 ? Math.max(0, Math.min(100, (a.valorHoy / a.costo) * 100)) : 0;
                return (
                  <tr
                    key={a.id}
                    data-clic
                    tabIndex={0}
                    className={a.estado !== "activo" ? "fin-suave" : undefined}
                    onClick={() => onAbrir(a)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        onAbrir(a);
                      }
                    }}
                  >
                    <td className="fin-ancha" data-l="Bien">
                      <b>{a.nombre}</b>
                      <span className="fin-sub">{a.proveedorNombre ?? a.tipoNombre ?? "Sin proveedor"}</span>
                      {a.estado !== "activo" && (
                        <span className="mt-1 block">
                          <Chip tono={e.tono}>{e.texto}</Chip>
                        </span>
                      )}
                    </td>
                    {verTodas && <td data-l="Unidad">{a.ubicacionNombre}</td>}
                    <td data-l="Comprado">{fechaCorta(a.fechaAdquisicion, true)}</td>
                    <td data-l="Factura">{a.comprobante ?? <span className="fin-tenue">Sin comprobante</span>}</td>
                    <td className="fin-num" data-l="Costo">
                      {solesRedondo(a.costo)}
                    </td>
                    <td data-l="Vida útil">{textoVidaUtil(a.vidaUtilMeses)}</td>
                    <td className="fin-num" data-l="Al mes">
                      {a.estado === "activo" && a.mesesDepreciados < a.vidaUtilMeses ? soles(a.depreciacionMensual) : "—"}
                    </td>
                    <td className="fin-num" data-l="Vale hoy">
                      <b>{solesRedondo(a.valorHoy)}</b>
                      <span className="fin-barra" aria-hidden>
                        <i style={{ width: `${pct}%` }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PieTabla>
          <span>
            Total {solesRedondo(t.costo)} · depreciado {solesRedondo(t.depreciado)} · vale hoy {solesRedondo(t.valorHoy)}
          </span>
          <span>
            {t.enUso} en uso · se deprecian {soles(t.alMes)} al mes
          </span>
        </PieTabla>
      </Superficie>
      <NotaActivos />
    </>
  );
}

function NotaActivos() {
  return (
    <p className="nota-cayla">
      Un activo no se resta entero del mes en que se compra: se reparte en su vida útil (<b>depreciación</b>), desde el mes siguiente. Así un mes no «pierde» S/ 3,200 por comprar un mostrador que sigue ahí. El IGV de su factura se descuenta aparte; las vidas útiles las confirma el contador.
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

  if (accion) {
    return (
      <Modal
        variante="hoja"
        titulo={accion === "baja" ? `Dar de baja: ${a.nombre}` : `Anular: ${a.nombre}`}
        subtitulo={accion === "baja" ? "Dejó de servir (se malogró, se regaló, se botó). No se borra: queda en la lista como dado de baja y desde ese mes deja de depreciarse." : `Se registró por error. No se borra: queda a la vista como anulado.${a.compraId ? " Su comprobante se anula con él." : ""}`}
        onClose={onCerrar}
        ancho="max-w-[520px]"
      >
        {accion === "baja" && (
          <CampoFin etiqueta="Desde cuándo ya no se usa" htmlFor="activo-baja-fecha">
            <InputFin id="activo-baja-fecha" type="date" min={a.fechaAdquisicion} max={hoy} value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
          </CampoFin>
        )}
        <CampoFin etiqueta="Motivo" htmlFor="activo-motivo">
          <InputFin id="activo-motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder={accion === "baja" ? "Se malogró la pantalla" : "Se registró dos veces"} />
        </CampoFin>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
        <div className="fin-botones mt-4">
          <button type="button" className="btn-cayla btn-secundario" onClick={() => setAccion(null)} disabled={guardando}>
            Volver
          </button>
          <button type="button" className="btn-cayla btn-primario" onClick={confirmar} disabled={guardando || !responsable.listo}>
            {guardando ? "Guardando…" : accion === "baja" ? "Dar de baja" : "Anular activo"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      variante="hoja"
      titulo={
        <>
          <span className="label-cayla mb-1 block font-sans text-[11px] font-semibold text-taupe">
            {a.tipoNombre ?? "Activo fijo"}
            {a.cuenta ? ` · cuenta ${a.cuenta}` : ""}
          </span>
          {a.nombre}
        </>
      }
      subtitulo={[a.ubicacionNombre, `comprado ${fechaCorta(a.fechaAdquisicion, true)}`, a.comprobante, a.proveedorNombre].filter(Boolean).join(" · ")}
      onClose={onCerrar}
      ancho="max-w-[520px]"
    >
      <ListaDatos
        filas={[
          { dato: "Costo (sin IGV)", valor: soles(a.costo) },
          { dato: "Vida útil", valor: textoVidaUtil(a.vidaUtilMeses) },
          { dato: "Se deprecia al mes", valor: soles(a.depreciacionMensual) },
          { dato: "Depreciado", valor: `${soles(a.depreciacionAcumulada)} · ${a.mesesDepreciados} de ${a.vidaUtilMeses} meses` },
          { dato: "Vale hoy", valor: soles(a.valorHoy) },
          ...(a.saldo !== null && a.saldo > 0 && a.estado === "activo" ? [{ dato: "Falta pagar", valor: `${soles(a.saldo)} · en Compras ▸ Por pagar` }] : []),
          ...(a.serie ? [{ dato: "N.° de serie", valor: a.serie }] : []),
          { dato: "Estado", valor: <Chip tono={e.tono}>{e.texto}</Chip> },
          ...(a.fechaBaja ? [{ dato: "Dado de baja", valor: `${fechaCorta(a.fechaBaja, true)} · ${a.motivoBaja ?? ""}`, tenue: true }] : []),
          ...(a.motivoAnulacion ? [{ dato: "Anulado", valor: a.motivoAnulacion, tenue: true }] : []),
          ...(a.registradoPor ? [{ dato: "Lo registró", valor: a.registradoPor, tenue: true }] : []),
        ]}
      />
      <div className="fin-botones">
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
    </Modal>
  );
}
