"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, PackagePlus, Search } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ColorAlta } from "@/lib/alta-producto";
import { leerCantidad } from "@/lib/alta-producto";
import {
  SOLUCIONES_DANADA,
  sumasDe,
  type CategoriaDeLinea,
  type Conteo,
  type PrendaRecepcion,
  type SolucionDanada,
} from "@/lib/recepcion-envio-reglas";
import { ElegirPrendaExistente } from "./ElegirPrendaExistente";
import { MatrizRecepcion } from "./MatrizRecepcion";

// La prenda de una línea y lo que llegó de ella (ADR-0362, fase 4): ¿qué prenda es? (una nueva, que se crea ahí mismo, o una que ya existe)
// y, con la prenda puesta, la matriz talla × color con cuántas llegaron; plegado debajo, «¿Llegó algo dañado?» con las dañadas de cada talla y
// color y si tienen arreglo (decisiones 23 y 27: las dañadas no se venden, entran a la cuarentena de la sede). Lo usan las líneas de la guía y
// lo que no estaba en ella. No guarda nada: cambia el borrador de la pantalla, que es la dueña de todo.

const TITULO = "mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-tinta";

export function BloquePrenda({
  ids,
  guia,
  etiqueta,
  conteo,
  prenda,
  categoria,
  marca,
  colores,
  enviado,
  preguntaPrenda = "¿Qué prenda es?",
  extraAntes,
  sinPrendaAbajo,
  listo = true,
  motivoNoListo,
  onPrenda,
  onConteo,
  onAbrirHoja,
}: {
  ids: { prenda: string; conteo: string; danadas: string; arreglo: string };
  guia: GuiaCampos;
  etiqueta: (id: string, texto: ReactNode) => ReactNode;
  conteo: Conteo;
  prenda: PrendaRecepcion | null;
  categoria: CategoriaDeLinea;
  marca: { id: string; nombre: string };
  colores: readonly ColorAlta[];
  /** Lo que venía de esta línea (`null` en lo que no estaba en la guía): «Contaste 18 de 20». */
  enviado: number | null;
  preguntaPrenda?: string;
  /** Algo más dentro del bloque de la prenda, antes de elegirla («No llegó nada de esto»). */
  extraAntes?: ReactNode;
  /** Lo que se dibuja en lugar de las dos salidas cuando ya no hace falta una prenda (la línea que no llegó). */
  sinPrendaAbajo?: ReactNode;
  /** Se puede elegir la prenda: en lo que no estaba en la guía, primero van la categoría y la marca. */
  listo?: boolean;
  motivoNoListo?: string;
  onPrenda: (prenda: PrendaRecepcion | null) => void;
  onConteo: (cambios: Partial<Conteo>) => void;
  onAbrirHoja: (modo: "nueva" | "agregar") => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const s = sumasDe(conteo, prenda);
  const topes: Record<string, number> = {};
  if (prenda) for (const v of prenda.variantes) topes[v.id] = leerCantidad(conteo.cantidades[v.id] ?? "") ?? 0;

  return (
    <>
      <CampoGuiado id={ids.prenda} guia={guia} retiene="fila">
        <div data-guia="recepcion.prenda" className="space-y-2.5">
          <p className={TITULO}>{etiqueta(ids.prenda, preguntaPrenda)}</p>
          {sinPrendaAbajo ? (
            sinPrendaAbajo
          ) : prenda ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sand bg-papel px-3 py-2.5">
              <MiniaturaPrenda fotoUrl={prenda.fotoUrl} tamano="md" prefijo={categoria.prefijo} familia={categoria.familia} categoria={categoria.nombre} />
              {/* Con base de 14 rem: en una tarjeta angosta (375 px) los botones bajan a su propia línea en vez de apretar el nombre. */}
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-tinta">
                  {prenda.nombre}
                  {prenda.nueva && <Chip tono="verde">Nueva</Chip>}
                </p>
                <p className="text-xs text-taupe">
                  {[prenda.codigo, `${prenda.variantes.length} ${prenda.variantes.length === 1 ? "combinación" : "combinaciones"} de talla y color`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Boton type="button" peso="discreto" className="px-3 py-1.5 text-[12px]" onClick={() => onAbrirHoja("agregar")}>
                  + talla o color
                </Boton>
                <Boton
                  type="button"
                  peso="discreto"
                  className="px-3 py-1.5 text-[12px]"
                  onClick={() => {
                    setBuscando(false);
                    onPrenda(null);
                  }}
                >
                  Cambiar
                </Boton>
              </div>
            </div>
          ) : !listo ? (
            <p className="text-[13px] text-taupe">{motivoNoListo}</p>
          ) : (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {/* La demo (ADR-0389) toca este botón para mostrar la hoja de la prenda nueva; abrirla no guarda nada. */}
                <Boton type="button" onClick={() => onAbrirHoja("nueva")} data-guia="recepcion.es-nueva">
                  <span className="inline-flex items-center gap-1.5">
                    <PackagePlus aria-hidden className="h-4 w-4" />
                    Es nueva
                  </span>
                </Boton>
                <Boton type="button" onClick={() => setBuscando((b) => !b)} aria-expanded={buscando}>
                  <span className="inline-flex items-center gap-1.5">
                    <Search aria-hidden className="h-4 w-4" />
                    Ya la tengo
                  </span>
                </Boton>
                {extraAntes}
              </div>
              {buscando && (
                <ElegirPrendaExistente
                  categoria={categoria}
                  marca={marca}
                  onElegir={(p) => {
                    setBuscando(false);
                    onPrenda(p);
                  }}
                  onEsNueva={() => {
                    setBuscando(false);
                    onAbrirHoja("nueva");
                  }}
                />
              )}
              <p className="text-xs text-taupe">«Es nueva» la crea en el catálogo con las tallas y los colores que llegaron; «Ya la tengo» la busca entre las de {categoria.nombre} · {marca.nombre}.</p>
            </div>
          )}
        </div>
      </CampoGuiado>

      {prenda && !sinPrendaAbajo && (
        <>
          <CampoGuiado id={ids.conteo} guia={guia} retiene="fila">
            <div data-guia="recepcion.matriz" className="space-y-2">
              <p className={TITULO}>
                {etiqueta(ids.conteo, "¿Cuántas llegaron?")}
                <span className="text-[12px] font-normal tabular-nums text-taupe" aria-live="polite">
                  {enviado != null ? `Contaste ${s.contado.toLocaleString("es-PE")} de ${enviado.toLocaleString("es-PE")}` : `Contaste ${s.contado.toLocaleString("es-PE")}`}
                </span>
              </p>
              <MatrizRecepcion prenda={prenda} colores={colores} valores={conteo.cantidades} onValor={(id, texto) => onConteo({ cantidades: { ...conteo.cantidades, [id]: texto } })} modo="cantidades" />
              {s.invalidas > 0 && <p className="text-xs text-ambar">Las cantidades son números enteros, de 0 a 9999.</p>}
              <p className="text-xs text-taupe">Buenas y dañadas juntas. Lo que no llegó, déjalo vacío. «—» = esa combinación no existe en la prenda.</p>
            </div>
          </CampoGuiado>

          <div data-guia="recepcion.danadas" className="space-y-3">
            <button
              type="button"
              aria-expanded={conteo.conDanadas}
              onClick={() => onConteo(conteo.conDanadas ? { conDanadas: false, danadas: {}, arreglo: null } : { conDanadas: true })}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-tinta hover:text-rojo-profundo"
            >
              <ChevronDown aria-hidden className={`h-4 w-4 transition-transform duration-200 ease-cayla motion-reduce:transition-none ${conteo.conDanadas ? "rotate-180" : ""}`} />
              {conteo.conDanadas ? "Llegó algo dañado" : "¿Llegó algo dañado?"}
              {s.danadas > 0 && <span className="font-normal text-taupe">· {s.danadas.toLocaleString("es-PE")}</span>}
            </button>
            {conteo.conDanadas && (
              <div className="anim-revelar space-y-3 border-l-2 border-sand pl-3 sm:pl-4">
                <CampoGuiado id={ids.danadas} guia={guia} retiene="fila">
                  <p className={TITULO}>
                    {etiqueta(ids.danadas, "¿Cuántas llegaron dañadas?")}
                    <span className="text-[12px] font-normal text-taupe">de las que contaste arriba, en su talla y color</span>
                  </p>
                  <MatrizRecepcion
                    prenda={prenda}
                    colores={colores}
                    valores={conteo.danadas}
                    onValor={(id, texto) => onConteo({ danadas: { ...conteo.danadas, [id]: texto } })}
                    modo="danadas"
                    topes={topes}
                  />
                  {s.danadasDeMas.length > 0 && <p className="mt-1.5 text-xs text-ambar">No puede haber más dañadas que las que llegaron de esa talla y color.</p>}
                </CampoGuiado>
                {s.danadas > 0 && (
                  <CampoGuiado id={ids.arreglo} guia={guia} retiene="fila">
                    <p className={TITULO}>{etiqueta(ids.arreglo, `¿${s.danadas === 1 ? "Tiene" : "Tienen"} arreglo?`)}</p>
                    <ElegirOpcion
                      etiqueta="¿Tienen arreglo?"
                      opciones={SOLUCIONES_DANADA.map((o) => ({ valor: o.valor, texto: s.danadas === 1 ? o.textoUna : o.texto }))}
                      valor={conteo.arreglo}
                      onValor={(arreglo) => onConteo({ arreglo: arreglo as SolucionDanada })}
                    />
                    <p className="mt-1.5 text-xs text-taupe">
                      {conteo.arreglo
                        ? SOLUCIONES_DANADA.find((o) => o.valor === conteo.arreglo)?.ayuda
                        : "Las dañadas no se venden: entran a la cuarentena de la sede. Desde Existencias se arreglan, liquidan, regalan, desechan o devuelven."}
                    </p>
                  </CampoGuiado>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Una pregunta de UNA respuesta entre pocas (la causa de lo que faltó, si tiene arreglo): las opciones como chips que se ven todas. */
export function ElegirOpcion({
  etiqueta,
  opciones,
  valor,
  onValor,
}: {
  etiqueta: string;
  opciones: readonly { valor: string; texto: string }[];
  valor: string | null;
  onValor: (valor: string) => void;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {opciones.map((o) => (
        <ChipOpcion key={o.valor} elegido={valor === o.valor} onClick={() => onValor(o.valor)}>
          {o.texto}
        </ChipOpcion>
      ))}
    </div>
  );
}
