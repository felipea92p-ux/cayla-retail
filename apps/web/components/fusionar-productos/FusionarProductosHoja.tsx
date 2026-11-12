"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Merge, SearchX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import {
  ELECCIONES_VACIAS,
  camposAElegir,
  camposDeLaGuia,
  eleccionesParaLaBase,
  fechaDeAlta,
  fotosEnOrden,
  frasesDelResumen,
  fuenteDe,
  leerPlan,
  motivoSugerido,
  nombreDeCampo,
  opcionesDeCampo,
  quedaSugerido,
  textoVentas,
  type CampoFusion,
  type Elecciones,
  type PlanFusion,
} from "@/lib/fusionar-productos-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
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

/**
 * «Fusionar productos repetidos» (ADR-0650, Felipe 2026-11-12): junta dos o más fichas de la misma prenda en una sola, sin perder
 * ventas, fotos ni stock. Todo lo que muestra lo calcula la base (`previsualizar_fusion_productos`) y lo que guarda lo hace una sola
 * función (`fusionar_productos`), con el mismo cálculo: lo que se ve es lo que pasa.
 *
 * Se abre desde la vista rápida («Fusionar») con una ficha, o desde la Tabla con las fichas marcadas. Las 15 decisiones de Felipe
 * están en `docs/adr/0650-fusionar-productos-duplicados.md`: elige la persona cuál queda (viendo sus ventas y su fecha de alta),
 * campo por campo lo que difiere, las fotos que quedan; no se deshace.
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
  const [guardando, setGuardando] = useState(false);

  const quedaEfectiva = queda ?? ids[0] ?? null;
  const duplicados = ids.filter((id) => id !== quedaEfectiva);
  const hayFusion = Boolean(quedaEfectiva) && duplicados.length > 0;

  // ---------- Leer el plan: cada vez que cambian las fichas, cuál queda o un dato que decide un bloqueo ----------
  const clavePlan = JSON.stringify({ quedaEfectiva, duplicados, campos: elecciones.campos });
  const leyendo = hayFusion && lectura?.clave !== clavePlan;
  const plan = hayFusion ? (lectura?.plan ?? null) : null;
  const errorLectura = hayFusion && lectura?.clave === clavePlan ? lectura.error : null;
  const productos = useMemo(() => plan?.productos ?? [], [plan]);

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

  // ---------- La guía de foco (ADR-0284) ----------
  const campos = camposDeLaGuia({
    duplicados: duplicados.length,
    queda: quedaEfectiva,
    hayDiferencias: camposAElegir(plan?.diferencias ?? []).length > 0,
    responsableListo: responsable.listo,
  });
  const guia = useGuiaCampos(campos);

  const fotos = useMemo(() => fotosEnOrden(productos), [productos]);
  const fotosQueQuedan = elecciones.fotos ?? fotos.map((f) => f.id);
  const bloqueado = !plan || !plan.ok;
  const puedeFusionar = !bloqueado && !leyendo && sePuedeConfirmar(campos) && !guardando;

  async function fusionar() {
    if (!puedeFusionar || !plan || !quedaEfectiva) return;
    setGuardando(true);
    const versiones = Object.fromEntries(plan.productos.map((p) => [p.id, p.version]));
    const { data, error } = await firmar(
      createClient().rpc("fusionar_productos", {
        p_queda: quedaEfectiva,
        p_duplicados: duplicados,
        p_elecciones: eleccionesParaLaBase(elecciones, plan.productos, plan.diferencias, quedaEfectiva) as never,
        p_versiones: versiones,
      }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "fusionar los productos"));
      return;
    }
    const nombre = (data as { producto_id?: string } | null)?.producto_id ? plan.productos.find((p) => p.id === quedaEfectiva)?.referencia : null;
    avisar.exito("Productos fusionados", {
      detalle: `${duplicados.length === 1 ? "La ficha repetida quedó" : `Las ${duplicados.length} fichas repetidas quedaron`} dentro de «${nombre ?? "la que queda"}», con su stock, sus ventas y sus fotos.`,
    });
    onHecho?.(quedaEfectiva);
    onClose();
    router.refresh();
  }

  const quitar = (id: string) => {
    setIds((xs) => xs.filter((x) => x !== id));
    if (queda === id) setQueda(null);
    setElecciones(ELECCIONES_VACIAS);
  };
  const agregar = (id: string) => {
    setIds((xs) => (xs.includes(id) ? xs : [...xs, id]));
    setElecciones(ELECCIONES_VACIAS);
  };

  const nombreInicial = inicial[0]?.referencia ?? "esta prenda";
  const elegibles = camposAElegir(plan?.diferencias ?? []);

  return (
    <Modal
      variante="hoja"
      tamano="ancha"
      bloqueado={guardando}
      titulo="Fusionar productos repetidos"
      subtitulo="Junta las fichas de una misma prenda en una sola. Las ventas, las fotos y el stock no se pierden."
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="space-y-6">
          {/* ---------- 1. Las fichas ---------- */}
          <CampoGuiado id="duplicados" guia={guia} titulo="Las fichas de esta prenda">
            <div className="space-y-3" data-guia="fusionar.fichas">
              <ul className="divide-y divide-sand rounded-xl border border-sand">
                {ids.map((id) => {
                  const p = productos.find((x) => x.id === id);
                  const nombre = p?.referencia ?? inicial.find((f) => f.productoId === id)?.referencia ?? "…";
                  return (
                    <li key={id} className="flex items-center gap-3 px-3 py-2.5">
                      <MiniaturaPrenda
                        fotoUrl={p?.fotos.find((f) => f.esPrincipal)?.url ?? p?.fotos[0]?.url ?? null}
                        prefijo={p?.categoria.prefijo}
                        familia={p?.categoria.familia}
                        categoria={p?.categoria.nombre}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-tinta">{nombre}</span>
                        <span className="block truncate text-sm text-taupe">
                          {[p?.codigo, p?.categoria.nombre].filter(Boolean).join(" · ") || " "}
                        </span>
                      </span>
                      {ids.length > 1 && (
                        <button
                          type="button"
                          onClick={() => quitar(id)}
                          disabled={guardando}
                          className="btn-cayla btn-sutil btn-chico"
                          aria-label={`Quitar «${nombre}» de la fusión`}
                        >
                          <X aria-hidden className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <BuscarFicha excluir={ids} nombre={nombreInicial} alElegir={agregar} deshabilitado={guardando} sinDuplicado={duplicados.length === 0} />
            </div>
          </CampoGuiado>

          {errorLectura && <Aviso tono="error" titulo="No se pudieron leer las fichas">{errorLectura}</Aviso>}

          {plan && productos.length > 1 && (
            <>
              {/* ---------- 2. Cuál queda (decisión 1) ---------- */}
              <CampoGuiado id="queda" guia={guia} titulo="¿Cuál se queda?" ayuda="Las demás pasan a esta. Mira cuál vendió más y cuál se creó primero.">
                <div role="radiogroup" aria-label="La ficha que se queda" className="grid gap-2 sm:grid-cols-2" data-guia="fusionar.queda">
                  {productos.map((p) => {
                    const elegido = p.id === quedaEfectiva;
                    const motivo = motivoSugerido(productos, p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={elegido}
                        disabled={guardando}
                        onClick={() => {
                          setQueda(p.id);
                          setElecciones(ELECCIONES_VACIAS);
                        }}
                        className={`flex gap-3 rounded-xl border px-3 py-3 text-left transition-colors ease-cayla ${
                          elegido ? "border-tinta bg-hueso" : "border-borde-control bg-papel hover:border-tinta/40"
                        }`}
                      >
                        <MiniaturaPrenda
                          tamano="xl"
                          fotoUrl={p.fotos.find((f) => f.esPrincipal)?.url ?? p.fotos[0]?.url ?? null}
                          prefijo={p.categoria.prefijo}
                          familia={p.categoria.familia}
                          categoria={p.categoria.nombre}
                        />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[15px] font-medium text-tinta">{p.referencia}</span>
                            {elegido && <Chip tono="tinta">Queda</Chip>}
                          </span>
                          <span className="block text-sm text-taupe">{[p.codigo, p.categoria.nombre].filter(Boolean).join(" · ")}</span>
                          <span className="block text-sm text-tinta">
                            {textoVentas(p)} · {p.stock.toLocaleString("es-PE")} en stock
                          </span>
                          <span className="block text-sm text-taupe">{fechaDeAlta(p.creadoEn)}</span>
                          {motivo && (
                            <Chip tono="pizarra" versalitas={false}>
                              {motivo}
                            </Chip>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CampoGuiado>

              {/* ---------- 3. Lo que es distinto (decisión 8) ---------- */}
              {elegibles.length > 0 && (
                <CampoGuiado id="diferencias" guia={guia} titulo="Lo que es distinto" ayuda="Elige con qué dato se queda. Lo que no aparece aquí es igual en las fichas.">
                  <div className="space-y-4" data-guia="fusionar.diferencias">
                    {elegibles.map((campo) => (
                      <ElegirCampo
                        key={campo}
                        campo={campo}
                        plan={plan}
                        elegido={
                          campo === "precio"
                            ? fuenteDe(elecciones.precioDe, "precio", plan.diferencias, quedaEfectiva)
                            : campo === "costo"
                              ? fuenteDe(elecciones.costoDe, "costo", plan.diferencias, quedaEfectiva)
                              : (elecciones.campos[campo as CampoFusion] ?? quedaEfectiva)
                        }
                        deshabilitado={guardando}
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
                    ))}
                    {elegibles.includes("costo") && (
                      <p className="nota-cayla">El costo que ya sale de las compras no cambia: el elegido va solo en las tallas que todavía no tienen compras.</p>
                    )}
                  </div>
                </CampoGuiado>
              )}

              {/* ---------- 4. Fotos (decisión 9) ---------- */}
              {fotos.length > 0 && (
                <section className="space-y-3" data-guia="fusionar.fotos">
                  <TituloGrupo cuenta={fotosQueQuedan.length} nota="las que no marques se guardan en la ficha repetida">
                    Fotos que quedan
                  </TituloGrupo>
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {fotos.map((f) => {
                      const marcada = fotosQueQuedan.includes(f.id);
                      const principal = fotosQueQuedan[0] === f.id;
                      const de = productos.find((p) => p.fotos.some((x) => x.id === f.id));
                      return (
                        <li key={f.id} className="relative">
                          <div
                            className={`relative overflow-hidden rounded-lg border bg-hueso ${marcada ? "border-tinta" : "border-sand opacity-60"}`}
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

              {/* ---------- 5. Qué va a pasar (decisión 14: el resumen antes de confirmar) ---------- */}
              <section className="space-y-3" data-guia="fusionar.resumen">
                <TituloGrupo>Qué va a pasar</TituloGrupo>
                <ul className="space-y-1.5 text-[15px] text-tinta">
                  {frasesDelResumen(plan, fotosQueQuedan.length).map((f) => (
                    <li key={f} className="flex gap-2">
                      <Merge aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-taupe" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {plan.variantes.some((v) => v.trato === "junta") && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Tallas y colores que se juntan">
                    {plan.variantes
                      .filter((v) => v.trato === "junta")
                      .map((v) => (
                        <li key={v.varianteId}>
                          <Chip tono="neutro" versalitas={false}>
                            {[v.color, v.talla].filter(Boolean).join(" ")}
                            {v.stock > 0 ? ` · +${v.stock}` : ""}
                          </Chip>
                        </li>
                      ))}
                  </ul>
                )}
              </section>

              {plan.bloqueos.length > 0 && (
                <Aviso tono="atencion" titulo="Todavía no se puede fusionar" guia="fusionar.bloqueos">
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {plan.bloqueos.map((b) => (
                      <li key={b.codigo + b.mensaje}>{b.mensaje}</li>
                    ))}
                  </ul>
                </Aviso>
              )}
            </>
          )}

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          <div className="pie-hoja-fijo space-y-3">
            <AvisoNoSeDeshace />
            <PieGuia guia={guia} listo={bloqueado ? "Revisa lo que falta arriba." : "Todo listo para fusionar."} />
            <div className="pie-acciones" data-guia="fusionar.botones">
              <Boton peso="fantasma" type="button" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton
                peso="primario"
                type="button"
                cargando={guardando}
                textoCargando="Fusionando…"
                disabled={!puedeFusionar}
                title={responsable.motivo ?? undefined}
                onClick={() => void fusionar()}
              >
                <span className="inline-flex items-center gap-2">
                  <Merge aria-hidden className="h-4 w-4" />
                  {duplicados.length > 1 ? `Fusionar ${ids.length} fichas` : "Fusionar"}
                </span>
              </Boton>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Una pregunta de «Lo que es distinto»: las opciones son el valor de cada ficha (las iguales, una sola vez). */
function ElegirCampo({
  campo,
  plan,
  elegido,
  deshabilitado,
  onElegir,
}: {
  campo: CampoFusion | "precio" | "costo";
  plan: PlanFusion;
  elegido: string | null;
  deshabilitado: boolean;
  onElegir: (productoId: string) => void;
}) {
  const opciones = opcionesDeCampo(plan.productos, campo);
  // La opción elegida es la del producto elegido, o la del producto cuyo valor es igual al suyo (se dibujó una sola vez).
  const valorElegido = plan.productos.find((p) => p.id === elegido);
  const marcada = opciones.find((o) => o.productoId === elegido) ?? opciones.find((o) => valorElegido && o.valor === opcionesDeCampo([valorElegido], campo)[0]?.valor);
  return (
    <div className="space-y-1.5">
      <span className="campo-etiqueta">{nombreDeCampo(campo)}</span>
      <div role="radiogroup" aria-label={nombreDeCampo(campo)} className="grid gap-2 sm:grid-cols-2">
        {opciones.map((o) => {
          const si = marcada?.productoId === o.productoId;
          return (
            <button
              key={o.productoId}
              type="button"
              role="radio"
              aria-checked={si}
              disabled={deshabilitado}
              onClick={() => onElegir(o.productoId)}
              className={`rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors ease-cayla ${
                si ? "border-tinta bg-hueso text-tinta" : "border-borde-control bg-papel text-tinta/80 hover:border-tinta/40"
              }`}
            >
              {o.valor}
            </button>
          );
        })}
      </div>
    </div>
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
        {parecidos.map((p) => (
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
