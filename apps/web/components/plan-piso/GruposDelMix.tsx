"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton, Desplegable } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Encabezado, TABLA, celda, fila } from "@/components/ui/Tabla";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import {
  armarVista,
  cambiosPreparados,
  conCambio,
  confirmarPropuestas,
  describirCambio,
  estadoDe,
  gruposPermitidos,
  leerResultado,
  loteParaGuardar,
  obsoletas,
  preparadoDe,
  resumir,
  ROL_AYUDA,
  ROL_ETIQUETA,
  sinObsoletas,
  textoGuardado,
  type CambioGrupo,
  type CategoriaMix,
  type EstadoCategoria,
  type GrupoMix,
  type Pendientes,
  type Seccion,
} from "@/lib/plan-piso-grupos";

// Plan del piso ▸ los grupos del mix (ADR-0329 + ADR-0328, actividad 12, primera entrega). El líder revisa a qué grupo va cada
// categoría —la propuesta viene sembrada y se ve «Por revisar»— y la confirma o la cambia. Nada se guarda al tocar: cada cambio
// queda PREPARADO en la fila y se guarda todo junto desde la barra de abajo («Tienes N cambios sin guardar», como Editar producto),
// con la firma del responsable. Es la unidad todo-o-nada de la base (`fijar_grupos_de_categorias`): confirmar las 42 de una vez es
// un solo guardado, y si una choca con el cambio de otra persona no se guarda ninguna.
//
// Por qué cada categoría solo ofrece los grupos de su lado del riel (`gruposPermitidos`): un vestido entre los accesorios de la caja es
// un error que el diseño no debe dejar cometer; la base lo rechazaría igual (`grupo_incoherente_con_familia`).
//
// Quien recibe el módulo sin ser líder VE los grupos y su estado, pero no tiene combos ni botones: la base pide al líder.

const PLANTILLA = "sm:grid-cols-[minmax(0,1.3fr)_8.5rem_minmax(0,1.2fr)]";
const COLUMNAS = [{ titulo: "Categoría" }, { titulo: "Estado" }, { titulo: "Grupo del plan" }];

const ESTADO_CHIP: Record<EstadoCategoria, { tono: TonoChip; texto: string; ayuda: string }> = {
  confirmada: { tono: "verde", texto: "Confirmada", ayuda: "El líder ya revisó y confirmó este grupo." },
  por_revisar: { tono: "ambar", texto: "Por revisar", ayuda: "Es la propuesta: el líder todavía no la confirmó." },
  sin_grupo: { tono: "ambar", texto: "Sin grupo", ayuda: "Categoría nueva: todavía no tiene grupo. Elige uno." },
};

