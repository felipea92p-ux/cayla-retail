"use client";

import { useRef, useState, type CSSProperties } from "react";
import { Check, ChevronRight, Shirt } from "lucide-react";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, TABLA, Tabla } from "@/components/ui/Tabla";
import { Balanza, BaldosaCategoria } from "./piezas";
import { PrecioDePrenda, type PrecioEditado } from "./PrecioDePrenda";
import { Modal } from "@/components/ui/Modal";
import { Vacio } from "@/components/ui/Vacio";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { ComboResponsable } from "@/components/ComboResponsable";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ElegirOpcion } from "@/components/recepcion-envio/BloquePrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { pendienteDe } from "@/lib/nos-debe-reglas";
import {
  atipicosPorLinea,
  leerCostoAtipicoRecepcion,
  type CausaFaltante,
  type CausaSobrante,
  type CostoAtipicoRecepcion,
  type DetalleEnvio,
} from "@/lib/recepcion-envio-reglas";
import {
  cambioDePrecioDeCompra,
  cambioDePrecioDeVenta,
  camposDelCierre,
  textoCambioDePrecio,
  type CambioDePrecio,
  causasDe,
  contadasDe,
  decisionInicial,
  detalladas,
  diferenciaDe,
  HINT_CONTEO_CAMBIADO,
  idCampoCierre,
  leerCostoCierre,
  lineaVisible,
  lineasParaCerrar,
  nombreDeLinea,
  textoBotonCerrar,
  TOPES_CONTEO,
  type DecisionCierre,
  type LineaParaContar,
  mensajeAlGuardar,
  resumenDelCierre,
  detalleParaDespues,
  textoResumenDelCierre,
  marcaDeLinea,
} from "@/lib/recepcion-conteo-reglas";
import { cambiarPrecioEnRecepcion, cerrarConteo, corregirGuiaEnvio, ponerProveedorEnvio } from "@/lib/recepcion-conteo-acciones";

// Cerrar (ADR-0393, el paso 3 de la cara A): una fila por categoría —lo que dijeron, lo que se contó, lo que entra hoy al stock y lo que
// queda para después—, el costo de cada una (decisión 6: quien cierra lo ve y lo corrige; en un envío sin aviso, solo quien ve el dinero de
// Compras, y vacío entra sin costo), qué pasó con lo que no cuadró, una nota y quién cierra. Separar y detallar NO frenan: son pendientes.
// Las reglas son las de `cerrar_conteo_envio` (`camposDelCierre`): la guía de foco enciende lo que falta.

// Las columnas del cierre, una sola vez para el encabezado y cada fila (la pieza <Tabla>, ADR-0358). La tabla decide su forma por el ancho
// de su TARJETA (`@container`, como Clientes), no por el de la ventana: con el lateral abierto, a 1024 px la tarjeta mide ~670 px y siete
// columnas se pisaban. Desde 880 px de tarjeta, columnas; con menos, cada fila apilada, con su etiqueta en cada dato.
// En columnas, toda celda pone su primera línea en la franja de 40 px de la caja del costo (`FRANJA`): el nombre, las cifras, el chip y la
// diferencia quedan a la misma altura aunque «Para después» o la causa sumen líneas abajo.
const PLANTILLA_CIERRE = "@min-[1000px]:grid-cols-[minmax(0,1.5fr)_3.75rem_4.25rem_7rem_minmax(0,1.5fr)_minmax(0,1.6fr)_7.5rem_2rem]";
const FRANJA = "@min-[1000px]:flex @min-[1000px]:min-h-10 @min-[1000px]:items-center";
const CIFRA = "min-w-0 whitespace-nowrap tabular-nums @min-[1000px]:flex @min-[1000px]:min-h-10 @min-[1000px]:items-center @min-[1000px]:justify-end";

