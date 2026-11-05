"use client";

import { useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";

// Revisar compras (Felipe 2026-10-23): «Quién tiene plata» y «Entregas y devoluciones» dejan de estar al pie de la pantalla, bajo la
// bandeja, y se abren en una hoja desde su botón de la cabecera. La pantalla principal queda para lo que espera a Compras. El contenido lo
// arma el servidor (las tablas, con sus acciones de devolver, saldar o anular) y llega como `children`: al guardar una de esas acciones, la
// pantalla se refresca y la hoja sigue abierta con lo nuevo. La hoja solo se lee: sale con la × (ADR-0358, familia `modal`).
export function HojaDeFondos({
  texto,
  titulo,
  subtitulo,
  guia,
  children,
}: {
  texto: string;
  titulo: string;
  subtitulo: string;
  guia: string;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        peso="fantasma"
        data-guia={guia}
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        {texto}
      </Boton>
      {abierta && (
        <Modal titulo={titulo} subtitulo={subtitulo} onClose={() => setAbierta(false)} conCerrar tamano="ancha" alCerrarEnfocar={origen}>
          <div className="space-y-4">{children}</div>
        </Modal>
      )}
    </>
  );
}
