"use client";

import { useId, useState } from "react";
import { useAnalisis } from "@/components/analisis/contexto";
import { Ayuda, nombreLargo, TilePrenda } from "@/components/analisis/piezas";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { diasQueQuedan } from "@/lib/analisis-reglas";
import { pistaAcaba } from "@/lib/analisis-acaba";
import {
  agruparPorProveedor,
  resumenCabecera,
  resumenDeGrupos,
  textoFuentesDelGrupo,
  textoModelosDelGrupo,
  type GrupoProveedor,
} from "@/lib/analisis-a-quien-pedir";

// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A8): «A quién pedir», sobre el carril de «Se está
// acabando». Lo que todavía hay que comprar (lo que ya viene en camino no se pide otra vez), junto por a quién se le pide: cada proveedor
// con sus modelos, del más urgente al menos, y «Sin proveedor» al final. El proveedor sale de la última compra o, si no hay, del catálogo, y
// la fila lo dice (`lib/analisis-a-quien-pedir.ts`).
//
// Solo muestra: no tiene un botón por proveedor porque «Comprar» todavía abre «Registrar factura» (una compra ya hecha) y no una orden de
// compra; ese botón llega con A9, cuando el destino sea el correcto. Tampoco dice cuántas pedir (decisión 7).

/** Cuántos proveedores se ven antes de «Ver N más»: con 17 proveedores, la tarjeta no debe empujar el carril fuera de la pantalla. */
const PROVEEDORES_A_LA_VISTA = 4;

const AYUDA =
  "Lo que se acaba y todavía no viene en camino, junto por a quién pedírselo, empezando por quien tiene lo más urgente. El proveedor es el de tu última compra; si el modelo no tiene ninguna, el que tiene en el catálogo (y lo dice). Toca un modelo para ver su ficha.";

export function AQuienPedir({ modelos }: { modelos: ModeloAnalisis[] }) {
  const { datos } = useAnalisis();
  const [abierto, setAbierto] = useState(false);
  const idMas = useId();
  const proveedores = datos.proveedores;
  const grupos = proveedores ? agruparPorProveedor(modelos, proveedores) : [];
  // Sin leer los proveedores (se dice en las fallas) o sin nada que pedir, la tarjeta no se dibuja: nunca «Sin proveedor» por un error.
  if (!proveedores || grupos.length === 0) return null;

  const primeros = grupos.slice(0, PROVEEDORES_A_LA_VISTA);
  const resto = grupos.slice(PROVEEDORES_A_LA_VISTA);
  return (
    <section className="tarjeta carril entra" style={{ ["--i" as string]: 0 }} aria-label="A quién pedir" data-guia="analisis.a-quien-pedir">
      <div className="c-cab">
        <div>
          <h3 className="b-tit">A quién pedir</h3>
          <span className="c-sub">{resumenCabecera(resumenDeGrupos(grupos))} · empieza por quien tiene lo más urgente</span>
        </div>
        <span className="b-nota">
          <Ayuda texto={AYUDA} />
        </span>
      </div>
      {primeros.map((g) => (
        <FilaProveedor key={g.clave} g={g} />
      ))}
      {resto.length > 0 && (
        <>
          <FilasDeMas abierto={abierto} id={idMas}>
            {resto.map((g) => (
              <FilaProveedor key={g.clave} g={g} />
            ))}
          </FilasDeMas>
          <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={`Ver ${resto.length} más`} controla={idMas} />
        </>
      )}
    </section>
  );
}

/** Un proveedor: su nombre, cuántos modelos y de dónde se sabe; y sus modelos, cada uno con lo que le queda (tocarlo abre su ficha). */
function FilaProveedor({ g }: { g: GrupoProveedor<ModeloAnalisis> }) {
  const { abrirFicha } = useAnalisis();
  return (
    <div className="qp-fila" role="group" aria-label={g.nombre}>
      <div className="qp-quien">
        <b>{g.nombre}</b>
        <span>
          {textoModelosDelGrupo(g)} · {textoFuentesDelGrupo(g.fuentes)}
        </span>
      </div>
      <div className="qp-mods">
        {g.modelos.map((m) => {
          const pista = pistaAcaba(diasQueQuedan(m));
          return (
            <button key={m.varianteId} type="button" className="qp-mod" aria-label={`${nombreLargo(m)}${pista ? `, ${pista.texto}` : ""}: ver su ficha`} onClick={() => abrirFicha(m.varianteId)}>
              <TilePrenda prenda={m} tamano={22} />
              <span className="n">{m.nombre}</span>
              {pista && <b className="d">{pista.texto}</b>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
