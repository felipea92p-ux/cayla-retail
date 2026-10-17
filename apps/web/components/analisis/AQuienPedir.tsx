"use client";

import { useId, useState, type ReactNode } from "react";
import { useAnalisis } from "@/components/analisis/contexto";
import { Ayuda, nombreLargo, TilePrenda } from "@/components/analisis/piezas";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { BotonEnlace } from "@/components/ui/campos";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { diasQueQuedan } from "@/lib/analisis-reglas";
import { pistaAcaba } from "@/lib/analisis-acaba";
import { dondeComprarDe, hrefElegirProveedor, hrefPedirAProveedor } from "@/lib/analisis-acciones";
import {
  agruparPorProveedor,
  CLAVE_SIN_PROVEEDOR,
  nombreCortoProveedor,
  repartirGrupos,
  resumenCabecera,
  resumenDeGrupos,
  textoFuentesDelGrupo,
  textoModelosDelGrupo,
  type GrupoProveedor,
} from "@/lib/analisis-a-quien-pedir";

// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A8 y F1): «A quién pedir» es el modo «POR PROVEEDOR» del
// carril de «Se está acabando» —OTRA forma de ver la misma lista, no una tarjeta más encima de ella: arriba empujaba el carril 381 px y a 1024 px
// lo dejaba fuera de la primera pantalla—. Muestra lo que todavía hay que comprar (lo que ya viene en camino no se pide otra vez), junto por a
// quién se le pide: cada proveedor con sus modelos, del más urgente al menos. El proveedor sale de la última compra o, si no hay, de la ficha del
// modelo en el catálogo, y la fila lo dice (`lib/analisis-a-quien-pedir.ts`). «Sin proveedor» no cuenta para el tope de 4 y, si trae un agotado,
// siempre se ve, con la salida a donde se elige; un proveedor archivado no se recomienda: sus modelos caen ahí con su motivo.
//
// Cada proveedor trae su «Pedir a X» (A9, decisión D8): abre una orden de compra nueva con ese proveedor, esta tienda y SUS modelos, sin cantidades (no
// dice cuántas pedir: decisión 7). Solo con el módulo Órdenes de compra; el Taller y «Sin proveedor» no lo traen (a ellos no se les abre una orden de compra).

const AYUDA =
  "Lo que se acaba y todavía no viene en camino, junto por a quién pedírselo, empezando por quien tiene lo más urgente. El proveedor es al que le compraste la última vez; si el modelo no tiene ninguna compra, el que está anotado en su ficha (y lo dice). Si su proveedor está archivado, no se le pide: aparece en «Sin proveedor» para que elijas otro. Toca un modelo para ver su ficha.";

/**
 * El modo «Por proveedor» de «Se está acabando»: `modelos` son los que todavía hay que pedir (`modelosPorPedir`, la misma regla de «Comprar») y
 * `herramienta`, el segmento «Por días / Por proveedor» que vive en la cabecera de las dos formas, para que no se mueva al cambiar. No dibuja
 * nada sin proveedores leídos o sin modelos.
 */
export function AQuienPedir({ modelos, herramienta }: { modelos: ModeloAnalisis[]; herramienta?: ReactNode }) {
  const { datos } = useAnalisis();
  const [abierto, setAbierto] = useState(false);
  const idMas = useId();
  const proveedores = datos.proveedores;
  const grupos = proveedores ? agruparPorProveedor(modelos, proveedores) : [];
  // Sin leer los proveedores (se dice en las fallas) o sin nada que pedir, no se dibuja: nunca «Sin proveedor» por un error.
  if (!proveedores || grupos.length === 0) return null;

  const { visibles, resto, fijo } = repartirGrupos(grupos);
  return (
    <section className="tarjeta carril entra" style={{ ["--i" as string]: 0 }} aria-label="A quién pedir" data-guia="analisis.a-quien-pedir">
      <div className="c-cab">
        <div>
          <h3 className="b-tit">A quién pedir</h3>
          <span className="c-sub">{resumenCabecera(resumenDeGrupos(grupos))}</span>
        </div>
        <span className="b-nota">
          {herramienta}
          <Ayuda texto={AYUDA} />
        </span>
      </div>
      {visibles.map((g) => (
        <FilaProveedor key={g.clave} g={g} />
      ))}
      {resto.length > 0 && (
        <FilasDeMas abierto={abierto} id={idMas}>
          {resto.map((g) => (
            <FilaProveedor key={g.clave} g={g} />
          ))}
        </FilasDeMas>
      )}
      {/* «Sin proveedor» con un agotado no se pliega nunca: está al final de la lista, también con «Ver más» cerrado. */}
      {fijo && <FilaProveedor g={fijo} />}
      {resto.length > 0 && <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={`Ver ${resto.length} más`} controla={idMas} />}
      <div style={{ height: 10 }} />
    </section>
  );
}

/** Un proveedor: su nombre, cuántos modelos y de dónde se sabe; y sus modelos, cada uno con lo que le queda (tocarlo abre su ficha). */
function FilaProveedor({ g }: { g: GrupoProveedor<ModeloAnalisis> }) {
  const { abrirFicha, acceso, datos } = useAnalisis();
  const sin = g.clave === CLAVE_SIN_PROVEEDOR;
  // Solo «Sin proveedor» lleva a elegirlo: ahí no hay nadie a quien pedirle, y un enlace que cae en «Sin acceso» no se dibuja.
  const elegir = sin ? hrefElegirProveedor(g.modelos, acceso) : null;
  // A quien SÍ se le pide (no el Taller ni «Sin proveedor»): una orden de compra con sus modelos. Sin el módulo, el botón no se dibuja.
  const pedir = g.proveedorId ? hrefPedirAProveedor(g.modelos, g.proveedorId, acceso, dondeComprarDe(datos)) : null;
  return (
    <div className={`qp-fila ${sin ? "sin" : ""}`} role="group" aria-label={g.nombre}>
      <div className="qp-quien">
        <b>{g.nombre}</b>
        <span>
          {textoModelosDelGrupo(g)} · {textoFuentesDelGrupo(g.fuentes)}
        </span>
        {g.archivados.length > 0 && (
          <span className="qp-arch">
            {g.archivados.map((nombre) => (
              <span key={nombre} className="qp-arch-n">
                {nombre}
                <Chip tono="apagado" tachado={false} versalitas={false} title="Ya no se trabaja con este proveedor">
                  Archivado
                </Chip>
              </span>
            ))}
          </span>
        )}
        {elegir && (
          <EnlaceVer href={elegir} className="qp-elegir">
            Elegir proveedor
          </EnlaceVer>
        )}
        {pedir && (
          <BotonEnlace
            href={pedir}
            className="qp-pedir btn-s"
            aria-label={`Pedir a ${g.nombre}: abre una orden de compra con ${g.modelos.length} ${g.modelos.length === 1 ? "modelo" : "modelos"}, sin cantidades`}
            title="Abre una orden de compra con estos modelos. Las cantidades las pones tú."
          >
            Pedir a {nombreCortoProveedor(g.nombre)}
          </BotonEnlace>
        )}
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
