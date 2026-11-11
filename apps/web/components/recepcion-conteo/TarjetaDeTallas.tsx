"use client";

import type { ReactNode } from "react";
import { ArrowRight, Check, Clock, Grid3x3, PackageCheck, Sparkles } from "lucide-react";
import { Punto } from "@/components/alta-producto/Punto";
import { Boton } from "@/components/ui/campos";
import type { ColorAlta } from "@/lib/alta-producto";
import type { VarianteSeparada } from "@/lib/recepcion-conteo-reglas";
import { conMiles } from "@/lib/recepcion-modelos-reglas";
import type { EstadoDeLaTarjeta, ModoDeTallas } from "@/lib/recepcion-tallas-reglas";

// El paso 2 del contador (ADR-0645, Felipe 2026-11-11): una tarjeta que dice cómo van las tallas y colores de este modelo y tiene UN botón, que abre la hoja donde se reparten.
// Reemplaza a la pregunta «¿Qué deseas hacer?», que había que contestar en cada modelo: ahora viene contestada por lo que es la prenda (lo del catálogo se reparte ahora; lo nuevo,
// después) y la tarjeta ofrece el otro camino en un enlace. La tabla dejó la placa porque ahí no cabía: se abre en una hoja con espacio.

const sinTildes = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("es");

