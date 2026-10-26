"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, FunnelX, SearchX, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Proveedor, ResumenProveedores } from "@/lib/proveedores";
import { ProveedorModal, BORRADOR_VACIO, type Borrador } from "@/components/ProveedorModal";
import { ProveedorVistaRapida } from "@/components/ProveedorVistaRapida";
import { ProveedoresIndicadores } from "@/components/ProveedoresIndicadores";
import { MedidaDelRanking, ProveedoresRanking } from "@/components/ProveedoresRanking";
import { ProveedoresLoQueNoSeVe } from "@/components/ProveedoresLoQueNoSeVe";
import { ProveedoresComparar } from "@/components/ProveedoresComparar";
import { BarraDeAbajo, BarraDeAbajoResumen } from "@/components/ui/BarraDeAbajo";
import type { Hallazgo } from "@/lib/proveedor-analisis-reglas";
import { celdaDeFila, resumenTallasYSedes, type CeldaTallaSede } from "@/lib/proveedor-tallas-sedes-reglas";
import { RITMOS, alternarComparar, porqueDelRitmo, contarPorRitmo, filasDelRanking, pasaFiltroRanking, totalesDelRanking, valorDe, type ClaseRitmo, type FiltroRanking, type MedidaRanking } from "@/lib/proveedores-ranking-reglas";
import type { RendimientoProveedor } from "@/lib/proveedor-prendas-reglas";
import { soles } from "@/lib/compras-reglas";
import { clave } from "@/lib/buscar-prenda-v2";
import { ETIQUETA_TIPO_PROVEEDOR, chipEntregas, haceCuanto, marcasParaMostrar, ordenarProveedores, repartoDeuda, rubrosConConteo, siguienteOrden, resumenSoloMercaderia, sinDatosDePago, textoBuscableProveedor, tieneRubro, type CampoOrden, type MarcasDeProveedor, type Orden, type TipoProveedor } from "@/lib/proveedores-reglas";
import { useFlip } from "@/lib/useFlip";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Resaltado } from "@/components/ui/Resaltado";
import { Sparkline } from "@/components/ui/Sparkline";
import { Tabla, Encabezado, fila, celda, type Columna } from "@/components/ui/Tabla";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Buscador } from "@/components/ui/Buscador";
import { Pestanas } from "@/components/ui/Pestanas";
import { Vacio } from "@/components/ui/Vacio";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// La tabla de líder gana columnas según el ANCHO DE LA TABLA, no el de la ventana (container queries de
// Tailwind: `@3xl`, `@5xl`, `@7xl` miden el contenedor `@container` de <Tabla>). Con el menú lateral abierto
// y el margen de la página, la tabla es ~350 px más angosta que la ventana: una tabla que decide por la
// ventana cree que le sobra sitio y aplasta el nombre hasta dejarlo en «C…». El NOMBRE es la única columna
// flexible y nunca se sacrifica; lo que se baja primero es lo que se puede leer en otro lado
// (RUC y «Última compra» están en la vista rápida y en la ficha; «A favor» y «Entregas» en la ficha).
//   · < 48 rem   : proveedor · saldo (y toda la fila abre la vista rápida)
//   · ≥ 48 rem   : proveedor · facturado 12 m · saldo · acción
//   · ≥ 64 rem   : + a favor · entregas
//   · ≥ 80 rem   : + RUC · última compra  (la maqueta 08 completa)
// Dos plantillas de fila (líder / colaborador), no una con columnas ocultas: lo financiero es solo de
// líder — corrección de D-27, 2026-09-17 (ver 20260917240000_proveedores_lista_indicadores_y_candado_sede.sql).
// Un colaborador ve el directorio puro (Proveedor · RUC); ni la base le manda esos números
// (fn_proveedores() los devuelve NULL), así que ocultar la columna acá es la segunda capa, no la única.
const COLUMNAS_LIDER =
  "grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,1fr)_9.75rem_7.5rem_9rem] @5xl:grid-cols-[minmax(0,1fr)_9.75rem_7.5rem_6.5rem_8rem_9.25rem] @7xl:grid-cols-[minmax(0,1fr)_6.75rem_9.75rem_7.5rem_6.5rem_8rem_6.5rem_9.25rem]";
const PLANTILLA_BASE = "sm:grid-cols-[1fr_8rem]";

