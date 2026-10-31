"use client";

import { useState } from "react";
import { BellRing, ChevronDown, SearchX } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import {
  ahoraDicho,
  cifrasEsperan,
  desdeCuando,
  estadoFila,
  filtrarEsperan,
  personasDichas,
  pildorasDeTienda,
  prendaDicha,
  quienDicho,
  tiendaDicha,
  type EstadoEspera,
  type FiltroEstado,
  type FiltroTienda,
  type LecturaEsperan,
} from "@/lib/vitrina-esperan-reglas";

// En el celular la fila es una tarjeta: la prenda arriba; debajo, en una línea, la tienda, cuántos y desde cuándo; y al final, qué
// pasa ahora. Desde `sm`, columnas.
const PLANTILLA =
  "grid-cols-[auto_auto_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_8rem_6.5rem_6.5rem_minmax(9rem,13rem)]";
const TONO: Record<EstadoEspera, TonoChip> = { falta: "ambar", llego: "verde", fuera: "neutro" };

/**
 * Tienda web ▸ Vitrina ▸ Esperan una talla (ADR-0408, actividad 12). Lo que los clientes de la tienda online pidieron con
 * «Avísame cuando llegue», por prenda y tienda: cuántas personas, desde cuándo, y si ya llegó o dónde hay para pedirla a otra sede.
 * Solo se lee: no tiene nada que guardar. Cada fila se abre y dice quién espera, con su celular y su correo (Felipe 2026-10-31).
 */
