"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";

// Modal cuyo "abierto/cerrado" lo decide la URL, no un `useState`. Lo usan las
// rutas interceptadas (`@modal/(.)...`): la página del servidor dibuja el
// contenido y este cascarón solo sabe cómo cerrarse — volviendo atrás en el
// historial, que es lo que deshace la navegación que lo abrió. Escape, clic
// en el velo y el botón Cerrar hacen exactamente lo mismo que la flecha
// "atrás" del navegador, así nunca quedan desincronizados.
//
// `cierre` (opt-in): por defecto el modal se cierra con el botón «Cerrar» del pie. Con `cierre="equis"` se cierra
// con una X arriba a la derecha (gira 90° al pasar el mouse; estilos en `app/estilos/comprobantes-detalle.css`,
// clase `cd-equis`) y el pie ya no muestra «Cerrar»: solo lleva `acciones`, y si no hay acciones no hay pie.
// Así lo pide el detalle de un comprobante (prototipo aprobado). Sin la prop, todo queda como antes.
//
// `alCerrar`: adónde ir cuando "atrás" no es el lugar correcto. El caso real
// es el formulario de nueva factura: al guardar navega al detalle y "atrás"
// volvería al formulario recién enviado; ahí se cierra hacia la lista.
export function ModalRuta({
  titulo,
  subtitulo,
  ancho = "max-w-4xl",
  alCerrar,
  acciones,
  cierre = "pie",
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  ancho?: string;
  alCerrar?: string;
  /** Botones de la entidad (pagar, anular…): van al pie, a la izquierda de
      Cerrar — el pie es donde la mano ya está cuando terminó de leer. */
  acciones?: ReactNode;
  /** `"pie"` (por defecto): botón «Cerrar» en el pie. `"equis"`: una X arriba a la derecha y pie solo con `acciones`. */
  cierre?: "pie" | "equis";
  children: ReactNode;
}) {
  const router = useRouter();
  // Memorizado: Modal programa el cierre en un efecto que depende de `onClose`;
  // una función nueva en cada render reiniciaría ese temporizador.
  const cerrar = useCallback(() => (alCerrar ? router.replace(alCerrar) : router.back()), [alCerrar, router]);

  return (
    <Modal titulo={titulo} subtitulo={subtitulo} ancho={ancho} onClose={cerrar}>
      {(pedirCierre) => (
        <>
          {cierre === "equis" && (
            <button type="button" onClick={pedirCierre} aria-label="Cerrar" className="cd-equis">
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
          {children}
          {cierre === "equis" ? (
            acciones && <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-tinta/10 pt-4">{acciones}</div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-tinta/10 pt-4">
              {acciones}
              <button
                type="button"
                onClick={pedirCierre}
                className="label-cayla ml-auto rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
              >
                Cerrar
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
