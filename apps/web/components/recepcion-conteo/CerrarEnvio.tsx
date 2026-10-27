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
import { enfocarPrecio, FilaDeCosto, PrecioDePrenda } from "./PrecioDePrenda";
import { ConfirmarPrecios } from "./ConfirmarPrecios";
import { usePreciosDeVenta } from "./usePreciosDeVenta";
import { Vacio } from "@/components/ui/Vacio";
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
import { avisoDePrecioRechazado, type CambioDePrecio, cambioDePrecioDeCompra, cambioDePrecioDeVenta, cambiosDeVentaDe, camposDelCierre, causasDe, contadasDe, costoComoTexto, costoDePrendaTexto, costosDePrendaConProblema, type CostosDePrendas, type DecisionCierre, decisionInicial, detalladas, detalleParaDespues, diferenciaDe, HINT_CONTEO_CAMBIADO, idCampoCierre, leerCostoCierre, type LineaParaContar, lineasParaCerrar, lineaVisible, marcaDeLinea, mensajeAlGuardar, nombreDeLinea, prendasConCosto, problemasDePrecio, resumenDelCierre, textoBotonCerrar, textoResumenDelCierre, TOPES_CONTEO, unidadesSinIdentificar } from "@/lib/recepcion-conteo-reglas";
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
const PLANTILLA_CIERRE = "@min-[1000px]:grid-cols-[minmax(0,1.5fr)_3.75rem_4.25rem_7rem_minmax(0,1.5fr)_minmax(0,1.6fr)_2rem]";
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
  soloSede = false,
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
  /** Una terminal (Felipe 2026-10-26): el precio de venta vale solo en su sede; la base no le deja cambiar el de todas. */
  soloSede?: boolean;
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
  // El costo de compra propio de cada prenda ya identificada (ADR-0519): por línea y por producto, solo lo que quien cierra tocó (lo demás sigue el
  // costo de su línea). Arranca con lo que quedó en el conteo; `costoPrendaInicial` es lo que traía al abrir, para decir «Antes S/ …».
  const [costoPrendaInicial] = useState<Record<string, CostosDePrendas>>(() =>
    Object.fromEntries(visibles.map((l) => [l.clave, Object.fromEntries(Object.entries(l.conteo?.costosPrendas ?? {}).map(([p, c]) => [p, costoComoTexto(c)]))])),
  );
  const [costosPrenda, setCostosPrenda] = useState<Record<string, CostosDePrendas>>(costoPrendaInicial);
  const cambiarCostoPrenda = (clave: string, productoId: string, valor: string) => {
    setAtipicos(null);
    setCostosPrenda((c) => ({ ...c, [clave]: { ...(c[clave] ?? {}), [productoId]: valor } }));
  };
  // El precio de venta de cada prenda ya identificada (por producto): su precio de hoy, lo escrito, dónde vale y por qué la base no lo aceptaría.
  // Se valida antes de confirmar y se aplica al cerrar.
  const { ventas, ponerActual, cambiarVenta, rechazar, aplicado, validar } = usePreciosDeVenta();
  // Lo que cambia (de compra y de venta), para confirmarlo antes de guardar: `null` = no se está confirmando.
  const [porConfirmar, setPorConfirmar] = useState<CambioDePrecio[] | null>(null);
  // Las filas con el costo y el precio de venta de sus prendas a la vista.
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

  /** Lo que cambió el precio de venta: una vez por prenda (aunque esté en dos líneas), con el nombre de la prenda. */
  const cambiosDeVenta = () => cambiosDeVentaDe(visibles.flatMap((l) => l.conteo?.separado.prendas ?? []), ventas);
  /** Todo lo que cambia de precio, de compra primero. */
  function cambiosDePrecio(): CambioDePrecio[] {
    const compra: CambioDePrecio[] = [];
    for (const l of visibles) {
      if (sinAviso && !l.linea && !veDinero) continue;
      const c = cambioDePrecioDeCompra(nombreDeLinea(l), costoInicial[l.clave] ?? "", decisionDe(l.clave).costo);
      if (c) compra.push(c);
    }
    return [...compra, ...cambiosDeCompraPorPrenda(), ...cambiosDeVenta()];
  }
  /** Lo que ve el campo «Costo» de una prenda: lo suyo (o el de su línea), lo que decía al abrir y si está mal escrito. */
  const costoDePrenda = (clave: string, textoLinea: string, productoId: string) => {
    const valor = costoDePrendaTexto(textoLinea, costosPrenda[clave], productoId); // `productoId`: o `nueva:<descripción>`
    return {
      valor,
      deLaLinea: textoLinea,
      antes: costoPrendaInicial[clave]?.[productoId] ?? costoInicial[clave] ?? "",
      problema: valor.trim() ? leerCostoCierre(valor).problema : null,
    };
  };
  /** El costo propio de una prenda que quien cierra cambió (ADR-0519): contra lo que traía al abrir. Una prenda sin costo propio sigue el de su línea. */
  function cambiosDeCompraPorPrenda(): CambioDePrecio[] {
    const r: CambioDePrecio[] = [];
    for (const l of visibles) {
      if (sinAviso && !l.linea && !veDinero) continue;
      for (const p of prendasConCosto(l)) {
        const propios = costosPrenda[l.clave];
        if (!propios || !Object.hasOwn(propios, p.clave) || !propios[p.clave]?.trim()) continue;
        const antes = costoPrendaInicial[l.clave]?.[p.clave] ?? costoInicial[l.clave] ?? "";
        const c = cambioDePrecioDeCompra(`${p.nombre}${p.nueva ? " (por crear)" : ""} · ${nombreDeLinea(l)}`, antes, propios[p.clave] ?? "");
        if (c) r.push(c);
      }
    }
    return r;
  }
  /** Un costo propio mal escrito frena el cierre antes de ir a la base (que lo rechaza con las mismas reglas). */
  function hayCostoDePrendaMalo(): boolean {
    const malos = costosDePrendaConProblema(visibles, costosPrenda);
    if (malos.length === 0) return false;
    setError({ texto: `Corrige el costo de ${malos[0].nombre}: ${malos[0].problema}.`, recargar: false });
    requestAnimationFrame(() => avisoError.current?.focus());
    return true;
  }
  /**
   * «Cerrar»: con precios cambiados, antes de guardar (1) un costo o un precio de venta escrito mal no se ignora, (2) la base dice si cada precio de venta se
   * podría guardar y por qué no, junto a su campo (la fila de su línea se abre), y recién entonces (3) se muestra qué cambia y se pide confirmar.
   */
  async function pedirCerrar() {
    if (!guia.puedeConfirmar || esperandoGuardar) return;
    if (hayCostoDePrendaMalo()) return;
    const prendas = visibles.flatMap((l) => l.conteo?.separado.prendas ?? []);
    const mostrar = (productoId: string) => {
      // El precio vive en la fila de su línea, que puede estar cerrada: se abre (con el motivo junto al campo) y el cursor va al campo.
      const claves = visibles.filter((l) => (l.conteo?.separado.prendas ?? []).some((p) => p.productoId === productoId)).map((l) => l.clave);
      setAbiertas((a) => new Set([...a, ...claves]));
      requestAnimationFrame(() => requestAnimationFrame(() => enfocarPrecio(productoId)));
    };
    const mal = problemasDePrecio(prendas, ventas);
    if (mal.length > 0) {
      mostrar(mal[0].productoId);
      return;
    }
    const venta = cambiosDeVenta();
    if (venta.length > 0) {
      setGuardando(true);
      setError(null);
      const rechazos = await validar(detalle.id, venta, responsable.firma());
      setGuardando(false);
      if (rechazos.length > 0) {
        mostrar(rechazos[0].productoId);
        return;
      }
    }
    const c = cambiosDePrecio();
    if (c.length > 0) {
      setPorConfirmar(c);
      return;
    }
    void cerrar();
  }

  async function cerrar(confirmados: ReadonlySet<string> = new Set()) {
    if (!guia.puedeConfirmar || esperandoGuardar) return;
    if (hayCostoDePrendaMalo()) return;
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
      const { error: epv } = await cambiarPrecioEnRecepcion({ p_despacho_id: detalle.id, p_producto_id: c.productoId, p_precio: c.despues, p_alcance: c.alcance ?? "sede" }, responsable.firma());
      responsable.despues(epv);
      if (epv) {
        setGuardando(false);
        const motivo = mensajeAlGuardar(epv, "cambiar el precio de venta");
        rechazar(c.productoId, motivo);
        setError({ texto: avisoDePrecioRechazado(c.nombre, motivo, "No se cerró el envío."), recargar: false });
        requestAnimationFrame(() => avisoError.current?.focus());
        return;
      }
      aplicado(c.productoId, c.despues, c.alcance ?? "sede");
    }
    const conConfirmados = Object.fromEntries(Object.entries(decisiones).map(([k, d]) => [k, confirmados.has(k) ? { ...d, confirmaCosto: true } : d]));
    const { resultado, error: e } = await cerrarConteo(
      {
        p_despacho_id: detalle.id,
        p_version: versionParaCerrar,
        p_lineas: lineasParaCerrar(visibles, conConfirmados, sinAviso, costosPrenda),
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
        void pedirCerrar();
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
            { titulo: <span className="sr-only">Costo y precio de venta de cada prenda</span> },
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
              // Al abrir la fila solo se ven las prendas con nombre: las identificadas y las nuevas ya descritas (Felipe 2026-10-26: cambiar el costo
              // de lo que no se sabe qué es no tiene sentido). Lo demás se cuenta al final («Hay 2 prendas sin identificar»). Una línea de fuera
              // de la guía es la excepción: su costo es obligatorio y no viene de ninguna orden, así que lleva su campo y se ve abierta.
              const conNombre = prendasConCosto(l);
              const sinIdentificar = unidadesSinIdentificar(l);
              const costoDeLaLineaObligatorio = editaCosto && !l.linea && contadasDe(l) > 0;
              // UN solo aviso para lo que no tiene nombre (Felipe 2026-10-26): cuántas son y a qué costo entran (el de la orden, si la línea venía en
              // la guía). Si no hay ninguna prenda con nombre, ese mismo aviso hace de vacío y dice cuándo se podrá cambiar su costo.
              const sinIdentificarTexto =
                sinIdentificar > 0
                  ? `Hay ${sinIdentificar} ${sinIdentificar === 1 ? "prenda sin identificar" : "prendas sin identificar"}` +
                    (l.linea && editaCosto && costo.valor != null ? `: cuestan lo que dice la orden (S/\u00a0${costo.valor.toFixed(2)}).` : ".")
                  : null;
              const siempreAbierta = costoDeLaLineaObligatorio;
              const abierta = siempreAbierta || abiertas.has(l.clave);
              // Lo que cambió en esta línea y quedaría escondido: se avisa en la fila cerrada.
              const cambiaVenta = prendas.some((pr) => {
                const e = ventas[pr.productoId];
                return !!e && cambioDePrecioDeVenta("", e.actual, e.valor, e.alcance) !== null;
              });
              const cambiaCosto =
                editaCosto &&
                (cambio ||
                  conNombre.some((pr) => {
                    const ahora = costoDePrendaTexto(d.costo, costosPrenda[l.clave], pr.clave);
                    const antes = costoPrendaInicial[l.clave]?.[pr.clave] ?? costoInicial[l.clave] ?? "";
                    return ahora.trim() !== "" && cambioDePrecioDeCompra("", antes, ahora) !== null;
                  }));
              const textoCambios = cambiaCosto && cambiaVenta ? "Costo y precio cambiados" : cambiaCosto ? "Costo cambiado" : "Precio de venta cambiado";
              const conCambios = cambiaVenta || cambiaCosto;
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
                      {conCambios && !abierta && <Chip tono="ambar">{textoCambios}</Chip>}
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
                    <div className="space-y-3">
                      {costoDeLaLineaObligatorio && (
                        <CampoGuiado id={idCampoCierre("costo", l.clave)} guia={guia}>
                          <FilaDeCosto
                            marca="linea"
                            titulo="Toda la línea"
                            subtitulo="no estaba en la guía: su costo es obligatorio"
                            unidades={contadasDe(l)}
                            nombre={nombreDeLinea(l)}
                            costo={{ valor: d.costo, deLaLinea: d.costo, antes: costoInicial[l.clave] ?? "", problema: costo.problema }}
                            placeholder={sinAviso ? "S/\u00a0sin costo" : "S/\u00a00.00"}
                            onCosto={(valor) => cambiar(l.clave, { costo: valor, confirmaCosto: false })}
                          />
                        </CampoGuiado>
                      )}
                      {conNombre.length === 0 && !costoDeLaLineaObligatorio ? (
                        <Vacio tamano="chico" icono={<Shirt />}>
                          {sinIdentificarTexto
                            ? `${sinIdentificarTexto} Su costo y su precio de venta se cambian cuando las identifiques o las describas.`
                            : "No llegó nada de esta línea."}
                        </Vacio>
                      ) : (
                        <div className="space-y-3">
                          {prendas.map((pr) => (
                            <PrecioDePrenda
                              key={`${l.clave}-${pr.productoId}`}
                              prenda={pr}
                              sede={sede}
                              soloSede={soloSede}
                              sedeId={detalle.sede?.id ?? null}
                              editado={ventas[pr.productoId]}
                              costo={editaCosto ? costoDePrenda(l.clave, d.costo, pr.productoId) : undefined}
                              onCosto={(valor) => cambiarCostoPrenda(l.clave, pr.productoId, valor)}
                              onActual={(general, enSede) => ponerActual(pr.productoId, general, enSede)}
                              onValor={(valor) => cambiarVenta(pr.productoId, { valor })}
                              onAlcance={(alcance) => cambiarVenta(pr.productoId, { alcance })}
                            />
                          ))}
                          {/* Las nuevas ya descritas todavía no existen: solo llevan costo; su precio se pone al crearlas. */}
                          {editaCosto &&
                            conNombre
                              .filter((n) => n.nueva)
                              .map((n) => (
                                <FilaDeCosto
                                  key={`${l.clave}-${n.clave}`}
                                  marca="nueva"
                                  titulo={n.nombre}
                                  subtitulo="nueva · se crea después, con su precio"
                                  unidades={n.unidades}
                                  nombre={n.nombre}
                                  costo={costoDePrenda(l.clave, d.costo, n.clave)}
                                  placeholder={`S/\u00a0${d.costo.trim() || "0.00"}`}
                                  onCosto={(valor) => cambiarCostoPrenda(l.clave, n.clave, valor)}
                                />
                              ))}
                        </div>
                      )}
                      {sinIdentificarTexto && (conNombre.length > 0 || costoDeLaLineaObligatorio) && (
                        <p className="text-xs text-taupe" data-sin-identificar={sinIdentificar}>
                          {sinIdentificarTexto}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                </div>
              );
            })}
      </Tabla>

      <Aviso tono="atencion" titulo="El costo de cada prenda se puede corregir aquí">
        {sinAviso
          ? "Lo que llega sin aviso entra sin costo si lo dejas vacío; la factura lo trae después. "
          : "Viene de la orden: si la factura dice otra cosa, corrígelo. "}
        Cambia el costo de lo que entra en este envío; lo comprado y recibido antes no se toca. El costo y el precio de venta se cambian por prenda, solo de las que ya identificaste o describiste: abre la fila. El de venta rige
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
        {!sinAviso && <p className="mt-2 text-xs text-taupe">Quien hizo una orden no puede cerrar su envío (solo un Admin cierra lo que él mismo compró): firma otra persona de la tienda.</p>}
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
      <ConfirmarPrecios
        cambios={porConfirmar}
        sede={sede}
        subtitulo="Revisa lo que cambia antes de cerrar el envío."
        textoConfirmar="Confirmar y cerrar"
        textoCargando="Cerrando…"
        cargando={guardando}
        onCancelar={() => setPorConfirmar(null)}
        onConfirmar={() => {
          setPorConfirmar(null);
          void cerrar();
        }}
      />
    )}
    </>
  );
}
