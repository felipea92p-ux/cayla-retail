"use client";

import { useSyncExternalStore } from "react";
import { estadoDeAtencion, momentoEnLima, type CierrePorFecha, type SemanaDeTienda } from "@cayla-retail/shared/horario-de-tienda";

// «Abierta · cierra 9 p. m.» / «Cerrada · abre mañana 10 a. m.» en la tarjeta de cada tienda (ADR-0518). Se calcula en el NAVEGADOR, con la hora de
// Lima: «Nuestras tiendas» sale armada de antemano (cache components) y un «Abierta» escrito en el servidor seguiría diciéndose horas después de
// cerrar. En el servidor no se dice nada (`null`) —la tarjeta ya trae el horario escrito— y, al cargar, entra el estado y se renueva cada medio
// minuto. Sin horario por días no se dice nada: una tienda no se declara cerrada por falta de datos.
const unaVezPorMinuto = () => Math.floor(Date.now() / 60_000);
const suscribir = (avisar: () => void) => {
  const id = setInterval(avisar, 30_000);
  return () => clearInterval(id);
};

export function EstadoDeTienda({ dias, cierres }: { dias: SemanaDeTienda; cierres: CierrePorFecha[] }) {
  const minuto = useSyncExternalStore(suscribir, unaVezPorMinuto, () => 0);
  const estado = minuto === 0 ? null : estadoDeAtencion(dias, cierres, momentoEnLima(new Date(minuto * 60_000)));
  if (!estado) return null;
  return (
    <p className="ay-tienda-estado" data-abierta={estado.abierta ? "" : undefined} role="status">
      {estado.texto}
    </p>
  );
}
