"use client";

import { useEffect, useRef, useState } from "react";
import { ListChecks, Sparkles, X } from "lucide-react";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import type { CategoriaDeLinea, PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import { sugerirNombre } from "@/lib/sugerencias-alta-producto";
import {
  cambiarCantidadNuevaDescrita,
  cambiarCantidadPrenda,
  cambiarNuevasSinDescribir,
  describirNuevas,
  leerContadas,
  nuevasSinDescribir,
  quitarNuevaDescrita,
  quitarPrenda,
  sumarPrenda,
  textoPrendas,
  totalSeparado,
  type PrendaSeparada,
  type Separado,
  type MarcaDeLinea,
} from "@/lib/recepcion-conteo-reglas";
import { BaldosaCategoria } from "./piezas";
import { DescribirNuevas } from "./DescribirNuevas";

// «¿Qué blusas son?» (ADR-0393, decisiones 1 y 8; la maqueta A): separar lo contado por prenda, si se quiere. Una conocida se busca por su
// nombre (entre las de esa categoría y marca) y se pone cuántas eran; con sus tallas y colores entra al stock al cerrar, sin ellas queda
// «por detallar». Lo nuevo es solo cuántas («por crear»); si se sabe qué son, «Describir ahora» lo anota. Lo que no se separa queda «sin
// separar»: nada de esto frena el cierre. La misma pieza sirve en «Hacer ahora», con lo que quedó de una línea ya cerrada.

const BOTON_PASO =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-taupe transition-colors hover:bg-sand hover:text-tinta disabled:pointer-events-none disabled:opacity-30";

/**
 * − 3 + : cuántas de una fila (el paso de cantidad del sistema, `<PasoCantidad>`). El número también se escribe: se guarda al salir de la
 * caja o con Enter, no con cada tecla —una prenda con sus tallas las suelta si su número cambia, y «1» camino a «12» no debe soltarlas—;
 * lo que no vale (vacío, bajo el mínimo) vuelve a lo que había, y Escape deja lo escrito sin guardar.
 */
export function PasoDePrendas({ valor, onValor, etiqueta, minimo = 0 }: { valor: number; onValor: (n: number) => void; etiqueta: string; minimo?: number }) {
  // Mientras se escribe, la caja muestra lo escrito (vacío es «todavía escribiendo», no 0); fuera de ella, siempre el valor.
  const [escribiendo, setEscribiendo] = useState<string | null>(null);
  // Escape quita el foco para dejar lo escrito; ese `blur` no debe guardarlo (la función de salir aún ve lo escrito).
  const dejarlo = useRef(false);
  const poner = (n: number) => {
    setEscribiendo(null);
    onValor(n);
  };
  const terminar = () => {
    const { contadas } = leerContadas(escribiendo ?? "");
    const guardar = !dejarlo.current && contadas !== null && contadas >= minimo && contadas !== valor;
    dejarlo.current = false;
    setEscribiendo(null);
    if (guardar) onValor(contadas);
  };
  return (
    <PasoCantidad
      menos={{ onClick: () => poner(valor - 1), deshabilitado: valor <= minimo, etiqueta: `Una menos de ${etiqueta}` }}
      mas={{ onClick: () => poner(valor + 1), etiqueta: `Una más de ${etiqueta}` }}
      campo={{
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        value: escribiendo ?? String(valor),
        "aria-label": `Cuántas de ${etiqueta}`,
        onFocus: (e) => {
          setEscribiendo(String(valor));
          e.currentTarget.select();
        },
        onChange: (e) => setEscribiendo(leerContadas(e.target.value).texto),
        onBlur: terminar,
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape" && escribiendo !== null) {
            // Escape deshace lo escrito y es de la caja: la hoja de afuera, si la hay, no se cierra con él.
            e.stopPropagation();
            dejarlo.current = true;
            e.currentTarget.blur();
          }
        },
      }}
    />
  );
}

