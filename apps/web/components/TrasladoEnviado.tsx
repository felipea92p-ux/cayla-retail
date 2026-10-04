"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { avisar, enfocar } from "@/components/ui/Avisos";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";
import { enlaceWhatsAppA, numeroWhatsApp } from "@/lib/facturacion-comprobantes-reglas";
import { mensajeParaLaOtraSede, type PrendaEnviada } from "@/lib/traslados-reglas";

// Lo que se ve justo después de enviar un traslado (ADR-0242 D-3). Antes decía «3 prendas» y nada más: sin número, la
// otra sede no tenía cómo buscarlo; sin lista, quien armaba la caja no tenía con qué revisarla antes de cerrarla.
//
// Aquí quien envía SÍ ve cuántas prendas van (las acaba de contar). El mensaje para la otra sede, en cambio, no las
// dice: esa sede cuenta a ciegas (ADR-0239 D-130). La lógica del texto vive en `lib/traslados-reglas.ts`
// (`mensajeParaLaOtraSede`, con prueba); esta pieza solo lo pinta.
//
// Se degrada así (principio 9): el traslado YA está guardado cuando esto aparece. Si no se pudo leer su número, el título
// dice «Traslado enviado» y el enlace lleva a la lista. Si WhatsApp no abre o la sede no tiene número guardado, el
// mensaje sigue ahí para copiarlo. Si el portapapeles se niega, el texto queda marcado para copiarlo a mano.
export function TrasladoEnviado({
  id,
  numero,
  origen,
  destino,
  whatsappDestino,
  prendas,
  onOtro,
}: {
  /** Null solo si la base no devolvió el id (no debería pasar): el enlace cae a la lista. */
  id: string | null;
  /** Null si no se pudo leer: el título pierde el número, el resto sigue igual. */
  numero: number | null;
  origen: string;
  destino: string;
  /** El celular de WhatsApp de la sede destino (solo las tiendas lo tienen), o null. */
  whatsappDestino: string | null;
  prendas: PrendaEnviada[];
  onOtro: () => void;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const areaMensaje = useRef<HTMLTextAreaElement>(null);
  const unidades = prendas.reduce((acc, p) => acc + p.cantidad, 0);
  const rutaDelTraslado = id ? `/inventario/traslados/${id}` : "/inventario/traslados";

  // Pasar del formulario a esta pantalla es un cambio de VISTA, no un bloque que se encogió: se suelta <PaginaEstable>
  // (ADR-0185) antes de pintar. Sin esto, con el formulario largo y la persona abajo, la página se acortaba, PaginaEstable
  // la devolvía al desplazamiento del clic y el título con el número quedaba fuera de la pantalla (medido en un celular
  // de 700 px con 2 prendas). Mismo caso que el paso de «Nuevo producto» y el cobro del ticket de Vender.
  useLayoutEffect(() => {
    soltarPaginaEstable();
  }, []);

  // Quien teclea o lee con lector de pantalla aterriza en el resultado, no en el vacío donde estaba el formulario; y en el
  // celular, donde el formulario era largo, el título con el número se trae a la vista (el navegador conservaba el
  // desplazamiento de abajo). Con el loader global a la vista la página está `inert` y `focus()` no hace nada: se espera a
  // que se libere (mismo mecanismo que los avisos, ADR-0149).
  useEffect(() => {
    const llevarAlTitulo = () => enfocar(titulo.current);
    if (!esperaOcupada()) {
      llevarAlTitulo();
      return;
    }
    const dejarDeEscuchar = suscribirEspera(() => {
      if (esperaOcupada()) return;
      dejarDeEscuchar();
      llevarAlTitulo();
    });
    return dejarDeEscuchar;
  }, []);

  // El enlace completo lleva el dominio de DONDE se está usando la app; este componente solo se pinta tras una acción
  // de la persona, así que `window` ya existe.
  const mensaje = useMemo(
    () =>
      mensajeParaLaOtraSede({
        numero,
        origen,
        destino,
        prendas: prendas.map((p) => p.etiqueta),
        enlace: `${window.location.origin}${rutaDelTraslado}`,
      }),
    [numero, origen, destino, prendas, rutaDelTraslado]
  );
  const sinChatDirecto = numeroWhatsApp(whatsappDestino) === null;

  // El cuadro del mensaje crece con su texto: a 375 px el mensaje da 10 líneas o más y en un cuadro de alto fijo quedaba
  // cortado (la lista de prendas, justo lo último, era lo que no se veía). Se vuelve a medir si gira el celular.
  useLayoutEffect(() => {
    const area = areaMensaje.current;
    if (!area) return;
    const ajustar = () => {
      area.style.height = "auto";
      // `scrollHeight` no cuenta el borde del cuadro: sin sumarlo, la última línea queda cortada por 2 px.
      area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
    };
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [mensaje]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      avisar.exito("Mensaje copiado", { detalle: `Pégalo en el chat de ${destino}.` });
    } catch {
      // Sin permiso o sin portapapeles: el texto queda marcado para que lo copie a mano.
      areaMensaje.current?.focus();
      areaMensaje.current?.select();
      avisar.error("No se pudo copiar solo", { detalle: "El mensaje quedó marcado: cópialo con Ctrl+C (o mantén pulsado en el celular)." });
    }
  }

  return (
    <div className="card-cayla space-y-6 p-5">
      <div className="space-y-1 text-center">
        <p className="label-cayla text-[11px] text-tinta/65">Traslado enviado</p>
        <h2 ref={titulo} tabIndex={-1} className="font-display text-3xl text-tinta outline-none">
          {numero !== null ? `Traslado ${numero}` : "Traslado enviado"}
        </h2>
        <p className="text-sm text-tinta/70">
          De {origen} hacia {destino}: en camino hasta que {destino} las cuente al recibirlas.
        </p>
      </div>

      {/* Para revisar la caja antes de cerrarla: quien envía sí ve las cantidades. */}
      <section aria-labelledby="caja-enviada" className="space-y-2">
        <h3 id="caja-enviada" className="label-cayla text-[11px] text-tinta/70">
          Lo que va en la caja · {unidades} {unidades === 1 ? "prenda" : "prendas"}
        </h3>
        <ul className="divide-y divide-sand rounded-xl border border-sand">
          {prendas.map((p, i) => (
            <li key={`${p.etiqueta}-${i}`} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
              <span className="min-w-0 break-words text-sm text-tinta">{p.etiqueta}</span>
              <span className="shrink-0 tabular-nums text-sm font-semibold text-tinta">× {p.cantidad}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="avisar-sede" className="space-y-2.5">
        <h3 id="avisar-sede" className="label-cayla text-[11px] text-tinta/70">
          Avísale a {destino}
        </h3>
        <p className="text-sm leading-relaxed text-taupe">
          El mensaje ya está escrito. No dice cuántas prendas van.
        </p>
        <textarea
          ref={areaMensaje}
          readOnly
          value={mensaje}
          rows={4}
          aria-label={`Mensaje para ${destino}`}
          className="w-full resize-none overflow-hidden rounded-xl border border-sand bg-hueso px-3.5 py-3 text-sm leading-relaxed text-tinta outline-none focus:border-rojo"
        />
        <div className="flex flex-wrap gap-2">
          <a href={enlaceWhatsAppA(whatsappDestino, mensaje)} target="_blank" rel="noopener noreferrer" className="btn-cayla btn-primario">
            Abrir WhatsApp
          </a>
          <button type="button" onClick={copiar} className="btn-cayla btn-secundario">
            Copiar mensaje
          </button>
        </div>
        {sinChatDirecto && (
          <p className="text-xs text-taupe">{destino} no tiene un WhatsApp guardado: WhatsApp te va a preguntar a quién se lo mandas.</p>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={rutaDelTraslado} className="btn-cayla btn-secundario justify-center sm:flex-1">
          {id ? "Ver el traslado" : "Ver traslados en curso"}
        </Link>
        <button type="button" onClick={onOtro} className="btn-cayla btn-secundario justify-center sm:flex-1">
          Enviar otro traslado
        </button>
      </div>
    </div>
  );
}
