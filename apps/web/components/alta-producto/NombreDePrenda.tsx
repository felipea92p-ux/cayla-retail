"use client";

import { Lightbulb, Lock } from "lucide-react";
import { CampoTexto } from "@/components/ui/campos";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { MAX_NOMBRE_PRODUCTO } from "@/lib/catalogo-topes";
import type { AvisoNombre } from "@/lib/nombre-de-prenda";

// El nombre de Nuevo producto con el estándar de CAYLA (ADR-0556): «<Tipo> <Flor>».
//
// EL PROBLEMA. La persona escribía el nombre entero y podía poner «Blusa» dentro de Casacas, el color dentro del nombre o inventar uno
// cada vez. Ahora el tipo lo pone la categoría (fijo a la izquierda de la caja), la persona escribe solo el nombre y el sistema le ofrece,
// primero, el que trajo el proveedor si sirve («Evaluna»: así tienda y compras dicen lo mismo, Felipe 2026-10-28) y después las flores libres. Lo que no sigue la regla se avisa debajo, en ámbar suave, sin frenar nada.
//
// CONTRATO. PROMETE: la caja muestra el tipo fijo, elegido en una fila de chips (uno solo en la mayoría; dos en «Camisas y Blusas»);
//   «Otro nombre» (siempre al final de esa fila) deja escribir el nombre completo a mano, para lo que no calza; las flores libres
//   como chips que llenan la caja de un toque; los avisos de `avisosDelNombre` como notas, nunca como error. ASUME: que quien la usa
//   arma la referencia con `armarReferencia` y la manda a la base como siempre. NO HACE: no decide qué flor ni comprueba si el nombre
//   existe (eso es de `floresLibres` y de la base) y no bloquea «Crear».

/** El chip que deja escribir el nombre completo a mano: para lo que no es de ningún tipo de la categoría. */
export const TIPO_LIBRE = "";

