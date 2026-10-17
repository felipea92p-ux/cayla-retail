import Link from "next/link";
import { Aviso } from "@/components/ui/Aviso";

// La pregunta «¿no será uno que ya existe?» (2026-09-25): la caja ámbar que aparece mientras se escribe el nombre de
// una marca o de un proveedor nuevo. UNA sola pieza para las tres puertas (nueva marca, proveedor nuevo desde la marca y
// Compras ▸ Proveedores) para que la pregunta se vea y se conteste igual en todas; qué es «parecido» lo deciden
// `marcasParecidas` y `proveedoresParecidos`, no esta pieza.
//
// Es ámbar y no roja a propósito: es una pregunta, no un error. Sin `no` no hay salida por aquí (el nombre es IGUAL y la
// base no lo dejaría pasar): solo se puede elegir el que ya existe o cambiar lo escrito.

export type OpcionParecida = { id: string; nombre: string; detalle?: string };
type Accion = { texto: string } & ({ onClick: () => void } | { href: string });

export function PreguntaParecido({
  id,
  titulo,
  bajada,
  opciones,
  si,
  no,
  deshabilitado = false,
}: {
  /** Para llevar la vista hasta la pregunta cuando se intenta guardar sin contestarla (`avisar.error(…, { enfocar })`). */
  id?: string;
  titulo: string;
  bajada: string;
  opciones: readonly OpcionParecida[];
  /** «Sí, es este»: elegirlo aquí mismo (`onClick`) o ir a su ficha (`href`). */
  si: (opcion: OpcionParecida) => Accion;
  /** «No, es otro»: deja seguir y no vuelve a preguntar por estas opciones. */
  no?: { texto: string; onClick: () => void };
  deshabilitado?: boolean;
}) {
  return (
    <Aviso id={id} tono="atencion" titulo={titulo}>
      <p>{bajada}</p>
      <ul className="mt-2.5 space-y-2">
        {opciones.map((opcion) => {
          const accion = si(opcion);
          return (
            <li key={opcion.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-tinta">
                <span className="font-medium">{opcion.nombre}</span>
                {opcion.detalle && <span className="text-tinta/55"> · {opcion.detalle}</span>}
              </span>
              {"href" in accion ? (
                <Link href={accion.href} className="btn-cayla btn-secundario">
                  {accion.texto}
                </Link>
              ) : (
                <button type="button" onClick={accion.onClick} disabled={deshabilitado} className="btn-cayla btn-secundario">
                  {accion.texto}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {no && (
        <button type="button" onClick={no.onClick} disabled={deshabilitado} className="btn-cayla btn-enlace mt-2.5 text-xs">
          {no.texto}
        </button>
      )}
    </Aviso>
  );
}
