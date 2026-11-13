"use client";

import { Award, CalendarHeart, Percent } from "lucide-react";
import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

/* ====================================================================
   «¿Insignia, campaña u oferta?» · el mapa (ADR-0655, Felipe 2026-11-13)

   PROMETE: en una hoja que solo se lee, las tres palabras con la pregunta que responde cada una, ejemplos y dónde vive; y una lista de
   «¿qué quieres hacer?» que dice a qué pantalla ir. Nació de que Felipe no sabía que los descuentos se armaban dentro de «Insignias».
   Se abre desde el «?» de la cabecera de Catálogo ▸ Campañas y ofertas y de Catálogo ▸ Insignias, y marca en cuál de las dos estás.
   NO HACE: no guarda nada ni cambia de pantalla por su cuenta (el enlace a la otra fila cierra la hoja al navegar).
   ==================================================================== */

type Palabra = { clave: "insignia" | "campana" | "oferta"; icono: ReactNode; nombre: string; pregunta: string; ejemplos: string; regla: string; donde: string };

const PALABRAS: Palabra[] = [
  {
    clave: "insignia",
    icono: <Award aria-hidden className="h-5 w-5" />,
    nombre: "Insignia",
    pregunta: "¿Qué es esta prenda?",
    ejemplos: "Nuevo · Hecho a mano · Últimas unidades · Top ventas",
    regla: "Se ve sobre la foto en la web, en la etiqueta y en la ficha.",
    donde: "Catálogo ▸ Insignias",
  },
  {
    clave: "campana",
    icono: <CalendarHeart aria-hidden className="h-5 w-5" />,
    nombre: "Campaña",
    pregunta: "¿Qué fecha celebramos?",
    ejemplos: "Black Friday · Navidad · Día de la Madre",
    regla: "Tiene nombre, fechas y prendas. Mientras rige, pone su insignia en sus prendas.",
    donde: "Catálogo ▸ Campañas y ofertas",
  },
  {
    clave: "oferta",
    icono: <Percent aria-hidden className="h-5 w-5" />,
    nombre: "Oferta",
    pregunta: "¿Qué paga de menos el cliente?",
    ejemplos: "−20 % · lleva 3 y paga 2 · S/ 30 menos desde S/ 300",
    regla: "Siempre va dentro de una campaña. Es lo que cambia lo que cobra la caja.",
    donde: "Dentro de cada campaña",
  },
];

const TAREAS: { que: string; donde: string }[] = [
  { que: "Marcar como «Nuevo» las prendas que llegaron", donde: "Insignias" },
  { que: "Black Friday con 20 % menos en toda la tienda", donde: "Campañas y ofertas" },
  { que: "Bajar el precio de unas prendas por unos días", donde: "Campañas y ofertas" },
  { que: "Decir que una prenda es hecha a mano", donde: "Insignias" },
];

export function MapaCampanas({ aqui, onClose }: { aqui: "campanas" | "insignias"; onClose: () => void }) {
  const estaAqui = (p: Palabra) => (aqui === "insignias" ? p.clave === "insignia" : p.clave !== "insignia");
  return (
    <Modal titulo="Insignia, campaña u oferta" subtitulo="Tres palabras, tres preguntas distintas." tamano="ancha" conCerrar onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {PALABRAS.map((p) => (
              <section key={p.clave} className="mapa-placa" aria-label={p.nombre}>
                <div className="flex items-center justify-between gap-2">
                  <span className="mapa-icono">{p.icono}</span>
                  {estaAqui(p) && <span className="text-sm text-tinta/65">Estás aquí</span>}
                </div>
                <TituloSeccion nivel={3} className="mt-2">
                  {p.nombre}
                </TituloSeccion>
                <p className="mt-1 text-sm font-semibold text-tinta">{p.pregunta}</p>
                <p className="mt-1 text-sm text-tinta/65">{p.ejemplos}</p>
                <p className="mt-2 text-sm text-tinta">{p.regla}</p>
                <p className="mapa-donde">{p.donde}</p>
              </section>
            ))}
          </div>
          <div>
            <p className="label-cayla pb-1 text-[11px] text-tinta/65">¿Qué quieres hacer?</p>
            <ul className="mapa-tareas">
              {TAREAS.map((t) => (
                <li key={t.que}>
                  <span>{t.que}</span>
                  <b>{t.donde}</b>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-tinta">
              <b>La regla:</b> si cambia lo que paga el cliente, es Campañas y ofertas. Si solo dice algo de la prenda, es Insignias.
            </p>
          </div>
          <div className="flex justify-end">
            {aqui === "campanas" ? (
              <EnlaceVer href="/productos/insignias" alNavegar={cerrar}>
                Ir a Insignias
              </EnlaceVer>
            ) : (
              <EnlaceVer href="/productos/campanas" alNavegar={cerrar}>
                Ir a Campañas y ofertas
              </EnlaceVer>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