/** La × de una fila: quita lo separado (vuelve a «sin separar»), nunca lo contado. */
function Quitar({ etiqueta, onQuitar }: { etiqueta: string; onQuitar: () => void }) {
  return (
    <button type="button" className={BOTON_PASO} aria-label={`Quitar ${etiqueta}`} onClick={onQuitar}>
      <X aria-hidden className="h-4 w-4" />
    </button>
  );
}

export function SepararPrendas({
  categoria,
  marca,
  separado,
  /** Hasta cuántas se pueden separar (lo contado menos lo que ya entró al stock; en «Hacer ahora», lo que queda sin separar). */
  tope,
  enHacerAhora = false,
  onSeparado,
  onTallas,
  onPrendaVista,
  elegida = null,
}: {
  categoria: CategoriaDeLinea;
  marca: MarcaDeLinea;
  separado: Separado;
  tope: number;
  enHacerAhora?: boolean;
  onSeparado: (s: Separado) => void;
  onTallas: (p: PrendaSeparada) => void;
  /** Una prenda elegida en la búsqueda (con sus tallas y colores): la pantalla la guarda para la hoja de tallas. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  /** La prenda que eligió la compradora al comprar desde el celular (ADR-0480): se ofrece de un toque, sin buscarla. */
  elegida?: { productoId: string; nombre: string | null; codigo: string | null } | null;
}) {
  const [describiendo, setDescribiendo] = useState(false);
  const total = totalSeparado(separado);
  const sinSeparar = Math.max(0, tope - total);
  const nuevas = nuevasSinDescribir(separado);
  const descritas = separado.nuevas.filter((n): n is { cantidad: number; descripcion: string } => !!n.descripcion);
  const nombre = categoria.nombre.toLowerCase();

  return (
    <div data-guia="recepcion.separar" className="space-y-2.5 border-t border-sand pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-cayla text-[11px] text-tinta/75">
          ¿Qué {nombre} son?{" "}
          {!enHacerAhora && <span className="font-medium normal-case tracking-normal text-taupe">· opcional: puedes dejarlo para después</span>}
        </p>
        {tope > 0 && (sinSeparar > 0 ? <Chip tono="neutro">{sinSeparar} sin separar</Chip> : <Chip tono="verde">Todas separadas</Chip>)}
      </div>

      {elegida && sinSeparar > 0 && !separado.prendas.some((p) => p.productoId === elegida.productoId) && (
        // ADR-0480 (actividad 6): lo que eligió la compradora. Quien cuenta lo confirma (contar es certificar): no se separa solo.
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-hueso px-3 py-2.5" data-guia="recepcion.elegida">
          <span className="min-w-0 text-sm text-tinta">
            La compradora anotó <span className="font-medium">{elegida.nombre ?? "una prenda del catálogo"}</span>
            {elegida.codigo ? <span className="text-taupe"> · {elegida.codigo}</span> : null}. ¿Son estas?
          </span>
          <button
            type="button"
            className="btn-cayla btn-sutil btn-chico mov-boton"
            onClick={() => onSeparado(sumarPrenda(separado, elegida, sinSeparar))}
          >
            Son estas ({sinSeparar})
          </button>
        </div>
      )}

      <BuscarPrendaEnLinea
        categoria={categoria}
        marca={marca}
        onElegir={(p) => {
          onPrendaVista(p);
          onSeparado(sumarPrenda(separado, { productoId: p.productoId, nombre: p.nombre, codigo: p.codigo }));
        }}
        onEsNueva={(texto) => onSeparado(describirNuevas(cambiarNuevasSinDescribir(separado, nuevas + 1), texto, 1))}
      />

      <ul className="space-y-1.5">
        {separado.prendas.map((p) => (
          <li key={p.productoId} className="rc-fila-sep">
            <BaldosaCategoria categoria={categoria} tamano="chico" />
            <span className="min-w-0">
              <b className="block truncate text-[14.5px] text-tinta">{p.nombre ?? "Prenda"}</b>
              <small className="block text-[12.5px] text-taupe">
                {[
                  marca.nombre,
                  p.variantes
                    ? p.variantes.map((v) => `${[v.talla, v.color].filter(Boolean).join(" ")} ${v.cantidad}`).join(" · ")
                    : enHacerAhora
                      ? "falta poner sus tallas y colores"
                      : "sin tallas: queda por detallar si no las pones",
                ].join(" · ")}
              </small>
            </span>
            <span className="rc-fila-fin">
              {p.variantes ? (
                <>
                  <Chip tono="verde">Entra al stock</Chip>
                  <button type="button" className="btn-cayla btn-enlace" onClick={() => onTallas(p)}>
                    Cambiar
                  </button>
                </>
              ) : (
                <>
                  <Boton type="button" peso="discreto" onClick={() => onTallas(p)}>
                    <span className="inline-flex items-center gap-1.5">
                      <ListChecks aria-hidden className="h-4 w-4" />
                      Tallas y colores ahora
                    </span>
                  </Boton>
                  {!enHacerAhora && <span className="text-[12.5px] text-taupe">o queda pendiente</span>}
                </>
              )}
              <PasoDePrendas valor={p.cantidad} etiqueta={p.nombre ?? "esta prenda"} minimo={1} onValor={(n) => onSeparado(cambiarCantidadPrenda(separado, p.productoId, n))} />
              <Quitar etiqueta={p.nombre ?? "esta prenda"} onQuitar={() => onSeparado(quitarPrenda(separado, p.productoId))} />
            </span>
          </li>
        ))}

        {descritas.map((n) => (
          <li key={n.descripcion} className="rc-fila-sep" data-nueva>
            <span className="rc-cat-ic" data-tamano="chico" aria-hidden>
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <b className="block truncate text-[14.5px] text-tinta">{n.descripcion}</b>
              <small className="block text-[12.5px] text-taupe">Nueva · se crea después, con su nombre, tallas y precio</small>
            </span>
            <span className="rc-fila-fin">
              <Chip tono="pizarra">Por crear</Chip>
              <PasoDePrendas valor={n.cantidad} etiqueta={n.descripcion} minimo={1} onValor={(c) => onSeparado(cambiarCantidadNuevaDescrita(separado, n.descripcion, c))} />
              <Quitar etiqueta={n.descripcion} onQuitar={() => onSeparado(quitarNuevaDescrita(separado, n.descripcion))} />
            </span>
          </li>
        ))}

        <li className="rc-fila-sep" data-nueva>
          <span className="rc-cat-ic" data-tamano="chico" aria-hidden>
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <b className="block text-[14.5px] text-tinta">Nuevas, no están en el catálogo</b>
            <small className="block text-[12.5px] text-taupe">Solo cuántas; describirlas (nombre, color, tallas) puede quedar para después</small>
          </span>
          <span className="rc-fila-fin">
            {nuevas > 0 && !enHacerAhora && (
              <BotonEditar onClick={() => setDescribiendo(true)}>Describir ahora</BotonEditar>
            )}
            {nuevas > 0 ? <Chip tono="pizarra">Por crear</Chip> : <Chip tono="neutro">Ninguna</Chip>}
            <PasoDePrendas valor={nuevas} etiqueta="nuevas" onValor={(n) => onSeparado(cambiarNuevasSinDescribir(separado, n))} />
          </span>
        </li>
      </ul>

      {!enHacerAhora && sinSeparar > 0 && total > 0 && (
        <p className="text-xs text-taupe">Las {textoPrendas(sinSeparar)} que no separes quedan como pendiente del envío: no frenan el cierre.</p>
      )}
      {total > tope &&
        (enHacerAhora ? (
          <p className="text-xs text-ambar">Solo quedan {textoPrendas(tope)} sin separar: si llegaron más, reabre el conteo.</p>
        ) : (
          <p className="text-xs text-ambar">Separaste más de las que contaste: al guardar, lo contado sube a {total}.</p>
        ))}

      {describiendo && (
        <DescribirNuevas
          categoria={categoria}
          maximo={nuevas}
          onDescribir={(texto, cantidad) => onSeparado(describirNuevas(separado, texto, cantidad))}
          onCerrar={() => setDescribiendo(false)}
        />
      )}
    </div>
  );
}

