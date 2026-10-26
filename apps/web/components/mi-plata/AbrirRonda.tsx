"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { abrirRonda } from "@/lib/mi-plata-acciones";
import { textoCierre, type RondaCerrada } from "@/lib/mi-plata-reglas";

// La tarjeta «¿Sales a comprar?» de la maqueta docs/maquetas/mis-compras-rediseno-2026-10/ (Felipe 2026-10-24): una pregunta en serif, una
// frase que dice para qué sirve y un solo botón. La ronda de compras (20261023183000, Felipe 2026-10-23): sin una abierta, la compradora no anota compras ni gastos. Esta tarjeta es lo
// único que se le pide: abrirla al salir a comprar. La abre ella misma (decisión de Felipe), de un toque y sin preguntas: abrir no mueve
// plata, y dos toques no abren dos (la base devuelve la que ya estaba). Debajo, cómo cerró la última, si Compras todavía no la recibió.
// La usan Mi plata y «Compré ropa» (si se llega ahí sin ronda).
export function AbrirRonda({ ultimaCerrada }: { ultimaCerrada: RondaCerrada | null }) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [rechazo, setRechazo] = useState<{ titulo: string; texto: string; tono: "error" | "atencion" } | null>(null);

  async function abrir() {
    if (abriendo) return;
    setRechazo(null);
    setAbriendo(true);
    const { error } = await abrirRonda(firmaOmitida("compra_ronda_abrir"));
    setAbriendo(false);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se abrió. Vuelve a tocar el botón: si ya se abrió, no se abre otra.", tono: "atencion" }
          : { titulo: "No se abrió", texto: traducirError(error, "abrir tu ronda"), tono: "error" },
      );
    }
    avisar.exito("Abriste tu ronda de compras", { detalle: "Lo que compres y gastes queda en ella. Al terminar, ciérrala." });
    router.refresh();
  }

  return (
    <section className="card-cayla flex flex-col gap-3 p-4" aria-label="Tu ronda de compras" data-guia="mi-plata.abrir-ronda">
      <span className="flex flex-col gap-1">
        <span className="block font-serif text-2xl leading-tight text-tinta">¿Sales a comprar?</span>
        <span className="block text-sm text-taupe">Abre tu ronda: lo que compres y gastes queda junto, y al volver la cierras.</span>
      </span>
      {ultimaCerrada && !ultimaCerrada.resuelto && ultimaCerrada.decision !== "se_queda" && (
        <p className="nota-cayla text-sm">
          Cerraste {ultimaCerrada.texto}. {textoCierre(ultimaCerrada)}
        </p>
      )}
      {rechazo && (
        <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
          {rechazo.texto}
        </Aviso>
      )}
      <Boton peso="primario" className="w-full" cargando={abriendo} textoCargando="Abriendo…" onClick={() => void abrir()}>
        Abrir mi ronda
      </Boton>
    </section>
  );
}
