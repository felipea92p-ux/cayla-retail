"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, TABLA, Tabla } from "@/components/ui/Tabla";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { BaldosaCategoria } from "./piezas";
import { PrendaConCombinaciones } from "./PrendaConCombinaciones";
import { ConfirmarPrecios } from "./ConfirmarPrecios";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { ComboResponsable } from "@/components/ComboResponsable";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ElegirOpcion } from "@/components/recepcion-envio/BloquePrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { deudaDe, VALOR_REPOSICION } from "@/lib/nos-debe-reglas";
import {
  atipicosPorLinea,
  leerCostoAtipicoRecepcion,
  type CausaFaltante,
  type CausaSobrante,
  type CostoAtipicoRecepcion,
  type DetalleEnvio,
} from "@/lib/recepcion-envio-reglas";
import { hayQueElegirDueno } from "@/lib/dueno-reglas";
import { useEmpresasDeSede } from "@/lib/useEmpresasDeSede";
import { DuenoDeLoQueEntra } from "./DuenoDeLoQueEntra";
import { agruparLineasDelCierre, camposDelCierrePorGrupo, nombreDelGrupoDelCierre, causasDelGrupo, filasDelCierre, lineaDeLaPrenda, lineaDelGrupo, textoDeLasPlegadas, type GrupoDeLineas } from "@/lib/recepcion-grupos-reglas";
import { borrarBorradorDelCierre, conCostosDecididos, conLoDecidido, costosCambiados, costosDeCombinacionCambiados, decisionCambiada, type FotoDelCierre, guardarBorradorDelCierre, leerBorradorDelCierre } from "@/lib/recepcion-cierre-borrador";
import { type PrendaConCosto, lineasSinModelosEnCero, modelosEnCeroDe, textoModelosEnCero, avisoDePrecioRechazado, type CambioDePrecio, cambioDePrecioDeCompra, camposDelCierre, conCostoDeHoy, contadasDe, costoComoTexto, costoDePrendaTexto, esRegaloFuera, costosDePrendaConProblema, type CostosDePrendas, deQuienLlego, type FilaDeQuien, idCampoProveedor, type DecisionCierre, decisionInicial, detalladas, detalleParaDespues, diferenciaDe, HINT_CONTEO_CAMBIADO, idCampoCierre, leerCostoCierre, type ClaveLinea, type LineaParaContar, lineasParaCerrar, lineaVisible, marcaDeLinea, mensajeAlGuardar, nombreDeLinea, prendasConCosto, resumenDelCierre, textoBotonCerrar, textoResumenDelCierre, TOPES_CONTEO, unidadesSinIdentificar } from "@/lib/recepcion-conteo-reglas";
import { VALOR_OTRO } from "@/lib/recepcion-envio-reglas";
import { cambiarPreciosEnRecepcion, cerrarConteo, corregirGuiaEnvio, leerCostosDeHoy, leerPreciosDeCombinaciones, ponerProveedorDeMarca, validarPreciosEnRecepcion } from "@/lib/recepcion-conteo-acciones";
import {
  type CambiosDeCosto,
  type CambiosDePrecio,
  type Combinacion,
  type Cifra,
  type LlamadaDePrecio,
  type PrecioDeHoy,
  combinacionesContadas,
  costosDeCombinacionesGuardados,
  costosParaLinea,
  etiquetaDe,
  llamadasDePrecio,
  ponerCosto,
  ponerPrecio,
  quitarCambios,
} from "@/lib/recepcion-combinaciones-reglas";

// Cerrar (ADR-0393, el paso 3 de la cara A): una fila por categoría —lo que dijeron, lo que se contó, lo que entra hoy al stock y lo que
// queda para después—, el costo de cada una (decisión 6: quien cierra lo ve y lo corrige; en un envío sin aviso, solo quien ve el dinero de
// Compras, y vacío entra sin costo), qué pasó con lo que no cuadró, una nota y quién cierra. Separar y detallar NO frenan: son pendientes.
// Las reglas son las de `cerrar_conteo_envio` (`camposDelCierre`): la guía de foco enciende lo que falta.
//
// Primero va lo que pide una decisión; con muchas filas, lo que cuadra queda plegado y sus precios nacen cerrados (Felipe 2026-11-03: con 75 líneas medía casi 16.000 px). Lo decidido se guarda en este
// navegador hasta cerrar: un F5 ya no lo borra (`lib/recepcion-cierre-borrador.ts`).

// Las columnas del cierre, una sola vez para el encabezado y cada fila (la pieza <Tabla>, ADR-0358). La tabla decide su forma por el ancho
// de su TARJETA (`@container`, como Clientes), no por el de la ventana: con el lateral abierto, a 1024 px la tarjeta mide ~670 px y siete
// columnas se pisaban. Desde 880 px de tarjeta, columnas; con menos, cada fila apilada, con su etiqueta en cada dato.
// Una fila por modelo: nombre, cuánto llegó, un costo y «Cambiar por talla». Lo que no cuadra y lo que queda para después van en una franja debajo, solo si hay (Felipe 2026-11-03).
const PLANTILLA_CIERRE = "@min-[760px]:grid-cols-[minmax(0,1fr)_7rem_10rem_11rem] @min-[760px]:items-center";