// Directorio de proveedores: a quién se le compra. Es la puerta de entrada del módulo — sin un
// proveedor registrado no se puede registrar su comprobante (`compras.proveedor_id` es FK dura), y
// hasta hoy el único camino era el SQL Editor. Alta y edición pasan por RPC (registrar_proveedor /
// actualizar_proveedor); desactivar nunca borra — los comprobantes históricos siguen diciendo de
// quién fueron.
//
// ADR-0111 (maqueta 08): la lista ahora ayuda a decidir. Arriba, cuatro cifras (a quién se le debe,
// cuánta deuda concentra uno solo, quiénes llevan meses sin comprar). En la tabla, «Facturado · 12 m»
// (lo reciente pesa más que «desde siempre»), «Saldo» en rojo si ya venció algo, «Entregas» (lo que
// hay que reclamar), columnas ordenables (por defecto por saldo) y «+ Comprobante» en la fila.
// Un filtro por rubro con conteo — el rubro ya se guardaba y se veía por fila, faltaba poder filtrar. Desde
// ADR-0213 un proveedor tiene varios: aparece bajo cada uno, y el conteo de cada botón es de proveedores (por eso
// la suma de los botones puede pasar de «Todos»).
//
// ADR-0128 (spike visual 2026-09-19): la lista RESPONDE. Tocar una fila abre una vista rápida (cajón)
// sin perder el orden ni el filtro; ordenar y filtrar deslizan las filas a su lugar (FLIP); el filtro
// de rubro tiene un pulgar que viaja; la búsqueda marca dónde coincidió; la barra de concentración
// enciende la fila del proveedor al que apuntas; y lo recién creado, reactivado o desactivado se marca
// con un destello. Desactivar se puede deshacer (7 s). Al llegar, las piezas entran escalonadas (cifras,
// buscador, tabla, filas: `anim-entra` con `--i`) y las cifras y trazos se arman una vez — regla de
// movimiento revisada el 2026-09-19 (globals.css, ADR-0128). Lo demás responde a una acción.
//
// ADR-0134: un chip ámbar «Sin datos de pago» marca al proveedor activo al que todavía no se le puede pagar por
// transferencia ni Yape/Plin (sin cuenta, sin CCI y sin celular de billetera; quien cobra en efectivo NO se marca:
// no le falta nada), y un filtro con su conteo — solo si hay alguno — para ir a completarlos de una vez. Se resuelve en
// el cliente como el rubro: el directorio entero ya está en la página. Los desactivados no se marcan: ya no se les paga.
//
// ADR-0140: el nombre es la razón social («Textil Ejemplo SAC») pero el equipo conoce al proveedor por su marca («Kero»).
// La búsqueda también mira las marcas y cada fila las muestra como etiquetas (las que coinciden con lo escrito van
// primero y resaltadas). Las marcas llegan aparte de `fn_proveedores()` (tablas `marcas` y `marca_proveedores`) y son
// opcionales: si su lectura falla llega `null` y la lista se pinta como antes.
//
// Dos llaves (ADR-0161 P3, 20260923140000 — antes era un solo `esLider`):
//  · `verMontos` (`verDineroCompras`): lo financiero — las cifras de arriba, las columnas de dinero, la vista rápida.
//  · `puedeEditar` (el módulo Proveedores, `editarCuentasProveedor` = `fn_puede_gestionar_proveedores`): registrar, abrir la
//    ficha (datos, cuentas, devoluciones, editar y desactivar) y el aviso «Sin datos de pago».
// Quien tiene Proveedores sin los montos ve el directorio y entra a la ficha, sin una sola cifra de dinero.
//
// Ranking (dirección «C», elegida por Felipe el 2026-10-26; docs/maquetas/proveedores-v5-2026-10/): con los montos y el rendimiento a mano, la
// pestaña Mercadería deja de ser el directorio y pasa a ser un ranking (`ProveedoresRanking`): del que más le compras al que menos, con cuánto se
// vendió y en cuántas semanas se vende lo que queda, filtrable por ese ritmo. Los activos sin compras van al final («Sin compras todavía», con las
// filas del directorio), los desactivados como siempre, y tocar una fila abre la misma vista rápida. Servicios sigue siendo el directorio.
export function ProveedoresPanel({
  proveedores,
  verMontos,
  puedeEditar,
  resumen,
  series,
  marcas,
  rendimiento = null,
  hoy,
  hallazgos = null,
  ventas = null,
}: {
  proveedores: Proveedor[];
  verMontos: boolean;
  puedeEditar: boolean;
  /** Las cifras de arriba; `null` para quien no ve los montos de Compras. */
  resumen: ResumenProveedores | null;
  /** Facturado por mes por proveedor (12 montos); `null` si no hay serie disponible → sin tendencias. */
  series: Record<string, number[]> | null;
  /** Marcas de cada proveedor (ADR-0140); `null` si no se pudieron leer → sin marcas ni búsqueda por marca. */
  marcas: MarcasDeProveedor | null;
  /** Lo comprado y vendido de cada proveedor (`fn_proveedores_rendimiento`); `null` sin los montos o si la base no lo tiene → el directorio de siempre. */
  rendimiento?: RendimientoProveedor[] | null;
  /** La fecha de Lima de hoy (la pone el servidor): desde cuándo se mide el ritmo. */
  hoy: string;
  /** Los avisos de compra de toda la cartera (`hallazgosDeCartera`): en el ranking van a la columna derecha. */
  hallazgos?: Hallazgo[] | null;
  /** Lo vendido por día en los últimos 28 días de cada proveedor (`seriesDeVentas`); `null` si la base no lo tiene → filas sin línea. */
  ventas?: Record<string, number[]> | null;
}) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // Qué clase de proveedor se mira (20261024222000): la ropa que se compra, o los servicios que se pagan (Entel, luz, agua, alquiler).
  const [tipo, setTipo] = useState<TipoProveedor>("mercaderia");
  const [rubro, setRubro] = useState<string | null>(null); // clave normalizada; null = todos
  const [soloSinPago, setSoloSinPago] = useState(false);
  const [orden, setOrden] = useState<Orden>({ campo: "saldo", dir: "desc" });
  const [abiertoId, setAbiertoId] = useState<string | null>(null); // el proveedor de la vista rápida
  const [filtroRitmo, setFiltroRitmo] = useState<FiltroRanking>(null); // el ranking: por ritmo o con deuda vencida
  const [verTodos, setVerTodos] = useState(false); // el ranking: más allá de las primeras 20 filas
  const [medida, setMedida] = useState<MedidaRanking>("prendas"); // el ranking: por prendas compradas o por dinero gastado
  const [puestosAntes, setPuestosAntes] = useState<ReadonlyMap<string, number> | null>(null); // los puestos de antes de cambiar de medida
  const [comparar, setComparar] = useState<readonly string[]>([]); // el ranking: hasta 3 marcados para compararlos a la derecha
  const [foco, setFoco] = useState<string | null>(null); // el tramo de la barra de concentración al que se apunta
  const [recientes, setRecientes] = useState<ReadonlySet<string>>(new Set());
  const pendienteScroll = useRef<string | null>(null);

  // Búsqueda en memoria: el directorio entero ya está en la página (son decenas de proveedores, no
  // miles), así que filtrar acá es instantáneo y no cuesta una consulta por tecla. Busca por nombre, marca,
  // RUC y contacto, sin tildes ni mayúsculas (misma `clave` que el buscador de Vender).
  const k = clave(busqueda);
  // Con algo escrito en el buscador se busca en TODOS los tipos (quien busca «Entel» no tiene por qué saber en qué pestaña está); sin
  // búsqueda, la lista, los rubros y los conteos son del tipo elegido.
  const delTipo = useMemo(() => proveedores.filter((p) => p.tipo === tipo), [proveedores, tipo]);
  const rubros = useMemo(() => rubrosConConteo(delTipo.filter((p) => p.activo)), [delTipo]);
  const nDeTipo = useMemo(() => ({ mercaderia: proveedores.filter((p) => p.activo && p.tipo === "mercaderia").length, servicios: proveedores.filter((p) => p.activo && p.tipo === "servicios").length }), [proveedores]);
  // Solo quien edita proveedores: el filtro (y su conteo) no le sirve a quien no puede completar los datos.
  const faltaPago = (p: Proveedor) => puedeEditar && p.activo && sinDatosDePago(p);
  const nSinPago = delTipo.filter(faltaPago).length;
  // Si al completar los datos ya no queda ninguno, el filtro deja de aplicar (y su botón desaparece): no se queda una lista vacía.
  const filtrarSinPago = soloSinPago && nSinPago > 0;
  const marcasDe = (id: string): readonly string[] => marcas?.[id] ?? [];
  // Solo se promete «marca» si hay marcas que buscar: sin lectura (`null`) o sin ningún vínculo, sería una promesa vacía.
  const hayMarcas = !!marcas && Object.keys(marcas).length > 0;
  const coincide = (p: Proveedor) =>
    (k ? clave(textoBuscableProveedor(p, marcasDe(p.id))).includes(k) : p.tipo === tipo) && (!rubro || tieneRubro(p, rubro)) && (!filtrarSinPago || faltaPago(p));
  const activos = ordenarProveedores(
    proveedores.filter((p) => p.activo && coincide(p)),
    orden,
  );
  const desactivados = proveedores.filter((p) => !p.activo && coincide(p));
  const totalActivos = delTipo.filter((p) => p.activo).length;
  const hayProveedores = proveedores.some((p) => p.activo);
  const filtrando = !!k || !!rubro || filtrarSinPago;
  const reparto = useMemo(() => repartoDeuda(proveedores.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre, saldo: p.saldo }))), [proveedores]);
  const maxSaldo = Math.max(1, ...proveedores.filter((p) => p.activo).map((p) => p.saldo ?? 0));
  // El ranking: solo en Mercadería, con los montos y el rendimiento a mano. Los mismos filtros del directorio (búsqueda, rubro, sin datos de pago)
  // más el del ritmo; los activos sin compras van al final y no tienen ritmo, así que un filtro de ritmo los esconde.
  const enRanking = verMontos && tipo === "mercaderia" && !!rendimiento;
  const porId = useMemo(() => new Map(proveedores.map((p) => [p.id, p])), [proveedores]);
  const ranking = useMemo(
    () => (enRanking && rendimiento ? filasDelRanking(rendimiento, new Set(proveedores.filter((p) => p.activo && p.tipo === "mercaderia").map((p) => p.id)), hoy, medida) : null),
    [enRanking, rendimiento, proveedores, hoy, medida],
  );
  // Con compras = en el ranking o el Taller (que va aparte en su propia línea): ninguno de los dos va a «Sin compras todavía».
  const conCompras = new Set([...(ranking?.filas.map((f) => f.proveedorId) ?? []), ...(ranking?.taller ? [ranking.taller.proveedorId] : [])]);
  const vencidoDe = (id: string) => (porId.get(id)?.saldo_vencido ?? 0) > 0;
  const filasRanking = (ranking?.filas ?? []).filter((f) => {
    const p = porId.get(f.proveedorId);
    return !!p && coincide(p) && pasaFiltroRanking(f, filtroRitmo, vencidoDe(f.proveedorId));
  });
  const sinCompras = enRanking ? activos.filter((p) => p.tipo === "mercaderia" && !conCompras.has(p.id) && (!filtroRitmo || (filtroRitmo === "vencido" && vencidoDe(p.id)))) : [];
  // Los marcados para comparar, en el orden en que se marcaron; uno que ya no está en el ranking (lo desactivaron) se cae solo. Un filtro o
  // la búsqueda no los sacan: se comparan aunque la lista ya no los muestre.
  const comparados = comparar.map((id) => ranking?.filas.find((f) => f.proveedorId === id)).filter((f): f is NonNullable<typeof f> => !!f);
  const alComparar = (id: string) => setComparar((c) => alternarComparar(c, id));
  // Las tallas y las sedes de cada proveedor que se abre o se compara (ADR-0521, actividad 6): se piden desde el navegador al abrirlo, una sola vez
  // por proveedor. Sin la función en la base o sin respuesta, esas secciones no se dibujan (`null`); mientras llegan, `undefined`.
  const [tallasDe, setTallasDe] = useState<ReadonlyMap<string, readonly CeldaTallaSede[] | null>>(new Map());
  const tallasPedidas = useRef(new Set<string>());
  useEffect(() => {
    if (!enRanking) return;
    const faltan = [...new Set([abiertoId, ...comparar])].filter((id): id is string => !!id && !tallasPedidas.current.has(id));
    if (faltan.length === 0) return;
    const supabase = createClient();
    for (const id of faltan) {
      tallasPedidas.current.add(id);
      void supabase.rpc("fn_proveedor_tallas_sedes", { p_proveedor_id: id }).then(({ data, error }) => {
        setTallasDe((m) => new Map(m).set(id, error || !data ? null : data.map(celdaDeFila)));
      });
    }
  }, [enRanking, abiertoId, comparar]);
  const tallasYSedesDe = (id: string) => {
    if (!tallasDe.has(id)) return undefined;
    const celdas = tallasDe.get(id);
    return celdas ? resumenTallasYSedes(celdas, hoy) : null;
  };
  // El porqué de la insignia, para la vista rápida: solo de quien está en el ranking (el Taller y los sin compras no tienen ritmo).
  const ritmoDe = (id: string) => {
    const f = ranking?.filas.find((x) => x.proveedorId === id);
    return f ? { palabra: RITMOS[f.clase].palabra, tono: RITMOS[f.clase].tono, ...porqueDelRitmo(f) } : null;
  };
  const conteoRitmo = contarPorRitmo(ranking?.filas ?? []);
  const totales = totalesDelRanking(ranking?.filas ?? []);
  // Cambiar de medida reordena: se guardan los puestos de antes para que cada fila diga cuántos subió o bajó (y las filas se deslizan con `useFlip`).
  const cambiarMedida = (m: MedidaRanking) => {
    if (m === medida) return;
    setPuestosAntes(new Map((ranking?.filas ?? []).map((f) => [f.proveedorId, f.puesto])));
    setMedida(m);
  };
  // Con algo escrito, el directorio busca en los dos tipos; el ranking es de Mercadería, así que avisa si coincide alguno de Servicios.
  const enServicios = enRanking && k ? proveedores.filter((p) => p.activo && p.tipo === "servicios" && clave(textoBuscableProveedor(p, marcasDe(p.id))).includes(k)).length : 0;
  const refFila = useFlip((enRanking ? [...filasRanking.map((f) => f.proveedorId), ...sinCompras.map((p) => p.id)] : activos.map((p) => p.id)).join("|"));

  // Lo que se recorre con ↑ ↓ en la vista rápida: las filas que se ven, activos primero (en el ranking, en su orden).
  const navegables = enRanking ? [...filasRanking.map((f) => porId.get(f.proveedorId)).filter((p): p is Proveedor => !!p), ...sinCompras, ...desactivados] : [...activos, ...desactivados];
  const abierto = abiertoId ? (proveedores.find((p) => p.id === abiertoId) ?? null) : null;
  const indiceAbierto = abierto ? navegables.findIndex((p) => p.id === abierto.id) : -1;

  const marcarReciente = useCallback((id: string) => {
    setRecientes((r) => new Set(r).add(id));
    // 4 s > los 2,6 s del destello: el reloj arranca al guardar, pero la fila nueva recién se pinta
    // cuando termina `router.refresh()`; con 2,7 s el destello se cortaba a la mitad.
    setTimeout(() => setRecientes((r) => new Set([...r].filter((x) => x !== id))), 4000);
  }, []);

  // Un proveedor recién registrado puede caer fuera de pantalla (por saldo queda al final): se lleva a la vista.
  useEffect(() => {
    const id = pendienteScroll.current;
    if (!id) return;
    const el = document.querySelector(`[data-proveedor-id="${id}"]`);
    if (!el) return;
    pendienteScroll.current = null;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [proveedores]);

  async function onCambiarEstado(p: Proveedor, esDeshacer = false) {
    setCambiandoId(p.id);
    const supabase = createClient();
    const { error } = await supabase.rpc(p.activo ? "desactivar_proveedor" : "reactivar_proveedor", { p_proveedor_id: p.id });
    setCambiandoId(null);
    if (error) {
      avisar.error(traducirError(error, p.activo ? "desactivar el proveedor" : "reactivar el proveedor"));
      return;
    }
    avisar.exito(p.activo ? `${p.nombre} desactivado` : `${p.nombre} reactivado`, {
      detalle: p.activo ? "Deja de aparecer al registrar comprobantes; su historial se conserva." : "Vuelve a aparecer al registrar comprobantes.",
      // Deshacer = la operación contraria sobre el mismo proveedor. Nada se borra nunca (desactivar es un
      // estado), así que deshacer es exacto; y no se ofrece deshacer de un deshacer, para no encadenar avisos.
      accion: esDeshacer ? undefined : { texto: "Deshacer", onClick: () => void onCambiarEstado({ ...p, activo: !p.activo }, true) },
      duracion: esDeshacer ? undefined : 7000,
    });
    marcarReciente(p.id);
    router.refresh();
  }

  function vecino(delta: 1 | -1) {
    if (navegables.length === 0 || indiceAbierto < 0) return;
    const sig = navegables[(indiceAbierto + delta + navegables.length) % navegables.length];
    setAbiertoId(sig.id);
    document.querySelector(`[data-proveedor-id="${sig.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const Fila = verMontos ? FilaLider : FilaBase;
  const filtrandoTodo = filtrando || (enRanking && !!filtroRitmo);
  const nVisibles = enRanking ? filasRanking.length + sinCompras.length + desactivados.length : activos.length + desactivados.length;
  const etiquetaFiltroRitmo = filtroRitmo === "vencido" ? "Con deuda vencida" : filtroRitmo ? RITMOS[filtroRitmo].palabra : "";
  // Las píldoras del ritmo, con su cuenta; las que no tienen a nadie no se dibujan.
  const opcionesRitmo: { c: FiltroRanking; texto: string; n: number; ayuda?: string }[] = [
    { c: null, texto: "Todos", n: ranking?.filas.length ?? 0 },
    ...(["rapido", "medio", "lento", "nomide"] as ClaseRitmo[]).map((c) => ({ c, texto: RITMOS[c].palabra, n: conteoRitmo[c], ayuda: RITMOS[c].ayuda })),
    { c: "vencido" as const, texto: "Con deuda vencida", n: (ranking?.filas ?? []).filter((f) => vencidoDe(f.proveedorId)).length },
  ].filter((o) => o.c === null || o.n > 0);
  const rubrosSugeridos = rubros.map((r) => r.etiqueta);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Proveedores"
        subtitulo="A quién se le compra. Un proveedor tiene que estar acá antes de poder registrar su comprobante."
        acciones={
          puedeEditar && (
            <Boton peso="primario" onClick={() => setBorrador({ ...BORRADOR_VACIO, tipo })} aria-haspopup="dialog" data-guia="proveedores.registrar">
              <span className="flex items-center gap-2">
                <span aria-hidden>+</span> Registrar proveedor
              </span>
            </Boton>
          )
        }
      />

      {/* En el ranking, lo de estas cifras (la deuda, lo vencido, lo que te deben, los que no reciben compras) va a la columna derecha. */}
      {verMontos && resumen && tipo === "mercaderia" && !enRanking && <ProveedoresIndicadores resumen={resumenSoloMercaderia(resumen, proveedores)} reparto={reparto} foco={foco} onFoco={setFoco} onAbrir={setAbiertoId} />}

      <ConLado
        lado={
          enRanking && ranking ? (
            // Al comparar, «Comparar» entra arriba y «Para hoy» se queda debajo (Formidable 2026-10-26): lo vencido y las entregas atrasadas
            // no se ven en otro lado de la pantalla. Más angosto que 1280 px, el margen de abajo deja ver lo último sobre la isla.
            <div className={comparados.length > 0 ? "space-y-4 max-xl:pb-28" : undefined}>
              {comparados.length > 0 && (
                <ProveedoresComparar
                  filas={comparados}
                  proveedores={porId}
                  medida={medida}
                  ventas={ventas}
                  onQuitar={alComparar}
                  onQuitarTodos={() => setComparar([])}
                  onAbrir={setAbiertoId}
                  tallasYSedesDe={tallasYSedesDe}
                />
              )}
              <ProveedoresLoQueNoSeVe
                proveedores={proveedores.filter((p) => p.activo && p.tipo === "mercaderia")}
                resumen={resumen ? resumenSoloMercaderia(resumen, proveedores) : null}
                filas={ranking.filas}
                medida={medida}
                hallazgos={hallazgos ?? []}
                onAbrir={setAbiertoId}
                soloHoy={comparados.length > 0}
              />
            </div>
          ) : null
        }
      >
      {/* Buscador + filtro por rubro con conteo. Una sola línea: el buscador a la izquierda, los rubros
          a la derecha; en celular los rubros bajan y se desplazan en horizontal. */}
      {hayProveedores && (
        <Pestanas
          guia="proveedores.tipos"
          idIndicador="proveedores-tipo"
          etiquetaAccesible="Tipo de proveedor"
          activa={tipo}
          onCambio={(c) => {
            setTipo(c as TipoProveedor);
            setRubro(null);
          }}
          items={[
            { clave: "mercaderia", etiqueta: ETIQUETA_TIPO_PROVEEDOR.mercaderia, conteo: nDeTipo.mercaderia, tono: "neutro", pide: "activos", ayuda: "Ropa y lo que se revende: a ellos se les compra y se les recibe" },
            { clave: "servicios", etiqueta: ETIQUETA_TIPO_PROVEEDOR.servicios, conteo: nDeTipo.servicios, tono: "neutro", pide: "activos", ayuda: "Telefonía, luz, agua, alquiler: a ellos se les paga" },
          ]}
        />
      )}
      {hayProveedores && enRanking && ranking && ranking.filas.length > 0 && (
        <div className="anim-entra" style={{ ["--i" as string]: 5 }}>
          <MedidaDelRanking medida={medida} onMedida={cambiarMedida} prendas={totales.prendas} gasto={totales.gasto} cargaPct={totales.cargaPct} proveedores={ranking.filas.length} />
        </div>
      )}
      {hayProveedores && (
        <div className="anim-entra flex flex-wrap items-center gap-x-4 gap-y-3" style={{ ["--i" as string]: 6 }}>
          <Buscador guia="proveedores.buscador"
            id="proveedores-buscar"
            valor={busqueda}
            onCambio={setBusqueda}
            atajo
            placeholder={hayMarcas ? "Nombre, marca, RUC o contacto" : "Nombre, RUC o contacto"}
            etiqueta="Buscar proveedor"
            conteo={filtrandoTodo ? `${nVisibles} de ${k ? proveedores.length : delTipo.length}` : undefined}
            className="min-w-[14rem] flex-1"
          />
          {rubros.length > 0 && (
            // El rubro deja menos proveedores en la misma lista: la píldora de filtro del sistema (ADR-0358).
            <div role="group" aria-label="Filtrar por rubro" data-guia="proveedores.rubros" className="flex flex-wrap items-center gap-2">
              {[{ clave: "", etiqueta: "Todos", conteo: totalActivos }, ...rubros.map((r) => ({ clave: r.clave, etiqueta: r.etiqueta, conteo: r.conteo }))].map((o) => (
                <button key={o.clave || "todos"} type="button" aria-pressed={(rubro ?? "") === o.clave} onClick={() => setRubro(o.clave || null)} className="pildora-cayla">
                  {o.etiqueta} <span className="pildora-cayla__n">{o.conteo}</span>
                </button>
              ))}
            </div>
          )}
          {nSinPago > 0 && (
            <button
              type="button"
              aria-pressed={filtrarSinPago}
              data-guia="proveedores.sin-pago"
              onClick={() => setSoloSinPago((v) => !v)}
              className={`anim-revelar rounded-full border px-3 py-1 text-xs tabular-nums transition-colors duration-200 ${
                filtrarSinPago ? "border-tinta bg-tinta text-crema" : "border-ambar/40 bg-ambar/10 text-ambar-profundo hover:border-ambar-profundo"
              }`}
            >
              Sin datos de pago · {nSinPago}
            </button>
          )}
        </div>
      )}

      {hayProveedores && enRanking && ranking && ranking.filas.length > 0 && (
        // El ritmo deja menos proveedores en la misma lista: la píldora de filtro del sistema (ADR-0358), con su cuenta.
        <div role="group" aria-label="Filtrar por ritmo de venta" data-guia="proveedores.ritmo" className="anim-entra -mt-3 flex flex-wrap items-center gap-2" style={{ ["--i" as string]: 6 }}>
          {opcionesRitmo.map((o) => (
            <button key={o.c ?? "todos"} type="button" aria-pressed={filtroRitmo === o.c} title={o.ayuda} onClick={() => setFiltroRitmo(filtroRitmo === o.c ? null : o.c)} className="pildora-cayla">
              {o.texto} <span className="pildora-cayla__n">{o.n}</span>
            </button>
          ))}
        </div>
      )}

      {!hayProveedores ? (
        <div className="card-cayla">
          <Vacio
            icono={<Truck />}
            titulo="Todavía no hay proveedores"
            acciones={
              puedeEditar ? (
                <Boton peso="primario" onClick={() => setBorrador(BORRADOR_VACIO)}>
                  Registrar el primero
                </Boton>
              ) : null
            }
          >
            Un proveedor tiene que estar aquí antes de poder registrar su comprobante.
          </Vacio>
        </div>
      ) : nVisibles === 0 ? (
        <div className="card-cayla">
          {!filtrandoTodo ? (
            <Vacio
              icono={<Truck />}
              titulo={tipo === "servicios" ? "Todavía no hay proveedores de servicios" : "Todavía no hay proveedores de mercadería"}
              acciones={
                puedeEditar ? (
                  <Boton peso="primario" onClick={() => setBorrador({ ...BORRADOR_VACIO, tipo })}>
                    Registrar uno
                  </Boton>
                ) : null
              }
            >
              {tipo === "servicios"
                ? "Aquí van Entel, la luz, el agua o el alquiler: a quien se le paga un servicio, no se le compra ropa."
                : "Aquí van los fabricantes y mayoristas de ropa, a quienes se les compra y se les recibe mercadería."}
            </Vacio>
          ) : busqueda.trim() ? (
            <Vacio
              icono={<SearchX />}
              titulo={`Ningún proveedor coincide con «${busqueda.trim()}»`}
              acciones={
                <>
                  <Boton peso="fantasma" onClick={() => setBusqueda("")}>
                    Borrar la búsqueda
                  </Boton>
                  {puedeEditar && (
                    <Boton peso="primario" onClick={() => setBorrador({ ...BORRADOR_VACIO, nombre: busqueda.trim() })}>
                      Registrarlo
                    </Boton>
                  )}
                </>
              }
            >
              Se busca por nombre{hayMarcas ? ", marca" : ""}, RUC o contacto.
              {marcas === null && " Las marcas no se pudieron cargar: esta búsqueda no las incluye."}
            </Vacio>
          ) : (
            <Vacio
              icono={<FunnelX />}
              titulo="Ningún proveedor con esos filtros"
              filtros={[
                ...(rubro ? [{ texto: rubros.find((r) => r.clave === rubro)?.etiqueta ?? "Rubro", onQuitar: () => setRubro(null) }] : []),
                ...(filtrarSinPago ? [{ texto: "Sin datos de pago", onQuitar: () => setSoloSinPago(false) }] : []),
                ...(enRanking && filtroRitmo ? [{ texto: etiquetaFiltroRitmo, onQuitar: () => setFiltroRitmo(null) }] : []),
              ]}
              acciones={
                <Boton
                  peso="fantasma"
                  onClick={() => {
                    setRubro(null);
                    setSoloSinPago(false);
                    setFiltroRitmo(null);
                  }}
                >
                  Limpiar filtros
                </Boton>
              }
            >
              Quita un filtro o límpialos todos para ver a todos los proveedores.
            </Vacio>
          )}
        </div>
      ) : enRanking && ranking ? (
        <>
          {filasRanking.length > 0 && (
            <ProveedoresRanking
              filas={filasRanking}
              proveedores={porId}
              maxValor={Math.max(1, ...ranking.filas.map((f) => valorDe(f, medida)))}
              medida={medida}
              antes={puestosAntes}
              ventas={ventas}
              busqueda={busqueda}
              verTodos={verTodos || !!k}
              onVerTodos={setVerTodos}
              onAbrir={setAbiertoId}
              comparar={comparar}
              onComparar={alComparar}
              refFila={refFila}
              taller={filtrandoTodo ? null : ranking.taller}
            />
          )}
          {enServicios > 0 && (
            <p className="text-sm text-tinta/75">
              También {enServicios === 1 ? "hay 1 proveedor" : `hay ${enServicios} proveedores`} de Servicios con «{busqueda.trim()}».{" "}
              <button type="button" className="btn-enlace" onClick={() => setTipo("servicios")}>
                Ver en Servicios
              </button>
            </p>
          )}
          {sinCompras.length > 0 && (
            // Los activos a los que todavía no se les compró nada: con las filas del directorio, porque lo que se sabe de ellos es eso.
            <section className="anim-entra space-y-2" style={{ ["--i" as string]: 8 }}>
              <TituloSeccion cuenta={sinCompras.length} dato="aún no hay prendas suyas en tus tiendas">
                Sin compras todavía
              </TituloSeccion>
              <Tabla className="@container overflow-y-hidden">
                {sinCompras.map((p, indice) => (
                  <Fila
                    key={p.id}
                    p={p}
                    indice={indice}
                    busqueda={busqueda}
                    marcas={marcasDe(p.id)}
                    serie={series?.[p.id] ?? null}
                    maxSaldo={maxSaldo}
                    cambiando={cambiandoId === p.id}
                    reciente={recientes.has(p.id)}
                    enfoque={foco === null ? "neutro" : foco === p.id ? "foco" : "tenue"}
                    refFila={refFila(p.id)}
                    onAbrir={() => setAbiertoId(p.id)}
                    onReactivar={() => onCambiarEstado(p)}
                    abreFicha={puedeEditar}
                  />
                ))}
              </Tabla>
            </section>
          )}
        </>
      ) : activos.length === 0 ? null : (
        // `overflow-y-hidden`: mientras las filas se deslizan (FLIP) algunas pasan un instante fuera de la
        // tarjeta; sin esto, `overflow-x-auto` les da a las dos direcciones scroll y parpadea una barra vertical.
        <div data-guia="proveedores.lista">
        <Tabla className="@container anim-entra overflow-y-hidden" style={{ ["--i" as string]: 7 }}>
          {verMontos ? <EncabezadoOrdenable orden={orden} onOrden={(c) => setOrden((o) => siguienteOrden(o, c))} /> : <Encabezado plantilla={PLANTILLA_BASE} columnas={[{ titulo: "Proveedor" }, { titulo: "RUC" }]} />}
          {activos.map((p, indice) => (
            <Fila
              key={p.id}
              p={p}
              indice={indice}
              busqueda={busqueda}
              marcas={marcasDe(p.id)}
              serie={series?.[p.id] ?? null}
              maxSaldo={maxSaldo}
              cambiando={cambiandoId === p.id}
              reciente={recientes.has(p.id)}
              enfoque={foco === null ? "neutro" : foco === p.id ? "foco" : "tenue"}
              refFila={refFila(p.id)}
              onAbrir={() => setAbiertoId(p.id)}
              onReactivar={() => onCambiarEstado(p)}
              abreFicha={puedeEditar}
            />
          ))}
        </Tabla>
        </div>
      )}

      {desactivados.length > 0 && (
        <section className="anim-entra space-y-2" style={{ ["--i" as string]: 9 }}>
          <p className="label-cayla text-[11px] text-tinta/65">Desactivados — ya no aparecen al registrar un comprobante</p>
          <Tabla>
            {desactivados.map((p, indice) => (
              <Fila
                key={p.id}
                p={p}
                indice={indice}
                busqueda={busqueda}
                marcas={marcasDe(p.id)}
                serie={series?.[p.id] ?? null}
                maxSaldo={maxSaldo}
                cambiando={cambiandoId === p.id}
                reciente={recientes.has(p.id)}
                enfoque="neutro"
                refFila={undefined}
                onAbrir={() => setAbiertoId(p.id)}
                onReactivar={() => onCambiarEstado(p)}
                abreFicha={puedeEditar}
              />
            ))}
          </Tabla>
        </section>
      )}

      </ConLado>

      {enRanking && comparados.length > 0 && (
        // Más angosto que 1280 px la comparación baja hasta debajo de la lista: la isla oscura dice cuántos llevas marcados y lleva a verlos.
        // En escritorio va al centro y a su medida, como la de lo marcado en Existencias (el lateral no la tapa).
        <BarraDeAbajo tono="tinta" role="region" aria-label="Proveedores para comparar" className="sm:inset-x-auto sm:left-1/2 sm:w-max sm:max-w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 xl:hidden">
          <BarraDeAbajoResumen cifra={comparados.length === 1 ? "1 marcado" : `${comparados.length} marcados`} detalle={comparados.map((f) => f.nombre).join(" · ")} />
          <div className="barra-abajo-acciones">
            <button
              type="button"
              className="btn-cayla btn-primario"
              onClick={() => document.getElementById("proveedores-comparacion")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}
            >
              Ver la comparación
            </button>
          </div>
        </BarraDeAbajo>
      )}

      {verMontos && abierto && (
        <ProveedorVistaRapida
          proveedor={abierto}
          marcas={marcasDe(abierto.id)}
          serie={series?.[abierto.id] ?? null}
          posicion={{ indice: Math.max(0, indiceAbierto), total: navegables.length }}
          cambiando={cambiandoId === abierto.id}
          onCerrar={() => setAbiertoId(null)}
          onNavegar={vecino}
          onCambiarEstado={() => onCambiarEstado(abierto)}
          ritmo={ritmoDe(abierto.id)}
          tallasYSedes={enRanking ? tallasYSedesDe(abierto.id) : null}
        />
      )}

      {borrador && (
        <ProveedorModal
          inicial={borrador}
          rubros={rubrosSugeridos}
          existentes={proveedores}
          onClose={() => setBorrador(null)}
          onGuardado={(id) => {
            setBorrador(null);
            if (id) {
              // El recién guardado tiene que verse: se limpia lo que pudiera esconderlo, se marca y, cuando
              // llegue en la próxima lectura, se lleva a la vista.
              setBusqueda("");
              setRubro(null);
              setSoloSinPago(false);
              pendienteScroll.current = id;
              marcarReciente(id);
            }
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filas y encabezado: FUERA del componente a propósito. Declaradas adentro (como estaban), cada
// tecla del buscador creaba componentes nuevos y React desmontaba y volvía a montar TODAS las filas.
// ---------------------------------------------------------------------------

type PropsFila = {
  p: Proveedor;
  /** Posición en su lista: desfasa la entrada escalonada de la fila (se topa en 10). */
  indice: number;
  busqueda: string;
  /** Marcas con que se conoce al proveedor (ADR-0140), en orden alfabético. */
  marcas: readonly string[];
  serie: number[] | null;
  maxSaldo: number;
  cambiando: boolean;
  reciente: boolean;
  /** «foco»: la fila del tramo de la barra al que se apunta; «tenue»: las demás mientras tanto. */
  enfoque: "neutro" | "foco" | "tenue";
  refFila: ((el: HTMLElement | null) => void) | undefined;
  onAbrir: () => void;
  onReactivar: () => void;
  /** Sin los montos pero con el módulo Proveedores (P3): la fila lleva a la ficha, donde se edita. */
  abreFicha?: boolean;
};

const MONOGRAMA = "font-display grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-sand text-base text-tinta transition-colors duration-300 group-hover:bg-tinta group-hover:text-crema";

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Nombre/contacto/rubro/plazo: para cualquiera. El resto de la fila (RUC en adelante) cambia de
// contenido Y de significado entre líder y colaborador, no solo de estilo.
// Cuántas etiquetas de marca caben en la fila antes de resumir el resto en «+N».
const MARCAS_POR_FILA = 3;

function NombreCelda({
  p,
  busqueda,
  marcas,
  marcarSinPago = false,
}: {
  p: Proveedor;
  busqueda: string;
  marcas: readonly string[];
  /** Solo quien edita proveedores: es quien puede completar los datos (ADR-0134, P3). */
  marcarSinPago?: boolean;
}) {
  const sinPago = marcarSinPago && p.activo && sinDatosDePago(p);
  const { visibles, ocultas } = marcasParaMostrar(marcas, busqueda, MARCAS_POR_FILA);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span aria-hidden className={MONOGRAMA}>
        {iniciales(p.nombre)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-tinta">
          <Resaltado texto={p.nombre} busqueda={busqueda} />
        </span>
        <span className="block truncate text-xs text-tinta/65">
          {p.contacto ? <Resaltado texto={p.contacto} busqueda={busqueda} /> : "Sin contacto"}
          {p.rubros.length > 0 && ` · ${p.rubros.join(", ")}`}
          {p.plazo_credito_dias != null && ` · Crédito ${p.plazo_credito_dias} d`}
        </span>
        {/* Debajo, no al lado: junto al nombre le quitaba ancho y lo cortaba («Confecciones d…»). Las marcas van en la
            misma línea que el aviso de pago para no alargar la fila (ADR-0140). */}
        {(sinPago || visibles.length > 0) && (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {sinPago && (
              <Chip tono="ambar" versalitas={false}>
                Sin datos de pago
              </Chip>
            )}
            {visibles.map((m) => (
              // Un solo hijo dentro del chip: es flex con `gap`, y cada tramo del resaltado (<span>, <mark>, <span>) sería un
              // ítem aparte con un hueco DENTRO de la palabra. El `truncate` corta una marca más ancha que la columna.
              <Chip key={m} versalitas={false} className="min-w-0 max-w-full">
                <span className="truncate">
                  <Resaltado texto={m} busqueda={busqueda} />
                </span>
              </Chip>
            ))}
            {ocultas > 0 && (
              <span className="text-[11px] text-tinta/55" title={marcas.filter((m) => !visibles.includes(m)).join(", ")}>
                +{ocultas}
              </span>
            )}
          </span>
        )}
      </span>
    </span>
  );
}

// Directorio para quien no ve los montos de Compras: sin ninguna columna financiera — `fn_proveedores()` ya le manda esos
// campos en NULL, esto es la segunda capa, no la única (20260917240000). Con el módulo Proveedores (P3) el nombre lleva a
// la ficha, donde se edita; sin él, no hay a dónde ir.
function FilaBase({ p, busqueda, marcas, abreFicha = false }: PropsFila) {
  return (
    <div data-proveedor-id={p.id} className={fila(PLANTILLA_BASE, `group ${p.activo ? "" : "opacity-60"}`)}>
      <span className={celda("izq", "min-w-0")}>
        {abreFicha ? (
          <Link href={`/compras/proveedores/${p.id}`} aria-label={`${p.nombre}: abrir ficha`} className="block min-w-0 rounded-md outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60">
            <NombreCelda p={p} busqueda={busqueda} marcas={marcas} marcarSinPago />
          </Link>
        ) : (
          <NombreCelda p={p} busqueda={busqueda} marcas={marcas} />
        )}
      </span>
      <span className={celda("izq", "font-mono text-xs tabular-nums text-tinta/75")}>{p.ruc ? <Resaltado texto={p.ruc} busqueda={busqueda} /> : "Sin RUC"}</span>
    </div>
  );
}

// La fila entera abre la vista rápida: el botón del nombre se estira con `after:` sobre toda la fila (un
// solo elemento interactivo, con nombre accesible, en vez de un `div` clicable); el saldo, cuando lo hay,
// lleva a Por pagar ya filtrado y los demás enlaces quedan por encima (`relative`) para no disparar la
// vista rápida. Al pasar el mouse: un filo rojo crece a la izquierda, el monograma se llena y, si hay
// serie, la mini-tendencia se redibuja.
function FilaLider({ p, indice, busqueda, marcas, serie, maxSaldo, cambiando, reciente, enfoque, refFila, onAbrir, onReactivar }: PropsFila) {
  const entregas = chipEntregas(p);
  const saldo = p.saldo ?? 0;
  const vencido = (p.saldo_vencido ?? 0) > 0;
  const dias = p.dias_desde_ultima_compra;
  const dormido = p.activo && dias != null && dias > 90;
  return (
    <div
      ref={refFila}
      data-proveedor-id={p.id}
      style={{ ["--i" as string]: 8 + Math.min(indice, 10) }}
      className={`anim-entra group relative grid ${COLUMNAS_LIDER} items-center gap-x-4 px-5 py-3 transition-[background-color,opacity] duration-200 before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:origin-center before:rounded-full before:bg-rojo before:transition-transform before:duration-300 before:ease-cayla hover:bg-tinta/[0.03] hover:before:scale-y-100 ${
        enfoque === "foco" ? "bg-tinta/[0.04] before:scale-y-100" : "before:scale-y-0"
      } ${enfoque === "tenue" ? "opacity-40" : p.activo ? "" : "opacity-60"}`}
    >
      {/* El destello vive en su propia capa: `animation` es una sola propiedad, y si se pusiera en la fila
          pisaría a la entrada `anim-entra` (y al quitarlo, la entrada se repetiría). */}
      {reciente && <span aria-hidden className="anim-destello-fila pointer-events-none absolute inset-0" />}
      <button type="button" onClick={onAbrir} data-guia="proveedores.nombre" aria-label={`${p.nombre}: abrir vista rápida`} className="min-w-0 text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-rojo/60">
        <NombreCelda p={p} busqueda={busqueda} marcas={marcas} marcarSinPago />
      </button>
      <span className="hidden truncate font-mono text-xs tabular-nums text-tinta/75 @7xl:block">{p.ruc ? <Resaltado texto={p.ruc} busqueda={busqueda} /> : "Sin RUC"}</span>
      <span className="hidden items-center justify-end gap-2.5 whitespace-nowrap text-sm tabular-nums @3xl:flex">
        {serie && <Sparkline serie={serie} indice={indice} />}
        <span className={p.facturado_12m ? "text-tinta" : "text-tinta/45"}>{soles(p.facturado_12m ?? 0)}</span>
      </span>
      <span className="text-right text-sm tabular-nums" data-guia="proveedores.saldo">
        {saldo > 0 ? (
          <>
            <Link
              href={`/compras/por-pagar?prov=${p.id}`}
              className={`relative whitespace-nowrap underline-offset-4 hover:underline ${vencido ? "text-rojo" : "text-tinta hover:text-rojo"}`}
            >
              {soles(saldo)}
            </Link>
            {/* La deuda a escala del mayor saldo de la lista (ronda 14 de /unificar): la barra apilada del sistema, lo ya vencido en rojo y
                lo que falta vencer en tinta, medida contra el mayor saldo (el hueco del final es la pista). */}
            <span title={vencido ? `Vencido: ${soles(p.saldo_vencido ?? 0)}` : "Nada vencido"} className="mt-1 block">
              <BarraApilada
                alto={4}
                decorativa
                total={maxSaldo}
                retraso={8 + Math.min(indice, 10)}
                segmentos={[
                  { clave: "vencido", nombre: "Vencido", valor: Math.min(p.saldo_vencido ?? 0, saldo), clase: "bg-rojo" },
                  { clave: "por-vencer", nombre: "Por vencer", valor: saldo - Math.min(p.saldo_vencido ?? 0, saldo), clase: "bg-tinta" },
                ]}
              />
            </span>
          </>
        ) : (
          <span className="text-tinta/45">{soles(saldo)}</span>
        )}
      </span>
      {/* Saldo a favor: lo que el proveedor le debe a CAYLA (una nota de crédito que superó su deuda); se descuenta al pagar. */}
      <span className="hidden text-right text-sm tabular-nums @5xl:block">
        {(p.saldo_favor ?? 0) > 0 ? (
          <Link href={`/compras/proveedores/${p.id}#saldo-a-favor`} className="relative whitespace-nowrap font-semibold text-verde-profundo underline-offset-4 hover:underline">
            {soles(p.saldo_favor ?? 0)}
          </Link>
        ) : (
          <span className="text-tinta/45">—</span>
        )}
      </span>
      <span className="hidden justify-end overflow-visible text-xs @5xl:flex">{entregas ? <Chip tono={entregas.tono}>{entregas.texto}</Chip> : <span className="text-tinta/45">—</span>}</span>
      <span className={`hidden whitespace-nowrap text-right text-sm @7xl:block ${dormido ? "text-ambar-profundo" : "text-tinta/65"}`} title={p.ultima_compra ?? undefined}>
        {haceCuanto(dias)}
      </span>
      <span className="hidden items-center justify-end gap-2 overflow-visible @3xl:flex">
        {/* «+ Comprobante» se fue con el registro a mano (2026-10-23): la compra nace en «Mis compras». */}
        {!p.activo && (
          <Boton textoCargando="Reactivando…" type="button" peso="discreto" cargando={cambiando} onClick={onReactivar} className="relative px-2.5 py-1.5 text-[11px]">
            Reactivar
          </Boton>
        )}
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 -translate-x-1.5 text-tinta/45 opacity-0 transition-[opacity,transform] duration-300 ease-cayla group-hover:translate-x-0 group-hover:opacity-100" />
      </span>
    </div>
  );
}

