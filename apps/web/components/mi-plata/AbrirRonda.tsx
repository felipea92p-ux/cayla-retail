"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { abrirRonda, reabrirRonda } from "@/lib/mi-plata-acciones";
import { puedeReabrirLaRonda, textoCierre, type RondaCerrada } from "@/lib/mi-plata-reglas";

// La tarjeta «¿Sales a comprar?» de la maqueta docs/maquetas/mis-compras-rediseno-2026-10/ (Felipe 2026-10-24): una pregunta en serif, una
// frase que dice para qué sirve y un solo botón. La ronda de compras (20261023183000, Felipe 2026-10-23): sin una abierta, la compradora no anota compras ni gastos. Esta tarjeta es lo
// único que se le pide: abrirla al salir a comprar. La abre ella misma (decisión de Felipe), de un toque y sin preguntas: abrir no mueve
// plata, y dos toques no abren dos (la base devuelve la que ya estaba). Debajo, cómo cerró la última, si Compras todavía no la recibió.
// La usan Mi plata y «Compré ropa» (si se llega ahí sin ronda).
//
// Reabrir la última ronda (ADR-0569, Felipe 2026-10-29): si se le olvidó anotar un gasto a la ronda que cerró, o quiere cambiar qué hizo con lo
// que le quedó, la reabre de un toque, anota y la cierra otra vez. Solo mientras Compras no recibió su cierre: la base lo exige. Reabrir no mueve
// plata (el cierre se archiva y se vuelve a elegir al cerrar), así que no pregunta antes: se puede volver a cerrar.
export function AbrirRonda({ ultimaCerrada }: { ultimaCerrada: RondaCerrada | null }) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
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

  async function reabrir() {
    if (reabriendo || abriendo) return;
    setRechazo(null);
    setReabriendo(true);
    const { error } = await reabrirRonda(firmaOmitida("compra_ronda_reabrir"));
    setReabriendo(false);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se reabrió. Vuelve a tocar el botón: si ya se reabrió, no se repite.", tono: "atencion" }
          : { titulo: "No se reabrió", texto: traducirError(error, "reabrir tu ronda"), tono: "error" },
      );
    }
    avisar.exito(`Reabriste tu ronda ${ultimaCerrada?.texto ?? ""}`.trim(), {
      detalle: "Anota lo que falte y ciérrala otra vez: ahí eliges de nuevo qué haces con lo que te queda.",
    });
    router.refresh();
  }

  const sePuedeReabrir = ultimaCerrada !== null && puedeReabrirLaRonda({ abierta: null, ultimaCerrada });

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
      <Boton peso="primario" className="w-full" cargando={abriendo} textoCargando="Abriendo…" disabled={reabriendo} onClick={() => void abrir()}>
        Abrir mi ronda
      </Boton>
      {sePuedeReabrir && ultimaCerrada && (
        <div className="flex flex-col gap-2 border-t border-sand pt-3" data-guia="mi-plata.reabrir-ronda">
          <p className="text-[13px] text-taupe">
            ¿Se te olvidó anotar algo de {ultimaCerrada.texto}? Reábrela, anótalo y vuelve a cerrarla.
          </p>
          <Boton peso="fantasma" className="w-full" cargando={reabriendo} textoCargando="Reabriendo…" disabled={abriendo} onClick={() => void reabrir()}>
            Reabrir {ultimaCerrada.texto}
          </Boton>
        </div>
      )}
    </section>
  );
}