export function CerrarEnvio({
  detalle,
  version,
  lineas,
  sinAviso,
  reabierto,
  sede,
  responsable,
  veDinero,
  proveedorPorConfirmar = false,
  proveedores = [],
  esperandoGuardar,
  onVolver,
  onConteoCambiado,
  onCerrado,
}: {
  detalle: DetalleEnvio;
  version: number;
  lineas: readonly LineaParaContar[];
  sinAviso: boolean;
  reabierto: boolean;
  sede: string;
  responsable: ControlResponsable;
  veDinero: boolean;
  /** Llegó sin aviso y sin saber de quién (Felipe 2026-10-14): antes de cerrar se elige el proveedor (`poner_proveedor_envio`). */
  proveedorPorConfirmar?: boolean;
  proveedores?: readonly { id: string; nombre: string }[];
  /** Algo de lo contado todavía se está guardando: se espera antes de cerrar. */
  esperandoGuardar: boolean;
  onVolver: () => void;
  onConteoCambiado: () => void;
  onCerrado: () => void;
}) {
  const visibles = lineas.filter(lineaVisible);
  const [decisiones, setDecisiones] = useState<Record<string, DecisionCierre>>(() => Object.fromEntries(visibles.map((l) => [l.clave, decisionInicial(l)])));
  // Lo que traía cada línea al abrir el cierre: la tarjeta «Costos y precios» marca lo que quien cierra cambió y dice cuánto era.
  const [costoInicial] = useState<Record<string, string>>(() => Object.fromEntries(visibles.map((l) => [l.clave, decisionInicial(l).costo])));
  // El precio de venta de cada prenda ya identificada (por producto): su precio de hoy, lo escrito y dónde vale. Se aplica al cerrar.
  const [ventas, setVentas] = useState<Record<string, PrecioEditado>>({});
  // Lo que cambia (de compra y de venta), para confirmarlo antes de guardar: `null` = no se está confirmando.
  const [porConfirmar, setPorConfirmar] = useState<CambioDePrecio[] | null>(null);
  // Las filas con los precios de venta de sus prendas a la vista (el precio de compra, que es de toda la línea, vive en la fila misma).
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(() => new Set());
  const alternarFila = (clave: string) =>
    setAbiertas((a) => {
      const n = new Set(a);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });
  const [nota, setNota] = useState("");
  const [token] = useState(() => crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  const [atipicos, setAtipicos] = useState<CostoAtipicoRecepcion[] | null>(null);
  const [proveedorId, setProveedorId] = useState("");
  // Ya quedó puesto en la base (poner_proveedor_envio no lo cambia): no se vuelve a pedir ni a elegir.
  const [proveedorPuesto, setProveedorPuesto] = useState(false);
  // La guía se escribe o corrige al cerrar (Felipe 2026-10-14): lo escrito, lo que ya quedó en la base y la versión nueva del envío.
  const [guiaEscrita, setGuiaEscrita] = useState(detalle.numeroGuia ?? "");
  const [guiaGuardada, setGuiaGuardada] = useState(detalle.numeroGuia ?? "");
  const [versionTrasGuia, setVersionTrasGuia] = useState<number | null>(null);
  const avisoError = useRef<HTMLDivElement>(null);

  const decisionDe = (clave: string): DecisionCierre => decisiones[clave] ?? decisionInicial(visibles.find((l) => l.clave === clave) ?? visibles[0]);
  const cambiar = (clave: string, cambio: Partial<DecisionCierre>) => {
    setAtipicos(null);
    setDecisiones((d) => ({ ...d, [clave]: { ...decisionDe(clave), ...cambio } }));
  };

  const campos = camposDelCierre({
    lineas: visibles,
    decisiones,
    sinAviso,
    responsable: responsable.listo,
    proveedorPorConfirmar,
    proveedorElegido: proveedorPuesto || proveedorId !== "",
    guia: guiaEscrita,
  });
  const guia = useGuiaCampos(campos, { enModal: false });
  const contadas = visibles.reduce((a, l) => a + contadasDe(l), 0);
  // Lo que pasa al cerrar, dicho para la tienda (formidable 2026-10-13, cambio 3): cuántas se pueden vender ya y cuántas quedan guardadas.
  const resumen = resumenDelCierre(visibles);
  const porDetallar = resumen.guardadas;

  const ponerActual = (productoId: string, actual: { desde: number; hasta: number } | null) =>
    setVentas((v) => {
      const hay = v[productoId];
      if (hay && hay.actual !== undefined) return v;
      const hoy = actual && actual.desde === actual.hasta ? actual.desde.toFixed(2) : "";
      return { ...v, [productoId]: { actual, valor: hay?.valor ? hay.valor : hoy, alcance: hay?.alcance ?? "todas" } };
    });
  const cambiarVenta = (productoId: string, cambio: Partial<PrecioEditado>) =>
    setVentas((v) => {
      const base: PrecioEditado = v[productoId] ?? { actual: undefined, valor: "", alcance: "todas" };
      return { ...v, [productoId]: { ...base, ...cambio } };
    });

  /** Lo que cambió el precio de venta: una vez por prenda (aunque esté en dos líneas), con el nombre de la prenda. */
  function cambiosDeVenta(): (CambioDePrecio & { productoId: string })[] {
    const r: (CambioDePrecio & { productoId: string })[] = [];
    for (const l of visibles) {
      for (const p of l.conteo?.separado.prendas ?? []) {
        const e = ventas[p.productoId];
        if (!e || r.some((x) => x.productoId === p.productoId)) continue;
        const c = cambioDePrecioDeVenta(p.nombre ?? p.codigo ?? "La prenda", e.actual, e.valor, e.alcance);
        if (c) r.push({ ...c, productoId: p.productoId });
      }
    }
    return r;
  }
  /** Todo lo que cambia de precio, de compra primero. */
  function cambiosDePrecio(): CambioDePrecio[] {
    const compra: CambioDePrecio[] = [];
    for (const l of visibles) {
      if (sinAviso && !l.linea && !veDinero) continue;
      const c = cambioDePrecioDeCompra(nombreDeLinea(l), costoInicial[l.clave] ?? "", decisionDe(l.clave).costo);
      if (c) compra.push(c);
    }
    return [...compra, ...cambiosDeVenta()];
  }
  /** «Cerrar»: con precios cambiados, antes de guardar se muestra qué se va a cambiar y se pide confirmar. */
  function pedirCerrar() {
    if (!guia.puedeConfirmar || esperandoGuardar) return;
    const c = cambiosDePrecio();
    if (c.length > 0) {
      setPorConfirmar(c);
      return;
    }
    void cerrar();
  }

  async function cerrar(confirmados: ReadonlySet<string> = new Set()) {
    if (!guia.puedeConfirmar || esperandoGuardar) return;
    setGuardando(true);
    setError(null);
    // Primero, de quién llegó (si se abrió sin saberlo): sin proveedor la base no cierra. Puesto una vez, queda puesto.
    if (proveedorPorConfirmar && !proveedorPuesto) {
      const { error: ep } = await ponerProveedorEnvio({ p_despacho_id: detalle.id, p_proveedor_id: proveedorId }, responsable.firma());
      responsable.despues(ep);
      if (ep) {
        setGuardando(false);
        setError({ texto: mensajeAlGuardar(ep, "poner el proveedor"), recargar: ep.hint === "envio_proveedor_puesto" });
        requestAnimationFrame(() => avisoError.current?.focus());
        return;
      }
      setProveedorPuesto(true);
    }
    // La guía, si cambió (corregir_guia_envio sube la versión del envío: se cierra con la nueva). Vacía no borra la que había.
    // La versión sube y nunca baja: la más alta entre la que trajo la pantalla y la que devolvió la guía.
    let versionParaCerrar = Math.max(versionTrasGuia ?? 0, version);
    const guiaNueva = guiaEscrita.trim();
    if (guiaNueva && guiaNueva !== guiaGuardada) {
      const { version: v, error: eg } = await corregirGuiaEnvio({ p_despacho_id: detalle.id, p_numero_guia: guiaNueva.slice(0, TOPES_CONTEO.guia) }, responsable.firma());
      responsable.despues(eg);
      if (eg || v == null) {
        setGuardando(false);
        setError({ texto: mensajeAlGuardar(eg, "corregir la guía"), recargar: false });
        requestAnimationFrame(() => avisoError.current?.focus());
        return;
      }
      setGuiaGuardada(guiaNueva);
      setVersionTrasGuia(v);
      versionParaCerrar = v;
    }
    // El precio de venta de lo que cambió, antes de cerrar (la base lo pide con el envío abierto). Cada uno que queda aplicado deja de ser un cambio:
    // si el cierre falla y se reintenta, no se vuelve a mandar.
    for (const c of cambiosDeVenta()) {
      const { error: epv } = await cambiarPrecioEnRecepcion({ p_despacho_id: detalle.id, p_producto_id: c.productoId, p_precio: c.despues, p_alcance: c.alcance ?? "todas" }, responsable.firma());
      responsable.despues(epv);
      if (epv) {
        setGuardando(false);
        setError({ texto: `${c.nombre}: ${mensajeAlGuardar(epv, "cambiar el precio de venta")} No se cerró el envío.`, recargar: false });
        requestAnimationFrame(() => avisoError.current?.focus());
        return;
      }
      setVentas((v) => ({ ...v, [c.productoId]: { ...v[c.productoId], actual: { desde: c.despues, hasta: c.despues } } }));
    }
    const conConfirmados = Object.fromEntries(Object.entries(decisiones).map(([k, d]) => [k, confirmados.has(k) ? { ...d, confirmaCosto: true } : d]));
    const { resultado, error: e } = await cerrarConteo(
      {
        p_despacho_id: detalle.id,
        p_version: versionParaCerrar,
        p_lineas: lineasParaCerrar(visibles, conConfirmados, sinAviso),
        p_nota: nota.trim() ? nota.trim().slice(0, TOPES_CONTEO.notaEnvio) : null,
        p_token: token,
      },
      responsable.firma(),
    );
    responsable.despues(e);
    setGuardando(false);
    if (e) {
      const atip = leerCostoAtipicoRecepcion(e, (item) => {
        const l = visibles.find((x) => x.linea?.id === item);
        return l ? nombreDeLinea(l) : null;
      });
      if (atip && atip.length) {
        setAtipicos(atip);
        return;
      }
      const cambio = e.hint === HINT_CONTEO_CAMBIADO;
      setError({ texto: mensajeAlGuardar(e, "cerrar el envío"), recargar: cambio || e.hint === "version_cambiada" });
      if (cambio) onConteoCambiado();
      requestAnimationFrame(() => avisoError.current?.focus());
      return;
    }
    avisar.exito(`${detalle.numero} cerrado`, {
      detalle: resultado && resultado.unidades > 0 ? `${resultado.unidades} prendas entraron al stock${porDetallar > 0 ? `; ${porDetallar} quedan para después` : ""}` : porDetallar > 0 ? `${porDetallar} prendas quedan para después` : undefined,
    });
    onCerrado();
  }

  return (
    <>
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        pedirCerrar();
      }}
      className="space-y-5"
     
    >
      {reabierto && (
        <Aviso tono="info" titulo="Lo cierras de nuevo">
          Lo que ya entró al stock queda donde está. Lo que faltó o sobró se vuelve a anotar con lo que diga este cierre.
        </Aviso>
      )}

      <Tabla guia="recepcion.tabla-cierre" className="@container">
        <Encabezado
          visible="hidden @min-[1000px]:grid"
          plantilla={PLANTILLA_CIERRE}
          columnas={[
            { titulo: "Categoría" },
            { titulo: "Dijeron", alinear: "der" },
            { titulo: "Contaste", alinear: "der" },
            { titulo: "Se pueden vender", alinear: "der", ayuda: "Lo que entra al stock al cerrar: ya tiene su talla y su color" },
            { titulo: "Para después", clase: "@min-[1000px]:pl-5", ayuda: "Lo que queda guardado en el almacén hasta separarlo, ponerle tallas o crearlo" },
            { titulo: "Diferencia y por qué" },
            { titulo: "Precio de compra", alinear: "der", ayuda: "Viene de la orden y es de toda la línea; quien cierra lo corrige si la factura dice otra cosa" },
            { titulo: <span className="sr-only">Precio de venta</span> },
          ]}
        />
            {visibles.map((l) => {
              const d = decisionDe(l.clave);
              const dif = diferenciaDe(l);
              const causas = causasDe(l, l.proveedor && l.categoria && l.marca ? pendienteDe(detalle.deudas, l.proveedor.id, l.categoria.id, l.marca.id) : 0, sinAviso);
              const costo = leerCostoCierre(d.costo);
              const editaCosto = !(sinAviso && !l.linea && !veDinero);
              const cambio = editaCosto && d.costo.trim() !== (costoInicial[l.clave] ?? "").trim();
              const prendas = l.conteo?.separado.prendas ?? [];
              const alStock = (l.conteo?.enStock ?? 0) + detalladas(l.conteo?.separado ?? { prendas: [], nuevas: [] });
              const para = Math.max(0, contadasDe(l) - alStock);
              const siempreAbierta = false;
              const abierta = siempreAbierta || abiertas.has(l.clave);
              // Lo que cambió en esta línea y quedaría escondido: se avisa en la fila cerrada.
              const cambiaVenta = prendas.some((pr) => {
                const e = ventas[pr.productoId];
                return !!e && cambioDePrecioDeVenta("", e.actual, e.valor, e.alcance) !== null;
              });
              const conCambios = cambiaVenta;
              return (
                <div key={l.clave}>
                <div
                  className={`grid ${TABLA.fila} ${PLANTILLA_CIERRE} @min-[1000px]:items-start ${siempreAbierta ? "" : "cursor-pointer"} ${abierta ? "bg-tinta/[0.03]" : ""}`}
                  role="row"
                  onClick={(e) => {
                    if (siempreAbierta || !(e.currentTarget.contains(e.target as Node))) return;
                    if ((e.target as HTMLElement).closest("button, input, a, [role='group'], [role='radio']")) return;
                    alternarFila(l.clave);
                  }}
                >
                  {/* El ícono en la franja; el nombre, centrado en ella si cabe en una línea y hacia abajo si se parte. */}
                  <div className="flex min-w-0 items-start gap-2.5" role="cell">
                    <span className="flex items-center @min-[1000px]:h-10">
                      <BaldosaCategoria categoria={l.categoria} tamano="chico" />
                    </span>
                    <span className="min-w-0 @min-[1000px]:flex @min-[1000px]:min-h-10 @min-[1000px]:flex-col @min-[1000px]:justify-center">
                      <p className="font-medium text-tinta">{l.categoria?.nombre ?? "Categoría"}</p>
                      {conCambios && !abierta && <Chip tono="ambar">Precio de venta cambiado</Chip>}
                      <p className="text-xs text-taupe">
                        {[l.categoria ? marcaDeLinea(l).nombre : null, l.conteo?.contadoPor?.nombre ? `contó ${l.conteo.contadoPor.nombre.split(" ")[0]}` : null, !l.linea && !sinAviso ? "no estaba en la guía" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </span>
                  </div>
                  <div className={`${CIFRA} text-taupe`} role="cell">
                    <span className="@min-[1000px]:hidden">Dijeron&nbsp;</span>
                    {l.dijeron ?? "—"}
                  </div>
                  <div className={`${CIFRA} text-tinta`} role="cell">
                    <span className="text-taupe @min-[1000px]:hidden">Contaste&nbsp;</span>
                    {l.conteo ? contadasDe(l) : <Chip tono="ambar">Sin contar</Chip>}
                  </div>
                  <div className={CIFRA} role="cell">
                    <span className="text-taupe @min-[1000px]:hidden">Se pueden vender&nbsp;</span>
                    <span className="font-semibold tabular-nums text-verde">{alStock}</span>
                  </div>
                  <div className="min-w-0 space-y-1 @min-[1000px]:pl-5" role="cell">
                    {para > 0 ? (
                      <>
                        <div className={FRANJA}>
                          <Chip tono="pizarra">{para} para después</Chip>
                        </div>
                        <ul className="space-y-0.5 text-xs leading-snug text-taupe">
                          {detalleParaDespues(l).map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <div className={FRANJA}>
                        <Chip tono="verde">Nada</Chip>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0" role="cell">
                    {!l.conteo ? (
                      <CampoGuiado id={idCampoCierre("contar", l.clave)} guia={guia} className={FRANJA}>
                        <Boton type="button" peso="discreto" onClick={onVolver}>
                          Contarla
                        </Boton>
                      </CampoGuiado>
                    ) : causas ? (
                      <CampoGuiado id={idCampoCierre("causa", l.clave)} guia={guia} retiene="fila">
                        {/* Como la maqueta: el chip de la diferencia en la franja y, debajo, qué pasó. */}
                        <div className={`${FRANJA} gap-2`}>
                          <Chip tono="ambar">
                            {dif != null && dif < 0 ? `Faltan ${-dif}` : dif != null && dif > 0 ? `Sobran ${dif}` : `${contadasDe(l)} que no venían`}
                          </Chip>
                          <span className="text-xs text-taupe">¿Qué pasó?</span>
                        </div>
                        <div className="mt-1">
                          <ElegirOpcion
                            chico
                            etiqueta={`Qué pasó con ${nombreDeLinea(l)}`}
                            opciones={causas.opciones}
                            valor={causas.tipo === "faltante" ? d.faltanteCausa : d.sobranteCausa}
                            onValor={(v) => cambiar(l.clave, causas.tipo === "faltante" ? { faltanteCausa: v as CausaFaltante } : { sobranteCausa: v as CausaSobrante })}
                          />
                        </div>
                      </CampoGuiado>
                    ) : (
                      <div className={FRANJA}>
                        {dif == null ? <Chip tono="neutro">{sinAviso ? "Sin aviso" : "Sin guía"}</Chip> : <Chip tono="verde">Cuadra</Chip>}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 @min-[1000px]:text-right" role="cell">
                    {editaCosto ? (
                      <CampoGuiado id={idCampoCierre("costo", l.clave)} guia={guia}>
                        <span aria-hidden className="mb-1 block text-xs font-semibold text-tinta @min-[1000px]:hidden">
                          Precio de compra <span className="font-normal text-taupe">· de toda la línea</span>
                        </span>
                        <CampoTexto
                          caja
                          etiqueta={`Precio de compra de ${nombreDeLinea(l)}`}
                          inputMode="decimal"
                          value={d.costo}
                          // sugerir-fijo: un costo es un monto de soles, no depende de nada elegido antes
                          placeholder={sinAviso ? "S/\u00a0sin costo" : "S/\u00a00.00"}
                          onChange={(e) => cambiar(l.clave, { costo: e.target.value, confirmaCosto: false })}
                          tono={costo.problema ? "error" : undefined}
                          pie={costo.problema ?? undefined}
                          sinPie={!costo.problema}
                          className="text-right font-semibold tabular-nums"
                        />
                        {cambio && (
                          <p className="mt-1 text-xs text-ambar-profundo" role="status">
                            Antes S/&nbsp;{(costoInicial[l.clave] ?? "").trim() || "—"}
                          </p>
                        )}
                      </CampoGuiado>
                    ) : (
                      <span className="text-xs text-taupe">llega con la factura</span>
                    )}
                  </div>
                  <div className="flex min-w-0 @min-[1000px]:min-h-10 @min-[1000px]:items-center @min-[1000px]:justify-end" role="cell">
                    {!siempreAbierta && (
                      <button
                        type="button"
                        onClick={() => alternarFila(l.clave)}
                        aria-expanded={abierta}
                        aria-controls={`precios-${l.clave}`}
                        aria-label={`${abierta ? "Esconder" : "Ver"} los precios de ${nombreDeLinea(l)}`}
                        className="grid h-8 w-8 place-items-center rounded-full text-taupe transition-colors hover:text-tinta"
                      >
                        <ChevronRight aria-hidden className={`h-4 w-4 transition-transform duration-300 ease-cayla ${abierta ? "rotate-90" : ""}`} />
                      </button>
                    )}
                  </div>
                </div>
                {abierta && (
                  <div id={`precios-${l.clave}`} className="border-t border-sand bg-tinta/[0.02] px-5 py-4" data-precios-de={l.clave}>
                    <div className="mx-auto w-full max-w-xl space-y-3">
                      <p className="text-center text-xs font-semibold text-tinta">Precio de venta</p>
                      {prendas.length === 0 ? (
                        <Vacio tamano="chico" icono={<Shirt />}>
                          Todavía no hay una prenda identificada en esta línea: su precio de venta se cambia cuando la separes, o al crearla si es nueva.
                        </Vacio>
                      ) : (
                        <div className="space-y-3">
                          {prendas.map((pr) => (
                            <PrecioDePrenda
                              key={`${l.clave}-${pr.productoId}`}
                              prenda={pr}
                              sede={sede}
                              editado={ventas[pr.productoId]}
                              onActual={(a) => ponerActual(pr.productoId, a)}
                              onValor={(valor) => cambiarVenta(pr.productoId, { valor })}
                              onAlcance={(alcance) => cambiarVenta(pr.productoId, { alcance })}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </div>
              );
            })}
      </Tabla>

      <Aviso tono="atencion" titulo="El precio de compra de cada línea se puede corregir aquí">
        {sinAviso
          ? "Lo que llega sin aviso entra sin precio de compra si lo dejas vacío; la factura lo trae después. "
          : "Viene de la orden: si la factura dice otra cosa, corrígelo. "}
        Cambia el costo de lo que entra en este envío; lo comprado y recibido antes no se toca. El precio de venta se cambia solo de las prendas que ya identificaste y rige
        desde ahora: lo ya vendido guarda su precio. Los dos quedan en el historial de la prenda.
      </Aviso>

      <p className="nota-cayla">
        {sinAviso ? "Lo que llega sin aviso no tiene con qué compararse: nada sobra ni falta. " : ""}
        ¿Alguna llegó dañada? Márcala en «Tallas y colores» (va a la cuarentena), o repórtala después en Existencias.
      </p>
      {porDetallar > 0 && (
        <p className="nota-cayla">
          Cerrar el envío deja el conteo oficial y {porDetallar} {porDetallar === 1 ? "prenda" : "prendas"} para después (separar, poner tallas y colores, crear lo
          nuevo). Hoy se pueden vender las que ya tienen tallas y colores; el resto, cuando se termine cada pendiente.
        </p>
      )}

      <Balanza dijeron={visibles.some((l) => l.dijeron != null) ? visibles.reduce((a, l) => a + (l.dijeron ?? 0), 0) : null} contadas={contadas} />

      <div className="card-cayla grid gap-4 p-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:p-5">
        <CampoGuiado id="guia" guia={guia}>
          <CampoTexto
            etiqueta={guia.etiqueta("guia", "Número de guía")}
            value={guiaEscrita}
            maxLength={TOPES_CONTEO.guia}
            onChange={(e) => setGuiaEscrita(e.target.value)}
            // sugerir-fijo: el formato de un número de guía no depende de nada elegido antes
            placeholder="Ej. T001-000342"
            pie={guiaEscrita.trim() && guiaEscrita.trim() !== guiaGuardada ? "Se corrige al cerrar." : "Si el papel dice otra cosa, corrígela."}
          />
        </CampoGuiado>
        <CampoTexto
          etiqueta="Nota (opcional)"
          value={nota}
          maxLength={TOPES_CONTEO.notaEnvio}
          onChange={(e) => setNota(e.target.value)}
          // sugerir-fijo: la nota de la recepción no depende de nada elegido antes
          placeholder="Ej. Llegó en dos bolsas"
        />
      </div>

      {proveedorPorConfirmar && (
        <div data-guia="recepcion.de-quien">
          <CampoGuiado id="proveedor" guia={guia} className="card-cayla space-y-2 p-4 sm:p-5">
            <CampoSelect
              etiqueta={guia.etiqueta("proveedor", "¿De quién llegó?")}
              valor={proveedorId}
              onValor={setProveedorId}
              opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))}
              marcador="Elige el proveedor"
              deshabilitado={proveedorPuesto || guardando}
            />
            <p className="text-xs text-taupe">
              Se abrió sin saber de quién era. Pregúntale a Compras: sin proveedor no entra al stock, porque el lote, el costo y la factura se
              unen por él. Las prendas pueden quedar sin marca.
            </p>
          </CampoGuiado>
        </div>
      )}

      <CampoGuiado id="responsable" guia={guia} className="card-cayla p-4 sm:p-5">
        <p className="mb-2 text-[13px] font-semibold text-tinta">{guia.etiqueta("responsable", "Quién cierra el conteo")}</p>
        <ComboResponsable control={responsable} />
        {!sinAviso && <p className="mt-2 text-xs text-taupe">Quien hizo una orden no puede cerrar su envío (regla de Compras): firma otra persona de la tienda.</p>}
      </CampoGuiado>

      {error && (
        <Aviso ref={avisoError} enfocable tono="error" titulo="No se pudo cerrar">
          {error.texto}
          {error.recargar && " Revisa lo contado y vuelve a cerrar."}
        </Aviso>
      )}

      {/* El pie de una hoja, pegado abajo mientras la tabla pasa por detrás; aquí vive en la página, así que su fondo es el de la página y
          no se estira a los lados (los márgenes negativos son los de la hoja: en la página, a 375 px, la sacaban 8 px del borde). */}
      <div className="pie-hoja-fijo" style={{ "--fondo-hoja": "var(--color-crema)", marginInline: 0, paddingInline: 0 } as CSSProperties}>
        <div className="card-cayla space-y-3 p-4">
          {atipicos ? (
            <AvisoCostoAtipico
              costos={atipicosPorLinea(atipicos)}
              pie="Revisa el costo de esa línea con la factura. Si está bien, confírmalo: el costo de la prenda se promedia con él."
              textoCorregir="Corregir el costo"
              textoConfirmar="Está bien, cerrar"
              textoCargando="Cerrando…"
              cargando={guardando}
              listo={responsable.listo}
              motivoNoListo={responsable.motivo}
              onCorregir={() => setAtipicos(null)}
              onConfirmar={() => {
                const claves = new Set(
                  atipicos
                    .map((a) => visibles.find((l) => (a.despachoItemId ? l.linea?.id === a.despachoItemId : !l.linea && l.conteo?.extraPosicion === a.extra))?.clave)
                    .filter((x): x is LineaParaContar["clave"] => !!x),
                );
                void cerrar(claves);
              }}
            />
          ) : (
            <>
              <p className="text-sm text-tinta" aria-live="polite">{textoResumenDelCierre(resumen)}</p>
              <PieGuia guia={guia} listo={porDetallar > 0 ? "Todo listo: lo guardado no frena el cierre." : "Todo listo para cerrar."} />
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <Volver onClick={onVolver} a="contar" deshabilitado={guardando} />
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  textoCargando="Cerrando…"
                  disabled={!guia.puedeConfirmar || esperandoGuardar}
                  title={esperandoGuardar ? "Espera: lo último que contaste se está guardando" : (guia.frase ?? undefined)}
                  className={guia.claseConfirmar}
                  data-guia="recepcion.cerrar-boton"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Check aria-hidden className="h-4 w-4" />
                    {textoBotonCerrar(contadas, sede, reabierto)}
                  </span>
                </Boton>
              </div>
            </>
          )}
        </div>
      </div>
    </form>
    {/* Fuera del <form> (ADR-0128): un clic o una tecla de la hoja no debe llegar al envío del cierre. */}
    {porConfirmar && (
      <Modal titulo="Vas a cambiar precios" subtitulo="Revisa lo que cambia antes de cerrar el envío." onClose={() => setPorConfirmar(null)} bloqueado={guardando} tamano="mediana">
        <div className="space-y-4">
          {(["compra", "venta"] as const).map((tipo) => {
            const lista = porConfirmar.filter((c) => c.tipo === tipo);
            if (lista.length === 0) return null;
            return (
              <div key={tipo} className="space-y-1.5">
                <p className="text-xs font-semibold text-tinta">{tipo === "compra" ? "Precio de compra" : "Precio de venta"}</p>
                <ul className="divide-y divide-sand rounded-xl border border-sand">
                  {lista.map((c) => (
                    <li key={`${tipo}-${c.nombre}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
                      <span className="font-medium text-tinta">{c.nombre}</span>
                      <span className="tabular-nums text-taupe">{textoCambioDePrecio(c, sede)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <Aviso tono="atencion" chico titulo="Es dinero">
            El precio de compra cambia el costo de lo que entra en este envío. El de venta rige desde ahora: lo ya vendido no cambia. Los dos quedan en el historial.
          </Aviso>
          <PieAcciones>
            <Boton type="button" peso="fantasma" disabled={guardando} onClick={() => setPorConfirmar(null)}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              cargando={guardando}
              textoCargando="Cerrando…"
              onClick={() => {
                setPorConfirmar(null);
                void cerrar();
              }}
            >
              Confirmar y cerrar
            </Boton>
          </PieAcciones>
        </div>
      </Modal>
    )}
    </>
  );
}