// Los encabezados de Facturado, Saldo y Última compra ordenan la tabla; el nombre también (clic en
// «Proveedor»). Es <Encabezado> con `orden` (ADR-0358, ronda 7): la flecha dice hacia dónde y GIRA al invertir el orden, con
// `aria-sort` para el lector de pantalla. Las columnas se muestran con los mismos cortes que las celdas de `FilaLider`
// (COLUMNAS_LIDER), y el encabezado entero solo desde @3xl: más angosta, cada fila se lee sola.
const COLUMNAS_ENCABEZADO_LIDER: Columna[] = [
  { titulo: "Proveedor", campo: "nombre" },
  { titulo: "RUC", clase: "hidden @7xl:block" },
  { titulo: "Facturado · 12 m", campo: "facturado", alinear: "der", clase: "hidden @3xl:block" },
  { titulo: "Saldo", campo: "saldo", alinear: "der" },
  { titulo: "A favor", campo: "favor", alinear: "der", clase: "hidden @5xl:block" },
  { titulo: "Entregas", alinear: "der", clase: "hidden @5xl:block" },
  { titulo: "Última compra", campo: "ultima", alinear: "der", clase: "hidden @7xl:block" },
  { titulo: "", clase: "hidden @3xl:block" },
];

function EncabezadoOrdenable({ orden, onOrden }: { orden: Orden; onOrden: (c: CampoOrden) => void }) {
  return <Encabezado plantilla={`${COLUMNAS_LIDER} @max-3xl:hidden!`} columnas={COLUMNAS_ENCABEZADO_LIDER} orden={orden} onOrden={(c) => onOrden(c as CampoOrden)} />;
}

// En el ranking, la lista y su columna derecha («Lo que no se ve a simple vista», o «Comparar» con «Para hoy») lado a lado desde 1280 px, la
// columna pegada al bajar y con su propio scroll; más angosto, la columna baja.
function ConLado({ lado, children }: { lado: ReactNode; children: ReactNode }) {
  if (!lado) return <>{children}</>;
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-6">{children}</div>
      <div className="xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">{lado}</div>
    </div>
  );
}
