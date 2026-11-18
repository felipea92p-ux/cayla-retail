"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { leerContadas } from "@/lib/recepcion-conteo-reglas";
import { cortesDelDial, esPedidoNuevo, estadoDelDial } from "@/lib/recepcion-dial-reglas";
import { Odometro } from "./Odometro";

// El Dial de una categoría (rediseño «B» de Recibir, Felipe 2026-10-29): el aro se llena con lo contado contra lo que dijeron, con un corte
// por prenda esperada y una perilla que marca hasta dónde se llegó. El aro solo muestra (Felipe pidió quitar el arrastre): el número se toca
// y se escribe con el teclado —salir de la caja lo deja, Escape lo devuelve, vacío no cambia nada— y el − y el + suman de a una. Enter lo deja y
// pasa al siguiente modelo en cero, que llega con su número listo para escribir (`abrirAlEntrar`); nunca a uno que ya tiene cantidad (`destinoDelEnter`).
// Sumar hace saltar una chispa en la perilla; cuadrar recorre el aro con un brillo y dibuja el visto. Todo una vez, sin rebote (ADR-0136).

const CX = 145;
const R = 105;
const R_EXCESO = 128;

export function Dial({
  contadas,
  dijeron,
  hayConteo,
  minimo,
  nombre,
  abrirAlEntrar = 0,
  onPoner,
  onEnter,
}: {
  contadas: number;
  dijeron: number | null;
  hayConteo: boolean;
  /** Lo contado no baja de aquí (lo ya separado o lo que ya entró al stock). */
  minimo: number;
  /** «faltas», en minúsculas: para lo que lee el lector de pantalla. */
  nombre: string;
  /**
   * El pedido de abrir el número (0 = ninguno): viene de apretar Enter en lo anterior, o de elegir o agregar un modelo sin contar. Cada pedido trae un número distinto: uno que llega
   * con el Dial ya montado lo abre ahí, también si es el mismo modelo y su número se cerró antes (`esPedidoNuevo`).
   */
  abrirAlEntrar?: number;
  /** El número que dejó la persona; `ContarEnvio` lo sube al mínimo y lo reparte entre las líneas. */
  onPoner: (n: number) => void;
  /** Apretó Enter al escribir: ya se dejó el número y toca pasar a lo siguiente. */
  onEnter?: () => void;
}) {
  const e = estadoDelDial(contadas, dijeron, hayConteo);
  const [editando, setEditando] = useState<string | null>(abrirAlEntrar > 0 ? (hayConteo ? String(contadas) : "") : null);
  // «1.5» o «-5»: no se guarda y se queda lo que había. Se dice bajo el número hasta que la persona toque otra cosa.
  const [rechazo, setRechazo] = useState<string | null>(null);
  const caja = useRef<HTMLInputElement>(null);
  const hecho = useRef(false);
  // Las animaciones de respuesta: cada vez que sube lo contado, una chispa; cada vez que pasa a «cuadra», el brillo. Se cuentan durante el
  // dibujo (no en un efecto) y el contador es la llave que reinicia la animación; al montar no hay ninguna.
  const [previo, setPrevio] = useState({ contadas, tono: e.tono, chispa: 0, brillo: 0 });
  if (previo.contadas !== contadas || previo.tono !== e.tono) {
    setPrevio({
      contadas,
      tono: e.tono,
      chispa: previo.chispa + (contadas > previo.contadas ? 1 : 0),
      brillo: previo.brillo + (e.tono === "cuadra" && previo.tono !== "cuadra" ? 1 : 0),
    });
  }

  // `abrirAlEntrar` también puede llegar después de montado: al agregar un modelo desde su hoja, el número se abre cuando la hoja ya se cerró y devolvió el cursor; y al
  // volver a elegir en la lista el modelo que ya está aquí, aunque su número se haya cerrado con Escape o con un clic fuera (tarea 4 de las 30 de Recibir, 2026-11-14). Si estaba
  // abierto, el clic en la fila de ESTE modelo no se lleva el cursor (`conservaLaCifra`): la caja sigue con lo tecleado y el pedido no la vuelve a seleccionar; el
  // clic en otra fila sí sale de la caja y la deja (`onBlur`), como cualquier salida. Se mira durante el dibujo, como `previo`.
  const [pedido, setPedido] = useState(abrirAlEntrar);
  // Un pedido que llega con el número todavía abierto le devuelve el cursor a la caja si lo había perdido: lo que se teclee después no se pierde fuera de ella. Si
  // la caja todavía lo tiene (el clic en su propia fila), no se toca: volver a seleccionar la cifra haría que la próxima tecla la reemplace.
  const [enfocar, setEnfocar] = useState(0);
  if (pedido !== abrirAlEntrar) {
    setPedido(abrirAlEntrar);
    if (esPedidoNuevo(pedido, abrirAlEntrar)) {
      if (editando === null) {
        setRechazo(null);
        setEditando(hayConteo ? String(contadas) : "");
      } else setEnfocar((n) => n + 1);
    }
  }

  useEffect(() => {
    if (editando === null || !caja.current || document.activeElement === caja.current) return;
    // Recién abierto, por el camino que sea: lo que se deje en esta visita cuenta de nuevo.
    hecho.current = false;
    caja.current.focus();
    caja.current.select();
  }, [editando, enfocar]);

  function abrir() {
    hecho.current = false;
    setRechazo(null);
    setEditando(hayConteo ? String(contadas) : "");
  }
  function dejar(guardar: boolean) {
    if (hecho.current || editando === null) return;
    hecho.current = true;
    const { contadas: n, problema } = leerContadas(editando);
    setEditando(null);
    setRechazo(guardar ? problema : null);
    // Un 0 escrito en lo que no se contó todavía también es una respuesta: «no llegó ninguna». Vacío no dice nada.
    if (guardar && n !== null && (n !== contadas || !hayConteo)) onPoner(n);
  }

  // El tamaño sigue a lo que está a la vista: lo escrito, o lo que quedaría si no se escribe nada. Seis o más es algo pegado por error.
  const aLaVista = editando === null || editando === "" ? String(contadas) : editando;

  return (
    <div className={`rc-dial rc-dial--${e.tono}`} data-cifras={Math.min(aLaVista.length, 6)}>
      <svg viewBox="0 0 290 290" aria-hidden className="rc-dial-aro">
        <circle className="rc-dial-pista" cx={CX} cy={CX} r={R} />
        <circle className="rc-dial-arco" cx={CX} cy={CX} r={R} pathLength={100} style={{ strokeDashoffset: 100 - e.lleno }} />
        {/* La luz quieta del tubo (vidrio, «B · Tubo», Felipe 2026-11-02): un brillo fino sobre el arco que lo sigue y no se mueve solo. */}
        <circle className="rc-dial-luz" cx={CX} cy={CX} r={R - 4} pathLength={100} style={{ strokeDashoffset: 100 - Math.max(0, e.lleno - 4) }} />
        {cortesDelDial(e.cortes, CX, R, 11).map((c, i) => (
          <line key={i} className="rc-dial-corte" style={{ "--i": i } as React.CSSProperties} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} />
        ))}
        {previo.brillo > 0 && <circle key={`b${previo.brillo}`} className="rc-dial-brillo" cx={CX} cy={CX} r={R} pathLength={100} />}
        <circle className="rc-dial-exceso" cx={CX} cy={CX} r={R_EXCESO} pathLength={100} style={{ strokeDashoffset: 100 - e.exceso }} />
        <g className="rc-dial-perilla" style={{ transform: `rotate(${e.angulo}deg)` }}>
          {previo.chispa > 0 && <circle key={`c${previo.chispa}`} className="rc-dial-chispa" cx={CX + R} cy={CX} r={15} />}
          <circle className="rc-dial-perilla-borde" cx={CX + R} cy={CX} r={15} />
          <circle className="rc-dial-perilla-punto" cx={CX + R} cy={CX} r={5} />
        </g>
      </svg>
      {previo.brillo > 0 && <span key={`g${previo.brillo}`} aria-hidden className="rc-dial-halo" />}

      <div className="rc-dial-centro">
        {editando !== null ? (
          // Abierto, el número no cambia de letra ni de tamaño (Felipe eligió la demo «El número de siempre, vivo», 2026-11-14): sin nada escrito,
          // lo que quedaría espera en taupe (`data-queda`) con el cursor a su derecha; lo escrito sale en tinta.
          <span
            className="rc-dial-vivo"
            data-queda={editando === "" ? String(contadas) : undefined}
            style={editando === "" ? ({ "--rc-n": String(contadas).length } as React.CSSProperties) : undefined}
          >
            <input // unificar-fijo: el número protagonista del Dial se escribe en su lugar, sin caja de campo (Felipe 2026-10-29)
              ref={caja}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={editando}
              aria-label={`Cuántas ${nombre} llegaron`}
              className="rc-dial-caja"
              aria-invalid={rechazo !== null}
              onChange={(ev) => {
                setRechazo(null);
                setEditando(leerContadas(ev.target.value).texto);
              }}
              onBlur={() => dejar(true)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  // No pasa al siguiente: la persona está mirando la caja, y ahí mismo lo corrige.
                  const { problema } = leerContadas(editando);
                  if (problema) return setRechazo(problema);
                  dejar(true);
                  onEnter?.();
                } else if (ev.key === "Escape") {
                  ev.preventDefault();
                  ev.stopPropagation();
                  dejar(false);
                }
              }}
            />
          </span>
        ) : (
          <button type="button" className="rc-dial-numero" onClick={abrir} aria-label={`Escribir cuántas ${nombre} llegaron (ahora ${contadas})`}>
            <Odometro valor={contadas} />
          </button>
        )}
        <small aria-live="polite" data-rechazo={rechazo ? "" : undefined}>{rechazo ?? e.texto}</small>
      </div>
      <span aria-hidden className="rc-dial-visto">
        <Check className="h-5 w-5" />
      </span>

      <button
        type="button"
        onClick={() => {
          setRechazo(null);
          onPoner(contadas - 1);
        }}
        disabled={contadas <= minimo}
        aria-label="Una menos"
        className="rc-dial-boton rc-dial-boton--menos"
      >
        <Minus aria-hidden className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setRechazo(null);
          onPoner(contadas + 1);
        }}
        aria-label="Una más"
        className="rc-dial-boton rc-dial-boton--mas"
      >
        <Plus aria-hidden className="h-5 w-5" />
      </button>
    </div>
  );
}
