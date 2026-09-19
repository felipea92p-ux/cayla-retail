"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lanzarChispas, prefiereMovimientoReducido, type EstadoConfirmar } from "@/components/ComprobanteBotonConfirmar";

// La secuencia de confirmar un pago (ADR-0130), compartida por `RegistrarPagoModal` (un comprobante, varios
// medios) y `PagoJuntosModal` (una transferencia para varios comprobantes):
//
//   apretar «Registrar» → `empezar()`: el botón pasa a «cargando» (giro)
//   la base responde    → `confirmar()`: «hecho» (el visto se dibuja), chispas si quedó saldado, y a los
//                         ~850 ms la hoja se cierra con su salida animada
//   al cerrarla         → `router.refresh()`: el detalle y las listas que están detrás traen los datos nuevos
//                         (las barras continúan desde donde estaban; «Por pagar» baja contando)
//   si la base falla    → `fallar()`: el botón vuelve a reposo y el formulario sigue como estaba
//
// Por qué el refresco va DESPUÉS de la animación de cierre y no en cuanto responde la base: así la persona ve
// primero su confirmación y, ya con la hoja fuera, el cambio en lo que tenía detrás. Y es a prueba de cortes:
// si el modal se desmonta antes de tiempo (Escape, navegar), el refresco igual ocurre —la base ya cambió—, una sola vez.

const MS_HECHO = 850;
const MS_HECHO_REDUCIDO = 350;
const MS_GIRO_MINIMO = 300;

/** Espera `trabajo` y, si respondió demasiado rápido, completa un mínimo para que el «cargando» se alcance a ver (sin movimiento no se espera). */
export async function conEspera<T>(trabajo: PromiseLike<T>, ms: number = MS_GIRO_MINIMO): Promise<T> {
  const [resultado] = await Promise.all([trabajo, new Promise<void>((ok) => window.setTimeout(ok, prefiereMovimientoReducido() ? 0 : ms))]);
  return resultado;
}

export function useConfirmacionPago({ onClose, onPagado }: { onClose: () => void; onPagado?: () => void }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoConfirmar>("reposo");
  const hecho = useRef(false);
  // El botón se ve bloqueado recién en el siguiente cuadro; esta guarda cubre un doble clic o un Enter repetido
  // que llegue antes (dos envíos = dos pagos del mismo saldo).
  const enCurso = useRef(false);
  const refrescado = useRef(false);
  const temporizador = useRef<number | undefined>(undefined);
  // Los manejadores del padre pueden cambiar en cada render; `alCerrar` tiene que ser ESTABLE (el temporizador
  // de cierre de `<Modal>` depende de su identidad) y aun así llamar a la versión más reciente.
  const manejadores = useRef({ onClose, onPagado });
  useEffect(() => {
    manejadores.current = { onClose, onPagado };
  });

  const refrescar = useCallback(() => {
    if (!hecho.current || refrescado.current) return;
    refrescado.current = true;
    router.refresh();
  }, [router]);

  useEffect(
    () => () => {
      window.clearTimeout(temporizador.current);
      refrescar();
    },
    [refrescar],
  );

  const alCerrar = useCallback(() => {
    refrescar();
    const { onClose: cerrar, onPagado: pagado } = manejadores.current;
    if (hecho.current && pagado) pagado();
    else cerrar();
  }, [refrescar]);

  /** `false` si ya hay un envío en curso: quien llama debe salirse sin hacer nada. */
  const empezar = useCallback(() => {
    if (enCurso.current) return false;
    enCurso.current = true;
    setEstado("cargando");
    return true;
  }, []);
  const fallar = useCallback(() => {
    enCurso.current = false;
    setEstado("reposo");
  }, []);
  const confirmar = useCallback(
    (cerrar: () => void, opciones: { saldado: boolean; origen?: Element | null }) => {
      hecho.current = true;
      setEstado("hecho");
      if (opciones.saldado) lanzarChispas(opciones.origen);
      temporizador.current = window.setTimeout(cerrar, prefiereMovimientoReducido() ? MS_HECHO_REDUCIDO : MS_HECHO);
    },
    [],
  );

  return { estado, empezar, fallar, confirmar, alCerrar };
}