const reducido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function GruposDelMix({ grupos, categorias, esLider }: { grupos: GrupoMix[]; categorias: CategoriaMix[]; esLider: boolean }) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState<Pendientes>(new Map());
  const [hojaAbierta, setHojaAbierta] = useState(false);

  const vista = useMemo(() => armarVista(grupos, categorias), [grupos, categorias]);
  const resumen = useMemo(() => resumir(categorias), [categorias]);
  const cambios = useMemo(() => cambiosPreparados(categorias, pendientes), [categorias, pendientes]);

  // El orden en que se ven en pantalla: primero las sin grupo, después cada grupo.
  const enPantalla = useMemo(() => [...vista.sinGrupo, ...vista.secciones.flatMap((s) => s.categorias)], [vista]);
  const siguiente = enPantalla.find((c) => estadoDe(c) !== "confirmada" && preparadoDe(pendientes, c) === undefined) ?? null;
  const porConfirmar = categorias.filter((c) => estadoDe(c) === "por_revisar" && preparadoDe(pendientes, c) === undefined).length;
  // Cambios preparados sobre una categoría que otra persona cambió después (la pantalla se actualizó): no valen y se dice cuáles.
  const quitadas = useMemo(() => obsoletas(categorias, pendientes), [categorias, pendientes]);

  function irA(c: CategoriaMix) {
    const el = document.getElementById(`cat-${c.categoriaId}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: reducido() ? "auto" : "smooth" });
    // El mismo destello de la guía de foco (`[data-campo][data-llamado]`): una vez, para que el ojo la encuentre.
    el.removeAttribute("data-llamado");
    void el.offsetWidth;
    el.setAttribute("data-llamado", "");
    window.setTimeout(() => el.removeAttribute("data-llamado"), 1200);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TarjetaCifra etiqueta="Categorías" valor={resumen.total} className="anim-sube">
          activas, repartidas en {grupos.length} grupos
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Confirmadas" valor={resumen.confirmadas} className="anim-sube" style={{ "--i": 1 } as React.CSSProperties}>
          {resumen.confirmadas === resumen.total && resumen.total > 0 ? "todas revisadas por el líder" : "ya revisadas por el líder"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Por revisar" valor={resumen.porRevisar} acento={resumen.porRevisar > 0} className="anim-sube" style={{ "--i": 2 } as React.CSSProperties}>
          {resumen.porRevisar > 0 ? "propuestas que falta confirmar" : "no queda ninguna propuesta"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Sin grupo" valor={resumen.sinGrupo} acento={resumen.sinGrupo > 0} className="anim-sube" style={{ "--i": 3 } as React.CSSProperties}>
          {resumen.sinGrupo > 0 ? "categorías nuevas por ubicar" : "ninguna categoría sin ubicar"}
        </TarjetaCifra>
      </div>

      <section className="card-cayla overflow-hidden anim-sube" style={{ "--i": 2 } as React.CSSProperties} aria-label="Grupos del plan del piso">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-sand px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-tinta">Grupos del plan</h2>
            <p className="mt-0.5 max-w-xl text-[13px] text-tinta/70">
              {esLider
                ? "Revisa a qué grupo va cada categoría. Lo que cambies o confirmes queda con tu firma."
                : "Así quedó cada categoría. Solo el líder decide a qué grupo va."}
            </p>
          </div>
          {esLider && (
            <div className="flex flex-wrap items-center gap-2.5">
              {siguiente && (
                <button type="button" className="btn-cayla btn-enlace text-[12.5px]" onClick={() => irA(siguiente)}>
                  Siguiente por revisar: {siguiente.categoria} →
                </button>
              )}
              {porConfirmar > 0 && (
                <button type="button" className="btn-cayla btn-secundario" onClick={() => setPendientes(confirmarPropuestas(pendientes, categorias))}>
                  Confirmar {porConfirmar === 1 ? "la propuesta" : `las ${porConfirmar} propuestas`}
                </button>
              )}
            </div>
          )}
        </div>

        {quitadas.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-sand bg-ambar/10 px-5 py-3 text-[13px] text-tinta">
            <p className="min-w-0">
              Otra persona cambió {quitadas.map((q) => `«${q.categoria}»`).join(", ")} mientras tenías cambios preparados. Quité {quitadas.length === 1 ? "ese cambio" : "esos cambios"}{" "}
              de lo tuyo para no pisarla: revisa cómo quedó {quitadas.length === 1 ? "y vuelve a decidir si hace falta" : "y vuelve a decidir lo que haga falta"}.
            </p>
            <button type="button" className="btn-cayla btn-enlace shrink-0 text-[12.5px]" onClick={() => setPendientes(sinObsoletas(categorias, pendientes))}>
              Entendido
            </button>
          </div>
        )}

        <div className="divide-y divide-sand">
          <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
          {vista.sinGrupo.length > 0 && (
            <SeccionSinGrupo categorias={vista.sinGrupo}>
              {vista.sinGrupo.map((c) => (
                <FilaCategoria key={c.categoriaId} c={c} grupos={grupos} pendientes={pendientes} esLider={esLider} onPreparar={setPendientes} />
              ))}
            </SeccionSinGrupo>
          )}
          {vista.secciones.map((s) => (
            <SeccionDeGrupo key={s.grupo.clave} s={s}>
              {s.categorias.map((c) => (
                <FilaCategoria key={c.categoriaId} c={c} grupos={grupos} pendientes={pendientes} esLider={esLider} onPreparar={setPendientes} />
              ))}
            </SeccionDeGrupo>
          ))}
        </div>
      </section>

      <p className="nota-cayla">
        Los grupos son la unidad del plan: con pocos días de venta, repartir el piso categoría por categoría daría cifras de 2 prendas que no dicen nada.
        «Por revisar» es la propuesta de la investigación del 4 de octubre; el rol de cada grupo (destino, rutina…) es una hipótesis que se valida con las
        ventas de cada sede, no un hecho. Cuánto lugar tiene cada grupo viene en el paso siguiente, sobre estos mismos grupos.
      </p>

      <BarraFija
        visible={esLider && cambios.length > 0}
        resumenMinimo="min-w-[17rem]"
        resumen={
          <div role="status" className="flex items-start gap-3">
            <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-ambar" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tinta">Tienes {cambios.length === 1 ? "1 cambio" : `${cambios.length} cambios`} sin guardar</p>
              <p className="text-[13px] text-tinta/65">
                Aún no se guardó nada.<span className="hidden sm:inline"> Cuando termines, pulsa «Revisar y guardar».</span>
              </p>
            </div>
          </div>
        }
        acciones={
          <>
            <Boton type="button" peso="discreto" className="max-sm:shrink-0" onClick={() => setPendientes(new Map())}>
              Descartar
            </Boton>
            <Boton type="button" peso="primario" className="max-sm:flex-1" onClick={() => setHojaAbierta(true)}>
              Revisar y guardar
            </Boton>
          </>
        }
      />

      {hojaAbierta && (
        <HojaGuardarGrupos
          cambios={cambios}
          grupos={grupos}
          onClose={() => setHojaAbierta(false)}
          onGuardado={() => {
            setPendientes(new Map());
            router.refresh();
          }}
          onActualizar={() => router.refresh()}
        />
      )}
    </div>
  );
}

function CabeceraDeSeccion({ children, derecha }: { children: React.ReactNode; derecha: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 bg-hueso/70 px-5 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
      <p className="text-xs text-taupe">{derecha}</p>
    </div>
  );
}

function SeccionSinGrupo({ categorias, children }: { categorias: CategoriaMix[]; children: React.ReactNode }) {
  return (
    <div>
      <CabeceraDeSeccion derecha={`${categorias.length} ${categorias.length === 1 ? "categoría" : "categorías"}`}>
        <h3 className="text-sm font-semibold text-tinta">Sin grupo</h3>
        <Chip tono="ambar">Elige uno</Chip>
      </CabeceraDeSeccion>
      <div>{children}</div>
    </div>
  );
}

function SeccionDeGrupo({ s, children }: { s: Seccion; children: React.ReactNode }) {
  const n = s.categorias.length;
  return (
    <div>
      <CabeceraDeSeccion
        derecha={`${n} ${n === 1 ? "categoría" : "categorías"}${s.porRevisar > 0 ? ` · ${s.porRevisar} por revisar` : ""}`}
      >
        <h3 className="text-sm font-semibold text-tinta">{s.grupo.nombre}</h3>
        <span title={ROL_AYUDA[s.grupo.rol]}>
          <Chip tono="pizarra">{ROL_ETIQUETA[s.grupo.rol]}</Chip>
        </span>
        <span className="text-xs text-taupe">{s.grupo.enRiel ? "En el riel" : "Fuera del riel: se mide como % de la venta"}</span>
      </CabeceraDeSeccion>
      {n === 0 ? <p className={`${TABLA.vacio} text-taupe`}>Ninguna categoría en este grupo todavía.</p> : <div>{children}</div>}
    </div>
  );
}

function FilaCategoria({
  c,
  grupos,
  pendientes,
  esLider,
  onPreparar,
}: {
  c: CategoriaMix;
  grupos: GrupoMix[];
  pendientes: Pendientes;
  esLider: boolean;
  onPreparar: (p: Pendientes) => void;
}) {
  const estado = estadoDe(c);
  const preparado = preparadoDe(pendientes, c);
  const chip = ESTADO_CHIP[estado];
  const nombreGrupo = (clave: string | null) => (clave === null ? null : (grupos.find((g) => g.clave === clave)?.nombre ?? clave));
  const opciones = gruposPermitidos(c, grupos).map((g) => ({ valor: g.clave, texto: g.nombre }));

  return (
    <div id={`cat-${c.categoriaId}`} data-campo={`cat-${c.categoriaId}`} className={fila(PLANTILLA, "sm:items-center")}>
      <div className={celda("izq")}>
        <span className="text-sm text-tinta">{c.categoria}</span>
        {c.prefijo && <span className="ml-2 font-mono text-[11px] text-taupe">{c.prefijo}</span>}
      </div>
      <div className={celda("izq", "flex flex-wrap items-center gap-1.5")}>
        {preparado !== undefined ? (
          <span title="Preparado: se guarda al pulsar «Revisar y guardar».">
            <Chip tono="pizarra">Sin guardar</Chip>
          </span>
        ) : (
          <span title={chip.ayuda}>
            <Chip tono={chip.tono}>{chip.texto}</Chip>
          </span>
        )}
      </div>
      <div className={celda("izq", "flex flex-wrap items-center gap-2")}>
        {esLider ? (
          <>
            <Desplegable
              valor={preparado ?? c.grupoClave ?? ""}
              onValor={(clave) => onPreparar(conCambio(pendientes, c, clave))}
              opciones={opciones}
              marcador="Elegir grupo"
              forma="cajaBaja"
              etiquetaAccesible={`Grupo de ${c.categoria}`}
              className="min-w-[12rem] flex-1"
            />
            {estado === "por_revisar" && preparado === undefined && (
              <button
                type="button"
                className="btn-cayla btn-enlace shrink-0 text-[12.5px]"
                onClick={() => onPreparar(conCambio(pendientes, c, c.grupoClave as string))}
                aria-label={`Confirmar ${c.categoria} en ${nombreGrupo(c.grupoClave)}`}
              >
                Confirmar
              </button>
            )}
          </>
        ) : (
          <span className="text-sm text-tinta/80">{nombreGrupo(c.grupoClave) ?? "Sin grupo"}</span>
        )}
      </div>
    </div>
  );
}

function HojaGuardarGrupos({
  cambios,
  grupos,
  onClose,
  onGuardado,
  onActualizar,
}: {
  cambios: CambioGrupo[];
  grupos: GrupoMix[];
  onClose: () => void;
  onGuardado: () => void;
  onActualizar: () => void;
}) {
  // Firma quien decide, de turno en la sede activa (ADR-0161, «Actualización 2026-09-23 (c)»): todas las funciones que guardan.
  const responsable = useResponsable();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Otra persona cambió una de estas categorías mientras la pantalla estaba abierta: se rechazó TODO y hay que volver a leer.
  const [choque, setChoque] = useState(false);
  const enVuelo = useRef(false);

  // Guía de foco (CLAUDE.md «Guía de foco», ADR-0284): lo único que falta para guardar es quién hace la operación; sale de la misma
  // regla que habilita «Guardar» (`responsable.listo`).
  const guia = useGuiaCampos([{ id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsable.listo, pendiente: "Elige quién hace esta operación." }]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (choque) {
      onActualizar();
      return onClose();
    }
    if (!responsable.listo) {
      if (responsable.motivo) setError(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    const { data, error: errorRpc } = await firmar(
      createClient().rpc("fijar_grupos_de_categorias" as never, { p_cambios: loteParaGuardar(cambios) } as never),
      responsable.firma()
    );
    setEnviando(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      enVuelo.current = false;
      // Las reglas de esta función vienen en castellano de CAYLA con un `hint` que empieza por «grupos_mix_», y el choque de versión
      // dice cuál categoría cambió la otra persona.
      if (errorRpc.hint === "version_cambiada") {
        setChoque(true);
        setError(`${errorRpc.message} No se guardó ninguna: actualiza para ver cómo quedó y revisa tus cambios.`);
      } else {
        setError(errorRpc.hint?.startsWith("grupos_mix_") ? errorRpc.message : traducirError(errorRpc, "guardar los grupos"));
      }
      return;
    }
    const r = leerResultado(data);
    avisar.exito("Grupos del plan guardados", { detalle: r ? textoGuardado(r) : undefined });
    onGuardado();
    onClose();
  }

  return (
    <Modal
      variante="hoja"
      titulo="Guardar los grupos"
      subtitulo={cambios.length === 1 ? "1 categoría" : `${cambios.length} categorías`}
      onClose={onClose}
      ancho="max-w-[520px]"
      bloqueado={enviando}
    >
      <form onSubmit={guardar} className="space-y-4" noValidate>
        <p className="text-[13px] text-taupe">
          Se guardan todas juntas: si una no se puede guardar, no se guarda ninguna. Cada una queda confirmada con tu firma.
        </p>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-md bg-hueso px-4 py-3 text-[13px] text-tinta">
          {cambios.map((c) => (
            <li key={c.categoriaId}>{describirCambio(c, grupos)}</li>
          ))}
        </ul>

        <div className="min-h-[1rem] text-xs text-rojo-profundo" role="alert">
          {error}
        </div>

        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={enviando || choque} />
        </CampoGuiado>
        <PieGuia guia={guia} listo="Todo listo para guardar." />

        <div className="fin-botones pie-hoja-fijo">
          <button type="button" className="btn-cayla btn-secundario" onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="submit"
            className={`btn-cayla btn-primario ${choque ? "" : guia.claseConfirmar}`}
            disabled={enviando || (!choque && !guia.puedeConfirmar)}
            title={choque ? undefined : (responsable.motivo ?? guia.frase ?? undefined)}
          >
            {enviando ? "Guardando…" : choque ? "Actualizar y revisar" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