export function TarjetaDeTallas({
  estado,
  contadas,
  repartidas,
  variantes,
  colores,
  esperaTabla,
  onAbrir,
  onModo,
  despues,
}: {
  estado: EstadoDeLaTarjeta;
  /** Lo que hay que repartir: lo contado menos lo que ya entró al stock. */
  contadas: number;
  repartidas: number;
  /** Lo repartido y guardado, para decirlo en chips. */
  variantes: readonly VarianteSeparada[] | null;
  colores: readonly ColorAlta[];
  /** Hay algo escrito en la tabla que todavía no cuadra: espera en la pantalla. */
  esperaTabla: boolean;
  onAbrir: () => void;
  onModo: (m: ModoDeTallas) => void;
  /** Lo que va debajo cuando ya está repartido (llevar al stock). */
  despues?: ReactNode;
}) {
  const flecha = <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />;
  const colorDe = (nombre: string | null) => (nombre ? (colores.find((c) => sinTildes(c.nombre) === sinTildes(nombre)) ?? null) : null);
  const chips = (variantes ?? []).filter((v) => v.cantidad > 0);
  const resumen = chips.length > 0 && (
    <ul className="rc-reparto" aria-label="Lo repartido">
      {chips.slice(0, 8).map((v) => {
        const color = colorDe(v.color);
        return (
          <li key={v.varianteId}>
            {color && <Punto hex={color.hex} familia={color.familiaColor} tipo={color.tipo} />}
            <span>{[v.color, v.talla].filter(Boolean).join(" ") || "Única"}</span>
            <b>×{conMiles(v.cantidad)}</b>
          </li>
        );
      })}
      {chips.length > 8 && <li className="rc-reparto-mas">y {chips.length - 8} más</li>}
    </ul>
  );
  const dejar = (
    <button type="button" className="btn-cayla btn-enlace" onClick={() => onModo("despues")}>
      Dejar para después
    </button>
  );

  if (estado === "en-stock") {
    return (
      <div className="rc-tarjeta" data-tono="lista" data-guia="recepcion.que-hacer">
        <span className="rc-tarjeta-ic" aria-hidden>
          <PackageCheck className="h-5 w-5" />
        </span>
        <div className="rc-tarjeta-textos">
          <b>Ya están en el stock</b>
          <span>No se vuelven a contar. Si hubo un error, ábrelas en la lista, donde dicen «En stock».</span>
        </div>
      </div>
    );
  }
  if (estado === "espera") {
    return (
      <div className="rc-tarjeta" data-tono="espera" data-guia="recepcion.que-hacer">
        <span className="rc-tarjeta-ic" aria-hidden>
          <Grid3x3 className="h-5 w-5" />
        </span>
        <div className="rc-tarjeta-textos">
          <b>Todavía no</b>
          <span>Primero cuenta cuántas llegaron.</span>
        </div>
      </div>
    );
  }
  if (estado === "nueva") {
    return (
      <div className="rc-tarjeta" data-tono="despues" data-guia="recepcion.que-hacer">
        <span className="rc-tarjeta-ic" aria-hidden>
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="rc-tarjeta-textos">
          <b>Es una prenda nueva: queda para después</b>
          <span>Entra al almacén contada. Se vende cuando la crees y le pongas tallas y colores, ahora o después de cerrar.</span>
        </div>
        <div className="rc-tarjeta-acciones">
          <Boton type="button" peso="fantasma" onClick={() => onModo("ahora")}>
            Crearla ahora
          </Boton>
        </div>
      </div>
    );
  }
  if (estado === "despues") {
    return (
      <div className="rc-tarjeta" data-tono="despues" data-guia="recepcion.que-hacer">
        <span className="rc-tarjeta-ic" aria-hidden>
          <Clock className="h-5 w-5" />
        </span>
        <div className="rc-tarjeta-textos">
          <b>Tallas y colores, para después</b>
          <span>Entra al almacén contada: no se vende hasta ponérselas.</span>
        </div>
        <div className="rc-tarjeta-acciones">
          <Boton type="button" peso="fantasma" onClick={() => onModo("ahora")} data-guia="recepcion.abrir-tallas">
            Repartir ahora
          </Boton>
        </div>
      </div>
    );
  }
  if (estado === "lista") {
    return (
      <div className="rc-tarjeta" data-tono="lista" data-guia="recepcion.que-hacer">
        <span className="rc-tarjeta-ic" aria-hidden>
          <Check className="h-5 w-5" />
        </span>
        <div className="rc-tarjeta-textos">
          <b>Repartidas las {conMiles(contadas)}</b>
          <span>Entran al stock al cerrar, o antes si tú las llevas.</span>
          {resumen}
        </div>
        <div className="rc-tarjeta-acciones">
          {despues}
          <button type="button" className="btn-cayla btn-enlace" onClick={onAbrir} data-guia="recepcion.abrir-tallas">
            Editar tallas
          </button>
        </div>
      </div>
    );
  }
  const falta = contadas - repartidas;
  return (
    <div className="rc-tarjeta" data-tono={estado === "de-mas" ? "atencion" : "ahora"} data-guia="recepcion.que-hacer">
      <span className="rc-tarjeta-ic" aria-hidden>
        <Grid3x3 className="h-5 w-5" />
      </span>
      <div className="rc-tarjeta-textos">
        <b>{estado === "repartir" ? `Reparte las ${conMiles(contadas)}` : estado === "a-medias" ? `Repartidas ${conMiles(repartidas)} de ${conMiles(contadas)} · ${falta === 1 ? "falta 1" : `faltan ${conMiles(falta)}`}` : `Repartiste ${conMiles(repartidas)} y contaste ${conMiles(contadas)}`}</b>
        <span>
          {estado === "repartir"
            ? "Di cuántas llegaron de cada talla y color: con eso entran al stock."
            : estado === "a-medias"
              ? esperaTabla
                ? "Se guarda cuando lo repartido cuadre con lo contado."
                : "Sigue repartiendo las que faltan."
              : "Baja una cantidad, o corrige lo contado desde la tabla."}
        </span>
      </div>
      <div className="rc-tarjeta-acciones">
        <Boton type="button" peso="primario" onClick={onAbrir} data-guia="recepcion.abrir-tallas">
          <span className="inline-flex items-center gap-2">
            {estado === "repartir" ? "Repartir tallas y colores" : estado === "a-medias" ? "Seguir repartiendo" : "Revisar el reparto"}
            {flecha}
          </span>
        </Boton>
        {dejar}
      </div>
    </div>
  );
}
