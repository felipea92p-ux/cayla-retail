"use client";

import { useEffect, useRef, useState } from "react";
import { Buscador } from "@/components/ui/Buscador";
import { ListaSugerencias, ariaDelBuscador } from "@/components/ui/ListaSugerencias";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { HojaRebaja } from "@/components/rebajas/HojaRebaja";
import { rpcRebaja } from "@/lib/rebaja-rapida";
import type { useResponsable } from "@/lib/useResponsable";

type Encontrada = {
  variante_id: string;
  referencia: string;
  codigo: string | null;
  color: string | null;
  color_hex: string | null;
  talla: string | null;
  precio: number;
  foto: string | null;
  categoria: string | null;
  categoria_prefijo: string | null;
  categoria_familia: string | null;
  exacta: boolean;
};

const soles = (n: number) => `S/ ${Number(n).toFixed(2)}`;

/**
 * «Poner un %» (ADR-0669, Felipe 2026-11-16): el escáner de Campañas y ofertas. La pistola lee el código y abre la hoja de esa prenda; escribir
 * un nombre muestra las prendas que coinciden. Al cerrar la hoja el cursor vuelve aquí, listo para la siguiente: se rebajan muchas seguidas.
 * Quién lo pone se elige una vez por tienda y queda para los siguientes (lo tiene `RebajasDeTienda`, con `recordarEn`).
 */
export function PonerUnPct({
  ubicacionId,
  sede,
  responsable,
  onCambio,
}: {
  ubicacionId: string;
  sede: string;
  responsable: ReturnType<typeof useResponsable>;
  onCambio: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [encontradas, setEncontradas] = useState<Encontrada[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [verLista, setVerLista] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [noEncontrada, setNoEncontrada] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  // Con menos de 2 letras no se busca: no se muestra lo de una búsqueda anterior.
  const visibles = texto.trim().length < 2 ? [] : encontradas;

  // Busca mientras se escribe (una lectura: `buscar_`, sin loader), con la pausa corta del buscador.
  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) return;
    let vigente = true;
    const reloj = setTimeout(async () => {
      setBuscando(true);
      const { data } = await rpcRebaja<Encontrada[]>("buscar_prenda_para_rebaja", { p_texto: t, p_ubicacion_id: ubicacionId });
      if (!vigente) return;
      setBuscando(false);
      setEncontradas(data ?? []);
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [texto, ubicacionId]);

  function abrir(varianteId: string) {
    setAbierta(varianteId);
    setVerLista(false);
    setTexto("");
    setEncontradas([]);
    setNoEncontrada(null);
  }

  async function alEnter() {
    const t = texto.trim();
    if (t.length < 2) return;
    // La pistola escribe rápido y da Enter antes de la pausa: se pregunta en el acto.
    const { data } = await rpcRebaja<Encontrada[]>("buscar_prenda_para_rebaja", { p_texto: t, p_ubicacion_id: ubicacionId });
    const filas = data ?? [];
    if (filas.length === 0) {
      setNoEncontrada(t);
      return;
    }
    abrir(filas[0].variante_id);
  }

  return (
    <div className="relative max-w-xl" data-guia="rebaja.escaner">
      <Buscador
        ref={entrada}
        valor={texto}
        onCambio={(v) => {
          setTexto(v);
          setVerLista(true);
          setNoEncontrada(null);
        }}
        buscando={buscando}
        icono="barras"
        tamano="mostrador"
        {...ariaDelBuscador("rebaja-sugerencias", verLista && visibles.length > 0, 0)}
        onFocus={() => setVerLista(true)}
        onBlur={() => setVerLista(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setVerLista(false);
          if (e.key !== "Enter") return;
          e.preventDefault();
          void alEnter();
        }}
        placeholder="Escanea una prenda para ponerle un %" // sugerir-fijo: la acción de la pieza, no un ejemplo de lo que se escribe
        etiqueta="Escanear o buscar una prenda para ponerle un %"
      />
      {noEncontrada && (
        <p role="status" className="mt-2 text-sm text-ambar-profundo">{`No hay una prenda a la venta con «${noEncontrada}».`}</p>
      )}
      {verLista && visibles.length > 0 && (
        <ListaSugerencias
          id="rebaja-sugerencias"
          etiqueta="Prendas que coinciden"
          className="absolute left-0 top-[calc(100%+6px)] z-10 w-[min(32rem,calc(100vw-2rem))]"
          sugerencias={visibles.map((p) => ({
            clave: p.variante_id,
            miniatura: <MiniaturaPrenda fotoUrl={p.foto} colorHex={p.color_hex} prefijo={p.categoria_prefijo} familia={p.categoria_familia} categoria={p.categoria} />,
            titulo: p.referencia,
            detalle: [p.color, p.talla, p.codigo].filter(Boolean).join(" · "),
            derecha: soles(p.precio),
          }))}
          onElegir={(i) => abrir(visibles[i].variante_id)}
        />
      )}
      {abierta && (
        <HojaRebaja
          varianteId={abierta}
          ubicacionId={ubicacionId}
          sede={sede}
          responsable={responsable}
          onCambio={onCambio}
          onClose={() => {
            setAbierta(null);
            // Lista para la siguiente prenda.
            requestAnimationFrame(() => entrada.current?.focus());
          }}
        />
      )}
    </div>
  );
}
