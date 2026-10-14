"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { useResponsable } from "@/lib/useResponsable";
import { recibirOrdenSinEnvio } from "@/lib/recepcion-envio-acciones";
import { mensajeDeLaRecepcion, type OrdenDirecta } from "@/lib/recepcion-envio-reglas";

// «Recibir sin guía» (ADR-0362, decisión 48): una orden «directo» a la tienda llegó sin que nadie registrara su envío. Al confirmar,
// `recibir_orden_sin_envio` arma un envío con TODO lo que le queda por enviar a la orden, sin número de guía, y lo deja abierto para contar;
// la pantalla va a esa recepción. La hoja dice qué va a pasar y quién recibe (el combo «Responsable»: firma quien recibe). El token hace
// seguro el reintento: si ya se armó, la base devuelve el mismo envío.

export function RecibirSinGuia({ orden, sede }: { orden: OrdenDirecta; sede: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      {/* «Llegó esta orden» y no «Recibir sin guía»: junto a «¿Llegó algo sin aviso?», dos «sin» se confundían (formidable, lista aparte
          del 2026-10-14). Esta fila es una orden de Compras que está en la lista; lo que no está en la lista va por «sin aviso». */}
      <Boton type="button" onClick={() => setAbierta(true)}>
        Llegó esta orden
      </Boton>
      {abierta && <HojaRecibirSinGuia orden={orden} sede={sede} onCerrar={() => setAbierta(false)} />}
    </>
  );
}

function HojaRecibirSinGuia({ orden, sede, onCerrar }: { orden: OrdenDirecta; sede: string; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);
  const guia = useGuiaCampos([{ id: "responsable", nombre: "Quién recibe", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién recibe." }]);

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  async function empezar() {
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      guia.ir("responsable");
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setError(null);
      const { resultado, error: falla } = await recibirOrdenSinEnvio({ p_orden_id: orden.ordenId, p_token: token }, responsable.firma());
      // Armar el envío es el primer paso de la recepción: el éxito no vacía el combo.
      if (falla) responsable.despues(falla);
      if (falla || !resultado) {
        setGuardando(false);
        setError(
          falla
            ? esFalloDeRed(falla)
              ? "Se cortó la conexión y no sabemos si el envío se armó. Vuelve a pulsar «Empezar a recibir»: si ya se armó, no se repite."
              : (mensajeDeLaRecepcion(falla) ?? traducirError(falla, "recibir la orden sin guía"))
            : "La base respondió, pero no pudimos leer el envío. Recarga la pantalla: debería aparecer arriba, abierto.",
        );
        return;
      }
      avisar.exito(`${resultado.numero ?? "Envío"} abierto`, { detalle: `${orden.numero}: cuenta lo que llegó y recíbelo.` });
      router.push(`/recibir/envio/${resultado.despachoId}`);
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo={`Recibir ${orden.numero} sin guía`}
      subtitulo={`${orden.proveedor ? `${orden.proveedor} · ` : ""}${orden.unidadesPorEnviar.toLocaleString("es-PE")} ${orden.unidadesPorEnviar === 1 ? "prenda" : "prendas"} por llegar a ${sede}.`}
      bloqueado={guardando}
      onClose={onCerrar}
    >
      {(cerrar) => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void empezar();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-tinta/80">
            Se arma un envío con todo lo que le falta llegar a esta orden y queda abierto para que cuentes, talla por talla. Desde ese momento la
            orden ya no se puede anular.
          </p>
          <CampoGuiado id="responsable" guia={guia} titulo="Quién recibe">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para empezar." />
          {error && (
            <Aviso ref={avisoError} enfocable tono="error" titulo="No se pudo empezar a recibir">
              {error}
            </Aviso>
          )}
          <div className="pie-acciones pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Abriendo…" : "Empezar a recibir"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