export function NombreDePrenda({
  id,
  tipos,
  tipo,
  onTipo,
  valor,
  onValor,
  sugeridas,
  delProveedor = null,
  avisos,
  placeholderLibre,
  nombreFinal,
  pie,
}: {
  id: string;
  tipos: readonly string[];
  /** El elegido; `TIPO_LIBRE` = nombre completo a mano. */
  tipo: string;
  onTipo: (t: string) => void;
  valor: string;
  onValor: (v: string) => void;
  /** Las próximas flores libres de la categoría. */
  sugeridas: readonly string[];
  /** El nombre que trajo el proveedor, si sirve como nombre (`nombreDelProveedorComoNombre`): va primero, antes que las flores. */
  delProveedor?: string | null;
  avisos: readonly AvisoNombre[];
  /** El ejemplo de la caja cuando el nombre es libre (sale de `sugerirNombre`). */
  placeholderLibre: string;
  /** El nombre entero como se va a guardar («Polera Dalia»): se muestra siempre debajo, mientras se escribe (Felipe 2026-10-28: no se
   *  entendía que el tipo queda fijo y va en el nombre). Vacío = todavía no se escribió nada. */
  nombreFinal: string;
  /** Debajo de la caja: «Se guardará como …» y el aviso de la base. */
  pie?: React.ReactNode;
}) {
  const libre = tipo === TIPO_LIBRE;
  // Con un solo tipo, una fila de chips repetía «Polera» al lado de la caja que ya lo dice: basta un enlace para salir al nombre libre.
  const unSoloTipo = tipos.length === 1;
  const enlaceLibre = unSoloTipo ? (
    <button type="button" className="btn-cayla btn-enlace text-[12.5px]" onClick={() => onTipo(libre ? tipos[0] : TIPO_LIBRE)}>
      {libre ? `Volver a «${tipos[0]} + nombre»` : `¿No es ${articulo(tipos[0])} ${tipos[0].toLocaleLowerCase("es")}? Escribe otro nombre`}
    </button>
  ) : null;
  // Así se llamará, siempre a la vista y pegado a la caja: con la caja vacía dice el tipo y un hueco por llenar.
  const asiSeLlamara = (
    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-taupe" aria-live="polite">
        Así se llamará:
        <strong className="font-serif text-[18px] font-medium text-tinta">
          {nombreFinal && valor.trim() ? (
            nombreFinal
          ) : (
            <>
              {tipo} <span aria-hidden className="inline-block w-16 border-b border-dashed border-borde-control align-baseline" />
              <span className="sr-only">(falta el nombre)</span>
            </>
          )}
        </strong>
      </span>
      {enlaceLibre}
    </span>
  );
  return (
    <div className="space-y-2.5">
      {tipos.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Con qué empieza el nombre">
          <span className="mr-0.5 text-[12px] text-taupe">Empieza con:</span>
          {tipos.map((t) => (
            <ChipOpcion key={t} elegido={tipo === t} onClick={() => onTipo(t)}>
              {t}
            </ChipOpcion>
          ))}
          <ChipOpcion elegido={libre} onClick={() => onTipo(libre ? tipos[0] : TIPO_LIBRE)}>
            Otro nombre
          </ChipOpcion>
        </div>
      ) : null}
      <CampoTexto
        id={id}
        etiqueta={libre ? "Nombre" : `Nombre de la ${tipo.toLocaleLowerCase("es")}`}
        caja
        // El tipo, como una pieza fija dentro de la caja (no un texto gris que parece parte del ejemplo): con su candado y un «+» que
        // dice que lo que escribas se le suma.
        antes={
          libre ? undefined : (
            <span className="inline-flex items-center gap-1.5" title="Lo pone la categoría: va al inicio del nombre">
              <span className="inline-flex items-center gap-1 rounded-md border border-borde-control bg-papel px-2 py-0.5 font-semibold text-tinta">
                <Lock aria-hidden className="h-3 w-3 text-taupe" />
                {tipo}
              </span>
              <span className="text-taupe">+</span>
            </span>
          )
        }
        maxLength={libre ? MAX_NOMBRE_PRODUCTO : MAX_NOMBRE_PRODUCTO - tipo.length - 1}
        className="!h-12 text-base"
        placeholder={libre ? placeholderLibre : (delProveedor ?? sugeridas[0] ?? "")}
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        autoComplete="off"
        pie={
          libre ? (
            pie || enlaceLibre ? (
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span>{pie}</span>
                {enlaceLibre}
              </span>
            ) : undefined
          ) : (
            asiSeLlamara
          )
        }
      />
      {!libre && delProveedor && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-taupe">Como lo llama el proveedor:</span>
          <ChipOpcion elegido={valor.trim().toLocaleLowerCase("es") === delProveedor.toLocaleLowerCase("es")} onClick={() => onValor(delProveedor)} chico>
            {delProveedor}
          </ChipOpcion>
        </div>
      )}
      {!libre && sugeridas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-taupe">{delProveedor ? "O una flor libre:" : "Libres en esta categoría:"}</span>
          {sugeridas.map((f) => (
            <ChipOpcion key={f} elegido={valor.trim().toLocaleLowerCase("es") === f.toLocaleLowerCase("es")} onClick={() => onValor(f)} chico>
              {f}
            </ChipOpcion>
          ))}
        </div>
      )}
      {avisos.length > 0 && (
        <ul className="space-y-1" aria-live="polite">
          {avisos.map((a) => (
            <li key={a.regla} className="flex items-start gap-1.5 text-[13px] text-tinta">
              <Lightbulb aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ambar" />
              {a.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** El artículo delante del tipo, para «¿No es una polera?»: los de la lista que terminan en «a» son femeninos y los que terminan en «s»,
 *  plurales («unos aretes», «unos lentes»). Basta para `TIPOS_POR_CATEGORIA`; un tipo nuevo raro solo lee un poco forzado. */
function articulo(tipo: string): "un" | "una" | "unos" {
  const t = tipo.trim().toLocaleLowerCase("es");
  return t.endsWith("s") ? "unos" : t.endsWith("a") ? "una" : "un";
}
