"use client";

// Las piezas de la hoja «Fusionar productos repetidos», dirección B «La ficha que se arma» (Felipe 2026-11-13; ficha al milímetro en
// `docs/milimetro/fusionar-productos.md`, estilos en `app/estilos/vidrio/fusionar.css`). La opción en tarjeta (vidrio claro sin
// elegir, gota con su ✓ elegida) es de esta hoja mientras Felipe no la elija para todo el ERP por `/unificar` (Propuesta 1 de la ficha).

import { useRef, useState, type ReactNode } from "react";
import { Check, Expand, X } from "lucide-react";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { CapsulaColor } from "@/components/ui/MuestraColor";
import { celdaDe, fraseDeLaMatriz, type FichaFinal, type MatrizFinal } from "@/lib/fusionar-productos-ficha";
import { fechaDeAlta, motivoSugerido, nombreDeCampo, type ProductoPlan } from "@/lib/fusionar-productos-reglas";

const enteros = (n: number) => n.toLocaleString("es-PE");

/** La foto de una ficha en 4:3 (la de la prenda es 3:4 y en una columna medía más que la columna). Sin foto, el mosaico de su
 *  categoría (ADR-0333). */
export function FotoFicha({
  url,
  categoria,
  alt = "",
  className = "",
  children,
}: {
  url: string | null;
  categoria: ProductoPlan["categoria"];
  alt?: string;
  className?: string;
  children?: ReactNode;
}) {
  const sinFoto = (
    <div className="absolute inset-0">
      <MosaicoPrenda forma="relleno" conNombre prefijo={categoria.prefijo} familia={categoria.familia} categoria={categoria.nombre} className="h-full w-full !rounded-none" />
    </div>
  );
  return (
    <div className={`fus-foto ${className}`}>
      {url ? <ImagenDePrenda src={url} alt={alt} fill sizes="340px" className="object-cover" fallback={sinFoto} /> : sinFoto}
      {children}
    </div>
  );
}

/** El visto de lo elegido: el círculo de tinta y su ✓, que se dibuja una vez al elegir. */
export function Visto() {
  return (
    <span className="fus-visto" aria-hidden>
      <Check strokeWidth={3} /> {/* unificar-fijo: la marca sobre un punto lleno lleva trazo 3 (fila «icono») */}
    </span>
  );
}

