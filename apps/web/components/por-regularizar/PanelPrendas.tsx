"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { buscarPrendas, candidatasDe, sugeridaDe, type Disponible, type IndicePrendas, type PrendaParaRegularizar } from "@/lib/por-regularizar-mesa";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { TarjetaCandidata } from "./TarjetaCandidata";
import { PorQue } from "./PorQue";

/**
 * Las prendas entre las que se elige (ADR-0360): las seis que más calzan con lo que anotó caja y, debajo, un buscador sobre TODO el
 * catálogo por si la que se busca no salió. La búsqueda no repite las que ya están arriba (y avisa si la que buscas ya está allí).
 * Elegir una prenda no guarda nada: la une a la venta en el puente.
 */
export function PanelPrendas({
  venta,
  prendas,
  indice,
  disponible,
  sede,
  seleccionadaId,
  guia,
  onElegir,
  onApuntar,
}: {
  venta: FilaPorRegularizar;
  prendas: PrendaParaRegularizar[];
  indice: IndicePrendas;
  disponible: Disponible;
  /** La tienda de la venta, corta («TRU»). */
  sede: string;
  seleccionadaId: string | null;
  guia: GuiaCampos;
  onElegir: (id: string) => void;
  onApuntar: (id: string | null) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const arriba = useMemo(() => candidatasDe(venta, prendas, disponible), [venta, prendas, disponible]);
  const sugerida = useMemo(() => sugeridaDe(venta, prendas, disponible), [venta, prendas, disponible]);
  const idsArriba = useMemo(() => new Set(arriba.map((c) => c.prenda.id)), [arriba]);
  const { lista, enLasDeArriba } = useMemo(() => buscarPrendas(indice, consulta, venta, disponible, idsArriba), [indice, consulta, venta, disponible, idsArriba]);
  const buscando = consulta.trim().length > 0;

  return (
    <div className="vsr-prendas" data-vsr-prendas>
      <CampoGuiado id="prenda" guia={guia} titulo="¿Qué prenda es?" ayuda={sugerida ? "La sugerida es la única que calza en todo." : "Toca la tuya. Si hay más de una que calza, tú la reconoces."}>
        <div className="mb-2 flex flex-wrap items-center">
          <PorQue etiqueta="¿Por qué estas?">
            <p>Salen primero las prendas que más se parecen a lo que anotó caja: la misma prenda, talla y color. Cada tarjeta dice si calza en todo o qué cambia.</p>
            <p>
              <b>Sugerida</b> es la única que calza en todo <b>y</b> tiene unidades libres en esta tienda. Si no sale ninguna, hay más de una que calza (tú la reconoces) o ninguna tiene unidades.
              Si no ves la tuya, búscala debajo.
            </p>
          </PorQue>
        </div>
        {disponible === null && (
          <p className="vsr-aviso-stock mb-2" role="note">
            No pudimos leer cuántas hay en la tienda ahora, así que no se muestran cifras ni se sugiere ninguna. Puedes regularizar igual: la base revisa el stock al guardar.
          </p>
        )}
        <div className="vsr-rejilla" role="group" aria-label="Prendas que más calzan">
          {arriba.map((c, i) => (
            <TarjetaCandidata key={c.prenda.id} candidata={c} sugerida={sugerida?.id === c.prenda.id} seleccionada={seleccionadaId === c.prenda.id} indice={i} sede={sede} onElegir={onElegir} onApuntar={onApuntar} />
          ))}
        </div>
      </CampoGuiado>

      <div className="vsr-busca">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">¿No ves la tuya?</p>
          <p>Búscala entre todas las prendas del catálogo.</p>
        </div>
        <label className="relative block">
          <span className="sr-only">Buscar una prenda en el catálogo</span>
          <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta/45" />
          <input
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && consulta) {
                // El Escape de un control que lo usó no cierra la hoja de arriba (ADR-0136, «Escape dentro de una hoja»).
                e.stopPropagation();
                e.preventDefault();
                setConsulta("");
              } else if (e.key === "Enter" && lista[0]) {
                e.preventDefault();
                onElegir(lista[0].prenda.id);
              }
            }}
            maxLength={120}
            autoComplete="off"
            placeholder="Nombre, color, talla o código" // sugerir-fijo: dice qué se puede escribir, no da el nombre ni el color de una prenda de ejemplo
            className="h-9 w-full truncate rounded-md border border-tinta/15 bg-papel pl-9 pr-8 text-sm text-tinta outline-none placeholder:text-[13px] placeholder:text-tinta/45 focus:border-rojo/60 [&::-webkit-search-cancel-button]:hidden"
          />
          {consulta && (
            <button type="button" aria-label="Borrar la búsqueda" onClick={() => setConsulta("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-tinta/50 hover:text-tinta">
              <X aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <div aria-live="polite">
          {buscando && lista.length > 0 && (
            <>
              <p className="vsr-res-n">
                {lista.length} {lista.length === 1 ? "prenda" : "prendas"} más
                {enLasDeArriba > 0 && ` · ${enLasDeArriba} ya ${enLasDeArriba === 1 ? "está" : "están"} entre las de arriba`}
              </p>
              <div className="vsr-rejilla">
                {lista.map((c, i) => (
                  <TarjetaCandidata key={c.prenda.id} candidata={c} sugerida={false} seleccionada={seleccionadaId === c.prenda.id} indice={i} sede={sede} onElegir={onElegir} onApuntar={onApuntar} />
                ))}
              </div>
            </>
          )}
          {buscando && lista.length === 0 && (
            <div className="vsr-res-0">
              <b>{enLasDeArriba > 0 ? "Ya está entre las de arriba" : `Ninguna prenda coincide con «${consulta.trim()}»`}</b>
              <span>
                {enLasDeArriba > 0 ? "Tócala ahí. " : "Prueba con otra palabra, o con el código. "}
                ¿No está en el catálogo?{" "}
                <Link href="/productos/nuevo" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
                  Dala de alta
                </Link>{" "}
                con su precio oficial y vuelve aquí.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