/**
 * El buscador de la maqueta: siempre a la vista; mientras se escribe, sugiere las prendas de esa categoría y marca (hasta 6) y, al final,
 * «No está: anotarla como nueva». Elegir una la suma a lo separado y vacía la búsqueda.
 */
function BuscarPrendaEnLinea({
  categoria,
  marca,
  onElegir,
  onEsNueva,
}: {
  categoria: CategoriaDeLinea;
  marca: MarcaDeLinea;
  onElegir: (p: PrendaRecepcion) => void;
  onEsNueva: (texto: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [prendas, setPrendas] = useState<PrendaRecepcion[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const vuelta = useRef(0);
  const texto = busqueda.trim();

  useEffect(() => {
    if (!texto) return;
    const mia = ++vuelta.current;
    const t = window.setTimeout(async () => {
      const { prendas: halladas, error } = await buscarPrendasParaRecibir(categoria.id, marca.id, texto);
      if (mia !== vuelta.current) return;
      setBuscando(false);
      setFallo(Boolean(error));
      setPrendas(error ? [] : halladas);
    }, 250);
    return () => window.clearTimeout(t);
  }, [categoria.id, marca.id, texto]);

  function limpiar() {
    vuelta.current++;
    setBusqueda("");
    setPrendas(null);
    setBuscando(false);
  }

  return (
    <div className="space-y-1.5">
      <Buscador
        valor={busqueda}
        onCambio={(v) => {
          setBusqueda(v);
          setBuscando(Boolean(v.trim()));
          if (!v.trim()) setPrendas(null);
        }}
        buscando={buscando}
        placeholder={`Busca una prenda conocida por su nombre (Ej. ${sugerirNombre(categoria).texto})`}
        etiqueta={`Buscar entre ${categoria.nombre} · ${marca.nombre}`}
      />
      {texto && !buscando && prendas !== null && (
        <ul data-resultados className="space-y-0.5 rounded-2xl border border-sand bg-papel p-1.5 shadow-[0_8px_24px_color-mix(in_srgb,var(--color-sombra)_12%,transparent)]">
          {fallo && <li className="px-2 py-1.5 text-[13px] text-ambar">No se pudo buscar: vuelve a escribir en un momento.</li>}
          {prendas.slice(0, 6).map((p) => (
            <li key={p.productoId}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-hueso focus-visible:bg-hueso"
                onClick={() => {
                  onElegir(p);
                  limpiar();
                }}
              >
                <MiniaturaPrenda fotoUrl={p.fotoUrl} prefijo={categoria.prefijo} familia={categoria.familia} categoria={categoria.nombre} />
                <span className="min-w-0 flex-1">
                  <b className="text-sm text-tinta">{p.nombre}</b>
                  <small className="ml-1.5 text-xs text-taupe">{[p.codigo, `${new Set(p.variantes.map((v) => v.talla ?? "Única")).size} tallas`].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="label-cayla text-[10px] text-taupe">Elegir</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm text-tinta transition-colors hover:bg-hueso focus-visible:bg-hueso"
              onClick={() => {
                onEsNueva(texto);
                limpiar();
              }}
            >
              <Sparkles aria-hidden className="h-4 w-4 text-pizarra" />
              {prendas.length === 0 ? "No está en el catálogo:" : "No es ninguna de estas:"} anotar «{texto}» como nueva
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
