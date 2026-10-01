"use client";

import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { FRASE, TEXTO, textoAnuncio, tonoChipDeAlerta, type AccionAlerta, type AlertaVista, type ParteTexto } from "@/lib/parecidas-alta-vista";

// La alerta «Prendas parecidas» del RESUMEN de «Nuevo producto» (Fase 1; maqueta docs/maquetas/producto-buscar-primero-2026-09/).
//
// EL PROBLEMA. Dos sedes cargan la misma prenda con nombres distintos y el stock queda partido. Felipe decidió (2026-09-30) que la ayuda no sea
// un bloque grande dentro del formulario sino una tarjeta compacta en el resumen de la derecha —donde la gente ya mira «qué falta»—, entre la
// ficha y la lista «Avance», con una hoja «Ver y comparar» bajo demanda. La persona decide mirando la foto y el stock: esta tarjeta solo AVISA.
//
// CONTRATO. PROMETE: dibujar `alerta` tal cual (el tono, el título, la frase, hasta 2 mini filas tocables y una acción); mantener UNA región
//   `role="status"` siempre montada, cuyo texto cambia (así un lector de pantalla anuncia cada cambio sin que la región se desmonte);
//   hacer UN solo pulso al cambiar de nivel (cuando cambia `alerta.clave`), nunca en bucle; no robar el foco; nada de precio ni costo; ni un
//   texto propio (todos vienen de `TEXTO` y `FRASE`). La región que envuelve la tarjeta es un destino de foco de respaldo (`data-parecidas-ancla`,
//   `tabIndex -1`): cuando la hoja se cierra y la fila que la abrió ya no existe, el foco vuelve aquí.
//   ASUME: que quien integra la monta en la columna derecha (entre la ficha y «Avance») y que espera la pausa de 0,6 s tras teclear antes de
//   cambiar `alerta` (la alerta no se actualiza en cada tecla); que el formulario usa `useSalidaSinGuardar` (los enlaces «Ver X de Jirish» SALEN de la
//   pantalla: sin esa guardia, lo llenado se pierde sin preguntar; la alerta ya lo dijo antes de tocar). NO HACE: calcular nada (todo viene en
//   `AlertaVista`), abrir la hoja por su cuenta ni guardar qué está revisado: avisa por callbacks.

type Props = {
  /** Lo que sale de `armarAlerta`; `null` = no hay nada que avisar (la región sigue montada, vacía y fuera de la vista). */
  alerta: AlertaVista | null;
  /** Abre la hoja. Con `id`, parada en esa prenda. */
  onVer: (id?: string) => void;
  /** «Ver las de Krisstell»: abre la hoja con todas las prendas de la marca. Sin esto, abre la hoja normal. */
  onVerMarca?: () => void;
  /** «Reintentar» cuando la lectura falló. */
  onReintentar?: () => void;
  /** Se tocó un enlace que SALE de la pantalla («Ver Wide Leg de Jirish»): el enlace navega solo, esto es por si quien integra quiere avisar o guardar. */
  onVerFicha?: (id: string) => void;
  /** Quien integra muestra el rojo bajo el campo Nombre (que ya se anuncia solo con `role="alert"`): el idéntico no se anuncia dos veces. */
  avisoEnLinea?: boolean;
};

