"use client";

import { useEffect, useState } from "react";

const FECHA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" });
const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

/** «viernes 18 de setiembre · 19:37», en hora de Lima — la de las tiendas, no la del
 *  aparato de quien mira. La hora corre sola (cada 20 s): en una pantalla de mostrador
 *  que se deja abierta todo el día, una hora congelada engaña. */
export function FechaHoraLima() {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 20_000);
    return () => clearInterval(id);
  }, []);

  // El servidor y el navegador pueden caer en minutos distintos: ese desfase no es un error.
  return (
    <time dateTime={ahora.toISOString()} suppressHydrationWarning>
      {FECHA.format(ahora)} · {HORA.format(ahora)}
    </time>
  );
}