/** Una columna de «¿Cuál se queda?»: la ficha entera es el radio; «Ver ficha» y la × van encima, como hermanos. */
export function ColumnaFicha({
  p,
  productos,
  elegida,
  indice,
  deshabilitada,
  quitable,
  onElegir,
  onVer,
  onQuitar,
  refRadio,
  onTecla,
}: {
  p: ProductoPlan;
  productos: ProductoPlan[];
  elegida: boolean;
  indice: number;
  deshabilitada: boolean;
  quitable: boolean;
  onElegir: () => void;
  onVer: () => void;
  onQuitar: () => void;
  refRadio: (el: HTMLButtonElement | null) => void;
  onTecla: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const foto = p.fotos.find((f) => f.esPrincipal)?.url ?? p.fotos[0]?.url ?? null;
  const motivo = motivoSugerido(productos, p.id);
  const idCifras = `fus-cifras-${p.id}`;
  return (
    <li className="fus-columna-caja" style={{ "--fus-i": indice } as React.CSSProperties}>
      <button
        ref={refRadio}
        type="button"
        role="radio"
        aria-checked={elegida}
        tabIndex={elegida ? 0 : -1}
        aria-label={[p.referencia, p.codigo].filter(Boolean).join(", ")}
        aria-describedby={idCifras}
        disabled={deshabilitada}
        onClick={onElegir}
        onKeyDown={onTecla}
        className="fus-opcion fus-columna"
      >
        {elegida && <Visto />}
        <FotoFicha url={foto} categoria={p.categoria} />
        <span className="fus-columna-nombre block">
          {p.referencia}
          {elegida && (
            <span className="ml-1.5 inline-block align-[2px]">
              <Chip tono="tinta">Queda</Chip>
            </span>
          )}
        </span>
        <span className="texto-detalle mt-0.5 block text-sm text-taupe">{[p.codigo, p.categoria.nombre].filter(Boolean).join(" · ")}</span>
        <span className="fus-cifras block" id={idCifras}>
          <dl>
            <div>
              <dd>{enteros(p.unidadesVendidas)}</dd>
              <dt className="label-cayla">{p.unidadesVendidas === 1 ? "vendida" : "vendidas"}</dt>
            </div>
            <div>
              <dd>{enteros(p.stock)}</dd>
              <dt className="label-cayla">en stock</dt>
            </div>
          </dl>
          <span className="texto-detalle mt-2 block text-sm text-taupe">{fechaDeAlta(p.creadoEn)}</span>
        </span>
        {motivo && (
          <span className="mt-2.5 block">
            <Chip tono="pizarra" versalitas={false}>
              {motivo}
            </Chip>
          </span>
        )}
      </button>
      {/* Encima de la foto, fuera del radio (un botón dentro de otro no se puede tocar con el teclado). La foto está a 12 px del borde. */}
      <button
        type="button"
        onClick={onVer}
        className="fus-sobre-foto fus-ver-ficha area-dedo"
        data-ver-ficha
        data-guia={indice === 0 ? "fusionar.ver-ficha" : undefined}
        aria-label={`Ver la ficha completa de ${p.referencia}`}
      >
        <Expand aria-hidden className="h-4 w-4" />
        Ver ficha
      </button>
      {quitable && !elegida && (
        <button
          type="button"
          onClick={onQuitar}
          disabled={deshabilitada}
          className="fus-sobre-foto fus-quitar area-dedo"
          aria-label={`Quitar «${p.referencia}» de la fusión`}
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/** Una fila de «Lo que es distinto»: una celda por ficha, bajo su columna; las que valen lo mismo que otra se dibujan una sola vez
 *  (la primera) y en las demás queda «Igual». */
export function FilaDistinta({
  campo,
  productos,
  opciones,
  marcada,
  indice,
  deshabilitada,
  onElegir,
}: {
  campo: Parameters<typeof nombreDeCampo>[0];
  productos: ProductoPlan[];
  opciones: { productoId: string; valor: string }[];
  marcada: string | null;
  indice: number;
  deshabilitada: boolean;
  onElegir: (productoId: string) => void;
}) {
  const nombre = nombreDeCampo(campo);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const lista = opciones.map((o) => o.productoId);
  const tecla = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const j = (i + paso + lista.length) % lista.length;
    onElegir(lista[j]);
    refs.current[j]?.focus();
  };
  return (
    <div className="fus-fila" role="radiogroup" aria-label={nombre} style={{ "--fus-n": productos.length, "--fus-k": indice } as React.CSSProperties}>
      <span className="campo-etiqueta">{nombre}</span>
      {productos.map((p) => {
        const i = lista.indexOf(p.id);
        if (i === -1)
          return (
            <span key={p.id} className="fus-celda-vacia" aria-hidden>
              Igual
            </span>
          );
        const o = opciones[i];
        const si = marcada === p.id;
        return (
          <button
            key={p.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={si}
            tabIndex={si || (marcada === null && i === 0) ? 0 : -1}
            disabled={deshabilitada}
            onClick={() => onElegir(p.id)}
            onKeyDown={(e) => tecla(e, i)}
            className="fus-opcion fus-opcion-fila"
          >
            {o.valor}
            <span className="sr-only">{`, de ${p.referencia}`}</span>
            {si && <Visto />}
          </button>
        );
      })}
    </div>
  );
}

/** Lo que dice cada celda: la cifra y, en grande, qué le pasa. */
function TextoCelda({ estado, antes, llega, grande }: { estado: "ya" | "pasa" | "junta"; antes: number; llega: number; grande: boolean }) {
  if (estado === "ya") return <span>{enteros(antes)}</span>;
  if (estado === "pasa")
    return (
      <span>
        {enteros(llega)}
        {grande && <small>pasa</small>}
      </span>
    );
  return (
    <span>
      {enteros(antes)}
      <small>+{enteros(llega)}</small>
    </span>
  );
}

const NOMBRE_ESTADO = { ya: "ya estaba", pasa: "pasa de la otra ficha", junta: "se junta" } as const;

/** La matriz color × talla de la ficha final (decisión 7): «ya estaba», «pasa» (contorno punteado) y «se junta» (+N). El color de
 *  cada fila es dato (la cápsula de la prenda); el estado se dice con forma y texto, no solo con color. */
export function MatrizTallas({
  m,
  grande = false,
  leyendo = false,
  varias = false,
  conFrase = true,
}: {
  m: MatrizFinal;
  grande?: boolean;
  leyendo?: boolean;
  varias?: boolean;
  /** En «Revisar» la lista de arriba ya lo dice. */
  conFrase?: boolean;
}) {
  if (m.colores.length === 0) return null;
  let k = 0;
  return (
    <div className="space-y-2">
      <table /* unificar-fijo: matriz de tallas, aparte de <Tabla> como MatrizIngreso (Propuesta 3 de la ficha) */ className={`fus-matriz ${grande ? "fus-matriz-grande" : ""}`} aria-busy={leyendo || undefined}>
        <caption className="sr-only">Tallas y colores de la ficha final</caption>
        <thead>
          <tr>
            <th scope="col" className="label-cayla text-left">
              <span className="sr-only">Color</span>
            </th>
            {m.tallas.map((t) => (
              <th key={t} scope="col" className="label-cayla">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.colores.map((c) => (
            <tr key={c.clave}>
              <th scope="row">
                <span className="flex min-w-0 items-center gap-2">
                  <CapsulaColor fondo={c.colorHex} compacta />
                  <span className="truncate">{c.color}</span>
                </span>
              </th>
              {m.tallas.map((t) => {
                const celda = celdaDe(m, c.clave, t);
                if (!celda)
                  return (
                    <td key={t} className="fus-celda fus-celda-nada">
                      —<span className="sr-only">{`${c.color} ${t}: no existe`}</span>
                    </td>
                  );
                const kk = Math.min(k++, 12);
                return (
                  <td
                    key={t}
                    className="fus-celda"
                    data-estado={celda.estado}
                    style={{ "--fus-k": kk } as React.CSSProperties}
                    title={`${c.color} ${t}: ${NOMBRE_ESTADO[celda.estado]}`}
                  >
                    <TextoCelda {...celda} grande={grande} />
                    <span className="sr-only">{`, ${NOMBRE_ESTADO[celda.estado]}`}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-taupe" aria-hidden> {/* unificar-fijo: leyenda de un gráfico, fuera del piso de 14 px */}
        <span className="inline-flex items-center gap-1.5">
          <i className="fus-leyenda-muestra fus-celda" data-estado="ya" />
          Ya estaba
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="fus-leyenda-muestra fus-celda" data-estado="pasa" />
          {varias ? "Pasa de otra ficha" : "Pasa de la otra ficha"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="fus-leyenda-muestra fus-celda" data-estado="junta" />
          Se junta y suma
        </span>
      </p>
      {conFrase && fraseDeLaMatriz(m) && <p className="text-sm text-tinta">{fraseDeLaMatriz(m)}</p>}
    </div>
  );
}

/** Un dato que se voltea una vez cuando cambia (no al llegar): cada cambio lo vuelve a montar con su clave. */
function Volteable({ valor }: { valor: string }) {
  // El ajuste durante el render que recomienda React (sin efecto): cuenta los cambios del valor.
  const [previo, setPrevio] = useState(valor);
  const [cambios, setCambios] = useState(0);
  if (valor !== previo) {
    setPrevio(valor);
    setCambios(cambios + 1);
  }
  return cambios === 0 ? <span>{valor}</span> : <span key={cambios} className="fus-voltea">{valor}</span>;
}

/** «Así va a quedar»: la ficha final, que se arma con cada elección. Lo que viene de otra ficha lleva su marca. */
export function PlacaFinal({
  ficha,
  matriz,
  avisoMatriz,
  fotos,
  leyendo,
  varias,
  pegada = true,
  conMatriz = true,
}: {
  ficha: FichaFinal;
  /** Null mientras se leen las tallas (o si no se pudieron leer): entonces se dice `avisoMatriz`. */
  matriz: MatrizFinal | null;
  avisoMatriz?: string;
  fotos: number;
  leyendo: boolean;
  varias: boolean;
  pegada?: boolean;
  conMatriz?: boolean;
}) {
  const datos = ficha.datos.filter((d) => d.campo === "categoria" || d.campo === "precio" || d.deOtra);
  return (
    <section className={`fus-final ${pegada ? "fus-final-pegada" : ""}`} aria-busy={leyendo || undefined} aria-label="Así va a quedar" data-guia="fusionar.final">
      <TituloGrupo>Así va a quedar</TituloGrupo>
      <FotoFicha url={ficha.fotoUrl} categoria={ficha.categoria} className="mt-2.5" />
      <p className="fus-final-nombre" aria-live="polite">
        <Volteable valor={ficha.referencia} />
      </p>
      {ficha.codigo && <p className="texto-detalle mt-0.5 text-sm text-taupe">{ficha.codigo}</p>}
      <dl aria-live="polite">
        {datos.map((d) => (
          <div key={d.campo} className="contents">
            <dt className="text-sm text-taupe">{nombreDeCampo(d.campo)}</dt>
            <dd>
              <Volteable valor={d.valor} />
            </dd>
          </div>
        ))}
        <dt className="text-sm text-taupe">Vendidas</dt>
        <dd>{enteros(ficha.unidadesVendidas)}</dd>
        <dt className="text-sm text-taupe">En stock</dt>
        <dd>{enteros(ficha.stock)}</dd>
        <dt className="text-sm text-taupe">Fotos</dt>
        <dd>
          <Volteable valor={enteros(fotos)} />
        </dd>
      </dl>
      {conMatriz && (
        <div className="mt-3 border-t border-tinta/10 pt-3">
          {matriz ? <MatrizTallas m={matriz} leyendo={leyendo} varias={varias} /> : <p className="text-sm text-taupe">{avisoMatriz}</p>}
        </div>
      )}
    </section>
  );
}
