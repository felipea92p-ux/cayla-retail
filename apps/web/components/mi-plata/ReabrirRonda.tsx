"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { reabrirRonda } from "@/lib/mi-plata-acciones";
import { puedeReabrirLaRonda, type RondaCerrada } from "@/lib/mi-plata-reglas";

// Reabrir la última ronda (ADR-0569, Felipe 2026-10-29): si se le olvidó anotar un gasto a la ronda que cerró, o quiere cambiar qué hizo con lo
// que le quedó, la reabre de un toque, anota y la cierra otra vez. Solo mientras Compras no recibió su cierre: la base lo exige. Reabrir no mueve
// plata (el cierre se archiva y se vuelve a elegir al cerrar), así que no pregunta antes: se puede volver a cerrar.
//
// Vive en «Tu última ronda» (Felipe 2026-10-29: «por aquí no colocaste el botón de reabrir, ya que aquí se ve la última ronda»): es la tarjeta
// que muestra la ronda que se reabre, así que el botón está junto a ella y no en «¿Sales a comprar?». Sin ronda que se pueda reabrir no dibuja nada.
export function ReabrirRonda({ ultimaCerrada }: { ultimaCerrada: RondaCerrada | null }) {
  const router = useRouter();
  const [reabriendo, setReabriendo] = useState(false);
  const [rechazo, setRechazo] = useState<{ titulo: string; texto: string; tono: "error" | "atencion" } | null>(null);

  if (!ultimaCerrada || !puedeReabrirLaRonda({ abierta: null, ultimaCerrada })) return null;

  async function reabrir() {
    if (reabriendo) return;
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

  return (
    <div className="flex flex-col gap-2.5 border-t border-sand pt-3.5" data-guia="mi-plata.reabrir-ronda">
      <p className="text-[13px] text-taupe">¿Se te olvidó anotar algo? Reábrela, anótalo y vuelve a cerrarla.</p>
      {rechazo && (
        <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
          {rechazo.texto}
        </Aviso>
      )}
      <div>
        <Boton peso="fantasma" className="btn-chico" cargando={reabriendo} textoCargando="Reabriendo…" onClick={() => void reabrir()}>
          Reabrir {ultimaCerrada.texto}
        </Boton>
      </div>
    </div>
  );
}