export function CerrarEnvio({
  detalle,
  version,
  lineas: lineasConCeros,
  sinAviso,
  reabierto,
  generacion,
  sede,
  responsable,
  veDinero,
  soloSede = false,
  proveedores = [],
  esperandoGuardar,
  onVolver,
  decisionesPrevias = null,
  sinGuardar = 0,
  onReintentarGuardado,
  onConteoCambiado,
  onCerrado,
}: {
  detalle: DetalleEnvio;
  version: number;
  lineas: readonly LineaParaContar[];
  sinAviso: boolean;
  reabierto: boolean;
  /** Cuántas veces se cerró o reabrió: lo decidido en otra vuelta ya no vale. */
  generacion: number;
  sede: string;
  responsable: ControlResponsable;
  veDinero: boolean;
  /** Una terminal (Felipe 2026-10-26): el precio de venta vale solo en su sede; la base no le deja cambiar el de todas. */
  soloSede?: boolean;
  proveedores?: readonly { id: string; nombre: string }[];
  /** Algo de lo contado todavía se está guardando: se espera antes de cerrar. */
  esperandoGuardar: boolean;
  /** Volver a contar; `clave`: la línea que falta contar, para llegar a ella. */
  onVolver: (clave: ClaveLinea | undefined, decisiones: Readonly<Record<string, DecisionCierre>>) => void;
  /** Lo que se decidió antes de volver a contar: no se pierde al ir y volver. */
  decisionesPrevias?: Readonly<Record<string, DecisionCierre>> | null;
  /** Cuántas líneas no se pudieron guardar. */
  sinGuardar?: number;
  onReintentarGuardado?: () => void;
  onConteoCambiado: () => void;
  onCerrado: () => void;
}) {
  // Lo agregado que quedó en 0 no se guarda (la base hace lo mismo): Cerrar ya no lo ve, y solo avisa cuál fue.
  const lineas = lineasSinModelosEnCero(lineasConCeros);
  const modelosEnCero = modelosEnCeroDe(lineasConCeros);
  const visibles = lineas.filter(lineaVisible);
  // Lo que se decidió antes de recargar. Esta pantalla siempre se monta en el navegador: leerlo al iniciar el estado no rompe la hidratación.
  const [borrador] = useState(() => leerBorradorDelCierre(detalle.id, generacion));
  const [decisiones, setDecisiones] = useState<Record<string, DecisionCierre>>(() => Object.fromEntries(visibles.map((l) => [l.clave, decisionesPrevias?.[l.clave] ?? conLoDecidido(decisionInicial(l), borrador?.decisiones[l.clave])])));
  // «Lo que habías decidido sigue aquí»: solo al llegar de una recarga o de otra visita, no al ir y volver de Contar.
  const [verRecuperado, setVerRecuperado] = useState(!!borrador && !decisionesPrevias);
  // En una sede con CAYLA y CLAURE, lo que entra al stock al cerrar lleva su dueño (ADR-0542): la base lo exige. Solo se pregunta si algo entra: lo que queda para después lo pregunta «Hacer ahora».
  const empresasDeLaSede = useEmpresasDeSede(detalle.sede?.id ?? null);
  const preguntaDueno = hayQueElegirDueno(empresasDeLaSede) && visibles.some((l) => l.conteo !== null && detalladas(l.conteo.separado) > 0);
  const [duenoId, setDuenoId] = useState(borrador?.duenoId ?? "");
  // Lo que traía cada línea al abrir el cierre: la tarjeta «Costos y precios» marca lo que quien cierra cambió y dice cuánto era.
  const [costoInicial] = useState<Record<string, string>>(() => Object.fromEntries(visibles.map((l) => [l.clave, decisionInicial(l).costo])));
  // El costo de compra propio de cada prenda ya identificada (ADR-0519): por línea y por producto, solo lo que quien cierra tocó (lo demás sigue el
  // costo de su línea). Arranca con lo que quedó en el conteo; `costoPrendaInicial` es lo que traía al abrir, para decir «Antes S/ …».
  const [costoPrendaInicial] = useState<Record<string, CostosDePrendas>>(() =>
    Object.fromEntries(visibles.map((l) => [l.clave, Object.fromEntries(Object.entries(l.conteo?.costosPrendas ?? {}).map(([p, c]) => [p, costoComoTexto(c)]))])),
  );
  const [costosPrenda, setCostosPrenda] = useState<Record<string, CostosDePrendas>>(() => conCostosDecididos(costoPrendaInicial, borrador?.costosPrenda));
  const cambiarCostoPrenda = (clave: string, productoId: string, valor: string) => {
    setAtipicos(null);
    setCostosPrenda((c) => ({ ...c, [clave]: { ...(c[clave] ?? {}), [productoId]: valor } }));
  };
  // El costo y el precio de venta por COMBINACIÓN (color y talla) de cada prenda identificada (Felipe 2026-10-28): lo escrito vive aquí hasta cerrar
  // (`lib/recepcion-combinaciones-reglas.ts`). Los costos arrancan con lo que ya quedó guardado en el conteo; los precios, vacíos. Lo que valen hoy
  // (el general y el de esta tienda) se lee una vez; el precio se valida antes de confirmar y se aplica al cerrar.
  const [hoy, setHoy] = useState<{ porVariante: Record<string, PrecioDeHoy>; activasPorPrenda: Record<string, number> }>({ porVariante: {}, activasPorPrenda: {} });
  const [cambiosCostoInicial] = useState<CambiosDeCosto>(() =>
    Object.assign({}, ...visibles.map((l) => costosDeCombinacionesGuardados(l.conteo?.separado.prendas ?? [], l.conteo?.costosPrendas ?? {}))),
  );
  const [cambiosCosto, setCambiosCosto] = useState<CambiosDeCosto>(borrador?.cambiosCosto ?? cambiosCostoInicial);
  const [cambiosPrecio, setCambiosPrecio] = useState<CambiosDePrecio>(borrador?.cambiosPrecio ?? {});
  /** Por qué la base no guardaría el precio de una prenda (`validar_precios_en_recepcion`), por producto: sale en su matriz y se borra al cambiar algo. */
  const [rechazosPrecio, setRechazosPrecio] = useState<Record<string, string>>({});
  const [prendasAbiertas, setPrendasAbiertas] = useState<ReadonlySet<string>>(new Set());
  const idsDeProductos = [...new Set(visibles.flatMap((l) => (l.conteo?.separado.prendas ?? []).map((p) => p.productoId)))].sort();
  useEffect(() => {
    let vivo = true;
    void leerPreciosDeCombinaciones(idsDeProductos, detalle.sede?.id ?? null).then((r) => {
      if (vivo && r) setHoy(r);
    });
    return () => {
      vivo = false;
    };
    // Se lee una vez por conjunto de prendas; `idsDeProductos` se arma en cada dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsDeProductos.join(","), detalle.sede?.id]);
  // Lo que cuesta hoy lo contado: la hoja de confirmar lo dice antes de cambiarlo (solo quien ve el dinero de Compras). Se lee una vez por conjunto de combinaciones.
  const [costosDeHoy, setCostosDeHoy] = useState<Record<string, number>>({});
  const variantesDe = (l: LineaParaContar, productoId?: string) =>
    (l.conteo?.separado.prendas ?? []).filter((p) => !productoId || p.productoId === productoId).flatMap((p) => (p.variantes ?? []).map((v) => v.varianteId));
  const idsDeVariantes = [...new Set(visibles.flatMap((l) => variantesDe(l)))].sort();
  useEffect(() => {
    if (!veDinero) return;
    let vivo = true;
    void leerCostosDeHoy(idsDeVariantes).then((r) => {
      if (vivo) setCostosDeHoy(r);
    });
    return () => {
      vivo = false;
    };
    // `idsDeVariantes` se arma en cada dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsDeVariantes.join(","), veDinero]);
  // Lo que cambia (de compra y de venta), para confirmarlo antes de guardar: `null` = no se está confirmando.
  const [porConfirmar, setPorConfirmar] = useState<CambioDePrecio[] | null>(null);
  // Las filas con el costo y el precio de venta de sus prendas a la vista. Una categoría de fuera de la guía arranca abierta (su costo se pide y no
  // viene de ninguna orden), pero se puede esconder (Felipe 2026-10-28): cerrada, dice «Falta el costo» mientras no lo escriban. Desde el
  // 2026-10-29 (Formidable) también arranca abierta la que ya tiene prendas identificadas, porque la prueba ciega no encontraba dónde poner el precio; con
  // muchas filas ya no (Felipe 2026-11-03): serían miles de px, y cada fila dice «Precio y costo» con su nombre.
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  // Lo que cuadra, plegado: se abre con su franja, y solo si hay que llevar a la persona a algo que está adentro.
  const [verCuadran, setVerCuadran] = useState(false);
  const [nota, setNota] = useState(borrador?.nota ?? "");
  const [token] = useState(() => crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  const [atipicos, setAtipicos] = useState<CostoAtipicoRecepcion[] | null>(null);
  // Alguien guardó un conteo mientras se cerraba: la franja del pie se pasaba por alto, así que además se dice en una hoja a la vista.
  const [choque, setChoque] = useState<string | null>(null);
  // «De quién llegó», marca por marca (Felipe 2026-11-07): lo que la persona eligió aquí y la base ya guardó (`poner_proveedor_de_marca`), y la marca que se está
  // guardando. Se guarda al elegir, no al cerrar: así lo que falta se ve al instante y un error se dice junto a su marca.
  const [puestos, setPuestos] = useState<Record<string, { id: string; nombre: string }>>({});
  const [poniendo, setPoniendo] = useState<string | null>(null);
  const [errorDeQuien, setErrorDeQuien] = useState<{ clave: string; texto: string } | null>(null);
  const deQuien = sinAviso ? deQuienLlego(visibles, puestos) : [];
  async function ponerDeQuien(fila: FilaDeQuien, proveedorId: string) {
    const prov = proveedores.find((x) => x.id === proveedorId);
    if (!prov || poniendo) return;
    setPoniendo(fila.clave);
    setErrorDeQuien(null);
    const { error: e } = await ponerProveedorDeMarca({ p_despacho_id: detalle.id, p_marca_id: fila.marca?.id ?? null, p_proveedor_id: proveedorId }, responsable.firma());
    responsable.despues(e);
    setPoniendo(null);
    if (e) {
      setErrorDeQuien({ clave: fila.clave, texto: mensajeAlGuardar(e, "poner de quién llegó") });
      return;
    }
    setPuestos((p) => ({ ...p, [fila.clave]: prov }));
  }
  // La guía se escribe o corrige al cerrar (Felipe 2026-10-14): lo escrito, lo que ya quedó en la base y la versión nueva del envío.
  const [guiaEscrita, setGuiaEscrita] = useState(borrador?.guia ?? detalle.numeroGuia ?? "");
  const [guiaGuardada, setGuiaGuardada] = useState(detalle.numeroGuia ?? "");
  const [versionTrasGuia, setVersionTrasGuia] = useState<number | null>(null);
  const avisoError = useRef<HTMLDivElement>(null);
  // Ya se cerró: lo que quede por pintar no vuelve a guardar lo que se acaba de borrar.
  const yaCerrado = useRef(false);

  /** Lo decidido hasta ahora: solo lo que cambió. */
  const fotoDelCierre = (): FotoDelCierre => ({
    decisiones: Object.fromEntries(visibles.map((l) => [l.clave, decisionCambiada(decisionInicial(l), decisiones[l.clave] ?? decisionInicial(l))] as const).filter(([, d]) => Object.keys(d).length > 0)),
    costosPrenda: costosCambiados(costoPrendaInicial, costosPrenda),
    cambiosCosto: costosDeCombinacionCambiados(cambiosCostoInicial, cambiosCosto),
    cambiosPrecio,
    nota,
    guia: guiaEscrita === (detalle.numeroGuia ?? "") ? null : guiaEscrita,
    // Ya no se elige un proveedor para todo el envío (Felipe 2026-11-07): cada marca se guarda al elegirla.
    proveedorId: "",
    duenoId,
  });
  useEffect(() => {
    if (!yaCerrado.current) guardarBorradorDelCierre(detalle.id, generacion, fotoDelCierre());
    // Se guarda lo que decide la persona: lo contado se guarda aparte, en la base.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisiones, costosPrenda, cambiosCosto, cambiosPrecio, nota, guiaEscrita, duenoId]);

  /** «Empezar de cero»: todo como lo trae la base. El aviso ofrece deshacerlo: es trabajo de la persona. */
  function empezarDeCero() {
    const antes = { decisiones, costosPrenda, cambiosCosto, cambiosPrecio, nota, guiaEscrita, duenoId };
    const poner = (f: typeof antes) => {
      setAtipicos(null);
      setDecisiones(f.decisiones);
      setCostosPrenda(f.costosPrenda);
      setCambiosCosto(f.cambiosCosto);
      setCambiosPrecio(f.cambiosPrecio);
      setNota(f.nota);
      setGuiaEscrita(f.guiaEscrita);
      setDuenoId(f.duenoId);
    };
    poner({ decisiones: Object.fromEntries(visibles.map((l) => [l.clave, decisionInicial(l)])), costosPrenda: costoPrendaInicial, cambiosCosto: cambiosCostoInicial, cambiosPrecio: {}, nota: "", guiaEscrita: detalle.numeroGuia ?? "", duenoId: "" });
    setVerRecuperado(false);
    avisar.exito("Empezaste de cero", { detalle: "Quitamos lo que habías decidido en este cierre.", accion: { texto: "Deshacer", onClick: () => poner(antes) } });
  }

  const decisionDe = (clave: string): DecisionCierre => decisiones[clave] ?? decisionInicial(visibles.find((l) => l.clave === clave) ?? visibles[0]);
  const cambiar = (clave: string, cambio: Partial<DecisionCierre>) => {
    setAtipicos(null);
    setDecisiones((d) => ({ ...d, [clave]: { ...decisionDe(clave), ...cambio } }));
  };

  // Una categoría es UNA fila (ADR-0393, act. 2026-10-26): las líneas de la compra con el mismo proveedor, categoría y marca van juntas. Lo que se
  // decide en una fila (qué pasó, el costo y el precio de cada prenda) se guarda en las líneas a las que toca: la base sigue pidiéndolo por línea.
  const grupos = agruparLineasDelCierre(visibles);
  const { piden, cuadran, plegar } = filasDelCierre(grupos, sinAviso, !(sinAviso && !veDinero));
  const campos = [
    ...camposDelCierrePorGrupo(
      camposDelCierre({
        lineas: visibles,
        decisiones,
        sinAviso,
        responsable: responsable.listo,
        deQuien,
        guia: guiaEscrita,
      }),
      grupos,
    ),
    ...(preguntaDueno ? [{ id: "hacer-ahora-dueno", nombre: "De quién es la mercadería", requerido: true, hecho: duenoId !== "", pendiente: "Di si lo que entra al stock es de CAYLA o de CLAURE." }] : []),
  ];
  const guiaBase = useGuiaCampos(campos, { enModal: false });
  // La guía interactiva ancla su paso «prendas» a la fila de la primera prenda que se dibuje.
  const primeraPrenda = grupos.flatMap((g) => g.separado.prendas.map((p) => `${g.clave}|${p.productoId}`))[0] ?? null;
  // El costo ya no se esconde (vive en la fila): la guía lleva a su caja sin abrir nada.
  const guia = guiaBase;
  const contadas = visibles.reduce((a, l) => a + contadasDe(l), 0);
  // Lo que pasa al cerrar, dicho para la tienda (formidable 2026-10-13, cambio 3): cuántas se pueden vender ya y cuántas quedan guardadas.
  const resumen = resumenDelCierre(visibles);
  const porDetallar = resumen.guardadas;

  /** El costo de partida de una prenda: el suyo (guardado por prenda en un cierre anterior) o el de su línea. */
  const costoHeredadoDe = (lineaClave: string, productoId: string): number | null =>
    leerCostoCierre(costoDePrendaTexto(decisionDe(lineaClave).costo, costosPrenda[lineaClave], productoId)).valor;
  /** Las prendas identificadas de las categorías, una vez cada una, con lo contado por color y talla: de ahí salen el precio y la confirmación. */
  const prendasConCombinaciones = (): { productoId: string; nombre: string; combinaciones: Combinacion[] }[] =>
    grupos.flatMap((g) =>
      g.separado.prendas.map((pr) => ({
        productoId: pr.productoId,
        nombre: pr.nombre ?? pr.codigo ?? "La prenda",
        combinaciones: combinacionesContadas(pr, hoy.porVariante, costoHeredadoDe(lineaDeLaPrenda(g, { productoId: pr.productoId }).clave, pr.productoId)),
      })),
    );
  /** Lo que cambió el precio de venta, una combinación por renglón, con dónde vale. */
  const cambiosDeVenta = (): CambioDePrecio[] => {
    const r: CambioDePrecio[] = [];
    for (const p of prendasConCombinaciones()) {
      for (const c of p.combinaciones) {
        const e = cambiosPrecio[c.varianteId];
        const antes = e ? (e.valeEn === "sede" ? c.precioSede : c.precioGeneral) : null;
        if (!e || antes === e.valor) continue;
        r.push({ tipo: "venta", nombre: `${p.nombre} · ${etiquetaDe(c)}`, antes, despues: e.valor, alcance: e.valeEn });
      }
    }
    return r;
  };
  /** El costo propio de cada combinación que quien cierra cambió, contra el de partida (el de su prenda o su línea). */
  const cambiosDeCompraPorCombinacion = (): CambioDePrecio[] => {
    const r: CambioDePrecio[] = [];
    for (const l of visibles) {
      if ((sinAviso && !l.linea && !veDinero) || esRegaloFuera(l, decisionDe(l.clave))) continue;
      for (const pr of l.conteo?.separado.prendas ?? []) {
        for (const c of combinacionesContadas(pr, hoy.porVariante, costoHeredadoDe(l.clave, pr.productoId))) {
          const e = cambiosCosto[c.varianteId];
          if (e === undefined || e === c.costoHeredado) continue;
          const cambio = conCostoDeHoy({ tipo: "compra", nombre: `${pr.nombre ?? pr.codigo ?? "La prenda"} · ${etiquetaDe(c)}`, antes: c.costoHeredado, despues: e, alcance: null }, [c.varianteId], costosDeHoy);
          if (cambio) r.push(cambio);
        }
      }
    }
    return r;
  };
  /** Los costos por combinación (y por prenda, si todas llevan el mismo) de cada línea, como los espera `costos_prendas`. */
  const costosCombinacionesPorLinea = (): Record<string, Record<string, number>> => {
    const r: Record<string, Record<string, number>> = {};
    for (const l of visibles) {
      if (sinAviso && !l.linea && !veDinero) continue;
      const prendas = (l.conteo?.separado.prendas ?? []).map((pr) => ({ productoId: pr.productoId, combinaciones: combinacionesContadas(pr, hoy.porVariante, costoHeredadoDe(l.clave, pr.productoId)) }));
      const costos = costosParaLinea(prendas, cambiosCosto);
      if (Object.keys(costos).length > 0) r[l.clave] = costos;
    }
    return r;
  };
  /** Una prenda y su categoría se ven abiertas (para llevar a quien cierra a lo que hay que corregir). */
  const mostrarPrenda = (productoId: string) => {
    const g = grupos.find((x) => x.separado.prendas.some((p) => p.productoId === productoId));
    if (!g) return;
    setAbiertas((a) => new Set([...a, g.clave]));
    setPrendasAbiertas((a) => new Set([...a, `${g.clave}|${productoId}`]));
    const irA = () => document.querySelector(`[data-prenda-comb-id="${CSS.escape(productoId)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    // Si estaba plegada, primero baja lo plegado (400 ms): si no, la vista llegaría a donde la fila todavía no está.
    if (plegar && !verCuadran && cuadran.includes(g)) {
      setVerCuadran(true);
      window.setTimeout(irA, 450);
    } else requestAnimationFrame(() => requestAnimationFrame(irA));
  };
  /** «Corregir el costo»: lleva a la caja de ese costo y le pone el cursor. Con la fila plegada, la persona no sabía dónde estaba (prueba ciega, 2026-11-03). */
  const irAlCostoAtipico = (a: CostoAtipicoRecepcion) => {
    const g = grupos.find((x) => x.lineas.some((l) => (a.despachoItemId ? l.linea?.id === a.despachoItemId : !l.linea && l.conteo?.extraPosicion === a.extra)));
    if (!g) return;
    const prenda = g.separado.prendas.find((p) => p.variantes?.some((v) => v.varianteId === a.varianteId));
    setAbiertas((ya) => new Set([...ya, g.clave]));
    if (plegar && cuadran.includes(g)) setVerCuadran(true);
    window.setTimeout(() => {
      const donde = document.querySelector(prenda ? `[data-prenda-comb-id="${CSS.escape(prenda.productoId)}"]` : `[data-precios-de="${CSS.escape(g.clave)}"]`);
      donde?.scrollIntoView({ block: "center", behavior: "smooth" });
      const caja = [...(donde?.querySelectorAll<HTMLInputElement>("input:not(:disabled)") ?? [])].find((i) => /costo/i.test(i.getAttribute("aria-label") ?? i.labels?.[0]?.textContent ?? ""));
      caja?.focus({ preventScroll: true });
      caja?.select();
    }, 450);
  };
  const cambiarCosto = (ids: string[], valor: number) => {
    setAtipicos(null);
    setCambiosCosto((c) => ponerCosto(c, ids, valor));
  };
  const cambiarPrecio = (productoId: string, ids: string[], valor: number, valeEn: "todas" | "sede") => {
    setRechazosPrecio((r) => quitarCambios(r, [productoId]));
    setCambiosPrecio((c) => ponerPrecio(c, ids, valor, valeEn));
  };
  const deshacerCambios = (productoId: string, cifra: Cifra, ids: string[]) => {
    if (cifra === "costo") setCambiosCosto((c) => quitarCambios(c, ids));
    else {
      setRechazosPrecio((r) => quitarCambios(r, [productoId]));
      setCambiosPrecio((c) => quitarCambios(c, ids));
    }
  };
  /** La base ya aplicó estos precios: lo escrito pasa a ser lo que vale hoy y deja de ser un cambio (un reintento del cierre no lo manda otra vez). */
  const precioAplicado = (l: LlamadaDePrecio) => {
    setHoy((h) => ({
      ...h,
      porVariante: {
        ...h.porVariante,
        ...Object.fromEntries(
          Object.entries(l.precios).map(([id, valor]) => [id, { general: l.alcance === "todas" ? valor : (h.porVariante[id]?.general ?? null), sede: l.alcance === "sede" ? valor : (h.porVariante[id]?.sede ?? valor) }]),
        ),
      },
    }));
    setCambiosPrecio((c) => quitarCambios(c, Object.keys(l.precios)));
  };
  /** Todo lo que cambia de precio, de compra primero. */
  function cambiosDePrecio(): CambioDePrecio[] {
    const compra: CambioDePrecio[] = [];
    for (const l of visibles) {
      if (sinAviso && !l.linea && !veDinero) continue;
      const c = cambioDePrecioDeCompra(nombreDeLinea(l), costoInicial[l.clave] ?? "", decisionDe(l.clave).costo);
      const conHoy = c && conCostoDeHoy(c, variantesDe(l), costosDeHoy);
      if (conHoy) compra.push(conHoy);
    }
    return [...compra, ...cambiosDeCompraPorPrenda(), ...cambiosDeCompraPorCombinacion(), ...cambiosDeVenta()];
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
        const conHoy = c && (p.nueva ? c : conCostoDeHoy(c, variantesDe(l, p.clave), costosDeHoy));
        if (conHoy) r.push(conHoy);
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
    const llamadas = llamadasDePrecio(prendasConCombinaciones(), cambiosPrecio);
    if (llamadas.length > 0) {
      setGuardando(true);
      setError(null);
      const rechazos: Record<string, string> = {};
      for (const l of llamadas) {
        const r = await validarPreciosEnRecepcion({ p_despacho_id: detalle.id, p_producto_id: l.productoId, p_precios: l.precios, p_alcance: l.alcance }, responsable.firma());
        if (r.estado === "rechazado" && !rechazos[l.productoId]) rechazos[l.productoId] = r.texto;
      }
      setGuardando(false);
      const primero = Object.keys(rechazos)[0];
      if (primero) {
        // La prenda cuyo precio la base no aceptaría se abre, con el motivo en su matriz.
        setRechazosPrecio((r) => ({ ...r, ...rechazos }));
        mostrarPrenda(primero);
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
    // El precio de venta de lo que cambió, antes de cerrar (la base lo pide con el envío abierto). Cada llamada que queda aplicada deja de ser un cambio:
    // si el cierre falla y se reintenta, no se vuelve a mandar.
    for (const l of llamadasDePrecio(prendasConCombinaciones(), cambiosPrecio)) {
      const { error: epv } = await cambiarPreciosEnRecepcion({ p_despacho_id: detalle.id, p_producto_id: l.productoId, p_precios: l.precios, p_alcance: l.alcance }, responsable.firma());
      responsable.despues(epv);
      if (epv) {
        setGuardando(false);
        const motivo = mensajeAlGuardar(epv, "cambiar el precio de venta");
        const nombre = prendasConCombinaciones().find((p) => p.productoId === l.productoId)?.nombre ?? "la prenda";
        setRechazosPrecio((r) => ({ ...r, [l.productoId]: motivo }));
        mostrarPrenda(l.productoId);
        setError({ texto: avisoDePrecioRechazado(nombre, motivo, "No se cerró el envío."), recargar: false });
        requestAnimationFrame(() => avisoError.current?.focus());
        return;
      }
      precioAplicado(l);
    }
    const conConfirmados = Object.fromEntries(Object.entries(decisiones).map(([k, d]) => [k, confirmados.has(k) ? { ...d, confirmaCosto: true } : d]));
    const { resultado, error: e } = await cerrarConteo(
      {
        p_despacho_id: detalle.id,
        p_version: versionParaCerrar,
        // Todos los conteos, también lo de fuera de la guía que quedó en 0 y no se ve: la base exige uno por conteo y lo salta sola.
        p_lineas: lineasParaCerrar(lineas, conConfirmados, sinAviso, costosPrenda, costosCombinacionesPorLinea()),
        p_nota: nota.trim() ? nota.trim().slice(0, TOPES_CONTEO.notaEnvio) : null,
        p_token: token,
      },
      responsable.firma(),
      preguntaDueno ? duenoId : null,
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
        // Lo que hay que revisar queda a la vista, aunque estuviera plegado.
        const afectadas = grupos.filter((g) => g.lineas.some((l) => atip.some((a) => (a.despachoItemId ? l.linea?.id === a.despachoItemId : !l.linea && l.conteo?.extraPosicion === a.extra))));
        setAbiertas((a) => new Set([...a, ...afectadas.map((g) => g.clave)]));
        if (afectadas.some((g) => cuadran.includes(g))) setVerCuadran(true);
        return;
      }
      const cambio = e.hint === HINT_CONTEO_CAMBIADO;
      setError({ texto: mensajeAlGuardar(e, "cerrar el envío"), recargar: cambio || e.hint === "version_cambiada" });
      if (cambio) {
        setChoque(mensajeAlGuardar(e, "cerrar el envío"));
        onConteoCambiado();
      }
      requestAnimationFrame(() => avisoError.current?.focus());
      return;
    }
    avisar.exito(`${detalle.numero} cerrado`, {
      detalle: resultado && resultado.unidades > 0 ? `${resultado.unidades.toLocaleString("es-PE")} prendas entraron al stock${porDetallar > 0 ? `; ${porDetallar.toLocaleString("es-PE")} quedan para después` : ""}` : porDetallar > 0 ? `${porDetallar.toLocaleString("es-PE")} prendas quedan para después` : undefined,
    });
    yaCerrado.current = true;
    borrarBorradorDelCierre(detalle.id);
    onCerrado();
  }

  /** La línea de la compra donde vive cada prenda: de ahí salen su costo de partida y donde se guarda lo que quien cierra le cambie. */
  const dondeViveEn = (g: GrupoDeLineas, pr: { clave: string; nueva: boolean; nombre: string }) => lineaDeLaPrenda(g, pr.nueva ? { descripcion: pr.nombre } : { productoId: pr.clave });
  /** ¿Se puede cambiar el costo de esta fila? Lo de fuera de la guía sin aviso, solo quien ve el dinero de Compras; un regalo entra a S/ 0. */
  const editaCostoDe = (g: GrupoDeLineas) => !(sinAviso && !g.principal.linea && !veDinero) && !esRegaloFuera(g.principal, decisionDe(g.principal.clave));
  /** Lo que cambió en una fila y quedaría escondido si está cerrada. */
  const cambiosDeLaFila = (g: GrupoDeLineas): { costo: boolean; venta: boolean } => {
    const prendas = g.separado.prendas;
    const editaCosto = editaCostoDe(g);
    const venta = prendas.some((pr) =>
      combinacionesContadas(pr, hoy.porVariante, 0).some((c) => cambiosPrecio[c.varianteId] !== undefined && cambiosPrecio[c.varianteId].valor !== (cambiosPrecio[c.varianteId].valeEn === "sede" ? c.precioSede : c.precioGeneral)),
    );
    const costo =
      editaCosto &&
      (g.lineas.some((x) => decisionDe(x.clave).costo.trim() !== (costoInicial[x.clave] ?? "").trim()) ||
        prendas.some((pr) => {
          const v = dondeViveEn(g, { clave: pr.productoId, nueva: false, nombre: pr.nombre ?? "" }).clave;
          const heredado = costoHeredadoDe(v, pr.productoId);
          return combinacionesContadas(pr, hoy.porVariante, heredado).some((c) => cambiosCosto[c.varianteId] !== undefined && cambiosCosto[c.varianteId] !== heredado);
        }) ||
        prendasConCosto(lineaDelGrupo(g)).some((pr) => {
          const v = dondeViveEn(g, pr).clave;
          const ahora = costoDePrendaTexto(decisionDe(v).costo, costosPrenda[v], pr.clave);
          const antes = costoPrendaInicial[v]?.[pr.clave] ?? costoInicial[v] ?? "";
          return ahora.trim() !== "" && cambioDePrecioDeCompra("", antes, ahora) !== null;
        }));
    return { costo, venta };
  };
  const plegadasConCambios = plegar ? cuadran.filter((g) => { const c = cambiosDeLaFila(g); return c.costo || c.venta; }).length : 0;

  /** Una fila del cierre, con su costo y su precio de venta si está abierta. */
  const filaDe = (g: GrupoDeLineas) => {
    // La categoría como UNA línea: solo para mostrarla (cifras, «para después», prendas con nombre). Lo que se guarda va por las líneas de `g`.
    const l = lineaDelGrupo(g);
    const p = g.principal;
    const hayConteo = g.lineas.some((x) => x.conteo !== null);
    const dif = diferenciaDe(l);
    const deuda = p.proveedor && p.categoria && p.marca ? deudaDe(detalle.deudas, p.proveedor.id, p.categoria.id, p.marca.id) : null;
    const causas = causasDelGrupo(g, deuda?.pendiente ?? 0, sinAviso, deuda?.prendas);
    const dP = decisionDe(p.clave);
    const costo = leerCostoCierre(dP.costo);
    // Un regalo de fuera de la guía entra a S/ 0 (obsequio) sin pedir ningún costo (Felipe 2026-10-28; la base lo hace igual).
    const regaloFuera = esRegaloFuera(p, dP);
    const editaCosto = editaCostoDe(g);
    const prendas = g.separado.prendas;
    const alStock = g.enStock + detalladas(g.separado);
    const para = Math.max(0, g.contadas - alStock);
    const dondeVive = (pr: { clave: string; nueva: boolean; nombre: string }) => dondeViveEn(g, pr);
    // Al abrir la fila solo se ven las prendas con nombre: las identificadas y las nuevas ya descritas (Felipe 2026-10-26: cambiar el costo
    // de lo que no se sabe qué es no tiene sentido). Lo demás se cuenta al final («Hay 2 prendas sin identificar»). Una línea de fuera
    // de la guía es la excepción: su costo es obligatorio y no viene de ninguna orden, así que lleva su campo y se ve abierta.
    const conNombre = prendasConCosto(l);
    const sinIdentificar = unidadesSinIdentificar(l);
    const costoDeLaLineaObligatorio = editaCosto && !p.linea && g.contadas > 0;
    // UN solo aviso para lo que no tiene nombre (Felipe 2026-10-26): cuántas son y a qué costo entran (el de la orden, si la línea venía en
    // la guía). Si no hay ninguna prenda con nombre, ese mismo aviso hace de vacío y dice cuándo se podrá cambiar su costo. Con varias
    // órdenes de costos distintos, el aviso dice entre cuáles.
    const costosDeOrden = g.lineas.map((x) => leerCostoCierre(decisionDe(x.clave).costo).valor).filter((v): v is number => v != null);
    const costoMin = Math.min(...costosDeOrden);
    const costoMax = Math.max(...costosDeOrden);
    const sinIdentificarTexto =
      sinIdentificar > 0
        ? `Hay ${sinIdentificar} ${sinIdentificar === 1 ? "prenda sin identificar" : "prendas sin identificar"}` +
          (p.linea && editaCosto && costosDeOrden.length > 0
            ? costoMin === costoMax
              ? `: cuestan lo que dice la orden (S/\u00a0${costoMin.toFixed(2)}).`
              : `: cuestan lo que dice cada orden (de S/\u00a0${costoMin.toFixed(2)} a S/\u00a0${costoMax.toFixed(2)}).`
            : ".")
        : null;
    // Una fila por modelo con UN solo costo (Felipe 2026-11-03: «Toda la línea» y la prenda eran dos costos para las mismas unidades). Lo raro, un costo o un
    // precio distinto por talla, se abre desde la fila. Lo que no tiene nombre no lleva caja, salvo la línea sin ningún modelo cuyo costo es obligatorio.
    const abierta = abiertas.has(g.clave);
    const idFila = g.principal.clave.replace(":", "-");
    const nombreGrupo = nombreDelGrupoDelCierre(g);
    const contaron = [...new Set(g.lineas.map((x) => x.conteo?.contadoPor?.nombre?.split(" ")[0]).filter((n): n is string => !!n))];
    // Lo que cambió y quedaría escondido: el costo está a la vista en la fila; el precio de venta vive en lo que se abre.
    const { venta: cambiaVenta } = cambiosDeLaFila(g);
    const sinContar = g.lineas.find((x) => x.linea && !x.conteo);
    const filasDelGrupo: (PrendaConCosto | null)[] = conNombre.length > 0 ? conNombre : [null];
    const dePaso = [p.categoria ? marcaDeLinea(p).nombre : null, contaron.length > 0 ? `contó ${contaron.join(" y ")}` : null];
    // Las prendas que se abren; sin ninguna elegida (un costo fuera de lo normal abrió el grupo), todas: lo que hay que corregir no se esconde.
    const elegidas = prendas.filter((pr) => prendasAbiertas.has(`${g.clave}|${pr.productoId}`));
    const conTallas = prendas.filter((pr) => combinacionesContadas(pr, hoy.porVariante, null).length > 0);
    const prendasALaVista = elegidas.length > 0 ? elegidas : conTallas;
    const alternarPrenda = (productoId: string) => {
      const clave = `${g.clave}|${productoId}`;
      const estaba = abierta && prendasAbiertas.has(clave);
      setPrendasAbiertas((a) => {
        const n = new Set(a);
        if (estaba) n.delete(clave);
        else n.add(clave);
        return n;
      });
      const quedan = elegidas.some((pr) => pr.productoId !== productoId);
      setAbiertas((a) => {
        const n = new Set(a);
        if (estaba && !quedan) n.delete(g.clave);
        else n.add(g.clave);
        return n;
      });
    };
    const hayFranja = !!sinContar || causas.length > 0 || para > 0 || regaloFuera || !!sinIdentificarTexto;
    return (
      <div key={g.clave}>
        {filasDelGrupo.map((m, i) => {
          const v = m ? dondeVive(m).clave : p.clave;
          const c = m ? costoDePrenda(v, decisionDe(v).costo, m.clave) : { valor: dP.costo, deLaLinea: dP.costo, antes: costoInicial[p.clave] ?? "", problema: costo.problema };
          const lectura = leerCostoCierre(c.valor.trim() ? c.valor : c.deLaLinea);
          const antes = c.antes.trim();
          const cambio = antes !== "" && lectura.problema === null && lectura.valor !== leerCostoCierre(antes).valor;
          const prendaFila = m && !m.nueva ? prendas.find((pr) => pr.productoId === m.clave) : undefined;
          const heredado = prendaFila ? costoHeredadoDe(v, prendaFila.productoId) : null;
          const combinaciones = prendaFila ? combinacionesContadas(prendaFila, hoy.porVariante, heredado) : [];
          const variosPorTalla = combinaciones.some((x) => cambiosCosto[x.varianteId] !== undefined && cambiosCosto[x.varianteId] !== heredado);
          const abiertaEsta = abierta && !!prendaFila && prendasALaVista.includes(prendaFila);
          const nombre = m?.nombre ?? nombreGrupo.split(" · ")[0];
          const caja = (
            <div>
              <input // unificar-fijo: la caja del sistema dentro de una celda de la tabla, donde el título lo pone la columna
                className="caja-cayla caja-campo w-full max-w-40 text-right font-semibold tabular-nums"
                aria-label={`Costo de ${nombre}`}
                inputMode="decimal"
                value={c.valor}
                // sugerir-fijo: un costo es un monto de soles, no depende de nada elegido antes
                placeholder={sinAviso ? "Sin costo" : c.deLaLinea.trim() ? `S/ ${c.deLaLinea}` : "S/ 0.00"}
                onChange={(e) => {
                  if (!m) return cambiar(p.clave, { costo: e.target.value, confirmaCosto: false });
                  cambiarCostoPrenda(v, m.clave, e.target.value);
                  // Lo que no vino en la guía necesita un costo en su línea: el primero que se escribe lo es, y las prendas sin costo propio lo heredan a la vista.
                  if (costoDeLaLineaObligatorio && !sinAviso && !dP.costo.trim()) cambiar(p.clave, { costo: e.target.value, confirmaCosto: false });
                }}
              />
              {(c.problema || cambio) && <p className={`mt-1 text-sm leading-tight ${c.problema ? "text-rojo-profundo" : "text-taupe"}`}>{c.problema ?? `Antes S/ ${antes}`}</p>}
            </div>
          );
          return (
            <div
              key={m?.clave ?? "linea"}
              className={`grid ${TABLA.fila} ${PLANTILLA_CIERRE} ${abiertaEsta ? "bg-tinta/[0.03]" : ""}`}
              role="row"
            >
              <div className="flex min-w-0 items-center gap-2.5" role="cell">
                <BaldosaCategoria categoria={p.categoria} tamano="chico" />
                <span className="min-w-0">
                  <p className="truncate font-medium text-tinta" title={nombre}>{nombre}</p>
                  <p className="truncate text-sm text-taupe">{[m?.nueva ? "Nueva, se crea después" : null, ...(i === 0 ? dePaso : [])].filter(Boolean).join(" · ") || " "}</p>
                  {cambiaVenta && !abierta && i === 0 && <Chip tono="ambar">Precio de venta cambiado</Chip>}
                </span>
              </div>
              <div className="min-w-0 text-sm" role="cell">
                <span className="campo-etiqueta block @min-[760px]:hidden">Llegó</span>
                {!hayConteo ? (
                  <Chip tono="ambar">Sin contar</Chip>
                ) : filasDelGrupo.length > 1 ? (
                  <b className="tabular-nums text-tinta">{(m?.unidades ?? 0).toLocaleString("es-PE")}</b>
                ) : (
                  <>
                    <b className="tabular-nums text-tinta">{g.contadas.toLocaleString("es-PE")}</b>
                    {g.dijeron != null && <span className="tabular-nums text-taupe"> de {g.dijeron.toLocaleString("es-PE")}</span>}
                    {dif === 0 && causas.length === 0 && <span className="ml-1.5 text-verde">Cuadra</span>}
                  </>
                )}
              </div>
              <div className="min-w-0" role="cell">
                <span className="campo-etiqueta block @min-[760px]:hidden">Costo</span>
                {!editaCosto ? null : variosPorTalla ? (
                  <p className="text-sm text-taupe">Distinto por talla</p>
                ) : i === 0 && costoDeLaLineaObligatorio ? (
                  <CampoGuiado id={idCampoCierre("costo", p.clave)} guia={guia}>
                    {caja}
                  </CampoGuiado>
                ) : m || costoDeLaLineaObligatorio ? (
                  caja
                ) : null}
              </div>
              <div className="flex min-w-0 @min-[760px]:justify-end" role="cell">
                {/* Sin repartir en tallas no hay nada que cambiar por talla: esa prenda solo lleva su costo. */}
                {prendaFila && combinaciones.length > 0 && (
                  <button
                    type="button"
                    onClick={() => alternarPrenda(prendaFila.productoId)}
                    aria-expanded={abiertaEsta}
                    aria-controls={`precios-${idFila}`}
                    aria-label={`${abiertaEsta ? "Esconder" : "Cambiar"} costo y precio por talla de ${nombre}`}
                    className="rc-fila-precios"
                  >
                    Cambiar por talla
                    <ChevronRight aria-hidden className={`h-4 w-4 transition-transform duration-300 ease-cayla ${abiertaEsta ? "rotate-90" : ""}`} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {hayFranja && (
          <div className="space-y-3 border-t border-sand px-5 py-3">
            {sinContar && (
              <CampoGuiado id={idCampoCierre("contar", sinContar.clave)} guia={guia}>
                <Boton type="button" peso="discreto" onClick={() => onVolver(sinContar.clave, decisiones)}>
                  Contarla
                </Boton>
              </CampoGuiado>
            )}
            {!sinContar &&
              causas.map((c) => (
                <CampoGuiado key={c.tipo} id={idCampoCierre("causa", c.lineas[0].clave)} guia={guia} retiene="fila">
                  {/* «Qué pasó» solo cuando algo no cuadra (Felipe 2026-11-03). Una sola respuesta vale para todas las líneas de la categoría. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tono="ambar">{c.tipo === "faltante" ? `Faltan ${c.cantidad}` : !c.lineas[0].linea ? `${c.cantidad} que no venían` : `Sobran ${c.cantidad}`}</Chip>
                    <span className="text-sm text-taupe">¿Qué pasó?</span>
                  </div>
                  <div className="mt-1">
                    <ElegirOpcion
                      chico
                      etiqueta={`Qué pasó con ${nombreGrupo}`}
                      opciones={c.opciones}
                      valor={c.tipo === "faltante" ? decisionDe(c.lineas[0].clave).faltanteCausa : decisionDe(c.lineas[0].clave).sobranteCausa}
                      onValor={(v) => {
                        // «Otro» se explica con la nota de la línea; al dejarlo, lo escrito se suelta (no hay otro lugar donde escribirla).
                        for (const x of c.lineas)
                          cambiar(x.clave, c.tipo === "faltante" ? { faltanteCausa: v as CausaFaltante } : { sobranteCausa: v as CausaSobrante, ...(v === VALOR_OTRO ? {} : { nota: "" }) });
                      }}
                    />
                    {/* Qué debe este proveedor de esto, con el nombre de cada prenda (ADR-0604): se contesta mirando lo que se tiene en la mano. */}
                    {c.opciones.some((o) => o.valor === VALOR_REPOSICION) && (
                      <p className="mt-2 text-sm text-taupe">
                        {decisionDe(c.lineas[0].clave).sobranteCausa === VALOR_REPOSICION ? c.opciones.find((o) => o.valor === VALOR_REPOSICION)?.ayuda : c.opciones.find((o) => o.valor === VALOR_REPOSICION)?.aviso}
                      </p>
                    )}
                    {c.tipo === "sobrante" && decisionDe(c.lineas[0].clave).sobranteCausa === VALOR_OTRO && (
                      <CampoTexto
                        className="mt-2"
                        etiqueta="¿Qué pasó exactamente?"
                        value={decisionDe(c.lineas[0].clave).nota}
                        maxLength={TOPES_CONTEO.nota}
                        // sugerir-fijo: lo que pasó con lo de más no depende de nada elegido antes
                        placeholder="Ej. El proveedor mandó una muestra"
                        onChange={(e) => {
                          for (const x of c.lineas) cambiar(x.clave, { nota: e.target.value });
                        }}
                      />
                    )}
                  </div>
                </CampoGuiado>
              ))}
            {para > 0 && (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <Chip tono="pizarra">{para.toLocaleString("es-PE")} para después</Chip>
                <span className="text-sm text-taupe">{detalleParaDespues(l).join(" · ")}</span>
              </div>
            )}
            {regaloFuera && (
              <p className="text-sm text-taupe" data-regalo-sin-costo>
                Es un regalo: entra con costo S/&nbsp;0.00 (obsequio), sin que escribas nada.
              </p>
            )}
            {sinIdentificarTexto && (
              <p className="text-sm text-taupe" data-sin-identificar={sinIdentificar}>
                {sinIdentificarTexto}
              </p>
            )}
          </div>
        )}
        {abierta && prendasALaVista.length > 0 && (
          <div id={`precios-${idFila}`} className="space-y-3 border-t border-sand bg-tinta/[0.02] px-5 py-4" data-precios-de={g.clave}>
            {prendasALaVista.map((pr) => {
              const v = dondeVive({ clave: pr.productoId, nueva: false, nombre: pr.nombre ?? "" }).clave;
              const clave = `${g.clave}|${pr.productoId}`;
              return (
                <div key={clave} data-prenda-comb-id={pr.productoId}>
                  <PrendaConCombinaciones
                    nombre={pr.nombre ?? pr.codigo ?? "La prenda"}
                    unidades={pr.cantidad}
                    categoria={{ prefijo: p.categoria?.prefijo ?? null, familia: p.categoria?.familia ?? null, categoria: p.categoria?.nombre ?? null }}
                    combinaciones={combinacionesContadas(pr, hoy.porVariante, costoHeredadoDe(v, pr.productoId))}
                    abierta
                    onAlternar={() => alternarPrenda(pr.productoId)}
                    cambiosCosto={cambiosCosto}
                    cambiosPrecio={cambiosPrecio}
                    puedeCosto={editaCosto}
                    sede={sede}
                    soloSede={soloSede}
                    totalActivas={hoy.activasPorPrenda[pr.productoId] ?? null}
                    rechazo={rechazosPrecio[pr.productoId] ?? null}
                    onCosto={(ids, valor) => cambiarCosto(ids, valor)}
                    onPrecio={(ids, valor, valeEn) => cambiarPrecio(pr.productoId, ids, valor, valeEn)}
                    onQuitar={(cifra, ids) => deshacerCambios(pr.productoId, cifra, ids)}
                    guia={clave === primeraPrenda ? "recepcion.prenda-fila" : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

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
      {/* «Cerrar el conteo» trae hasta aquí: todavía falta este paso (Felipe 2026-11-03). */}
      <TituloSeccion>Revisa y cierra</TituloSeccion>
      {modelosEnCero.length > 0 && (
        <p className="nota-cayla text-sm">
          <b className="text-tinta">{textoModelosEnCero(modelosEnCero)}</b> Si sí llegaron, vuelve a contarlos.
        </p>
      )}
      {reabierto && (
        <Aviso tono="info" titulo="Lo cierras de nuevo">
          Lo que ya entró al stock queda donde está. Lo que faltó o sobró se vuelve a anotar con lo que diga este cierre.
        </Aviso>
      )}

      {verRecuperado && (
        <Aviso
          tono="info"
          chico
          accion={
            <button type="button" className="btn-cayla btn-enlace" onClick={empezarDeCero}>
              Empezar de cero
            </button>
          }
        >
          Lo que habías decidido sigue aquí.
        </Aviso>
      )}

      <Tabla guia="recepcion.tabla-cierre" className="@container">
        {(!plegar || piden.length > 0 || verCuadran) && <Encabezado
          visible="hidden @min-[760px]:grid"
          plantilla={PLANTILLA_CIERRE}
          columnas={[
            { titulo: "Modelo" },
            { titulo: "Llegó" },
            { titulo: "Costo" },
            { titulo: <span className="sr-only">Costo y precio de venta por talla</span> },
          ]}
        />}
            {piden.map((g) => filaDe(g))}
            {plegar ? (
              <>
                <FilasDeMas abierto={verCuadran} id="rc-cierre-plegadas">
                  {cuadran.map((g) => filaDe(g))}
                </FilasDeMas>
                <BotonVerMas abierto={verCuadran} onCambiar={setVerCuadran} controla="rc-cierre-plegadas" texto={textoDeLasPlegadas(cuadran.length, plegadasConCambios, sinAviso, piden.length === 0)} data-guia="recepcion.plegadas" />
              </>
            ) : (
              cuadran.map((g) => filaDe(g))
            )}
      </Tabla>

      {/* UN solo mensaje debajo de la tabla (Felipe 2026-10-28): lo que pasa al apretar «Cerrar». Antes había otros dos: las reglas del costo (la fila abierta
          ya muestra sus cajas con su «Antes» y la confirmación lista lo que cambia) y «¿Alguna llegó dañada?» (eso se anota al contar, en «Anotar observación»). */}
      {(porDetallar > 0 || sinAviso) && (
        <p className="nota-cayla">
          {sinAviso ? "Lo que llega sin aviso no tiene con qué compararse: nada sobra ni falta. " : ""}
          {porDetallar > 0
            ? `Cerrar el envío deja el conteo oficial y ${porDetallar.toLocaleString("es-PE")} ${porDetallar === 1 ? "prenda" : "prendas"} para después (separar, poner tallas y colores, crear lo nuevo). Hoy se pueden vender las que ya tienen tallas y colores; el resto, cuando se termine cada pendiente.`
            : ""}
        </p>
      )}

      {/* La balanza de todo el envío se fue (Formidable 2026-10-29): cada fila y la barra de abajo ya dicen cuánto dijeron y cuánto se contó. */}

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

      {/* De quién llegó, marca por marca (Felipe 2026-11-07): lo sin aviso casi nunca es de un solo proveedor. La marca ya lo dice casi siempre; lo que no
          se puede saber (una marca con dos proveedores, o «Sin marca») se elige aquí y se guarda al elegirlo. */}
      {deQuien.length > 0 && (
        <section data-guia="recepcion.de-quien" className="card-cayla space-y-3 p-4 sm:p-5" aria-label="De quién llegó">
          <TituloSeccion cuenta={deQuien.length > 1 ? deQuien.length : undefined}>De quién llegó</TituloSeccion>
          <ul className="divide-y divide-sand">
            {deQuien.map((f) => {
              const id = idCampoProveedor(f.clave);
              const fila = (
                <div className="grid items-center gap-x-4 gap-y-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]">
                  <p className="min-w-0">
                    <b className="block truncate text-[15px] font-semibold text-tinta">{f.marca?.nombre ?? "Sin marca"}</b>
                    <span className="block text-sm text-taupe">
                      {f.prendas.toLocaleString("es-PE")} {f.prendas === 1 ? "prenda" : "prendas"}
                      {f.proveedor && !puestos[f.clave] ? " · lo dice su marca" : ""}
                      {f.varios ? " · trae más de un proveedor" : ""}
                    </span>
                  </p>
                  <CampoSelect
                    etiqueta={f.proveedor ? "Proveedor" : guia.etiqueta(id, "Proveedor")}
                    valor={f.proveedor?.id ?? ""}
                    onValor={(v) => void ponerDeQuien(f, v)}
                    opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))}
                    marcador="Elige el proveedor"
                    deshabilitado={poniendo !== null || guardando}
                    tono={errorDeQuien?.clave === f.clave ? "error" : undefined}
                    pie={errorDeQuien?.clave === f.clave ? errorDeQuien.texto : undefined}
                    sinPie={errorDeQuien?.clave !== f.clave}
                  />
                </div>
              );
              return (
                <li key={f.clave}>
                  {f.proveedor ? (
                    fila
                  ) : (
                    <CampoGuiado id={id} guia={guia}>
                      {fila}
                    </CampoGuiado>
                  )}
                </li>
              );
            })}
          </ul>
          {deQuien.some((f) => !f.proveedor) && (
            <p className="text-sm text-taupe">Pregúntale a Compras lo que falta: sin proveedor no entra al stock, porque el lote, el costo y la factura se unen por él.</p>
          )}
        </section>
      )}

      {preguntaDueno && empresasDeLaSede && (
        <CampoGuiado id="hacer-ahora-dueno" guia={guia} className="card-cayla p-4 sm:p-5">
          <DuenoDeLoQueEntra empresas={empresasDeLaSede} duenoId={duenoId} onElegir={setDuenoId} deshabilitado={guardando} />
        </CampoGuiado>
      )}

      <CampoGuiado id="responsable" guia={guia} className="card-cayla p-4 sm:p-5">
        <p className="mb-2 text-sm font-semibold text-tinta">{guia.etiqueta("responsable", "Quién cierra el conteo")}</p>
        <ComboResponsable control={responsable} />
        {!sinAviso && <p className="mt-2 text-sm text-taupe">Quien hizo una orden no puede cerrar su envío (solo un Admin cierra lo que él mismo compró): firma otra persona de la tienda.</p>}
      </CampoGuiado>

      {choque && (
        <Modal titulo="Cambió el conteo mientras cerrabas" onClose={() => setChoque(null)} conCerrar>
          <div className="space-y-3 text-sm">
            <p className="text-tinta">{choque}</p>
            <p className="text-taupe">No se cerró nada y el stock no se tocó. La pantalla ya trajo lo último: mira lo contado y vuelve a cerrar.</p>
          </div>
        </Modal>
      )}

      {error && (
        <Aviso ref={avisoError} enfocable tono="error" titulo="No se pudo cerrar">
          {error.texto}
          {error.recargar && !/vuelve a cerrar/i.test(error.texto) && " Revisa lo contado y vuelve a cerrar."}
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
              onCorregir={() => {
                const primero = atipicos[0];
                setAtipicos(null);
                if (primero) irAlCostoAtipico(primero);
              }}
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
              {sinGuardar > 0 && (
                <Aviso
                  tono="error"
                  chico
                  accion={
                    <button type="button" className="btn-cayla btn-enlace" onClick={onReintentarGuardado}>
                      Reintentar
                    </button>
                  }
                >
                  {sinGuardar === 1 ? "Una línea no se pudo guardar" : `${sinGuardar} líneas no se pudieron guardar`}: hasta guardarlas no se puede cerrar.
                </Aviso>
              )}
              <PieGuia guia={guia} tope={2} listo={porDetallar > 0 ? "Todo listo: lo guardado no frena el cierre." : "Todo listo para cerrar."} />
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <Volver onClick={() => onVolver(undefined, decisiones)} a="contar" deshabilitado={guardando} />
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  textoCargando="Cerrando…"
                  disabled={esperandoGuardar} confirma={guia}
                  title={sinGuardar > 0 ? "Hay líneas que no se pudieron guardar" : esperandoGuardar ? "Espera: lo último que contaste se está guardando" : (guia.frase ?? undefined)}
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
