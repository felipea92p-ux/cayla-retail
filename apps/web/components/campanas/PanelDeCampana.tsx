"use client";

import type { CSSProperties, ReactNode } from "react";
import { Plus, Shirt, Tag } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { FotoDePrenda } from "@/components/ui/FotoDePrenda";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import type { CartelDeOferta, ChipDeCampana } from "@/lib/campana-panel-reglas";
import type { ModeloColor } from "@/lib/sellos-pases";

/** Cuántas prendas se ven antes de «+N prendas más» (dos filas anchas de la grilla). */
const PRENDAS_A_LA_VISTA = 12;

/**
 * Una campaña abierta en Campañas y ofertas (ADR-0677, actividad 6 de la maqueta `docs/maquetas/campanas-simple-2026-11/`): su nombre, tres chips
 * (estado, fechas, tiendas), sus ofertas como carteles y sus prendas. «Editar» y «Más» los arma la pantalla (`acciones`), que es la que abre las hojas
 * de siempre. Quien no puede editar ve lo mismo sin botones. La ficha con cada medida: `docs/milimetro/panel-de-campana.md`.
 */
export function PanelDeCampana({
  nombre,
  volver,
  chips,
  acciones,
  carteles,
  onCartel,
  onNuevaOferta,
  prendas,
  categorias,
  eligenSusOfertas,
  onElegirPrendas,
  vacioPrendas,
}: {
  nombre: string;
  /** La flecha de vuelta a la lista (solo con una columna, donde el panel queda bajo su fila). */
  volver?: ReactNode;
  chips: readonly ChipDeCampana[];
  /** «Editar» y «Más» (o aprobar, reactivar) a la derecha del nombre. */
  acciones: ReactNode;
  carteles: readonly CartelDeOferta[];
  /** Abrir una oferta; sin él, los carteles solo se leen. */
  onCartel?: (id: string) => void;
  /** «Nueva oferta»; sin él, no se dibuja. */
  onNuevaOferta?: () => void;
  prendas: readonly ModeloColor[];
  /** Las categorías que entran enteras (se nombran si no hay prendas a la vista). */
  categorias: readonly string[];
  /** Sus ofertas eligen las prendas: no está «sin prendas» aunque no tenga ninguna marcada. */
  eligenSusOfertas: boolean;
  /** «Elegir prendas»; sin él, no se dibuja. */
  onElegirPrendas?: () => void;
  /** Lo que dice el vacío de prendas, si aplica algo más que lo de siempre. */
  vacioPrendas?: string;
}) {
  const visibles = prendas.slice(0, PRENDAS_A_LA_VISTA);
  const resto = prendas.length - visibles.length;
  return (
    <section className="lc-panel" aria-label={`Campaña ${nombre}`}>
      <div className="lc-panel-cab" data-guia="campana.cabecera">
        <div className="min-w-0">
          <p className="lc-panel-pre">
            {volver}
            <span>Campaña</span>
          </p>
          <h2 className="lc-panel-tit" data-nombre="">
            {nombre}
          </h2>
          <div className="lc-chips">
            {chips.map((c) => (
              <Chip key={c.clave} tono={c.tono} title={c.title} versalitas={c.punto}>
                {c.texto}
              </Chip>
            ))}
          </div>
        </div>
        <div className="lc-panel-acc">{acciones}</div>
      </div>

      <TituloSeccion cuenta={carteles.length} className="mt-8" guia="campana.ofertas">
        Ofertas
      </TituloSeccion>
      <div className="lc-ofertas">
        {carteles.map((c, i) =>
          onCartel ? (
            <button
              key={c.id}
              type="button"
              className="lc-cartel"
              style={{ "--i": i } as CSSProperties}
              aria-label={`Abrir ${c.id === "descuento" ? "el descuento" : "la oferta"} ${c.glifo}, ${[c.en, c.detalle].filter(Boolean).join(", ")}`}
              onClick={() => onCartel(c.id)}
            >
              <Cartel c={c} />
            </button>
          ) : (
            <div key={c.id} className="lc-cartel" style={{ "--i": i } as CSSProperties}>
              <Cartel c={c} />
            </div>
          ),
        )}
        {onNuevaOferta && (
          <button type="button" className="lc-cartel lc-cartel-nuevo" style={{ "--i": carteles.length } as CSSProperties} onClick={onNuevaOferta} data-guia="campana.nueva-oferta">
            <Plus aria-hidden className="h-5 w-5" />
            <span>Nueva oferta</span>
          </button>
        )}
        {carteles.length === 0 && !onNuevaOferta && (
          <Vacio tamano="chico" icono={<Tag />}>
            Todavía no tiene ofertas.
          </Vacio>
        )}
      </div>

      <TituloSeccion
        cuenta={prendas.length}
        className="mt-8"
        guia="campana.prendas"
        accion={
          onElegirPrendas ? (
            <Boton peso="fantasma" className="btn-chico" onClick={onElegirPrendas}>
              Elegir prendas
            </Boton>
          ) : undefined
        }
      >
        Prendas
      </TituloSeccion>
      {prendas.length > 0 ? (
        <div className="lc-grilla !mt-4" data-guia="sellos.lookbook">
          {visibles.map((m, j) => (
            <article key={m.clave} className="sl-prenda" style={{ "--j": j } as CSSProperties}>
              <div className="sl-prenda-foto">
                <FotoDePrenda fotoUrl={m.fotoUrl} colorHex={m.colorHex} prefijo={m.categoria?.prefijo} familia={m.categoria?.familia} categoria={m.categoria?.nombre} />
              </div>
              <span className="sl-prenda-nombre" title={m.referencia}>
                {m.referencia}
              </span>
              <span className="sl-prenda-dato">
                {[m.colorNombre, m.unidades !== null ? (m.unidades === 0 ? "agotada" : `${m.unidades} u`) : null].filter(Boolean).join(" · ")}
              </span>
            </article>
          ))}
          {resto > 0 &&
            (onElegirPrendas ? (
              <button type="button" className="sl-mas" style={{ "--j": visibles.length } as CSSProperties} onClick={onElegirPrendas}>
                <span>
                  <b>+{resto}</b>prendas más
                </span>
              </button>
            ) : (
              <div className="sl-mas" style={{ "--j": visibles.length } as CSSProperties}>
                <span>
                  <b>+{resto}</b>prendas más
                </span>
              </div>
            ))}
        </div>
      ) : categorias.length > 0 ? (
        <p className="mt-3 text-sm text-tinta/65">Entran enteras: {categorias.join(", ")}.</p>
      ) : eligenSusOfertas ? (
        <p className="mt-3 text-sm text-tinta/65">Las eligen sus ofertas.</p>
      ) : (
        <div className="mt-4">
          <Vacio tamano="chico" icono={<Shirt />}>
            {vacioPrendas ?? "Todavía no tiene prendas."}
          </Vacio>
        </div>
      )}
    </section>
  );
}

function Cartel({ c }: { c: CartelDeOferta }) {
  return (
    <>
      {/* El «%» nunca queda solo en una línea («La 2.ª al 50 %» a 375 px). */}
      <span className="lc-cartel-glifo">{c.glifo.replace(/ %/g, " %")}</span>
      <span className="lc-cartel-en">{c.en}</span>
      {c.detalle && <span className="lc-cartel-en lc-cartel-detalle">{c.detalle}</span>}
      {c.chip && (
        <span className="lc-cartel-chip">
          <Chip tono={c.chip.tono}>{c.chip.texto}</Chip>
        </span>
      )}
    </>
  );
}
