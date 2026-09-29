"use client";

import { memo, useState } from "react";
import { cantidadEscrita } from "@/lib/conteo-reglas";

/* ====================================================================
   CampoContaste · el número que la persona cuenta en UNA variante
   (Inventario ▸ Conteo ▸ Contar, rediseño 2026-09-29)

   Tres reglas que este campo hace cumplir, en palabras de la tienda:
     · VACÍO NO ES CERO. Un campo sin número es «Pendiente»: nadie contó esa variante. Solo el 0 escrito de verdad
       significa «no queda ninguna». Por eso el texto se lee con `cantidadEscrita`: vacío → pendiente (nunca se manda 0),
       letras o decimales → no vale (no se guarda y se avisa), y un entero ≥ 0 → la cantidad. Borrar un número que ya
       estaba guardado lo des-cuenta: la variante vuelve a Pendiente.
     · EL TEXTO ES DE ESTA FILA. Lo que se teclea vive en el estado de este campo, no en la pantalla: el padre no se
       entera de cada tecla y las otras 800 filas no se vuelven a dibujar. Solo al terminar (salir del campo o Enter) la
       cantidad sube al almacén del conteo.
     · NO SE PISA LO QUE SE ESTÁ ESCRIBIENDO. Si una lectura del escáner o la respuesta de la base cambian el número de
       esta variante mientras la persona tiene el campo a medias, el texto que ella escribe se respeta; si no lo tocó,
       el campo sigue a la cifra viva. Y salir de un campo que no se tocó no guarda nada (no revive una cifra vieja).

   Guardar al SALIR del campo (blur) y no solo con Enter: el teclado numérico del iPhone no trae Enter. Enter avanza al
   siguiente campo «Contaste» (lo decide quien arma la lista: `alEnter`), y el guardado sale por el mismo blur.

   Medidas (plano §3.4): 44 px de alto en todos los anchos —la tablet de la tienda es táctil—, `text-base` (16 px) para
   que iOS no haga zoom al enfocar, foco que SE VE (borde tinta, fondo papel y contorno de 2 px). Sin rojo salvo
   «no es un número válido».
   ==================================================================== */

const formato = (n: number | null) => (n === null ? "" : String(n));

export const CampoContaste = memo(function CampoContaste({
  varianteId,
  contada,
  etiqueta,
  alConfirmar,
  alInvalido,
  alEnter,
}: {
  varianteId: string;
  /** Lo que la pantalla tiene contado de esta variante ahora (`null` = pendiente). */
  contada: number | null;
  /** Para el lector de pantalla: «Contaste de Blusa Emma Beige talla M». */
  etiqueta: string;
  /** Sube la cantidad al conteo. Devuelve `false` si no se aplicó (no hay responsable, por ejemplo): el campo vuelve a la cifra viva. */
  alConfirmar: (varianteId: string, cantidad: number | null) => boolean;
  /** Lo escrito no es una cantidad válida: se avisa una vez, al salir del campo. */
  alInvalido: (texto: string) => void;
  /** Enter: pasar al siguiente campo. */
  alEnter: (campo: HTMLInputElement) => void;
}) {
  const [texto, setTexto] = useState(formato(contada));
  const [previa, setPrevia] = useState(contada);
  // «Sucio» = la persona tocó este campo y todavía no lo confirmó.
  const [sucio, setSucio] = useState(false);

  // La cifra viva cambió (una lectura, la respuesta de la base): el campo la sigue, salvo que se esté escribiendo aquí.
  if (previa !== contada) {
    setPrevia(contada);
    if (!sucio) setTexto(formato(contada));
  }

  const invalido = sucio && cantidadEscrita(texto) === undefined;

  function confirmar() {
    if (!sucio) return;
    setSucio(false);
    const cantidad = cantidadEscrita(texto);
    if (cantidad === undefined) {
      setTexto(formato(contada));
      alInvalido(texto);
      return;
    }
    if (cantidad === contada) {
      // Igual a lo que hay (o «05» por «5»): nada que guardar, solo se deja el texto limpio.
      setTexto(formato(contada));
      return;
    }
    if (!alConfirmar(varianteId, cantidad)) setTexto(formato(contada));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="next"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder="—"
      aria-label={etiqueta}
      aria-invalid={invalido || undefined}
      data-contaste=""
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        setSucio(true);
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        alEnter(e.currentTarget);
      }}
      className="caja-cayla mx-auto block h-11 w-full min-w-0 scroll-my-28 px-1 text-center text-base tabular-nums text-tinta outline-none placeholder:text-taupe focus:border-tinta focus:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tinta/60 aria-[invalid=true]:border-rojo-profundo @[36rem]:max-w-24"
    />
  );
});
