"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { agregarLookALaBolsa } from "@/app/acciones/bolsa";
import { tallasDeTuLook } from "@/app/acciones/probador";
import { avisoDelLook, type LineaLook, type Look as LookDeCayla } from "@/lib/looks";
import { lookParaLaHoja, piezasDelLook, presentes, type Look, type PrendaDelProbador } from "@/lib/probador";
import { useAvisoBreve } from "../club/useAvisoBreve";
import { Icono } from "../Icono";
import { AgregarLook } from "../looks/AgregarLook";
import { saltarLaBolsa } from "../looks/AgregarLookALaBolsa";

const SIN_TALLAS = "No pudimos traer las tallas. Vuelve a intentarlo en un momento.";

/**
 * «Agregar a mi bolsa» de «Arma el tuyo» (ADR-0434, actividad 6): pide las tallas de cada prenda en su color (la misma ficha de la tienda),
 * abre la MISMA hoja de tallas de los looks y le pasa lo elegido a la MISMA acción de la bolsa (`agregarLookALaBolsa`, que vuelve a
 * preguntarle a la base y no lleva ningún precio). Al terminar, el aviso de abajo («Agregaste 3 prendas de tu look a tu bolsa.») y el
 * salto del globo, como en los looks. Sin sesión, a «Entrar».
 */
export function AgregarTuLook({
  look,
  indice,
  sedeId,
  origenFotos,
  className = "pb-agregar-bolsa",
  texto = "Agregar a mi bolsa",
}: {
  look: Look;
  indice: ReadonlyMap<string, PrendaDelProbador>;
  /** La tienda que el cliente venía mirando: queda elegida para recoger si todavía no eligió otra. */
  sedeId: string | null;
  origenFotos: string | undefined;
  /** Dónde va el botón: en la barra del probador (por omisión) o a lo ancho, en la página de un look guardado. */
  className?: string;
  texto?: string;
}) {
  const router = useRouter();
  const { aviso, mostrar } = useAvisoBreve();
  // Cada vez que se abre, una hoja nueva con las tallas recién pedidas (`vuelta`: la vuelve a montar).
  const [hoja, setHoja] = useState<{ vuelta: number; look: LookDeCayla } | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  async function abrir() {
    if (pidiendo) return;
    setPidiendo(true);
    try {
      const tallas = await tallasDeTuLook(piezasDelLook(look), sedeId);
      if (!tallas) mostrar(SIN_TALLAS, false);
      else setHoja((h) => ({ vuelta: (h?.vuelta ?? 0) + 1, look: lookParaLaHoja(look, indice, tallas) }));
    } catch {
      mostrar(SIN_TALLAS, false);
    } finally {
      setPidiendo(false);
    }
  }

  async function alAgregar(lineas: LineaLook[]): Promise<string | null> {
    const r = await agregarLookALaBolsa(
      lineas.map((l) => l.varianteId),
      sedeId,
    );
    if (r.estado === "sin_sesion") {
      router.push("/entrar");
      return null;
    }
    if (r.estado === "no") return r.mensaje;
    const dicho = avisoDelLook(null, lineas, r);
    if (!dicho.cerrar) return dicho.texto;
    mostrar(dicho.texto, r.agotadas.length + r.noEstan.length === 0);
    saltarLaBolsa(r.cuantas);
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={`t-btn ${className}`}
        aria-haspopup="dialog"
        aria-busy={pidiendo}
        disabled={pidiendo || presentes(look).length === 0}
        onClick={abrir}
      >
        <Icono nombre="bolsa" />
        {pidiendo ? "Buscando tallas…" : texto}
      </button>
      {hoja && (
        <AgregarLook
          key={hoja.vuelta}
          look={hoja.look}
          origenFotos={origenFotos}
          alAgregar={alAgregar}
          titulo="Una talla por prenda"
          conBoton={false}
          abiertaAlMontar
        />
      )}
      {aviso}
    </>
  );
}
