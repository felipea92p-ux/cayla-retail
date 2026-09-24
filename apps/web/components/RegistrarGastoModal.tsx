"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Campo, CampoTexto, SelectNativo, Segmentado } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import {
  TEXTO_COMPROBANTE,
  TEXTO_MEDIO,
  TIPOS_COMPROBANTE,
  borradorDesdeFijo,
  igvDeFactura,
  mediosPara,
  parsearMonto,
  partirSerieNumero,
  textoVidaUtil,
  validarActivo,
  validarGasto,
  type BorradorGasto,
  type CategoriaGasto,
  type EgresoPorClasificar,
  type GastoFijoMes,
  type TipoActivo,
  type TipoComprobante,
  type UbicacionGastos,
} from "@/lib/gastos-reglas";

// Registrar un gasto o un activo fijo (ADR-0195 F2). Una sola ventana para los casos de la vida real:
//  · sin comprobante (mototaxi, bolsas): cómo se pagó; si fue efectivo, sale del cajón abierto de esa tienda;
//  · con factura, boleta o recibo por honorarios: el proveedor, la serie y el número; al contado o a crédito (Por pagar);
//  · clasificar un egreso que la tienda ya registró en Caja: el monto y la tienda vienen fijos.
//  · F2b: un gasto que nace de un gasto fijo (viene lleno), o un ACTIVO (un mueble, una laptop): el mismo comprobante y
//    pago, pero dice qué tipo de activo es y su vida útil, y la base lo deprecia.
// La pantalla solo arma y explica; la base vuelve a validar todo (`registrar_gasto`, `registrar_activo`).

export type ProveedorGasto = { id: string; nombre: string; ruc: string | null };

