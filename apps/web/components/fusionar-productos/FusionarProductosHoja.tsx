"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Merge, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { esRespuestaIncierta, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import {
  ELECCIONES_VACIAS,
  camposAElegir,
  camposDeLaGuia,
  eleccionesParaLaBase,
  fotosEnOrden,
  frasesDelResumen,
  fuenteDe,
  leerPlan,
  mensajeAlNoFusionar,
  opcionesDeCampo,
  quedaSugerido,
  yaFusionadas,
  type CampoFusion,
  type Elecciones,
  type PlanFusion,
} from "@/lib/fusionar-productos-reglas";
import { fichaFinal, matrizFinal, ordenFijo, type DetalleFusion } from "@/lib/fusionar-productos-ficha";
import { leerDetalleFusion } from "@/lib/fusionar-productos-detalle";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Volver } from "@/components/ui/Volver";
import { Buscador } from "@/components/ui/Buscador";
import { ListaSugerencias, ariaDelBuscador, type Sugerencia } from "@/components/ui/ListaSugerencias";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { Casilla } from "@/components/ui/Casilla";
import { Chip } from "@/components/ui/Chip";
import { Aviso, AvisoNoSeDeshace } from "@/components/ui/Aviso";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ColumnaFicha, FilaDistinta, MatrizTallas, PlacaFinal } from "./piezas";
import { CompararFichas } from "./CompararFichas";

/** Lo que la hoja necesita de cada ficha con la que se abre. */
export type FichaParaFusionar = { productoId: string; referencia: string };

type Encontrado = {
  id: string;
  referencia: string;
  codigo: string | null;
  categoria: { nombre: string | null; prefijo: string | null; familia: string | null } | null;
  fotoUrl: string | null;
};

/** Cuánto espera la búsqueda a que la persona deje de escribir. */
const ESPERA_BUSQUEDA_MS = 250;

/** Cuántas «¿Es alguna de estas?» se ofrecen de un toque: más alargan la hoja; las demás se encuentran escribiendo. */
const MAX_SUGERIDOS = 6;

/** Hasta cuántas fichas se juntan de una vez en la hoja (la mesa de columnas está pensada para tres). */
const TOPE_FICHAS = 3;

type Vista = "armar" | "revisar" | "listo";

const nombres = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * «Fusionar productos repetidos» (ADR-0650, Felipe 2026-11-12): junta dos o más fichas de la misma prenda en una sola, sin perder
 * ventas, fotos ni stock. Todo lo que muestra lo calcula la base (`previsualizar_fusion_productos`) y lo que guarda lo hace una sola
 * función (`fusionar_productos`), con el mismo cálculo: lo que se ve es lo que pasa.
 *
 * Rediseño del 2026-11-13, dirección B «La ficha que se arma» (maqueta `docs/maquetas/fusionar-productos-2026-11/`, ficha al
 * milímetro `docs/milimetro/fusionar-productos.md`): las fichas lado a lado en vidrio, la que queda en gota con su ✓ y sin cambiar
 * de lugar; a la derecha, «Así va a quedar», que cambia con cada elección; «Ver ficha» abre una hoja para compararlas; y antes de
 * guardar, «Revisar y fusionar», un último vistazo con «Sí, fusionar».
 */
