"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Shuffle } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { leerDescripcion, svgDeReceta, urlDeSvg, variantes, type ColorDibujo } from "@/lib/dibujo-generado";
import { svgAArchivo } from "@/lib/muestra-atributo";
import type { TipoMuestra } from "@/lib/muestra-atributo-reglas";

/**
 * «Generar dibujo» (ADR-0256, actualización): una frase corta —«rayas azul marino finas sobre crudo»— y el sistema
 * propone tres dibujos al instante, con los colores del catálogo. Se ven mientras se escribe; «Entendí: …» dice qué
 * leyó, para que quien escribe corrija la frase si no era eso. Nada se guarda aquí: «Usar este dibujo» lo entrega al
 * detalle, que lo muestra arriba («Así se verá») y lo guarda solo con «Guardar foto», igual que una foto.
 */
export function GeneradorDibujo({
  tipo,
  nombre,
  colores,
  descripcionInicial = "",
  onVista,
  onUsar,
  onCancelar,
}: {
  tipo: TipoMuestra;
  nombre: string;
  colores: readonly ColorDibujo[];
  descripcionInicial?: string;
  /** La propuesta marcada, para verla en grande arriba (o `null` al cerrar). */
  onVista?: (url: string | null) => void;
  /** `descripcion` es la frase tal como quedó al elegir: quien la usa la guarda junto con el dibujo. */
  onUsar: (archivo: File, descripcion: string) => void;
  onCancelar: () => void;
}) {
  const [descripcion, setDescripcion] = useState(descripcionInicial);
  const [ronda, setRonda] = useState(0);
  const [elegida, setElegida] = useState(1);
  const [preparando, setPreparando] = useState(false);

  const lectura = useMemo(() => leerDescripcion(tipo, nombre, descripcion, colores), [tipo, nombre, descripcion, colores]);
  const propuestas = useMemo(() => variantes(lectura, ronda).map((r) => urlDeSvg(svgDeReceta(r))), [lectura, ronda]);

  useEffect(() => {
    onVista?.(propuestas[elegida]);
  }, [onVista, propuestas, elegida]);
  useEffect(() => () => onVista?.(null), [onVista]);

  async function usar() {
    setPreparando(true);
    try {
      const listo = await svgAArchivo(propuestas[elegida]);
      if ("error" in listo) {
        avisar.error(listo.error);
        return;
      }
      onUsar(listo.archivo, descripcion);
    } finally {
      setPreparando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-sand bg-hueso/60 p-3">
      <CampoTexto
        etiqueta="Describe cómo se ve (opcional)"
        value={descripcion}
        onChange={(e) => {
          setDescripcion(e.target.value);
          setRonda(0);
        }}
        placeholder={tipo === "patron" ? "Ej. rayas azul marino finas sobre crudo" : "Ej. denim azul claro, grueso"}
        maxLength={120}
        autoFocus
      />
      <p className="text-xs text-tinta/70">
        <span className="text-tinta">Entendí:</span> {lectura.entendido}
        {!lectura.reconocido && (
          <span className="text-tinta/60">
            {" "}
            — no reconocí el {tipo === "patron" ? "dibujo" : "tipo de tela"}; prueba con {tipo === "patron" ? "rayas, cuadros, lunares, floral o animal print" : "denim, lino, punto, canalé, piqué, polar o seda"}.
          </span>
        )}
      </p>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Propuestas de dibujo">
        {propuestas.map((url, i) => (
          <button
            key={`${ronda}-${i}`}
            type="button"
            role="radio"
            aria-checked={elegida === i}
            aria-label={`Propuesta ${i + 1}: ${["fina", "media", "ancha"][i]}`}
            onClick={() => setElegida(i)}
            className={`relative aspect-[2/1] overflow-hidden rounded-md border-2 transition-colors ${
              elegida === i ? "border-tinta" : "border-transparent hover:border-tinta/30"
            }`}
          >
            <Image src={url} alt="" fill unoptimized className="object-cover" />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Boton peso="fantasma" className="px-3 py-2 text-[11px]" onClick={onCancelar} disabled={preparando}>
          Cancelar
        </Boton>
        <Boton peso="discreto" className="px-3 py-2 text-[11px]" onClick={() => setRonda((r) => r + 1)} disabled={preparando}>
          <span className="inline-flex items-center gap-1.5">
            <Shuffle className="h-3.5 w-3.5" aria-hidden />
            Otras variantes
          </span>
        </Boton>
        <Boton peso="primario" className="ml-auto px-3 py-2 text-[11px]" onClick={usar} cargando={preparando}>
          Usar este dibujo
        </Boton>
      </div>
    </div>
  );
}