export function RegistrarGastoModal({
  categorias,
  ubicaciones,
  proveedores: proveedoresIniciales,
  cajasAbiertas,
  esLider,
  ubicacionInicial,
  egreso,
  fijo,
  clase = "gasto",
  tiposActivo = [],
  hoy,
  onCerrar,
}: {
  categorias: CategoriaGasto[];
  ubicaciones: UbicacionGastos[];
  proveedores: ProveedorGasto[];
  cajasAbiertas: { id: string; ubicacionId: string }[];
  esLider: boolean;
  ubicacionInicial: string;
  /** Si viene, se está clasificando este egreso de caja como gasto (o como activo). */
  egreso?: EgresoPorClasificar;
  /** F2b: el gasto fijo del que nace este gasto (viene lleno con lo de siempre). */
  fijo?: GastoFijoMes;
  /** F2b: «activo» registra un activo fijo en vez de un gasto. */
  clase?: "gasto" | "activo";
  tiposActivo?: TipoActivo[];
  hoy: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [nuevoProveedor, setNuevoProveedor] = useState<{ nombre: string; ruc: string } | null>(null);
  const [token] = useState(() => crypto.randomUUID());
  const [documento, setDocumento] = useState("");
  const esActivo = clase === "activo";
  const [activo, setActivo] = useState({ tipo: "", serie: "", vidaUtilMeses: "" });
  const [b, setB] = useState<BorradorGasto>(() => ({
    ubicacion: egreso?.ubicacionId ?? (esActivo && ubicacionInicial === "empresa" ? (ubicaciones[0]?.id ?? "") : ubicacionInicial),
    categoria: "",
    descripcion: egreso?.nota ?? "",
    fecha: egreso ? hoyLima(new Date(egreso.creadoEn)) : hoy,
    monto: egreso ? String(egreso.monto) : "",
    comprobante: "sin_comprobante",
    proveedorId: "",
    serie: "",
    numero: "",
    condicion: "contado",
    vence: "",
    medio: egreso ? "efectivo" : "",
    cajaId: "",
    egresoId: egreso?.id ?? "",
    referencia: "",
    ...(fijo ? borradorDesdeFijo(fijo, hoy) : {}),
  }));
  const poner = <K extends keyof BorradorGasto>(k: K, v: BorradorGasto[K]) => setB((x) => ({ ...x, [k]: v }));

  const conComprobante = b.comprobante !== "sin_comprobante";
  const aCredito = conComprobante && b.condicion === "credito";
  const cajaDeLaTienda = cajasAbiertas.find((c) => c.ubicacionId === b.ubicacion) ?? null;
  const monto = parsearMonto(b.monto);
  const igv = b.comprobante === "factura" && monto.ok ? igvDeFactura(monto.valor) : 0;
  const categoria = categorias.find((c) => c.codigo === b.categoria) ?? null;
  const tipoActivo = tiposActivo.find((t) => t.codigo === activo.tipo) ?? null;
  const opcionesUbicacion = useMemo(
    () => [...ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre })), ...(esLider && !esActivo ? [{ valor: "empresa", texto: "De la empresa (no es de una tienda)" }] : [])],
    [ubicaciones, esLider, esActivo],
  );
  const comprobantes = esActivo ? TIPOS_COMPROBANTE.filter((t) => t !== "recibo_por_honorarios") : TIPOS_COMPROBANTE;

  function elegirComprobante(t: TipoComprobante) {
    setB((x) => {
      const medios = mediosPara(t);
      const medio = x.medio && medios.includes(x.medio) ? x.medio : "";
      return { ...x, comprobante: t, medio: x.egresoId ? "efectivo" : medio, condicion: x.egresoId || t === "sin_comprobante" ? "contado" : x.condicion };
    });
  }

  async function sumarProveedor() {
    if (!nuevoProveedor?.nombre.trim()) return avisar.error("Escribe el nombre del proveedor.");
    const { data, error } = await createClient().rpc("registrar_proveedor_de_gasto" as never, { p_nombre: nuevoProveedor.nombre, p_ruc: nuevoProveedor.ruc || null } as never);
    if (error) return avisar.error(traducirError(error, "sumar el proveedor"));
    const id = String(data);
    if (!proveedores.some((p) => p.id === id)) setProveedores((ps) => [...ps, { id, nombre: nuevoProveedor.nombre.trim(), ruc: nuevoProveedor.ruc || null }].sort((x, y) => x.nombre.localeCompare(y.nombre)));
    poner("proveedorId", id);
    setNuevoProveedor(null);
  }

  async function guardar() {
    const conCaja = { ...b, cajaId: b.medio === "efectivo" && !b.egresoId ? (cajaDeLaTienda?.id ?? "") : "" };
    const v = esActivo ? validarActivo({ ...conCaja, tipo: activo.tipo, nombre: b.descripcion, serie: activo.serie, vidaUtilMeses: activo.vidaUtilMeses || String(tipoActivo?.vidaUtilMeses ?? "") }, hoy) : validarGasto(conCaja, hoy);
    if (!v.ok) return avisar.error(v.error);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(createClient().rpc((esActivo ? "registrar_activo" : "registrar_gasto") as never, { ...v.valor, p_token: token } as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, esActivo ? "registrar el activo" : "registrar el gasto"));
    const que = esActivo ? "Activo" : "Gasto";
    avisar.exito(egreso ? `Egreso clasificado como ${que.toLowerCase()}` : `${que} registrado`, {
      detalle: aCredito
        ? `Quedó en Por pagar hasta el ${b.vence.split("-").reverse().join("/")}.`
        : b.medio === "efectivo" && !egreso
          ? "Salió del cajón: la caja ya lo descuenta."
          : esActivo
            ? "Se deprecia desde el próximo mes."
            : undefined,
    });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal
      titulo={egreso ? (esActivo ? "Es un activo fijo" : "Es un gasto") : esActivo ? "Registrar activo fijo" : fijo ? `Registrar ${fijo.descripcion}` : "Registrar gasto"}
      subtitulo={
        egreso
          ? `${egreso.ubicacionNombre} · ${soles(egreso.monto)} · «${egreso.motivo}${egreso.nota ? ` — ${egreso.nota}` : ""}»`
          : esActivo
            ? "Algo que sirve varios años: muebles, equipos, máquinas del Taller, una remodelación. No se resta entero este mes: se reparte en su vida útil."
            : fijo
              ? `Gasto fijo de ${fijo.ubicacionNombre}: llega cerca del día ${fijo.diaDelMes}${fijo.montoVariable ? ", con monto que cambia" : ""}.`
              : "Lo que se paga para que el negocio funcione. La mercadería va por Compras y la planilla viene de Dynamic."
      }
      onClose={onCerrar}
      ancho="max-w-2xl"
    >
      <div className="space-y-4">
        <Segmentado
          etiqueta="¿Tiene comprobante de un proveedor?"
          valor={b.comprobante}
          onValor={elegirComprobante}
          opciones={comprobantes.map((t) => ({ valor: t, texto: TEXTO_COMPROBANTE[t] }))}
        />

        {conComprobante && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Proveedor" htmlFor="gasto-proveedor" pie={nuevoProveedor ? undefined : <button type="button" className="btn-cayla btn-enlace" onClick={() => setNuevoProveedor({ nombre: "", ruc: "" })}>¿No está? Súmalo</button>}>
              <SelectNativo id="gasto-proveedor" value={b.proveedorId} onChange={(e) => poner("proveedorId", e.target.value)}>
                <option value="">Elige…</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.ruc ? ` · ${p.ruc}` : ""}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <CampoTexto
              etiqueta="Serie y número"
              placeholder="F001-00140"
              value={documento}
              tono={documento && !b.numero ? "aviso" : undefined}
              pie={documento && !b.numero ? "Como está en el comprobante: serie, guion y número (F001-00140)." : undefined}
              onChange={(e) => {
                const texto = e.target.value.toUpperCase();
                setDocumento(texto);
                const partes = partirSerieNumero(texto);
                setB((x) => ({ ...x, serie: partes.serie, numero: partes.numero }));
              }}
            />
            {nuevoProveedor && (
              <div className="nota-cayla sm:col-span-2" data-sin-cascada>
                <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                  <CampoTexto etiqueta="Nombre del proveedor" value={nuevoProveedor.nombre} onChange={(e) => setNuevoProveedor((n) => n && { ...n, nombre: e.target.value })} placeholder="Hidrandina" />
                  <CampoTexto etiqueta="RUC (opcional)" inputMode="numeric" value={nuevoProveedor.ruc} onChange={(e) => setNuevoProveedor((n) => n && { ...n, ruc: e.target.value.replace(/\D/g, "").slice(0, 11) })} />
                  <div className="flex gap-2">
                    <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={sumarProveedor}>Sumar</button>
                    <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => setNuevoProveedor(null)}>Cancelar</button>
                  </div>
                </div>
                <p className="mt-2 text-[12.5px]">Queda en el directorio de proveedores; sus cuentas se completan luego en Compras ▸ Proveedores.</p>
              </div>
            )}
          </div>
        )}

        {esActivo ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <CampoTexto etiqueta="Qué es" value={b.descripcion} onChange={(e) => poner("descripcion", e.target.value)} placeholder="Estante de exhibición en L" />
            <CampoTexto etiqueta="N.° de serie (opcional)" value={activo.serie} onChange={(e) => setActivo((a) => ({ ...a, serie: e.target.value }))} />
          </div>
        ) : (
          <CampoTexto etiqueta="Qué se pagó" value={b.descripcion} onChange={(e) => poner("descripcion", e.target.value)} placeholder="Luz de septiembre" />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {esActivo ? (
            <Campo etiqueta="Tipo de activo" htmlFor="activo-tipo" pie={tipoActivo ? `Va a la cuenta ${tipoActivo.cuenta} ${tipoActivo.cuentaNombre}.` : undefined}>
              <SelectNativo
                id="activo-tipo"
                value={activo.tipo}
                onChange={(e) => {
                  const t = tiposActivo.find((x) => x.codigo === e.target.value);
                  setActivo((a) => ({ ...a, tipo: e.target.value, vidaUtilMeses: t ? String(t.vidaUtilMeses) : a.vidaUtilMeses }));
                }}
              >
                <option value="">Elige…</option>
                {tiposActivo.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.nombre} — {t.ejemplos}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
          ) : (
            <Campo etiqueta="Categoría" htmlFor="gasto-categoria" pie={categoria ? `Va a la cuenta ${categoria.cuenta} ${categoria.cuentaNombre}. Nadie la elige: viene con la categoría.` : "Sin «Otros»: si no calza en ninguna, avisa al líder."}>
              <SelectNativo id="gasto-categoria" value={b.categoria} onChange={(e) => poner("categoria", e.target.value)}>
                <option value="">Elige…</option>
                {categorias.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.nombre} — {c.ejemplos}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
          )}
          <Campo etiqueta={esActivo ? "Dónde está" : "A quién se le carga"} htmlFor="gasto-ubicacion">
            <SelectNativo id="gasto-ubicacion" value={b.ubicacion} disabled={!!egreso || !!fijo || opcionesUbicacion.length < 2} onChange={(e) => poner("ubicacion", e.target.value)}>
              {opcionesUbicacion.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </SelectNativo>
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <CampoTexto etiqueta={conComprobante ? "Fecha del comprobante" : "Fecha"} type="date" max={hoy} value={b.fecha} onChange={(e) => poner("fecha", e.target.value)} />
          <CampoTexto etiqueta="Total pagado (con IGV)" inputMode="decimal" value={b.monto} readOnly={!!egreso} onChange={(e) => poner("monto", e.target.value)} placeholder="0.00" />
          <Campo etiqueta="IGV">
            <p className="flex h-9 items-center text-sm tabular-nums text-tinta">{b.comprobante === "factura" ? soles(igv) : "S/ 0.00"}</p>
            <p className="text-[12px] text-taupe">{b.comprobante === "factura" ? "Descontable: sale del total (18 %)." : "Solo la factura da IGV descontable."}</p>
          </Campo>
        </div>

        {esActivo && (
          <Campo
            etiqueta="Vida útil"
            htmlFor="activo-vida"
            pie={
              tipoActivo && monto.ok
                ? `Se deprecia ${soles((monto.valor - igv) / Math.max(1, Number(activo.vidaUtilMeses || tipoActivo.vidaUtilMeses)))} al mes desde el próximo mes${igv ? " (sobre el costo sin IGV)" : ""}.`
                : "Cuántos años sirve. La sugiere el tipo; el contador la confirma."
            }
          >
            <SelectNativo id="activo-vida" value={activo.vidaUtilMeses} onChange={(e) => setActivo((a) => ({ ...a, vidaUtilMeses: e.target.value }))}>
              <option value="">{tipoActivo ? textoVidaUtil(tipoActivo.vidaUtilMeses) : "Elige el tipo primero"}</option>
              {[12, 24, 36, 48, 60, 84, 120, 180, 240].map((m) => (
                <option key={m} value={String(m)}>
                  {textoVidaUtil(m)}
                </option>
              ))}
            </SelectNativo>
          </Campo>
        )}

        {conComprobante && !egreso && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Segmentado
              etiqueta="¿Cómo se paga?"
              valor={b.condicion}
              onValor={(v) => poner("condicion", v)}
              opciones={[
                { valor: "contado", texto: "Ya se pagó" },
                { valor: "credito", texto: "A crédito" },
              ]}
            />
            {aCredito && <CampoTexto etiqueta="Vence" type="date" min={b.fecha} value={b.vence} onChange={(e) => poner("vence", e.target.value)} />}
          </div>
        )}

        {!aCredito && !egreso && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Cómo se pagó"
              htmlFor="gasto-medio"
              tono={b.medio === "efectivo" && !cajaDeLaTienda ? "aviso" : "neutro"}
              pie={
                b.medio === "efectivo"
                  ? cajaDeLaTienda
                    ? "Sale del cajón abierto de esa tienda: se crea su egreso de caja en la misma operación."
                    : "La caja de esa tienda no está abierta. Si ya salió del cajón, regístralo en Caja y clasifícalo aquí."
                  : undefined
              }
            >
              <SelectNativo id="gasto-medio" value={b.medio} onChange={(e) => poner("medio", e.target.value as BorradorGasto["medio"])}>
                <option value="">Elige…</option>
                {mediosPara(b.comprobante).map((m) => (
                  <option key={m} value={m}>
                    {m === "efectivo" ? "Efectivo del cajón" : TEXTO_MEDIO[m]}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            {b.medio && b.medio !== "efectivo" && (
              <CampoTexto etiqueta="N.° de operación (opcional)" value={b.referencia} onChange={(e) => poner("referencia", e.target.value)} />
            )}
          </div>
        )}

        <ComboResponsable control={responsable} deshabilitado={guardando} />

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="btn-cayla btn-primario" onClick={guardar} disabled={guardando || !responsable.listo}>
            {guardando ? "Guardando…" : egreso ? (esActivo ? "Guardar como activo" : "Guardar como gasto") : esActivo ? "Registrar activo" : "Registrar gasto"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