export function FusionarProductosHoja({
  inicial,
  onClose,
  onHecho,
}: {
  inicial: FichaParaFusionar[];
  onClose: () => void;
  onHecho?: (productoQuedaId: string) => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [ids, setIds] = useState<string[]>(() => [...new Set(inicial.map((f) => f.productoId))]);
  const [queda, setQueda] = useState<string | null>(null);
  const [elecciones, setElecciones] = useState<Elecciones>(ELECCIONES_VACIAS);
  // La última lectura de la base, con la clave de lo que se le preguntó: mientras llega la siguiente se sigue viendo la anterior.
  const [lectura, setLectura] = useState<{ clave: string; plan: PlanFusion | null; error: string | null } | null>(null);
  // «Leer de nuevo» tras un error de lectura: cambia la clave y la lectura corre de nuevo (/chaos 2026-11-13, RS-08).
  const [intento, setIntento] = useState(0);
  const [detalle, setDetalle] = useState<{ clave: string; datos: DetalleFusion | null; error: boolean } | null>(null);
  const [vista, setVista] = useState<Vista>("armar");
  const [comparando, setComparando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ referencia: string; vendidas: number; stock: number; repetidas: number; porOtra: boolean } | null>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const radios = useRef<Record<string, HTMLButtonElement | null>>({});
  // Dos clics en el mismo instante ven `guardando` en falso los dos: el candado de la ref no espera a React. (La base igual frena el
  // segundo por la versión de las fichas, `p_versiones`; esto evita siquiera pedirlo.)
  const enviando = useRef(false);

  const quedaEfectiva = queda ?? ids[0] ?? null;
  const duplicados = ids.filter((id) => id !== quedaEfectiva);
  const hayFusion = Boolean(quedaEfectiva) && duplicados.length > 0;

  // ---------- Leer el plan: cada vez que cambian las fichas, cuál queda o un dato que decide un bloqueo ----------
  const clavePlan = JSON.stringify({ quedaEfectiva, duplicados, campos: elecciones.campos, intento });
  const leyendo = hayFusion && lectura?.clave !== clavePlan;
  const plan = hayFusion ? (lectura?.plan ?? null) : null;
  const errorLectura = hayFusion && lectura?.clave === clavePlan ? lectura.error : null;
  // Orden fijo (decisión 3 del rediseño): como se agregaron, no como los devuelve el plan (que pone primero al que queda).
  const productos = useMemo(() => ordenFijo(ids, plan?.productos ?? []), [ids, plan]);

  useEffect(() => {
    if (!hayFusion || !quedaEfectiva) return;
    let vigente = true;
    const t = window.setTimeout(async () => {
      const { data, error } = await createClient().rpc("previsualizar_fusion_productos", {
        p_queda: quedaEfectiva,
        p_duplicados: duplicados,
        p_elecciones: { campos: elecciones.campos },
      });
      if (!vigente) return;
      if (error) {
        setLectura((l) => ({ clave: clavePlan, plan: l?.plan ?? null, error: traducirError(error, "leer las fichas", { lectura: true }) }));
        return;
      }
      const nuevo = leerPlan(data);
      setLectura({ clave: clavePlan, plan: nuevo, error: null });
      // La primera vez, la ficha que se propone que quede (decisión 1): la que más vendió, o la más antigua.
      if (queda === null && nuevo.productos.length > 0) setQueda(quedaSugerido(nuevo.productos));
    }, 120);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clavePlan` resume las dependencias que cambian la lectura
  }, [clavePlan]);

  // ---------- El detalle para comparar y para la matriz: tallas y stock por sede de cada ficha ----------
  const claveDetalle = [...ids].sort().join(",");
  useEffect(() => {
    if (ids.length < 2) return;
    let vigente = true;
    leerDetalleFusion(ids).then(
      (datos) => vigente && setDetalle({ clave: claveDetalle, datos, error: false }),
      () => vigente && setDetalle({ clave: claveDetalle, datos: null, error: true }),
    );
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `claveDetalle` resume `ids`
  }, [claveDetalle]);
  const detalleListo = detalle?.clave === claveDetalle ? detalle.datos : null;
  const errorDetalle = detalle?.clave === claveDetalle && detalle.error;

  // ---------- La guía de foco (ADR-0284), una por paso ----------
  const estadoGuia = {
    duplicados: duplicados.length,
    queda: quedaEfectiva,
    hayDiferencias: camposAElegir(plan?.diferencias ?? []).length > 0,
    responsableListo: responsable.listo,
  };
  const camposArmar = camposDeLaGuia({ ...estadoGuia, vista: "armar" });
  const camposRevisar = camposDeLaGuia({ ...estadoGuia, vista: "revisar" });
  const guiaArmar = useGuiaCampos(camposArmar);
  const guiaRevisar = useGuiaCampos(camposRevisar);

  const fotos = useMemo(() => fotosEnOrden(plan?.productos ?? []), [plan]);
  const fotosQueQuedan = elecciones.fotos ?? fotos.map((f) => f.id);
  // Un bloqueo es lo que la base dijo que frena; sin duplicado todavía no hay plan, y eso lo pide la guía, no un bloqueo.
  const bloqueado = Boolean(plan && !plan.ok);
  const elegibles = camposAElegir(plan?.diferencias ?? []);
  const ficha = plan && quedaEfectiva ? fichaFinal(plan, quedaEfectiva, elecciones, fotosQueQuedan) : null;
  // La matriz se arma con el que queda según el plan que llegó (el plan no manda las tallas del que queda): mientras llega el
  // siguiente, se ve la anterior, atenuada.
  const quedaDelPlan = plan?.productos.find((p) => p.queda)?.id ?? null;
  // Sin el detalle no se dibuja: sin las tallas del que queda, todo parecería «pasa» y lo que se junta no se vería.
  const matriz = plan && quedaDelPlan && detalleListo ? matrizFinal(plan, quedaDelPlan, detalleListo) : null;
  const avisoMatriz = errorDetalle ? "No se pudieron leer las tallas. La fusión hace lo mismo; vuelve a abrir la hoja para verlas." : "Leyendo las tallas…";
  const varias = duplicados.length > 1;

  // Cambiar de vista lleva la hoja arriba: el título nuevo a la vista (ADR-0185, «un clic que cambia de vista»).
  useEffect(() => {
    for (let el = cuerpo.current?.parentElement; el; el = el.parentElement) {
      if (el.scrollTop > 0) el.scrollTop = 0;
      if (el.getAttribute("role") === "dialog") break;
    }
  }, [vista]);

  async function fusionar() {
    if (enviando.current || guardando || leyendo || bloqueado || !plan || !quedaEfectiva || !sePuedeConfirmar(camposRevisar)) return;
    enviando.current = true;
    setGuardando(true);
    setErrorGuardar(null);
    const versiones = Object.fromEntries(plan.productos.map((p) => [p.id, p.version]));
    const { error } = await firmar(
      createClient().rpc("fusionar_productos", {
        p_queda: quedaEfectiva,
        p_duplicados: duplicados,
        p_elecciones: eleccionesParaLaBase(elecciones, plan.productos, plan.diferencias, quedaEfectiva) as never,
        p_versiones: versiones,
      }),
      responsable.firma(),
    );
    enviando.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      // La respuesta no llegó o alguien cambió las fichas: la base pudo haber fusionado (o alguien más). Se le pregunta antes de decir
      // nada (/chaos 2026-11-13, RS-03 y NAV-05). Si no responde, el aviso no afirma lo que no sabe.
      const incierta = esRespuestaIncierta(error);
      if (incierta || esVersionCambiada(error)) {
        const { data: filas } = await createClient().from("productos").select("id, fusionado_en_id").in("id", duplicados);
        const ya = yaFusionadas((filas ?? []).map((f) => ({ id: f.id, fusionadoEnId: f.fusionado_en_id })), quedaEfectiva, duplicados);
        if (ya) {
          terminar(!incierta);
          return;
        }
      }
      setErrorGuardar(mensajeAlNoFusionar(traducirError(error, "fusionar los productos"), incierta));
      return;
    }
    terminar(false);
  }

  function terminar(porOtra: boolean) {
    if (!plan || !quedaEfectiva) return;
    setHecho({
      referencia: ficha?.referencia ?? plan.productos.find((p) => p.id === quedaEfectiva)?.referencia ?? "La ficha",
      vendidas: ficha?.unidadesVendidas ?? 0,
      stock: ficha?.stock ?? 0,
      repetidas: duplicados.length,
      porOtra,
    });
    setVista("listo");
    onHecho?.(quedaEfectiva);
    router.refresh();
  }

  const elegirQueda = (id: string) => {
    if (id === quedaEfectiva) return;
    setQueda(id);
    setElecciones(ELECCIONES_VACIAS);
  };
  const quitar = (id: string) => {
    // El foco pasa a la columna de al lado: nunca se pierde.
    const i = ids.indexOf(id);
    const vecino = ids[i + 1] ?? ids[i - 1];
    setIds((xs) => xs.filter((x) => x !== id));
    if (queda === id) setQueda(null);
    setElecciones(ELECCIONES_VACIAS);
    window.requestAnimationFrame(() => vecino && radios.current[vecino]?.focus());
  };
  const agregar = (id: string) => {
    setIds((xs) => (xs.includes(id) ? xs : [...xs, id]));
    setElecciones(ELECCIONES_VACIAS);
  };
  // El grupo de radios de «¿Cuál se queda?» (patrón de APG): las flechas pasan a la de al lado y la eligen.
  const teclaColumna = (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso || productos.length < 2) return;
    e.preventDefault();
    const i = productos.findIndex((p) => p.id === id);
    const otra = productos[(i + paso + productos.length) % productos.length];
    elegirQueda(otra.id);
    radios.current[otra.id]?.focus();
  };

  const nombreInicial = inicial[0]?.referencia ?? "esta prenda";
  const nombreQueda = productos.find((p) => p.id === quedaEfectiva)?.referencia ?? nombreInicial;
  const nombresRepetidas = productos.filter((p) => p.id !== quedaEfectiva).map((p) => p.referencia);
  const titulo = vista === "revisar" ? "Revisa y fusiona" : vista === "listo" ? "Productos fusionados" : "Fusionar productos repetidos";
  const subtitulo =
    vista === "revisar"
      ? `${nombres(nombresRepetidas)} ${nombresRepetidas.length > 1 ? "pasan" : "pasa"} a ${nombreQueda}.`
      : vista === "listo"
        ? undefined
        : "Junta las fichas de una misma prenda en una sola. Las ventas, las fotos y el stock no se pierden.";

  return (
    <>
      <Modal /* unificar-fijo: la ficha que se arma es de diseño propio (dirección B, Felipe 2026-11-13): 1080 px */ variante="hoja" ancho="max-w-[67.5rem]" bloqueado={guardando} conCerrar={vista === "listo"} titulo={titulo} subtitulo={subtitulo} onClose={onClose}>
        {(cerrar) => (
          <div ref={cuerpo} className="fus-cuerpo" key={vista}>
            {vista === "armar" && (
              <div className="fus-dos">
                <div className="min-w-0 space-y-6">
                  {/* ---------- 1. Cuál queda (decisión 1), con las fichas lado a lado y en su sitio ---------- */}
                  <CampoGuiado id="queda" guia={guiaArmar} titulo="¿Cuál se queda?" ayuda="Toca la ficha que queda. Las demás pasan a esa; ninguna cambia de lugar.">
                    {productos.length > 1 ? (
                      <ul
                        role="radiogroup"
                        aria-label="La ficha que se queda"
                        className="fus-mesa"
                        style={{ "--fus-n": productos.length } as React.CSSProperties}
                        data-guia="fusionar.queda"
                      >
                        {productos.map((p, i) => (
                          <ColumnaFicha
                            key={p.id}
                            p={p}
                            productos={productos}
                            elegida={p.id === quedaEfectiva}
                            indice={i}
                            deshabilitada={guardando}
                            quitable={productos.length > 2}
                            onElegir={() => elegirQueda(p.id)}
                            onVer={() => setComparando(p.id)}
                            onQuitar={() => quitar(p.id)}
                            refRadio={(el) => {
                              radios.current[p.id] = el;
                            }}
                            onTecla={(e) => teclaColumna(e, p.id)}
                          />
                        ))}
                      </ul>
                    ) : (
                      <ul className="fus-mesa" style={{ "--fus-n": Math.max(ids.length, 1) } as React.CSSProperties} data-guia="fusionar.queda">
                        {ids.map((id) => (
                          // Sin plan todavía, una fila corta: el nombre y en qué está (Felipe 2026-11-13: «está demasiado largo»).
                          <li key={id} className="fus-opcion fus-ficha-sola">
                            <span className="font-semibold">{inicial.find((f) => f.productoId === id)?.referencia ?? "…"}</span>
                            <span className="text-sm text-taupe">{errorLectura ? "No se pudo leer esta ficha." : hayFusion ? "Leyendo las fichas…" : "Busca abajo la otra ficha"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CampoGuiado>

                  {ids.length < TOPE_FICHAS && (
                    <CampoGuiado id="duplicados" guia={guiaArmar}>
                      <div data-guia="fusionar.fichas">
                        <BuscarFicha excluir={ids} nombre={nombreInicial} alElegir={agregar} deshabilitado={guardando} sinDuplicado={duplicados.length === 0} />
                      </div>
                    </CampoGuiado>
                  )}

                  {errorLectura && (
                    <Aviso
                      tono="error"
                      titulo="No se pudieron leer las fichas"
                      accion={
                        <Boton peso="fantasma" type="button" className="btn-chico" onClick={() => setIntento((n) => n + 1)}>
                          Leer de nuevo
                        </Boton>
                      }
                    >
                      {errorLectura}
                    </Aviso>
                  )}

                  {/* ---------- 2. Lo que es distinto (decisión 8): cada valor bajo la columna de su ficha ---------- */}
                  {plan && elegibles.length > 0 && (
                    <CampoGuiado id="diferencias" guia={guiaArmar} titulo="Lo que es distinto" ayuda="Toca el dato con el que se queda. Lo que no está aquí es igual en las fichas.">
                      <div className="space-y-4" data-guia="fusionar.diferencias">
                        {elegibles.map((campo, k) => {
                          const elegido =
                            campo === "precio"
                              ? fuenteDe(elecciones.precioDe, "precio", plan.diferencias, quedaEfectiva)
                              : campo === "costo"
                                ? fuenteDe(elecciones.costoDe, "costo", plan.diferencias, quedaEfectiva)
                                : (elecciones.campos[campo as CampoFusion] ?? quedaEfectiva);
                          const opciones = opcionesDeCampo(productos, campo);
                          // Dos fichas con el mismo valor se dibujan una vez: la elegida es la del producto o la de su mismo valor.
                          const valorElegido = productos.find((p) => p.id === elegido);
                          const marcada =
                            opciones.find((o) => o.productoId === elegido)?.productoId ??
                            opciones.find((o) => valorElegido && o.valor === opcionesDeCampo([valorElegido], campo)[0]?.valor)?.productoId ??
                            null;
                          return (
                            <FilaDistinta
                              key={campo}
                              campo={campo}
                              productos={productos}
                              opciones={opciones}
                              marcada={marcada}
                              indice={Math.min(k, 7)}
                              deshabilitada={guardando}
                              onElegir={(productoId) =>
                                setElecciones((e) =>
                                  campo === "precio"
                                    ? { ...e, precioDe: productoId }
                                    : campo === "costo"
                                      ? { ...e, costoDe: productoId }
                                      : { ...e, campos: { ...e.campos, [campo]: productoId } },
                                )
                              }
                            />
                          );
                        })}
                        {elegibles.includes("costo") && (
                          <p className="nota-cayla">El costo que ya sale de las compras no cambia: el elegido va solo en las tallas que todavía no tienen compras.</p>
                        )}
                      </div>
                    </CampoGuiado>
                  )}

                  {/* ---------- 3. Fotos (decisión 9) ---------- */}
                  {plan && fotos.length > 0 && (
                    <section className="space-y-3" data-guia="fusionar.fotos">
                      <TituloGrupo cuenta={fotosQueQuedan.length} nota="las que no marques se guardan en la ficha repetida">
                        Fotos que quedan
                      </TituloGrupo>
                      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {fotos.map((f) => {
                          const marcada = fotosQueQuedan.includes(f.id);
                          const principal = fotosQueQuedan[0] === f.id;
                          const de = productos.find((p) => p.fotos.some((x) => x.id === f.id));
                          return (
                            <li key={f.id} className="relative">
                              {/* Toda la foto marca o desmarca (con el dedo, la casilla sola mide 20 px): el control para el teclado y el lector sigue
                                  siendo la casilla, así que la foto no se anuncia ni se enfoca. */}
                              <div
                                aria-hidden
                                onClick={() =>
                                  !guardando &&
                                  setElecciones((e) => {
                                    const actuales = e.fotos ?? fotos.map((x) => x.id);
                                    return { ...e, fotos: marcada ? actuales.filter((x) => x !== f.id) : [...actuales, f.id] };
                                  })
                                }
                                className={`relative cursor-pointer overflow-hidden rounded-lg border transition-opacity ease-cayla ${marcada ? "border-tinta" : "border-sand opacity-60"}`}
                                style={{ aspectRatio: "3 / 4" }}
                              >
                                <ImagenDePrenda src={f.url} alt={`Foto de ${de?.referencia ?? "la prenda"}`} fill sizes="120px" className="object-cover" fallback={null} />
                              </div>
                              <div className="absolute left-1.5 top-1.5">
                                <Casilla
                                  marcada={marcada}
                                  disabled={guardando}
                                  etiqueta={`Quedarse con esta foto de ${de?.referencia ?? "la prenda"}`}
                                  onCambio={() =>
                                    setElecciones((e) => {
                                      const actuales = e.fotos ?? fotos.map((x) => x.id);
                                      return { ...e, fotos: marcada ? actuales.filter((x) => x !== f.id) : [...actuales, f.id] };
                                    })
                                  }
                                />
                              </div>
                              {principal && (
                                <span className="absolute bottom-1.5 left-1.5">
                                  <Chip tono="tinta">Principal</Chip>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}

                  {plan && plan.bloqueos.length > 0 && (
                    <Aviso id="fusionar-bloqueos" tono="atencion" titulo="Todavía no se puede fusionar" guia="fusionar.bloqueos">
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {plan.bloqueos.map((b) => (
                          <li key={b.codigo + b.mensaje}>{b.mensaje}</li>
                        ))}
                      </ul>
                    </Aviso>
                  )}
                </div>

                {/* ---------- «Así va a quedar», pegada a la derecha ---------- */}
                {ficha && <PlacaFinal ficha={ficha} matriz={matriz} avisoMatriz={avisoMatriz} fotos={fotosQueQuedan.length} leyendo={leyendo} varias={varias} />}
              </div>
            )}

            {vista === "revisar" && plan && ficha && (
              <div className="fus-revisar" data-guia="fusionar.resumen">
                <PlacaFinal ficha={ficha} matriz={null} fotos={fotosQueQuedan.length} leyendo={leyendo} varias={varias} pegada={false} conMatriz={false} />
                <div className="min-w-0 space-y-5">
                  <section className="space-y-2">
                    <TituloGrupo>Qué va a pasar</TituloGrupo>
                    <ul className="fus-lista-revisar max-w-prose space-y-2 text-[15px] leading-relaxed text-tinta">
                      {[...frasesDelResumen(plan, fotosQueQuedan.length), "La ficha repetida queda archivada con su historia; nunca se borra."].map((f, k) => (
                        <li key={f} className="flex gap-3" style={{ "--fus-k": Math.min(k, 7) } as React.CSSProperties}>
                          <Check aria-hidden className="mt-1 h-4 w-4 shrink-0 text-verde" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="space-y-2">
                    <TituloGrupo>Tallas y colores</TituloGrupo>
                    {matriz ? <MatrizTallas m={matriz} grande leyendo={leyendo} varias={varias} conFrase={false} /> : <p className="text-sm text-taupe">{avisoMatriz}</p>}
                  </section>
                  <CampoGuiado id="responsable" guia={guiaRevisar}>
                    <ComboResponsable control={responsable} deshabilitado={guardando} />
                  </CampoGuiado>
                </div>
              </div>
            )}

            {vista === "listo" && hecho && (
              <div className="fus-listo" role="status">
                <span className="fus-sello" aria-hidden>
                  Fusionado
                </span>
                <h3 className="fus-listo-texto mt-5 font-serif text-[27px] font-semibold leading-tight text-tinta" style={{ "--fus-k": 0 } as React.CSSProperties}>
                  {hecho.referencia} es ahora una sola ficha
                </h3>
                <p className="fus-listo-texto mt-1.5 max-w-[46ch] text-[15px] leading-relaxed text-taupe" style={{ "--fus-k": 1 } as React.CSSProperties}>
                  Lleva {hecho.vendidas.toLocaleString("es-PE")} {hecho.vendidas === 1 ? "prenda vendida" : "prendas vendidas"} y{" "}
                  {hecho.stock.toLocaleString("es-PE")} en stock.{" "}
                  {hecho.porOtra
                    ? "Alguien más la fusionó mientras la revisabas: ya está hecha."
                    : hecho.repetidas === 1
                      ? "La ficha repetida quedó archivada."
                      : "Las fichas repetidas quedaron archivadas."}
                </p>
                <div className="fus-listo-texto mt-5" style={{ "--fus-k": 2 } as React.CSSProperties}>
                  {quedaEfectiva && (
                    <BotonVer href={`/productos/${quedaEfectiva}`} alNavegar={cerrar}>
                      Ver la ficha
                    </BotonVer>
                  )}
                </div>
              </div>
            )}

            {/* ---------- El pie de cada paso ---------- */}
            {vista === "armar" && (
              // Una sola fila (Felipe 2026-11-13: «la parte de abajo ocupa mucho espacio»): lo que dice la guía a la izquierda, los botones a
              // la derecha; en el celular la frase toma su propia fila.
              <div className="pie-hoja-fijo mt-4">
                <div className="pie-acciones" data-guia="fusionar.botones">
                  <div className="min-w-0 flex-1 max-sm:order-first max-sm:basis-full">
                    <PieGuia
                      guia={guiaArmar}
                      listo={errorLectura ? "No se pudieron leer las fichas." : leyendo || !plan ? "Leyendo las fichas…" : bloqueado ? "Revisa lo que falta arriba." : "Todo listo para revisar."}
                    />
                  </div>
                  <Boton peso="fantasma" type="button" onClick={cerrar}>
                    Cancelar
                  </Boton>
                  <Boton
                    peso="primario"
                    type="button"
                    disabled={leyendo || bloqueado}
                    confirma={guiaArmar}
                    title={leyendo ? "Leyendo las fichas…" : bloqueado ? "Todavía no se puede fusionar: mira el aviso." : (guiaArmar.frase ?? undefined)}
                    className={guiaArmar.claseConfirmar}
                    aria-describedby={plan && plan.bloqueos.length > 0 ? "fusionar-bloqueos" : undefined}
                    onClick={() => plan && ficha && setVista("revisar")}
                  >
                    <span className="inline-flex items-center gap-2">
                      Revisar y fusionar
                      <ArrowRight aria-hidden className="h-4 w-4" />
                    </span>
                  </Boton>
                </div>
              </div>
            )}
            {vista === "revisar" && (
              <div className="pie-hoja-fijo mt-4 space-y-3">
                {errorGuardar && (
                  <Aviso tono="error" titulo="No se pudo fusionar">
                    {errorGuardar} Las fichas siguen como estaban.
                  </Aviso>
                )}
                <AvisoNoSeDeshace />
                <div className="pie-acciones" data-guia="fusionar.confirmar">
                  <Volver onClick={() => setVista("armar")} a="Volver a elegir" />
                  <div className="min-w-0 flex-1 max-sm:order-first max-sm:basis-full">
                    <PieGuia guia={guiaRevisar} listo="Todo listo para fusionar." />
                  </div>
                  <Boton peso="fantasma" type="button" onClick={cerrar} disabled={guardando}>
                    Cancelar
                  </Boton>
                  <Boton
                    peso="primario"
                    type="button"
                    cargando={guardando}
                    textoCargando="Fusionando…"
                    disabled={leyendo || bloqueado}
                    confirma={guiaRevisar}
                    title={guiaRevisar.frase ?? responsable.motivo ?? undefined}
                    className={guiaRevisar.claseConfirmar}
                    onClick={() => void fusionar()}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Merge aria-hidden className="h-4 w-4" />
                      Sí, fusionar
                    </span>
                  </Boton>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      {comparando && (
        <CompararFichas
          productos={productos}
          quedaId={quedaEfectiva}
          detalle={detalleListo}
          errorDetalle={errorDetalle}
          enfocar={comparando}
          onClose={() => setComparando(null)}
        />
      )}
    </>
  );
}

/** Buscar la otra ficha de la misma prenda: mientras se escribe, por nombre (sin la que ya está ni las fusionadas); sin escribir, las
 *  que la base cree parecidas a esta (decisión 3: el sistema sugiere, la persona elige). */
function BuscarFicha({
  excluir,
  nombre,
  alElegir,
  deshabilitado,
  sinDuplicado,
}: {
  excluir: string[];
  nombre: string;
  alElegir: (id: string) => void;
  deshabilitado: boolean;
  sinDuplicado: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(0);
  const [resultado, setResultado] = useState<{ q: string; filas: Encontrado[] }>({ q: "", filas: [] });
  const [parecidos, setParecidos] = useState<Encontrado[]>([]);
  const claveExcluir = excluir.join(",");

  // Los parecidos a la primera ficha: lo que se ofrece antes de escribir.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("buscar_productos_parecidos", { p_referencia: nombre });
      const ids = (data ?? []).map((p: { id: string }) => p.id).filter((id: string) => !excluir.includes(id));
      const filas = ids.length > 0 ? await leerFichas(ids) : [];
      if (vigente) setParecidos(filas);
    })();
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `claveExcluir` resume `excluir`
  }, [nombre, claveExcluir]);

  const q = texto.trim();
  const buscando = q.length >= 2 && resultado.q !== q;
  const encontrados = resultado.q === q ? resultado.filas : [];
  useEffect(() => {
    if (q.length < 2) return;
    let vigente = true;
    const t = window.setTimeout(async () => {
      const filas = await leerFichas(null, q, excluir);
      if (!vigente) return;
      setResultado({ q, filas });
      setActiva(0);
    }, ESPERA_BUSQUEDA_MS);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `claveExcluir` resume `excluir`
  }, [q, claveExcluir]);

  const lista = texto.trim().length >= 2 ? encontrados : parecidos;
  const sugerencias: Sugerencia[] = lista.map((p) => ({
    clave: p.id,
    miniatura: <MiniaturaPrenda fotoUrl={p.fotoUrl} prefijo={p.categoria?.prefijo} familia={p.categoria?.familia} categoria={p.categoria?.nombre} />,
    titulo: p.referencia,
    detalle: [p.codigo, p.categoria?.nombre].filter(Boolean).join(" · "),
  }));
  const elegir = (i: number) => {
    const p = lista[i];
    if (!p) return;
    alElegir(p.id);
    setTexto("");
    setAbierta(false);
  };

  return (
    <div className="relative space-y-2">
      <Buscador
        valor={texto}
        onCambio={(v) => {
          setTexto(v);
          setAbierta(true);
        }}
        buscando={buscando}
        etiqueta="Buscar otra ficha de esta prenda"
        placeholder={`Busca la otra ficha de «${nombre}»`}
        disabled={deshabilitado}
        onFocus={() => setAbierta(true)}
        onBlur={() => window.setTimeout(() => setAbierta(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiva((a) => Math.min(a + 1, Math.max(sugerencias.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiva((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && abierta && sugerencias.length > 0) {
            e.preventDefault();
            elegir(activa);
          } else if (e.key === "Escape" && abierta) {
            e.stopPropagation();
            setAbierta(false);
          }
        }}
        {...ariaDelBuscador("fusionar-sugerencias", abierta, sugerencias.length > 0 ? activa : null)}
      />
      {abierta && (texto.trim().length >= 2 || parecidos.length > 0) && (
        <ListaSugerencias
          id="fusionar-sugerencias"
          etiqueta={texto.trim().length >= 2 ? "Fichas encontradas" : "Fichas que parecen la misma prenda"}
          sugerencias={sugerencias}
          activa={activa}
          onActiva={setActiva}
          onElegir={elegir}
          enLinea
          // Cuatro filas y asoma la quinta; las demás corren adentro: con muchas prendas la hoja ya no se alarga (Felipe 2026-11-13).
          className="fus-lista-buscar"
        >
          {!buscando && (
            <Vacio tamano="chico" icono={<SearchX />} titulo={`No hay otra ficha con «${texto.trim()}»`}>
              No hay otra ficha con «{texto.trim()}». Prueba con otra parte del nombre o con su código.
            </Vacio>
          )}
        </ListaSugerencias>
      )}
      {sinDuplicado && !abierta && parecidos.length > 0 && (
        <SugeridosEnLinea parecidos={parecidos} alElegir={alElegir} deshabilitado={deshabilitado} />
      )}
    </div>
  );
}

/** Sin escribir nada: «¿Es alguna de estas?», las fichas que la base cree la misma prenda, de un toque. */
function SugeridosEnLinea({ parecidos, alElegir, deshabilitado }: { parecidos: Encontrado[]; alElegir: (id: string) => void; deshabilitado: boolean }): ReactNode {
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-taupe">¿Es alguna de estas?</p>
      <ul className="flex flex-wrap gap-2">
        {parecidos.slice(0, MAX_SUGERIDOS).map((p) => (
          <li key={p.id}>
            <button type="button" disabled={deshabilitado} onClick={() => alElegir(p.id)} className="btn-cayla btn-secundario btn-chico">
              {p.referencia}
              {p.codigo ? <span className="text-taupe"> · {p.codigo}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Las fichas, con lo que la hoja muestra de cada una. Por ids (los parecidos) o por nombre o código (lo que se escribe; dos consultas
 *  y no un `.or()`, que interpolaría el texto de la persona dentro del filtro, como en `ventas-v2.ts`). Sin las fusionadas ni las
 *  rechazadas: no se pueden fusionar. */
async function leerFichas(ids: string[] | null, q?: string, excluir: string[] = []): Promise<Encontrado[]> {
  const supabase = createClient();
  const base = () => {
    let c = supabase
      .from("productos")
      .select("id, referencia, codigo, categoria:categorias ( nombre, prefijo, familia ), producto_fotos ( url, es_principal )")
      .is("fusionado_en_id", null)
      .neq("estado_alta", "rechazado")
      .limit(8);
    if (excluir.length > 0) c = c.not("id", "in", `(${excluir.join(",")})`);
    return c;
  };
  const literal = (q ?? "").replace(/[\\%_]/g, (x) => `\\${x}`);
  const respuestas = ids
    ? [await base().in("id", ids)]
    : await Promise.all([base().ilike("referencia", `%${literal}%`).order("referencia"), base().ilike("codigo", `%${literal}%`).order("referencia")]);
  const vistos = new Set<string>();
  return respuestas
    .flatMap((r) => r.data ?? [])
    .filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
    .slice(0, 8)
    .map((p) => {
      const fotos = (p.producto_fotos ?? []) as { url: string; es_principal: boolean }[];
      return {
        id: p.id,
        referencia: p.referencia,
        codigo: p.codigo,
        categoria: p.categoria as unknown as Encontrado["categoria"],
        fotoUrl: fotos.find((f) => f.es_principal)?.url ?? fotos[0]?.url ?? null,
      };
    });
}
