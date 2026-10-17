"use client";

import { memo, useState } from "react";
import { cantidadEscrita } from "@/lib/conteo-reglas";
import { PasoCantidad } from "@/components/ui/PasoCantidad";

/* ====================================================================
   CampoContaste · el número que la persona cuenta en UNA variante: [−] [ cantidad ] [+]
   (Inventario ▸ Conteo ▸ Contar; rediseño 2026-09-29, tarjeta de producto)

   Reglas que este control hace cumplir, en palabras de la tienda:
     · VACÍO NO ES CERO. Un campo sin número es «Pendiente»: nadie contó esa variante. Solo el 0 escrito de verdad
       significa «no queda ninguna». Por eso el texto se lee con `cantidadEscrita`: vacío → pendiente (nunca se manda 0),
       letras o decimales → no vale (no se guarda y se avisa), y un entero ≥ 0 → la cantidad. Borrar un número que ya
       estaba guardado lo des-cuenta: la variante vuelve a Pendiente.
     · EL TEXTO ES DE ESTA FILA. Lo que se teclea vive en el estado de este campo, no en la pantalla: el padre no se
       entera de cada tecla y las otras 800 filas no se vuelven a dibujar. Solo al terminar (salir del campo, Enter o
       un clic en − / +) la cantidad sube al almacén del conteo.
     · NO SE PISA LO QUE SE ESTÁ ESCRIBIENDO. Si una lectura del escáner o la respuesta de la base cambian el número de
       esta variante mientras la persona tiene el campo a medias, el texto que ella escribe se respeta; si no lo tocó,
       el campo sigue a la cifra viva. Y salir de un campo que no se tocó no guarda nada (no revive una cifra vieja).
     · «+» suma 1 (desde vacío, deja 1). «−» resta 1 y se detiene en 0: desde vacío no hace nada (restar a algo que
       nadie contó no lo vuelve un cero verificado) y desde 0 tampoco baja. Parten del número que hay escrito en el campo.

   LA CIFRA DE ANTES (`sugerida`). Una variante mandada a recontar (`conteo_recontar`) vuelve sin número, pero el campo muestra lo que
   se había contado, ya escrito y seleccionado, para corregirlo en vez de teclearlo de cero. Es un borrador, no una cifra
   guardada: la variante sigue «en reconteo» hasta que se acepta con Enter o con − / +, o se escribe otra. Salir del campo sin
   tocarlo no guarda nada. Si sale igual que la vez anterior, la base confirma la diferencia sola (`conteo_contar`).

   Guardar al SALIR del campo (blur) y no solo con Enter: el teclado numérico del iPhone no trae Enter. Enter avanza al
   siguiente campo «Contaste» (lo decide quien arma la lista: `alEnter`); ↑ y ↓ del teclado suman y restan. Los botones
   − y + son de ratón y de dedo: no son parada de Tab, así quien cuenta con teclado no atraviesa tres controles por fila.

   Medidas: el paso de cantidad del sistema (<PasoCantidad>, ADR-0358 ronda 17), tamaño «fila»: 36 px con puntero fino; con dedo
   (`pointer: coarse`) sube a 44 px y el número a 16 px para que iOS no haga zoom al enfocar. Con el cursor en el número, la caja se
   enciende como un campo.
   ==================================================================== */

const formato = (n: number | null) => (n === null ? "" : String(n));

/** La marca con la que Contar encuentra los campos «Contaste» a la vista (`ContarConteo`, Enter → el siguiente). */
const MARCA_CONTASTE = { "data-contaste": "" };

export const CampoContaste = memo(function CampoContaste({
  varianteId,
  contada,
  sugerida = null,
  etiqueta,
  alConfirmar,
  alInvalido,
  alEnter,
}: {
  varianteId: string;
  /** Lo que la pantalla tiene contado de esta variante ahora (`null` = pendiente). */
  contada: number | null;
  /** Lo que se había contado antes de mandar la variante a recontar: se muestra escrito mientras `contada` es `null`. */
  sugerida?: number | null;
  /** Para el lector de pantalla: «Contaste de Blusa Emma Beige talla M». */
  etiqueta: string;
  /** Sube la cantidad al conteo. Devuelve `false` si no se aplicó (no hay responsable, por ejemplo): el campo vuelve a la cifra viva. */
  alConfirmar: (varianteId: string, cantidad: number | null) => boolean;
  /** Lo escrito no es una cantidad válida: se avisa una vez, al salir del campo. */
  alInvalido: (texto: string) => void;
  /** Enter: pasar al siguiente campo. */
  alEnter: (campo: HTMLInputElement) => void;
}) {
  const [texto, setTexto] = useState(formato(contada ?? sugerida));
  const [previa, setPrevia] = useState(contada);
  // «Sucio» = la persona tocó este campo y todavía no lo confirmó.
  const [sucio, setSucio] = useState(false);

  // La cifra viva cambió (una lectura, la respuesta de la base): el campo la sigue, salvo que se esté escribiendo aquí.
  if (previa !== contada) {
    setPrevia(contada);
    if (!sucio) setTexto(formato(contada ?? sugerida));
  }

  const invalido = sucio && cantidadEscrita(texto) === undefined;

  function confirmar(forzar = false) {
    if (!sucio && !forzar) return;
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

  /** − / +: parten del número escrito en el campo (si es válido) o de la cifra viva. */
  function paso(delta: 1 | -1) {
    const escrito = cantidadEscrita(texto);
    const actual = escrito === undefined ? contada : escrito;
    if (delta === -1 && (actual === null || actual === 0)) return;
    const siguiente = delta === 1 ? (actual ?? 0) + 1 : (actual as number) - 1;
    setSucio(false);
    if (!alConfirmar(varianteId, siguiente)) setTexto(formato(contada));
  }

  return (
    <div className="flex items-center justify-center">
      <PasoCantidad
        // Los botones no son parada de Tab (ver arriba); lo escrito que no vale tiñe la caja de error (antes, el borde del campo).
        sinTab
        tono={invalido ? "error" : undefined}
        menos={{ onClick: () => paso(-1), etiqueta: `Restar uno. ${etiqueta}` }}
        mas={{ onClick: () => paso(1), etiqueta: `Sumar uno. ${etiqueta}` }}
        campo={{
          className: "scroll-my-28",
          type: "text",
          inputMode: "numeric",
          pattern: "[0-9]*",
          enterKeyHint: "next",
          autoComplete: "off",
          autoCorrect: "off",
          spellCheck: false,
          placeholder: "",
          "aria-label": etiqueta,
          "aria-invalid": invalido || undefined,
          ...MARCA_CONTASTE,
          value: texto,
          onChange: (e) => {
            setTexto(e.target.value);
            setSucio(true);
          },
          onFocus: (e) => e.currentTarget.select(),
          onBlur: () => confirmar(),
          onKeyDown: (e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              // Aceptar con Enter la cifra de antes es una decisión, no una omisión: se guarda.
              if (contada === null && sugerida !== null && !sucio) confirmar(true);
              alEnter(e.currentTarget);
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              paso(e.key === "ArrowUp" ? 1 : -1);
            }
          },
        }}
      />
    </div>
  );
});
