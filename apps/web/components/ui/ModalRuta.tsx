"use client";

import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";

// Modal cuyo "abierto/cerrado" lo decide la URL, no un `useState`. Lo usan las
// rutas interceptadas (`@modal/(.)...`): la página del servidor dibuja el
// contenido y este cascarón solo sabe cómo cerrarse — volviendo atrás en el
// historial, que es lo que deshace la navegación que lo abrió. Escape, clic
// en el velo y el botón Cerrar hacen exactamente lo mismo que la flecha
// "atrás" del navegador, así nunca quedan desincronizados.
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
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  ancho?: string;
  alCerrar?: string;
  /** Botones de la entidad (pagar, anular…): van al pie, a la izquierda de
      Cerrar — el pie es donde la mano ya está cuando terminó de leer. */
  acciones?: ReactNode;
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
          {children}
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
        </>
      )}
    </Modal>
  );
}
