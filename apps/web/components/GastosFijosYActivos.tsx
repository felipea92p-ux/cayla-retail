"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ProveedorGasto } from "@/components/RegistrarGastoModal";
import { CabeceraBloque, CampoFin, InputFin, ListaDatos, PieTabla, RadiosFin, SelectFin, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { ProveedorElegido } from "@/components/ProveedorElegido";
import { FichaDePagoCampos } from "@/components/gasto-fijo/FichaDePagoCampos";
import { HistorialFicha } from "@/components/gasto-fijo/HistorialFicha";
import {
  contratoPorVencer,
  datosDeLaFicha,
  esProveedorDeGasto,
  faltaDeLaFicha,
  FICHA_VACIA,
  fichaParaEnviar,
  leerFicha,
  TEXTO_FORMA_DE_PAGO,
  textoContratoPorVencer,
  type FichaFijo,
  type ResumenFicha,
} from "@/lib/gasto-fijo-ficha-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import {
  AYUDA_MOMENTO_FIJO,
  MOMENTOS_FIJO,
  TEXTO_COMPROBANTE,
  TEXTO_ESTADO_ACTIVO,
  TEXTO_MOMENTO_FIJO,
  TIPOS_COMPROBANTE,
  fechaCorta,
  puedeAnularActivo,
  resumenActivosPorSede,
  solesRedondo,
  textoColumnaCuando,
  textoCuandoLlega,
  textoVidaUtil,
  totalesActivos,
  validarFijo,
  type ActivoFila,
  type BorradorFijo,
  type CategoriaGasto,
  type FijoSugerido,
  type GastoFijoMes,
  type MomentoFijo,
  type UbicacionGastos,
} from "@/lib/gastos-reglas";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { CalendarClock, Laptop } from "lucide-react";
import { MAX_DESCRIPCION_GASTO } from "@/lib/finanzas-topes";
import { BotonEditar, LapizEditar } from "@/components/ui/BotonEditar";

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
  puedeConfigurar,
  onRegistrar,
  onMarcarFijo,
  onNoEsFijo,
}: {
  fijos: GastoFijoMes[];
  sugeridos: FijoSugerido[];
  verTodas: boolean;
  /** ¿Ve Configuración, donde se editan los fijos? (ADR-0253: el módulo ya se da a un rol). */
  puedeConfigurar: boolean;
  onRegistrar: (f: GastoFijoMes) => void;
  onMarcarFijo: (s: FijoSugerido) => void;
  onNoEsFijo: (s: FijoSugerido) => void;
}) {
  const vienen = fijos.filter((f) => f.estado === "por_llegar");
  const faltan = fijos.filter((f) => f.estado === "falta");
  const registrados = fijos.filter((f) => f.estado === "registrado");
  const nombre = (f: { descripcion: string; ubicacionNombre: string }) => (verTodas ? `${f.descripcion} · ${f.ubicacionNombre}` : f.descripcion);
  const detalle = (f: GastoFijoMes) => `${f.proveedorNombre ? `${f.proveedorNombre} · ` : ""}${textoCuandoLlega(f.momento, f.diaDelMes)}${f.montoVariable ? " · monto variable" : ""}`;
  const monto = (f: GastoFijoMes) => `${f.montoVariable ? "~" : ""}${solesRedondo(f.monto)}`;
  const editar = puedeConfigurar ? (
    <BotonEditar chico href="/configuracion?tab=fijos">
      Editar fijos
    </BotonEditar>
  ) : null;

  if (fijos.length === 0 && sugeridos.length === 0) {
    return (
      <>
        <Superficie>
          <Vacio
            guia="fin-gastos.fijos"
            icono={<CalendarClock />}
            titulo="Todavía no hay gastos fijos"
            acciones={
              puedeConfigurar ? (
                <BotonEnlace href="/configuracion?tab=fijos" peso="primario">
                  Agregar el primero
                </BotonEnlace>
              ) : null
            }
          >
            El alquiler, la luz o el contador: se guardan una vez {puedeConfigurar ? "en Configuración ▸ Gastos fijos" : "(lo hace quien tiene Configuración)"} y cada mes el sistema dice cuáles llegaron y cuáles faltan.
          </Vacio>
        </Superficie>
        <NotaFijos />
      </>
    );
  }

  return (
    <>
      <section className="fin-dos-col" data-guia="fin-gastos.fijos">
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
      tamano="mediana"
    >
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <Boton peso="primario" cargando={guardando} type="button" onClick={confirmar} disabled={guardando || !responsable.listo}>
          No es fijo
        </Boton>
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
  fichas = {},
  fichaDisponible = false,
  hoy = "",
}: {
  fijos: GastoFijoMes[];
  categorias: CategoriaGasto[];
  ubicaciones: UbicacionGastos[];
  proveedores: ProveedorGasto[];
  /** Lo que se sabe de cada fijo para pagarlo (ADR-0452), por id. */
  fichas?: Record<string, ResumenFicha>;
  /** La base ya tiene la ficha. Si no, la tabla se dibuja como antes. */
  fichaDisponible?: boolean;
  /** Hoy en Lima (`AAAA-MM-DD`), para avisar de un contrato que vence pronto. */
  hoy?: string;
}) {
  const [editar, setEditar] = useState<{ fijo?: GastoFijoMes } | null>(null);
  const cuenta = (codigo: string) => categorias.find((c) => c.codigo === codigo)?.cuenta ?? "";
  const total = fijos.reduce((t, f) => t + f.monto, 0);
  const sinCompletar = fichaDisponible ? fijos.filter((f) => faltaDeLaFicha(fichas[f.id]).length > 0).length : 0;
  return (
    <>
      <Superficie className="anim-sube" guia="config.fijos">
        <TituloDeTarjeta titulo="Gastos que se repiten" bajada="El sistema los propone cada mes en Gastos ▸ Fijos del mes. Los variables (luz, agua) piden el monto del recibo.">
          <Boton type="button" peso="primario" onClick={() => setEditar({})}>
            + Agregar fijo
          </Boton>
        </TituloDeTarjeta>
        {fijos.length === 0 ? (
          <Vacio tamano="chico" icono={<CalendarClock />}>
            Todavía no hay gastos fijos. El alquiler, la luz o el contador: agrégalos una vez.
          </Vacio>
        ) : (
          <div className="fin-tabla-wrap">
            <table className="fin-tabla">
              <thead>
                <tr>
                  <th>Gasto</th>
                  <th>Unidad</th>
                  <th>{fichaDisponible ? "Se le paga a" : "Proveedor"}</th>
                  <th>Llega con</th>
                  <th className="fin-num">Monto</th>
                  <th className="fin-num">Llega</th>
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
                    {fichaDisponible ? (
                      <td data-l="Se le paga a">
                        <CeldaSePagaA r={fichas[f.id]} hoy={hoy} />
                      </td>
                    ) : (
                      <td data-l="Proveedor">{f.proveedorNombre ?? <span className="fin-tenue">Sin proveedor</span>}</td>
                    )}
                    <td data-l="Llega con">{TEXTO_COMPROBANTE[f.comprobanteTipo]}</td>
                    <td className="fin-num" data-l="Monto">
                      {f.montoVariable ? "~" : ""}
                      {solesRedondo(f.monto)}
                    </td>
                    <td className="fin-num" data-l="Llega">
                      {textoColumnaCuando(f.momento, f.diaDelMes)}
                    </td>
                    <td className="fin-num">
                      <LapizEditar que={f.descripcion} onClick={() => setEditar({ fijo: f })} className="ml-auto" />
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
            {sinCompletar > 0 && ` · ${sinCompletar} sin completar a quién y cómo se paga`}
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

/** La celda «Se le paga a» de la lista de fijos (ADR-0452): quién cobra y cómo, o que falta completarlo. */
function CeldaSePagaA({ r, hoy }: { r: ResumenFicha | undefined; hoy: string }) {
  const vence = r?.contratoVence && hoy ? contratoPorVencer(r.contratoVence, hoy) : null;
  if (!r || !r.beneficiario) return <span className="fin-tenue">Sin completar</span>;
  return (
    <>
      <b>{r.beneficiario}</b>
      <span className="fin-sub">
        {r.formaDePago ? TEXTO_FORMA_DE_PAGO[r.formaDePago] : "Falta cómo se paga"}
        {r.codigoServicio ? ` · ${r.codigoServicio}` : ""}
      </span>
      {vence && (
        <Chip tono={vence.vencido || vence.dias <= 30 ? "ambar" : "neutro"} versalitas={false}>
          {textoContratoPorVencer(vence)}
        </Chip>
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
    momento: fijo?.momento ?? "dia",
  }));
  const poner = <K extends keyof BorradorFijo>(k: K, v: BorradorFijo[K]) => setB((x) => ({ ...x, [k]: v }));
  const cat = categorias.find((c) => c.codigo === b.categoria) ?? null;

  // La ficha de pago (ADR-0452): a quién y cómo se paga, para que otra persona pueda pagarlo sin quien lo cargó. La hoja pregunta
  // una vez si la base ya la tiene (antes de pegar la migración, el modal es el de siempre) y si la cuenta es de un líder o admin
  // (solo ellos ven y cambian la cuenta). Al editar, lee la ficha del fijo; al guardar manda SOLO lo que la persona cambió.
  const [apoyo, setApoyo] = useState<{ disponible: boolean; lider: boolean } | null>(null);
  const [ficha, setFicha] = useState<FichaFijo>(FICHA_VACIA);
  const [fichaInicial, setFichaInicial] = useState<FichaFijo>(FICHA_VACIA);
  const [lectura, setLectura] = useState<"leyendo" | "lista" | "fallo">(fijo ? "leyendo" : "lista");
  const [bancoLeido, setBancoLeido] = useState(true);
  const ponerFicha = <K extends keyof FichaFijo>(k: K, v: FichaFijo[K]) => setFicha((x) => ({ ...x, [k]: v }));
  const fichaOn = apoyo?.disponible === true;
  const verBanco = apoyo?.lider === true && bancoLeido;

  useEffect(() => {
    let vigente = true;
    const supabase = createClient();
    // `fn_` es de lectura para el loader (espera-reglas.ts): no tapa la hoja.
    Promise.all([supabase.rpc("fn_gastos_fijos_fichas" as never), supabase.rpc("fn_es_lider" as never)]).then(([fichas, lider]) => {
      if (vigente) setApoyo({ disponible: !fichas.error, lider: lider.data === true });
    });
    return () => {
      vigente = false;
    };
  }, []);

  const fijoId = fijo?.id;
  useEffect(() => {
    if (!fijoId || !fichaOn) return;
    let vigente = true;
    createClient()
      .rpc("fn_gasto_fijo_ficha" as never, { p_gasto_fijo_id: fijoId } as never)
      .then(({ data, error }) => {
        if (!vigente) return;
        const leida = leerFicha(error ? undefined : ((data ?? []) as Record<string, unknown>[])[0]);
        if (!leida) return setLectura("fallo");
        const datos = datosDeLaFicha(leida);
        setFicha(datos);
        setFichaInicial(datos);
        setBancoLeido(leida.puedeVerBanco);
        setLectura("lista");
      });
    return () => {
      vigente = false;
    };
  }, [fijoId, fichaOn]);

  async function ejecutar(accion: "guardar" | "archivar") {
    const v = validarFijo(b);
    if (accion === "guardar" && !v.ok) return avisar.error(v.error);
    // Solo lo que cambió; sin lectura de la ficha (todavía o con falla) no se manda nada: nunca se pisa lo que no se vio.
    const f = accion === "guardar" && fichaOn && lectura === "lista" ? fichaParaEnviar(ficha, fichaInicial, verBanco) : null;
    if (f && !f.ok) return avisar.error(f.error);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { error } = await firmar(
      accion === "archivar"
        ? supabase.rpc("archivar_gasto_fijo" as never, { p_id: fijo!.id } as never)
        : supabase.rpc("guardar_gasto_fijo" as never, { p_id: fijo?.id ?? null, ...(v.ok ? v.valor : {}), ...(f?.ok && f.valor ? { p_ficha: f.valor } : {}) } as never),
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
  const conComprobante = b.comprobante !== "sin_comprobante";
  // Con la ficha, el proveedor es solo quien EMITE el papel (luz, agua, internet…): la mercadería no se ofrece. Sin la ficha (la base
  // aún no la tiene) queda el combo de siempre.
  const emisores = fichaOn ? proveedores.filter((p) => esProveedorDeGasto(p) || p.id === b.proveedorId) : proveedores;
  return (
    <Modal variante="hoja" titulo={fijo ? "Editar gasto fijo" : "Nuevo gasto fijo"} subtitulo="Lo que se paga todos los meses. Es un recordatorio: cuenta cuando se registra con lo que llegó." onClose={onCerrar} tamano="mediana">
      <CampoFin etiqueta="Qué se paga" htmlFor="fijo-descripcion">
        <InputFin id="fijo-descripcion" value={b.descripcion} onChange={(e) => poner("descripcion", e.target.value)} placeholder="Alquiler del local" maxLength={MAX_DESCRIPCION_GASTO} />
      </CampoFin>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Categoría" htmlFor="fijo-categoria" ayuda={cat ? `Va a la cuenta ${cat.cuenta}.` : undefined}>
          <SelectFin
            id="fijo-categoria"
            valor={b.categoria}
            onValor={(v) => poner("categoria", v)}
            marcador="Elige…"
            opciones={categorias.map((c) => ({ valor: c.codigo, texto: c.nombre }))}
          />
        </CampoFin>
        <CampoFin etiqueta="A quién se le carga" htmlFor="fijo-ubicacion">
          <SelectFin
            id="fijo-ubicacion"
            valor={b.ubicacion}
            deshabilitado={opcionesUbicacion.length < 2}
            onValor={(v) => poner("ubicacion", v)}
            opciones={opcionesUbicacion}
          />
        </CampoFin>
      </div>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Monto de siempre (con IGV)" htmlFor="fijo-monto">
          <InputFin id="fijo-monto" inputMode="decimal" value={b.monto} onChange={(e) => poner("monto", e.target.value)} placeholder="0.00" />
        </CampoFin>
        <CampoFin etiqueta="Cuándo llega" htmlFor="fijo-momento" ayuda={AYUDA_MOMENTO_FIJO[b.momento]}>
          <SelectFin<MomentoFijo>
            id="fijo-momento"
            valor={b.momento}
            onValor={(v) => poner("momento", v)}
            opciones={MOMENTOS_FIJO.map((m) => ({ valor: m, texto: TEXTO_MOMENTO_FIJO[m] }))}
          />
        </CampoFin>
      </div>
      {b.momento === "dia" && (
        <CampoFin etiqueta="Día del mes en que llega" htmlFor="fijo-dia" ayuda="Del 1 al 28. Para el 29, 30 o 31, elige «A fin de mes».">
          <InputFin id="fijo-dia" inputMode="numeric" value={b.dia} onChange={(e) => poner("dia", e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="10" />
        </CampoFin>
      )}
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
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Llega con" htmlFor="fijo-comprobante">
          <SelectFin<BorradorFijo["comprobante"]>
            id="fijo-comprobante"
            valor={b.comprobante}
            onValor={(v) => setB((x) => ({ ...x, comprobante: v, proveedorId: v === "sin_comprobante" ? "" : x.proveedorId }))}
            opciones={TIPOS_COMPROBANTE.map((t) => ({ valor: t, texto: TEXTO_COMPROBANTE[t] }))}
          />
        </CampoFin>
        {apoyo && (!fichaOn || conComprobante) && (
          <CampoFin
            etiqueta={fichaOn ? "Quién emite el comprobante" : "Proveedor"}
            htmlFor="fijo-proveedor"
            ayuda={fichaOn ? "Opcional: luz, agua, internet y demás servicios. ¿No está? Súmalo al registrar su primer gasto." : undefined}
          >
            <SelectFin
              id="fijo-proveedor"
              valor={b.proveedorId}
              onValor={(v) => poner("proveedorId", v)}
              opciones={[{ valor: "", texto: fichaOn ? "Sin elegir" : "Sin proveedor" }, ...emisores.map((p) => ({ valor: p.id, texto: p.nombre }))]}
            />
          </CampoFin>
        )}
      </div>
      {apoyo && !fichaOn && <ProveedorElegido proveedor={proveedores.find((p) => p.id === b.proveedorId)} />}
      {fichaOn && lectura === "leyendo" && <p className="nota-cayla mt-4">Leyendo los datos de pago…</p>}
      {fichaOn && lectura === "fallo" && (
        <p className="nota-cayla mt-4">No pude leer los datos de pago de este gasto. Lo demás se guarda igual y los datos de pago quedan como estaban.</p>
      )}
      {fichaOn && lectura === "lista" && <FichaDePagoCampos valor={ficha} onCambio={ponerFicha} categoria={b.categoria} puedeVerBanco={verBanco} deshabilitado={guardando} />}
      {fichaOn && lectura === "lista" && fijo && verBanco && <HistorialFicha gastoFijoId={fijo.id} />}
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones pie-hoja-fijo mt-4">
        {fijo && (
          <button type="button" className="btn-cayla btn-sutil mr-auto" disabled={guardando} onClick={() => ejecutar("archivar")}>
            Ya no se paga: archivar
          </button>
        )}
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <Boton peso="primario" cargando={guardando} type="button" onClick={() => ejecutar("guardar")} disabled={guardando || !responsable.listo}>
          {fijo ? "Guardar" : "Agregar fijo"}
        </Boton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Activos fijos

/**
 * La vista integrada de los activos (ADR-0335): una tarjeta por sede con lo que vale hoy, y el total de CAYLA. Solo en «Todas las
 * tiendas». Una sede sin activos sale punteada y dice «Sin activos cargados»: así se ve lo que falta cargar. Tocar una sede lleva la
 * lista a esa sede. Lo que vale hoy es costo menos lo depreciado: es la cifra que el Balance toma de cada sede.
 */
export function ResumenActivosPorSede({ resumen, onVer }: { resumen: ReturnType<typeof resumenActivosPorSede>; onVer: (ubicacionId: string) => void }) {
  const { porSede, total } = resumen;
  const entra = (i: number): { className: string; style: CSSProperties } => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
  const detalle = (s: { activos: number; costo: number; alMes: number }) => (
    <>
      <span className="block">
        {s.activos} {s.activos === 1 ? "activo" : "activos"} · costo {solesRedondo(s.costo)}
      </span>
      <span className="block">se deprecian {soles(s.alMes)} al mes</span>
    </>
  );
  return (
    <section className="fin-cifras fin-cifras-activos" aria-label="Activos de cada sede y total de CAYLA">
      {porSede.map((s, i) => (
        <TarjetaCifra
          key={s.ubicacionId}
          etiqueta={s.nombre}
          valor={s.activos ? solesRedondo(s.valorHoy) : null}
          unidad={s.activos ? "vale hoy" : undefined}
          onClick={s.activos ? () => onVer(s.ubicacionId) : undefined}
          {...entra(i + 1)}
        >
          {s.activos ? detalle(s) : "Sin activos cargados"}
        </TarjetaCifra>
      ))}
      {/* Antes llevaba `activa` (fondo sand/40) solo para resaltar el total; ese fondo era la marca de «elegida» y desde
          ADR-0358 se reserva para la cifra que filtra. */}
      <TarjetaCifra etiqueta="CAYLA · todas las sedes" valor={solesRedondo(total.valorHoy)} unidad="vale hoy" {...entra(porSede.length + 1)}>
        {detalle(total)}
      </TarjetaCifra>
    </section>
  );
}

export function TablaActivos({ activos, verTodas, onAbrir }: { activos: ActivoFila[]; verTodas: boolean; onAbrir: (a: ActivoFila) => void }) {
  const t = totalesActivos(activos);
  if (activos.length === 0) {
    return (
      <>
        <Superficie>
          <Vacio guia="fin-gastos.activos" icono={<Laptop />} titulo="Sin activos fijos registrados">
            Un mostrador, una laptop, una máquina del Taller: regístralos con «+ Registrar activo» y el sistema los deprecia cada mes.
          </Vacio>
        </Superficie>
        <NotaActivos />
      </>
    );
  }
  return (
    <>
      <Superficie className="anim-sube" guia="fin-gastos.activos">
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
                    data-guia="fin-gastos.activo-fila"
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
                    <td data-l="Factura">
                      {a.comprobante ?? (a.cargaInicial ? <Chip tono="pizarra">Ya lo teníamos</Chip> : <span className="fin-tenue">Sin comprobante</span>)}
                    </td>
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
      Un activo no se resta entero del mes en que se compra: se reparte en su vida útil (<b>depreciación</b>), desde el mes siguiente. Así un mes no «pierde» S/&nbsp;3,200 por comprar un mostrador que sigue ahí. El IGV de su factura se descuenta aparte; las vidas útiles las confirma el contador.
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
        tamano="mediana"
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
          <Boton textoCargando={accion === "baja" ? "Dando de baja…" : "Anulando…"} peso="primario" cargando={guardando} type="button" onClick={confirmar} disabled={guardando || !responsable.listo}>
            {accion === "baja" ? "Dar de baja" : "Anular activo"}
          </Boton>
        </div>
      </Modal>
    );
  }

  return (
    <Modal conCerrar
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
      tamano="mediana"
    >
      <ListaDatos
        guia="fin-gastos.activo-detalle"
        filas={[
          { dato: a.cargaInicial ? "Costo (lo que se pagó)" : "Costo (sin IGV)", valor: soles(a.costo) },
          { dato: "Vida útil", valor: textoVidaUtil(a.vidaUtilMeses) },
          { dato: "Se deprecia al mes", valor: soles(a.depreciacionMensual) },
          { dato: "Depreciado", valor: `${soles(a.depreciacionAcumulada)} · ${a.mesesDepreciados} de ${a.vidaUtilMeses} meses` },
          { dato: "Vale hoy", valor: soles(a.valorHoy) },
          ...(a.saldo !== null && a.saldo > 0 && a.estado === "activo" ? [{ dato: "Falta pagar", valor: `${soles(a.saldo)} · en Compras ▸ Por pagar` }] : []),
          ...(a.serie ? [{ dato: "N.° de serie", valor: a.serie }] : []),
          ...(a.cargaInicial ? [{ dato: "Origen", valor: <Chip tono="pizarra">Ya lo teníamos</Chip> }] : []),
          { dato: "Estado", valor: <Chip tono={e.tono}>{e.texto}</Chip> },
          ...(a.fechaBaja ? [{ dato: "Dado de baja", valor: `${fechaCorta(a.fechaBaja, true)} · ${a.motivoBaja ?? ""}`, tenue: true }] : []),
          ...(a.motivoAnulacion ? [{ dato: "Anulado", valor: a.motivoAnulacion, tenue: true }] : []),
          ...(a.registradoPor ? [{ dato: "Lo registró", valor: a.registradoPor, tenue: true }] : []),
        ]}
      />
      <div className="fin-botones" data-guia="fin-gastos.activo-botones">
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
      </div>
    </Modal>
  );
}