export function EsperanPantalla({ lectura, hoy }: { lectura: LecturaEsperan; hoy: string }) {
  const [tienda, setTienda] = useState<FiltroTienda>("todas");
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [texto, setTexto] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);

  const cifras = cifrasEsperan(lectura);
  const visibles = filtrarEsperan(lectura.filas, { tienda, estado, busqueda: texto });
  const alternarEstado = (e: FiltroEstado) => setEstado((actual) => (actual === e ? "todos" : e));
  const pildoras = pildorasDeTienda(lectura);
  const hayFiltro = tienda !== "todas" || estado !== "todos" || texto.trim() !== "";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3" data-guia="esperan.cifras">
        <TarjetaCifra
          punto="neutro"
          etiqueta="Personas esperando"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={cifras.personas} alMontar />}
        >
          Tocaron «Avísame» en la web
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.faltan > 0 ? "ambar" : "neutro"}
          etiqueta="Tallas que faltan"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.faltan} alMontar />}
          activa={estado === "faltan"}
          onClick={() => alternarEstado("faltan")}
        >
          {cifras.faltan > 0 ? "No hay donde las esperan" : "Nada pendiente"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.llegaron > 0 ? "verde" : "neutro"}
          etiqueta="Ya llegaron"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          valor={<CifraQueCuenta valor={cifras.llegaron} alMontar />}
          activa={estado === "llegaron"}
          onClick={() => alternarEstado("llegaron")}
        >
          Cada persona lo ve en su cuenta
        </TarjetaCifra>
      </div>

      <section className="card-cayla space-y-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-sand px-5 py-4">
          <div className="min-w-[14rem] flex-1">
            <Buscador
              valor={texto}
              onCambio={setTexto}
              atajo
              guia="esperan.buscador"
              placeholder="Busca un modelo, un color, una talla o a quien espera"
              conteo={texto.trim() ? `${visibles.length} ${visibles.length === 1 ? "coincide" : "coinciden"}` : undefined}
            />
          </div>
          {pildoras.length > 2 && (
            <div className="pildoras-desliza gap-2 sm:flex-wrap" role="group" aria-label="Tienda" data-guia="esperan.tiendas">
              {pildoras.map((p) => (
                <button key={p.valor} type="button" className="pildora-cayla" aria-pressed={tienda === p.valor} onClick={() => setTienda(p.valor)}>
                  {p.texto}
                  <span className="pildora-cayla__n">· {p.cuantas}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {visibles.length === 0 ? (
          lectura.filas.length === 0 ? (
            <Vacio icono={<BellRing />} titulo="Nadie espera una talla todavía">
              Cuando un cliente de la tienda online toque «Avísame» en una talla que no hay, aparece aquí con cuántas personas la esperan.
            </Vacio>
          ) : texto.trim() ? (
            <Vacio icono={<SearchX />} titulo={`Nada coincide con «${texto.trim()}»`} acciones={<Boton onClick={() => setTexto("")}>Borrar la búsqueda</Boton>}>
              Busca por el nombre del modelo, su código, el color, la talla o el nombre de quien espera.
            </Vacio>
          ) : (
            <Vacio icono={<BellRing />} tamano="chico">
              {estado === "llegaron" ? "Todavía no llegó nada de lo que esperan aquí." : "No hay tallas esperando con este filtro."}
            </Vacio>
          )
        ) : (
          <Tabla className="rounded-none border-0 shadow-none" guia="esperan.lista">
            <Encabezado
              plantilla={PLANTILLA}
              columnas={[{ titulo: "Prenda" }, { titulo: "Tienda" }, { titulo: "Esperan", alinear: "der" }, { titulo: "Desde" }, { titulo: "Ahora" }]}
            />
            {visibles.map((f, i) => {
              const e = estadoFila(f);
              const abierto = abierta === f.clave;
              return (
                <div key={f.clave}>
                <div role="row" className={fila(PLANTILLA, "items-center sm:items-center")}>
                  <span className={celda("izq", "col-span-3 flex items-center gap-3 sm:col-span-1")}>
                    <MiniaturaPrenda
                      fotoUrl={f.producto.foto}
                      colorHex={f.color?.hex ?? null}
                      tamano="md"
                      prefijo={f.producto.prefijo}
                      familia={f.producto.familia}
                      categoria={f.producto.categoria}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-tinta" data-guia={i === 0 ? "esperan.modelo" : undefined}>
                        {f.producto.nombre}
                      </span>
                      <span className="block truncate text-[12px] text-taupe">{prendaDicha(f) || "—"}</span>
                    </span>
                  </span>
                  <span className={celda("izq", "text-[13px] text-tinta")}>
                    <span className="text-taupe sm:hidden">En </span>
                    {tiendaDicha(f)}
                  </span>
                  <span className={celda("der", "text-[13px] font-semibold text-tinta")}>
                    <button
                      type="button"
                      className="btn-cayla btn-enlace inline-flex items-center gap-1"
                      aria-expanded={abierto}
                      onClick={() => setAbierta(abierto ? null : f.clave)}
                      data-guia={i === 0 ? "esperan.quienes" : undefined}
                      title="Ver quién espera"
                    >
                      {personasDichas(f.personas)}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                  </span>
                  <span className={celda("izq", "text-[13px] text-taupe")} title={`La más nueva: ${desdeCuando(f.ultima, hoy)}`}>
                    {desdeCuando(f.desde, hoy)}
                  </span>
                  <span className={celda("izq", "col-span-3 pt-1 sm:col-span-1 sm:pt-0")} data-guia={i === 0 ? "esperan.ahora" : undefined}>
                    <Chip tono={TONO[e]}>{ahoraDicho(f)}</Chip>
                  </span>
                </div>
                {abierto && (
                  <ul className="space-y-2 border-t border-sand bg-hueso px-5 py-3" aria-label={`Quién espera ${f.producto.nombre}`}>
                    {f.quienes.map((w, k) => (
                      <li key={w.fichaId ?? `sin-${k}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
                        <span className="min-w-[10rem] font-medium text-tinta">{quienDicho(w)}</span>
                        {w.celular && (
                          <span className="text-tinta">
                            {w.celular}
                            {!w.aceptaWhatsapp && (
                              <span className="ml-2 inline-block" title="No aceptó mensajes de WhatsApp: úsalo solo para avisarle de esta prenda">
                                <Chip tono="neutro" versalitas={false}>Sin permiso de WhatsApp</Chip>
                              </span>
                            )}
                          </span>
                        )}
                        {w.correo && <span className="text-taupe">{w.correo}</span>}
                        <span className="text-taupe">Espera {desdeCuando(w.desde, hoy)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                </div>
              );
            })}
          </Tabla>
        )}
        {hayFiltro && visibles.length > 0 && (
          <p className="border-t border-sand px-5 py-2.5 text-xs text-taupe">
            {visibles.length} de {lectura.filas.length} {lectura.filas.length === 1 ? "talla" : "tallas"}
          </p>
        )}
      </section>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="esperan.nota">
        <p>
          Toca «personas» para ver quién espera cada talla, con su celular y su correo. A cada una también le avisa su cuenta de la tienda
          online apenas hay donde la espera. Quien no aceptó WhatsApp lleva su marca: escríbele solo para avisarle de esa prenda, no para
          ofrecerle otras. Si una talla falta en una tienda y hay en otra, pídela con un traslado.
        </p>
      </div>
    </div>
  );
}
