"use client";

import { useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { nivelMargen, type ColorAlta } from "@/lib/alta-producto";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import { cambiosDeVariante, textoPendienteDeVariante, type Cambio, type ResumenCambios } from "@/lib/producto-cambios-reglas";
import {
  agregarCombinaciones,
  agruparPorColor,
  avisoDesactivar,
  bloqueoPorVenta,
  cambiarFila,
  choqueDeCorreccion,
  codigoQueMuestra,
  corregida,
  corregir,
  destinoGuardado,
  ejesDeLaPrenda,
  etiquetasComunes,
  filasDelEje,
  margenDeFila,
  nombreVariante,
  quitarNueva,
  desactivarColor,
  textoChoque,
  textosCostoFijo,
  textoSedes,
  todasNuevas,
  unidadesEnStock,
  type CampoBloque,
  type Destino,
  type FilaFicha,
  type Identidad,
  type ProblemaFicha,
} from "@/lib/variantes-ficha-reglas";
import { AgregarColoresModal, type ResultadoAgregarColores } from "./AgregarColoresModal";
import { AgregarTallasModal } from "./AgregarTallasModal";
import { AjusteDeStock } from "./AjusteDeStock";
import { CambiarEnBloque } from "./CambiarEnBloque";
import { CorregirVarianteModal, type EjesCorreccion } from "./CorregirVarianteModal";
import { PuntoColor, type ContextoFicha } from "./piezas";

// La sección «Variantes» de la ficha de una prenda (ADR-0263). La prenda se ve como en el alta: por EJES. Arriba, sus
// colores y sus tallas (cada chip corrige ese color o esa talla si se registró mal; «+ Agregar» es para lo que llegó
// nuevo); debajo, las variantes agrupadas por color, con su stock. Corregir y agregar son dos gestos distintos con dos
// palabras distintas, porque para quien está en la tienda son dos cosas distintas: «Corregir» = se registró mal (conserva
// stock e historia), «Agregar» = llegó nuevo. No hay un tercer verbo para esos gestos: «Cambiar» queda solo para una
// fila NUEVA (todavía no existe: cambiarla no toca nada).
//
// Nada se guarda aquí: cada gesto cambia las filas de la ficha (y ProductoForm mueve fotos y temporada con el color) y
// todo viaja en un solo «Revisar y guardar» (ADR-0257: la barra de abajo y la hoja). Lo que cambió en cada fila se marca en
// ámbar con la MISMA cuenta que la barra (`resumen`, de `lib/producto-cambios-reglas.ts`). Las reglas de la sección son
// de `lib/variantes-ficha-reglas.ts`.

type ModalAbierto = { tipo: "corregir"; claves: string[]; ejes: EjesCorreccion } | { tipo: "agregar-color" } | { tipo: "agregar-talla" } | null;

const NUMERO =
  "w-full min-w-0 border-b border-tinta/25 bg-transparent px-0.5 py-1.5 text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-tinta sm:text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
/** El mismo campo con la línea de abajo en ámbar: cambió y todavía no se guardó (ADR-0257). Se arma cambiando la clase, no
 *  sumando otra: dos colores de borde en el mismo elemento los resuelve el orden de la hoja de estilos, no el del atributo. */
const NUMERO_CAMBIADO = NUMERO.replace("border-tinta/25", "border-ambar");

/** En celular la fila es una tarjeta (identidad y menú arriba; precio, costo y margen; stock). En escritorio, una línea. */
function columnas(conStock: boolean): string {
  return conStock
    ? "sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_3.5rem_4.5rem_2.5rem]"
    : "sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_3.5rem_2.5rem]";
}

const ROTULO = "block text-[10.5px] font-medium uppercase tracking-wide text-taupe sm:sr-only";

export function VariantesFicha({
  ctx,
  filas,
  problemas,
  onFilas,
  onBloquePendiente,
  tallasCategoria,
  categoriaNombre,
  onColorCreado,
  onFotosDeColores,
  etiquetas,
  avisoEtiquetas,
  deshabilitado,
  resumen,
  detalle = false,
}: {
  ctx: ContextoFicha;
  filas: FilaFicha[];
  /** Lo que impide guardar (`problemasVariantes`, armado en ProductoForm con la categoría ELEGIDA): la MISMA lista con que
   *  «Revisar y guardar» decide. Aquí marca cada fila con el suyo. */
  problemas: readonly ProblemaFicha[];
  /** Todo cambio de las filas pasa por aquí (ProductoForm mueve con el color las fotos y la temporada). */
  onFilas: (siguiente: FilaFicha[]) => void;
  /** Hay un monto escrito en «Cambiar en bloque» sin aplicar (o ya no): el guardado lo avisa y no lo pierde en silencio. */
  onBloquePendiente: (pendiente: CampoBloque | null) => void;
  /** Las tallas habilitadas en la categoría elegida, ya ordenadas. */
  tallasCategoria: ValorVocabulario[];
  categoriaNombre?: string;
  /** Un color creado desde «Agregar color»: la ficha lo suma a su vocabulario para nombrarlo y pintarlo. */
  onColorCreado: (color: ColorAlta) => void;
  /** Las fotos que se eligieron en «Agregar color» (ya subidas), cada una con el color al que se agregó (ADR-0279). */
  onFotosDeColores: (fotos: { colorCodigo: string; url: string }[]) => void;
  /** Las etiquetas que esta cuenta puede poner (sin las de descuento si no es líder). */
  etiquetas: { valor: string; texto: string }[];
  avisoEtiquetas?: string;
  deshabilitado: boolean;
  /** Lo que cambió contra lo guardado (la cuenta de la barra, armada con `variantesParaResumen(filas)`: el índice de cada
   *  cambio es el de su fila). Sin él, las filas no se marcan. */
  resumen?: ResumenCambios;
  /** Dentro de «Más de cada variante», bajo la matriz de la ficha (maqueta B, 2026-10-02): sin su tarjeta ni «Cambiar en bloque»
   *  (la matriz ya lo tiene arriba), y con otros ids en los precios para no repetir los de la matriz. */
  detalle?: boolean;
}) {
  const n = ctx.nombres;
  const [modal, setModal] = useState<ModalAbierto>(null);
  const [etiquetasEn, setEtiquetasEn] = useState<string | null>(null);
  const [verDesactivadas, setVerDesactivadas] = useState(false);

  const ejes = ejesDeLaPrenda(filas, n);
  const { grupos, desactivadas } = agruparPorColor(filas, n);
  const conStock = ctx.estado !== null;
  const activas = filas.filter((f) => f.activo).length;
  const unidades = unidadesEnStock(filas, ctx.estado);
  const problemaDe = (clave: string) => problemas.find((p) => p.clave === clave)?.texto ?? null;
  const comunes = etiquetasComunes(
    filas,
    etiquetas.map((e) => e.valor),
  );
  const etiquetasTexto = comunes.length > 0 ? comunes.map((id) => etiquetas.find((e) => e.valor === id)?.texto ?? "").filter(Boolean).join(", ") : null;
  const bloqueoGeneral = bloqueoPorVenta(
    filas.filter((f) => f.activo),
    ctx.estado,
    ctx.esLider,
    n,
  );
  // Con un solo color, la cabecera de su grupo ya dice lo mismo: no se repite.
  const bloqueoDelUnicoGrupo = grupos.length === 1 ? bloqueoPorVenta(grupos[0].filas, ctx.estado, ctx.esLider, n) : null;

  function deshacer(f: FilaFicha) {
    const destino = destinoGuardado(f);
    const choque = choqueDeCorreccion(filas, [f.clave], destino);
    if (choque) return void avisar.error(textoChoque(choque, destino, filas, ctx));
    onFilas(corregir(filas, [f.clave], destino));
  }

  function aplicarCorreccion(claves: string[], destino: Destino) {
    onFilas(corregir(filas, claves, destino));
  }

  function agregar(combos: Identidad[], precio: string, costo: string, base: FilaFicha[] = filas) {
    onFilas(agregarCombinaciones(base, combos, { precio, costo, etiquetaIds: comunes }));
  }

  function agregarColores(r: ResultadoAgregarColores) {
    const base = r.colorDeLasQueTiene
      ? corregir(
          filas,
          filasDelEje(filas, "color", null).map((f) => f.clave),
          { colorCodigo: r.colorDeLasQueTiene },
        )
      : filas;
    agregar(r.combos, r.precio, r.costo, base);
    if (r.fotos.length > 0) onFotosDeColores(r.fotos);
  }

  const fila = (f: FilaFicha, mostrarColor: boolean) => (
    <FilaVariante
      key={f.clave}
      f={f}
      ctx={ctx}
      codigo={codigoQueMuestra(filas, f, ctx.codigoProducto, n)}
      conStock={conStock}
      mostrarColor={mostrarColor}
      problema={problemaDe(f.clave)}
      cambios={resumen ? cambiosDeVariante(resumen, filas.findIndex((x) => x.clave === f.clave)) : []}
      bloqueo={bloqueoPorVenta([f], ctx.estado, ctx.esLider, n)}
      etiquetas={etiquetas}
      avisoEtiquetas={avisoEtiquetas}
      etiquetasAbiertas={etiquetasEn === f.clave}
      sufijoId={detalle ? "-detalle" : ""}
      onEtiquetasAbiertas={(abrir) => setEtiquetasEn(abrir ? f.clave : null)}
      deshabilitado={deshabilitado}
      onCambio={(cambio) => onFilas(cambiarFila(filas, f.clave, cambio))}
      // Una fila que ya existe se corrige solo si la base sabe hacerlo; una nueva se cambia siempre (todavía no existe).
      onCorregir={ctx.puedeCorregir || !f.guardada ? () => setModal({ tipo: "corregir", claves: [f.clave], ejes: "ambos" }) : null}
      onDeshacer={() => deshacer(f)}
      onQuitar={() => onFilas(quitarNueva(filas, f.clave))}
    />
  );

  return (
    <section className={detalle ? "space-y-4" : "card-cayla space-y-4 p-4 sm:p-5"} aria-labelledby="variantes-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="variantes-titulo" className="label-cayla text-[11px] text-tinta/65">
          Variantes (talla × color)
        </h2>
        <p className="text-[12.5px] text-taupe">
          {activas} {activas === 1 ? "activa" : "activas"} · {ejes.colores.length} {ejes.colores.length === 1 ? "color" : "colores"} · {ejes.tallas.length}{" "}
          {ejes.tallas.length === 1 ? "talla" : "tallas"}
          {unidades !== null ? ` · ${unidades} u. en stock` : ""}
        </p>
      </div>

      {/* ---------- los ejes: qué colores y tallas vende la prenda ---------- */}
      <div className="space-y-2.5">
        <Eje titulo="Colores">
          {ejes.colores.map((c) => {
            const delColor = filasDelEje(filas, "color", c);
            const bloqueo = bloqueoPorVenta(delColor, ctx.estado, ctx.esLider, n);
            return (
              <ChipEje
                key={c ?? "sin-color"}
                deshabilitado={deshabilitado || !!bloqueo}
                titulo={bloqueo ?? (todasNuevas(delColor) ? `Cambiar el color ${n.color(c)} (recién agregado, sin guardar)` : `Corregir el color ${n.color(c)}, si se registró mal`)}
                onClick={ctx.puedeCorregir ? () => setModal({ tipo: "corregir", claves: filasDelEje(filas, "color", c).map((f) => f.clave), ejes: "color" }) : null}
              >
                <PuntoColor codigo={c} colores={ctx.colores} />
                {n.color(c)}
              </ChipEje>
            );
          })}
          <button type="button" id={detalle ? undefined : "variantes-agregar-color"} disabled={deshabilitado} onClick={() => setModal({ tipo: "agregar-color" })} className="btn-cayla btn-enlace text-[12.5px]">
            + Agregar color
          </button>
        </Eje>
        <Eje titulo="Tallas">
          {ejes.tallas.map((t) => {
            const deLaTalla = filasDelEje(filas, "talla", t);
            const bloqueo = bloqueoPorVenta(deLaTalla, ctx.estado, ctx.esLider, n);
            return (
              <ChipEje
                key={t ?? "sin-talla"}
                deshabilitado={deshabilitado || !!bloqueo}
                titulo={
                  bloqueo ??
                  (todasNuevas(deLaTalla)
                    ? `Cambiar la talla ${n.talla(t) || "(sin talla)"} (recién agregada, sin guardar)`
                    : `Corregir la talla ${n.talla(t) || "(sin talla)"}, si se registró mal`)
                }
                onClick={ctx.puedeCorregir ? () => setModal({ tipo: "corregir", claves: filasDelEje(filas, "talla", t).map((f) => f.clave), ejes: "talla" }) : null}
              >
                <span className="tabular-nums">{n.talla(t) || "Sin talla"}</span>
              </ChipEje>
            );
          })}
          <button type="button" disabled={deshabilitado} onClick={() => setModal({ tipo: "agregar-talla" })} className="btn-cayla btn-enlace text-[12.5px]">
            + Agregar talla
          </button>
        </Eje>
        {ctx.puedeCorregir ? (
          <p className="text-[12px] text-taupe">
            Toca un color o una talla para <b className="font-semibold text-tinta/80">corregirla</b> si se registró mal (conserva stock e historia). Si llegó
            mercadería nueva, usa <b className="font-semibold text-tinta/80">Agregar</b>.
          </p>
        ) : (
          <p className="text-[12px] text-taupe">Corregir el color o la talla todavía no está disponible. Si llegó mercadería nueva, usa Agregar.</p>
        )}
        {ctx.puedeCorregir && bloqueoGeneral && bloqueoGeneral !== bloqueoDelUnicoGrupo && <p className="text-[12px] text-ambar-profundo">{bloqueoGeneral}</p>}
      </div>

      {activas > 0 && !detalle && (
        <CambiarEnBloque filas={filas} onFilas={onFilas} onPendiente={onBloquePendiente} nombres={n} veCosto={ctx.veCosto} deshabilitado={deshabilitado} />
      )}

      {/* ---------- las variantes, un bloque por color ---------- */}
      <div className="space-y-3">
        {grupos.map((g) => {
          const bloqueo = bloqueoPorVenta(g.filas, ctx.estado, ctx.esLider, n);
          const activasGrupo = g.filas.filter((f) => f.activo).length;
          const u = unidadesEnStock(g.filas, ctx.estado);
          // Un color recién agregado todavía no existe: no hay nada «registrado mal» que corregir, se cambia (el modal dice lo
          // mismo). Con una sola variante que ya exista en el grupo, es «Corregir».
          const verbo = todasNuevas(g.filas) ? "Cambiar" : "Corregir";
          // Ajustar stock (2026-09-29): la ventana busca la prenda en la base, así que va el color TAL COMO ESTÁ GUARDADO, no el
          // que se esté corrigiendo a medias en pantalla. Un color todo nuevo todavía no existe: no tiene stock que ajustar.
          const guardadaDelColor = g.filas.find((f) => f.guardada)?.guardada ?? null;
          const colorGuardado = guardadaDelColor ? (guardadaDelColor.colorCodigo === null ? null : n.color(guardadaDelColor.colorCodigo)) : null;
          return (
            <section key={g.colorCodigo ?? "sin-color"} className="rounded-xl border border-sand" aria-label={`Color ${n.color(g.colorCodigo)}`}>
              <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-sand px-3 py-2.5">
                <PuntoColor codigo={g.colorCodigo} colores={ctx.colores} />
                <h3 className="text-sm font-semibold text-tinta">{n.color(g.colorCodigo)}</h3>
                <span className="text-[12.5px] text-taupe">
                  {activasGrupo} {activasGrupo === 1 ? "variante" : "variantes"}
                  {u !== null ? ` · ${u} u.` : ""}
                </span>
                {guardadaDelColor && (
                  <AjusteDeStock ajuste={ctx.ajusteStock} colorNombre={colorGuardado} forma="enlace" descripcion={n.color(g.colorCodigo)} deshabilitado={deshabilitado} />
                )}
                {/* «Corregir», no «Cambiar»: si la prenda ahora viene en otro color, eso es «Agregar color» (D-136). «Cambiar»
                    solo para un grupo que todavía no existe (recién agregado). */}
                {ctx.puedeCorregir && (
                  <button
                    type="button"
                    disabled={deshabilitado || !!bloqueo}
                    title={
                      bloqueo ??
                      (verbo === "Cambiar"
                        ? `Cambiar el color ${n.color(g.colorCodigo)} (recién agregado, sin guardar)`
                        : `Corregir el color ${n.color(g.colorCodigo)}, si se registró mal`)
                    }
                    onClick={() => setModal({ tipo: "corregir", claves: g.filas.map((f) => f.clave), ejes: "color" })}
                    className="btn-cayla btn-enlace ml-auto text-[12.5px]"
                  >
                    {verbo} color
                  </button>
                )}
                {activasGrupo > 0 && (
                  <button
                    type="button"
                    disabled={deshabilitado}
                    title={`Desactivar el color ${n.color(g.colorCodigo)} con todas sus tallas: dejan de venderse y se conservan con su historia`}
                    onClick={() => onFilas(desactivarColor(filas, g.filas.map((f) => f.clave)))}
                    className={`btn-cayla btn-enlace text-[12.5px] ${ctx.puedeCorregir ? "" : "ml-auto"}`}
                  >
                    Desactivar color
                  </button>
                )}
                {ctx.puedeCorregir && bloqueo && <p className="w-full text-[11.5px] text-taupe">{bloqueo}</p>}
              </header>
              <div className={`hidden gap-x-3 px-3 pt-2 sm:grid ${columnas(conStock)}`}>
                {["Talla · código", "Precio", "Costo", "Margen", ...(conStock ? ["Stock"] : []), ""].map((t, i) => (
                  <span key={i} className={`text-[10.5px] font-medium uppercase tracking-wide text-taupe ${i > 0 ? "text-right" : ""}`}>
                    {t}
                  </span>
                ))}
              </div>
              <ul className="divide-y divide-sand px-3">{g.filas.map((f) => fila(f, false))}</ul>
            </section>
          );
        })}
        {grupos.length === 0 && <p className="text-sm text-taupe">Esta prenda no tiene variantes activas. Agrega un color o una talla.</p>}
      </div>

      {desactivadas.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={verDesactivadas}
            onClick={() => setVerDesactivadas((v) => !v)}
            className="label-cayla inline-flex items-center gap-1 text-[11px] text-tinta/65 hover:text-tinta"
          >
            {verDesactivadas ? "Ocultar" : "Mostrar"} desactivadas ({desactivadas.length})
            <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${verDesactivadas ? "rotate-180" : ""}`} />
          </button>
          {verDesactivadas && (
            <div className="mt-2 rounded-xl border border-dashed border-sand">
              <p className="px-3 pt-2 text-[12px] text-taupe">
                Ya no se venden; si tienen unidades, siguen en el inventario. «Activar» (en ⋯) las vuelve a poner a la venta.
              </p>
              <ul className="divide-y divide-sand px-3">{desactivadas.map((f) => fila(f, true))}</ul>
            </div>
          )}
        </div>
      )}

      {ctx.veCosto && filas.some((f) => f.costoFijo) && <p className="text-xs text-tinta/55">{textosCostoFijo(ctx.costoSinComprobar).nota}</p>}

      {modal?.tipo === "corregir" && (
        <CorregirVarianteModal
          ctx={ctx}
          filas={filas}
          claves={modal.claves}
          ejes={modal.ejes}
          tallas={tallasCategoria}
          onConfirmar={(destino) => aplicarCorreccion(modal.claves, destino)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === "agregar-color" && (
        <AgregarColoresModal
          ctx={ctx}
          filas={filas}
          tallas={tallasCategoria}
          categoriaNombre={categoriaNombre}
          etiquetasTexto={etiquetasTexto}
          onColorCreado={onColorCreado}
          onConfirmar={agregarColores}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === "agregar-talla" && (
        <AgregarTallasModal
          ctx={ctx}
          filas={filas}
          tallas={tallasCategoria}
          categoriaNombre={categoriaNombre}
          etiquetasTexto={etiquetasTexto}
          onConfirmar={(r) => agregar(r.combos, r.precio, r.costo)}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

function Eje({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-center">
      <p className="text-[12.5px] font-semibold text-tinta">{titulo}</p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Un color o una talla de la prenda: tocarlo abre «Corregir». El lápiz dice que se edita; el porqué de uno apagado
 *  va en su `title` y, para el celular (sin mouse), en la línea de abajo. Sin `onClick` (la base todavía no corrige) es
 *  solo un rótulo: no se ofrece lo que no se puede hacer. */
function ChipEje({ children, onClick, titulo, deshabilitado }: { children: React.ReactNode; onClick: (() => void) | null; titulo: string; deshabilitado: boolean }) {
  if (!onClick) {
    return <span className="flex min-h-9 items-center gap-1.5 rounded-md border border-tinta/10 px-2.5 py-1.5 text-sm text-tinta">{children}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      aria-label={titulo}
      className="flex min-h-9 items-center gap-1.5 rounded-md border border-tinta/15 px-2.5 py-1.5 text-sm text-tinta transition-colors hover:border-tinta/40 disabled:cursor-not-allowed disabled:opacity-55"
    >
      {children}
      <Pencil aria-hidden className="h-3 w-3 text-tinta/40" />
    </button>
  );
}

function FilaVariante({
  f,
  ctx,
  codigo,
  conStock,
  mostrarColor,
  problema,
  cambios,
  bloqueo,
  etiquetas,
  avisoEtiquetas,
  etiquetasAbiertas,
  onEtiquetasAbiertas,
  deshabilitado,
  onCambio,
  onCorregir,
  onDeshacer,
  onQuitar,
  sufijoId,
}: {
  f: FilaFicha;
  ctx: ContextoFicha;
  /** El código que tiene (o va a tener, si es nueva o se corrigió). */
  codigo: string | null;
  conStock: boolean;
  /** Fuera de un grupo de color (las desactivadas): la fila dice también su color. */
  mostrarColor: boolean;
  problema: string | null;
  /** Lo que cambió en esta fila contra lo guardado (ADR-0257): la marca en ámbar y el «antes» de su precio o su costo. */
  cambios: readonly Cambio[];
  bloqueo: string | null;
  etiquetas: { valor: string; texto: string }[];
  avisoEtiquetas?: string;
  etiquetasAbiertas: boolean;
  onEtiquetasAbiertas: (abrir: boolean) => void;
  deshabilitado: boolean;
  onCambio: (cambio: Partial<Pick<FilaFicha, "precio" | "costo" | "activo" | "etiquetaIds">>) => void;
  /** `null` = no se ofrece corregir (la base todavía no sabe). */
  onCorregir: (() => void) | null;
  onDeshacer: () => void;
  onQuitar: () => void;
  sufijoId: string;
}) {
  const n = ctx.nombres;
  const g = f.guardada;
  const e = f.id && ctx.estado ? ctx.estado[f.id] : undefined;
  const margen = ctx.veCosto ? margenDeFila(f) : null;
  const nivel = nivelMargen(margen);
  const aviso = avisoDesactivar(f, ctx.estado);
  const esCorregida = corregida(f);
  const nombre = nombreVariante(f, n);
  // Lo que cambió en la fila: la identidad, «nueva» y «activa» ya tienen su chip y su Deshacer; precio, costo y etiquetas se
  // dicen en una línea con lo de antes (lo que se ve como hecho y no lo está hasta guardar).
  const tocada = cambios.length > 0;
  const menores = cambios.filter((c) => c.tipo === "precio" || c.tipo === "costo" || c.tipo === "etiquetas");
  const precioCambio = cambios.some((c) => c.tipo === "precio");
  const costoCambio = cambios.some((c) => c.tipo === "costo");
  const items: ItemMenu[] = [
    // «Corregir» si ya existe (se registró mal); «Cambiar» solo en una nueva, que todavía no existe.
    ...(onCorregir
      ? [
          {
            clave: "corregir",
            etiqueta: g ? "Corregir color o talla de esta variante" : "Cambiar color o talla",
            onSelect: onCorregir,
            motivo: g ? (bloqueo ?? undefined) : undefined,
          },
        ]
      : []),
    g
      ? { clave: "activa", etiqueta: f.activo ? "Desactivar" : "Activar", onSelect: () => onCambio({ activo: !f.activo }) }
      : { clave: "quitar", etiqueta: "Quitar esta variante nueva", onSelect: onQuitar, peligro: true },
  ];

  return (
    <li
      className={`py-3 transition-colors duration-300 ease-cayla ${!f.activo ? "text-tinta/60" : ""} ${
        tocada ? "-mx-3 bg-ambar/[0.08] px-3 shadow-[inset_3px_0_0_var(--color-ambar)]" : ""
      }`}
    >
      <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 sm:items-center ${columnas(conStock)}`}>
        {/* Qué variante es */}
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {mostrarColor && <PuntoColor codigo={f.colorCodigo} colores={ctx.colores} />}
            <span className="text-sm font-semibold text-tinta">{mostrarColor ? nombre : n.talla(f.tallaId) || "Sin talla"}</span>
            <span
              className="font-mono text-[11.5px] tracking-wide text-tinta/60"
              title={esCorregida && g?.codigo ? `Código nuevo al guardar. ${g.codigo} sigue sonando en la caja.` : !g ? "Se asigna al guardar" : undefined}
            >
              {codigo ?? "código al guardar"}
            </span>
          </div>
        </div>

        {/* El menú: en celular arriba a la derecha; en escritorio, al final de la línea. */}
        <div className="col-start-3 row-start-1 flex justify-end sm:order-last sm:col-auto sm:row-auto">
          <MenuAcciones etiqueta={`Acciones de ${nombre}`} items={items} deshabilitado={deshabilitado} />
        </div>

        <label className="min-w-0">
          <span className={ROTULO}>Precio</span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            id={`producto-variante-${f.clave}-precio${sufijoId}`}
            aria-label={`Precio de ${nombre}`}
            placeholder="0.00"
            value={f.precio}
            disabled={deshabilitado}
            onChange={(ev) => onCambio({ precio: ev.target.value })}
            className={precioCambio ? NUMERO_CAMBIADO : NUMERO}
          />
        </label>

        <div className="min-w-0">
          <span className={ROTULO}>Costo</span>
          {!ctx.veCosto ? (
            <span className="block py-1.5 text-sm text-tinta/45 sm:text-right" title="El costo solo lo ve quien tiene permiso de ver el dinero">
              —
            </span>
          ) : f.costoFijo ? (
            <span className="block py-1.5 text-sm tabular-nums text-tinta/70 sm:text-right" title={textosCostoFijo(ctx.costoSinComprobar).celda}>
              {g?.costo ? Number(g.costo).toFixed(2) : "—"}
            </span>
          ) : (
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              aria-label={`Costo de ${nombre}`}
              placeholder="0.00"
              value={f.costo}
              disabled={deshabilitado}
              onChange={(ev) => onCambio({ costo: ev.target.value })}
              className={costoCambio ? NUMERO_CAMBIADO : NUMERO}
            />
          )}
        </div>

        <div className="min-w-0">
          <span className={ROTULO}>Margen</span>
          <span
            className={`block py-1.5 text-sm tabular-nums sm:text-right ${
              nivel === "negativo" ? "text-rojo-profundo" : nivel === "bajo" ? "text-ambar-profundo" : "text-tinta/60"
            }`}
            title={nivel === "negativo" ? "Con este precio se pierde dinero en cada venta" : nivel === "bajo" ? "Menos de 30 %: un descuento de campaña ya se come la ganancia" : undefined}
          >
            {margen === null ? "—" : `${margen.toFixed(0)} %`}
          </span>
        </div>

        {conStock && (
          <div className="col-span-3 min-w-0 sm:col-span-1">
            <span className={ROTULO}>Stock</span>
            <span className="block py-1.5 text-sm tabular-nums sm:text-right" title={e ? textoSedes(e) : undefined}>
              {e ? `${e.stock} u.` : g ? "0 u." : "—"}
              {e && e.apartado > 0 && <span className="text-taupe"> · {e.apartado} ap.</span>}
              {g && (
                <AjusteDeStock
                  ajuste={ctx.ajusteStock}
                  colorNombre={g.colorCodigo === null ? null : n.color(g.colorCodigo)}
                  forma="lapiz"
                  descripcion={nombre}
                  deshabilitado={deshabilitado}
                />
              )}
            </span>
            {e && e.sedes.length > 0 && <span className="block text-[11px] text-taupe sm:hidden">{textoSedes(e)}</span>}
          </div>
        )}
      </div>

      {/* Qué le pasa a esta fila al guardar (nueva, corregida, se desactiva…): en su propia línea, a todo el ancho. */}
      {(!g || esCorregida || (g && f.activo !== g.activo) || !f.activo || menores.length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {!g && (
            <>
              <Chip tono="pizarra">Nueva</Chip>
              <button type="button" onClick={onQuitar} disabled={deshabilitado} className="btn-cayla btn-enlace text-[12px]">
                Quitar
              </button>
            </>
          )}
          {g && esCorregida && (
            <>
              <Chip tono="pizarra">
                Antes: {n.color(g.colorCodigo)} · {n.talla(g.tallaId) || "sin talla"}
              </Chip>
              <button type="button" onClick={onDeshacer} disabled={deshabilitado} className="btn-cayla btn-enlace text-[12px]">
                Deshacer
              </button>
            </>
          )}
          {g && f.activo && !g.activo && (
            <>
              <Chip tono="pizarra">Vuelve a venderse</Chip>
              <button type="button" onClick={() => onCambio({ activo: false })} disabled={deshabilitado} className="btn-cayla btn-enlace text-[12px]">
                Deshacer
              </button>
            </>
          )}
          {g && !f.activo && g.activo && (
            <>
              <Chip tono="ambar">Se desactiva</Chip>
              <button type="button" onClick={() => onCambio({ activo: true })} disabled={deshabilitado} className="btn-cayla btn-enlace text-[12px]">
                Deshacer
              </button>
            </>
          )}
          {g && !f.activo && !g.activo && (
            <Chip tono="apagado" tachado={false}>
              Desactivada
            </Chip>
          )}
          {g && menores.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ambar-profundo">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-ambar" />
                {textoPendienteDeVariante(menores)}
              </span>
              <button
                type="button"
                onClick={() => onCambio({ precio: g.precio, costo: g.costo, etiquetaIds: [...g.etiquetaIds] })}
                disabled={deshabilitado}
                className="btn-cayla btn-enlace text-[12px]"
              >
                Deshacer
              </button>
            </>
          )}
        </div>
      )}

      {problema && <p className="mt-1 text-[12px] text-rojo-profundo">{problema}</p>}
      {aviso && <p className="mt-1 text-[12px] text-ambar-profundo">{aviso}</p>}

      <div className="mt-1.5">
        <button
          type="button"
          disabled={deshabilitado}
          aria-expanded={etiquetasAbiertas}
          onClick={() => onEtiquetasAbiertas(!etiquetasAbiertas)}
          className={`text-[12px] disabled:opacity-50 ${f.etiquetaIds.length > 0 ? "font-semibold text-tinta" : "text-tinta/55 hover:text-tinta"}`}
        >
          Etiquetas{f.etiquetaIds.length > 0 ? ` (${f.etiquetaIds.length})` : ""}
        </button>
        {etiquetasAbiertas && (
          <div className="mt-2 space-y-1.5">
            {etiquetas.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((et) => (
                  <ChipOpcion
                    key={et.valor}
                    elegido={f.etiquetaIds.includes(et.valor)}
                    disabled={deshabilitado}
                    onClick={() =>
                      onCambio({ etiquetaIds: f.etiquetaIds.includes(et.valor) ? f.etiquetaIds.filter((id) => id !== et.valor) : [...f.etiquetaIds, et.valor] })
                    }
                    className="min-h-8 py-1 text-[12.5px]"
                  >
                    {et.texto}
                  </ChipOpcion>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-tinta/55">Todavía no hay etiquetas aprobadas.</p>
            )}
            <p className="text-xs text-tinta/55">Se guarda junto con el resto al pulsar «Revisar y guardar».</p>
            {avisoEtiquetas && <p className="text-xs text-tinta/55">{avisoEtiquetas}</p>}
          </div>
        )}
      </div>
    </li>
  );
}