/** Un texto dicho en trozos: los códigos van en monoespaciado y los nombres en negrita. */
export function TextoConPartes({ texto, partes }: { texto: string; partes?: ParteTexto[] }) {
  if (!partes) return <>{texto}</>;
  return (
    <>
      {partes.map((p, i) =>
        p.codigo ? (
          <span key={i} className="parecidas-codigo-texto">
            {p.texto}
          </span>
        ) : p.negrita ? (
          <b key={i}>{p.texto}</b>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}

/** El botón o enlace de una acción de la alerta. Siempre `type="button"`: la alerta vive dentro del formulario y un toque no debe enviarlo. */
function AccionDeAlerta({
  accion,
  onVer,
  onVerMarca,
  onReintentar,
  onVerFicha,
  className,
}: {
  accion: AccionAlerta;
  onVer: (id?: string) => void;
  onVerMarca?: () => void;
  onReintentar?: () => void;
  onVerFicha?: (id: string) => void;
  className: string;
}) {
  if (accion.tipo === "ver_ficha") {
    const id = accion.id;
    return (
      <Link href={accion.href} className={className} onClick={() => onVerFicha?.(id)}>
        {accion.etiqueta}
      </Link>
    );
  }
  const alTocar = () => {
    if (accion.tipo === "comparar") onVer(accion.id);
    else if (accion.tipo === "ver_marca") (onVerMarca ?? (() => onVer()))();
    else if (accion.tipo === "reintentar") onReintentar?.();
    else onVer();
  };
  return (
    <button type="button" onClick={alTocar} className={className}>
      {accion.etiqueta}
    </button>
  );
}

const CLASE_BOTON_ALERTA = "btn-cayla btn-secundario parecidas-boton";
const CLASE_ENLACE_ALERTA = "btn-enlace parecidas-enlace";

export function AlertaParecidas({ alerta, onVer, onVerMarca, onReintentar, onVerFicha, avisoEnLinea = false }: Props) {
  return (
    // La región es también el destino de foco de respaldo de la hoja (ver el contrato): con `tabIndex -1` solo se enfoca por código.
    <div className="parecidas-region" data-activa={alerta ? "" : undefined} data-parecidas-ancla tabIndex={-1}>
      {/* La región que se anuncia: siempre montada; lo que cambia es su texto (el título y la frase, sin filas ni botones). */}
      <p role="status" aria-live="polite" className="sr-only">
        {textoAnuncio(alerta, { avisoEnLinea })}
      </p>
      {alerta && (
        <div className="parecidas-alerta anim-revelar" data-tono={alerta.tono} data-tipo={alerta.tipo}>
          {/* El único pulso: este aro se vuelve a montar (y a abrirse una vez) solo cuando cambia la clave de la alerta. */}
          <span key={alerta.clave} aria-hidden className="parecidas-aro" />

          {alerta.esqueleto ? (
            <>
              <p className="parecidas-gris">{alerta.titulo}</p>
              <div aria-hidden className="parecidas-esqueleto">
                <i />
                <i />
                <i />
              </div>
            </>
          ) : (
            <>
              {alerta.formaTitulo === "chip" ? (
                <div className="parecidas-cab">
                  <Chip tono={tonoChipDeAlerta(alerta.tono)} className="parecidas-chip">
                    {alerta.titulo}
                  </Chip>
                </div>
              ) : (
                <p className="parecidas-txt">{alerta.titulo}</p>
              )}

              {alerta.texto && (
                <p className="parecidas-txt">
                  <TextoConPartes texto={alerta.texto} partes={alerta.textoPartes} />
                </p>
              )}

              {alerta.filas.length > 0 && (
                <ul className="parecidas-filas">
                  {alerta.filas.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className="parecidas-fila"
                        data-destacada={f.destacada ? "" : undefined}
                        onClick={() => onVer(f.id)}
                        aria-label={FRASE.filaAria(f.nombre, f.detalle)}
                      >
                        <MiniaturaPrenda fotoUrl={f.fotoUrl} tamano="sm" />
                        <span className="min-w-0 block">
                          {/* Un nombre largo pasa a dos renglones (no pierde justo lo que lo distingue) y, si aun así no cabe, dice todo en el `title`. */}
                          <b title={f.nombre}>{f.nombre}</b>
                          <small title={TEXTO.tituloDisponibles}>
                            {f.detalle}
                            {f.descontinuada && (
                              <Chip tono="neutro" className="parecidas-chip-mini">
                                {TEXTO.descontinuada}
                              </Chip>
                            )}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(alerta.accion || alerta.masFilas > 0) && (
                // «y 2 más» va en la misma línea que la acción: no suma una fila más al resumen.
                <div className="parecidas-pie">
                  {alerta.accion && (
                    <AccionDeAlerta
                      accion={alerta.accion}
                      onVer={onVer}
                      onVerMarca={onVerMarca}
                      onReintentar={onReintentar}
                      onVerFicha={onVerFicha}
                      className={alerta.accion.estilo === "boton" ? CLASE_BOTON_ALERTA : CLASE_ENLACE_ALERTA}
                    />
                  )}
                  {alerta.masFilas > 0 && <span className="parecidas-mas">{FRASE.yMas(alerta.masFilas)}</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
