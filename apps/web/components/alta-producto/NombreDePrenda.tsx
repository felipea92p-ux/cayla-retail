"use client";

import { Lightbulb } from "lucide-react";
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
  /** Debajo de la caja: «Se guardará como …» y el aviso de la base. */
  pie?: React.ReactNode;
}) {
  const libre = tipo === TIPO_LIBRE;
  return (
    <div className="space-y-2.5">
      {tipos.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de prenda">
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
        antes={libre ? undefined : tipo}
        maxLength={libre ? MAX_NOMBRE_PRODUCTO : MAX_NOMBRE_PRODUCTO - tipo.length - 1}
        className="!h-12 text-base"
        placeholder={libre ? placeholderLibre : (delProveedor ?? sugeridas[0] ?? "")}
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        autoComplete="off"
        pie={pie}
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
