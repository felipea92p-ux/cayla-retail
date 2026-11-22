"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { BotonVerMas } from "@/components/ui/VerMas";
import { Vacio } from "@/components/ui/Vacio";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { RPC_LECTURAS_BARRIDO, agruparEnTramos, leerLecturasDelBarrido, textoDeTramo, textoDeRechazo, type LecturaDelBarrido, type PrendaBarrido } from "@/lib/barrido-piso-reglas";

/* ====================================================================
   HojaLoEscaneado · «Ver lo escaneado» del barrido del piso (ADR-0690, actividad 3)

   Lo escaneado en TRAMOS: lo que una persona escaneó seguido («Ana · 10:05 a 10:12 · 23 prendas»). Sin áreas fijas, las chicas
   reconocen por quién y a qué hora de dónde salió cada tramo, y si algo se contó de más lo quitan: un tramo entero o una lectura
   suelta. Quitar pide dos toques («Quitar» → «Sí, quitar 23») y NO borra: la lectura queda tachada con quién la quitó y deja de
   sumar (`anular_lecturas_barrido`). Lo que este celular todavía no subió no está aquí: se dice cuántas esperan.
   ==================================================================== */

type Confirmar = { tipo: "tramo"; clave: string } | { tipo: "lectura"; id: string } | null;

export function HojaLoEscaneado({
  barridoId,
  porId,
  esperan,
  onAnular,
  onClose,
}: {
  barridoId: string;
  porId: ReadonlyMap<string, PrendaBarrido>;
  /** Cuántas lecturas de este celular todavía no subieron. */
  esperan: number;
  /** Quita esas lecturas en la base (con la firma de quien está elegido). Devuelve el error a mostrar, o null si salió bien. */
  onAnular: (ids: string[], motivo: "repetida" | "tramo") => Promise<string | null>;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [lecturas, setLecturas] = useState<LecturaDelBarrido[] | null>(null);
  const [tope, setTope] = useState<{ total: number; tope: number } | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [persona, setPersona] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const [confirmar, setConfirmar] = useState<Confirmar>(null);
  const [quitando, setQuitando] = useState(false);

  function cargar() {
    return supabase
      .rpc(RPC_LECTURAS_BARRIDO as never, { p_barrido_id: barridoId } as never)
      .then(({ data, error }) => {
        if (error) {
          setFallo(textoDeRechazo(error.hint) ?? "No se pudo leer lo escaneado. Vuelve a intentarlo en un momento.");
          return;
        }
        const r = leerLecturasDelBarrido(data);
        setFallo(null);
        setLecturas(r.lecturas);
        setTope({ total: r.total, tope: r.tope });
      });
  }

  // Una vez al abrir la hoja; después de quitar se vuelve a leer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void cargar(), [barridoId]);

  const todos = useMemo(() => agruparEnTramos(lecturas ?? []), [lecturas]);
  const personas = useMemo(() => [...new Map(todos.map((t) => [t.personaId, t.nombre.split(" ")[0] || t.nombre])).entries()], [todos]);
  const tramos = persona ? todos.filter((t) => t.personaId === persona) : todos;

  async function quitar(ids: string[], motivo: "repetida" | "tramo") {
    setQuitando(true);
    const error = await onAnular(ids, motivo);
    setQuitando(false);
    setConfirmar(null);
    if (error) {
      setFallo(error);
      return;
    }
    await cargar();
  }

  const nombreDe = (id: string) => {
    const p = porId.get(id);
    return p ? [p.referencia, p.talla, p.color].filter(Boolean).join(" · ") : "Prenda";
  };

  return (
    <Modal titulo="Lo escaneado" subtitulo="En tramos: lo que cada persona escaneó seguido." tamano="ancha" conCerrar onClose={onClose}>
      <div className="space-y-4">
        {esperan > 0 && (
          <p className="nota-cayla">
            {esperan === 1 ? "1 lectura de este celular todavía no subió" : `${esperan.toLocaleString("es-PE")} lecturas de este celular todavía no subieron`}: aparecen aquí cuando suben.
          </p>
        )}
        {fallo && <Aviso tono="error">{fallo}</Aviso>}

        {personas.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ver lo de">
            <button type="button" className="pildora-cayla" aria-pressed={persona === null} onClick={() => setPersona(null)}>
              Todas
            </button>
            {personas.map(([id, nombre]) => (
              <button key={id} type="button" className="pildora-cayla" aria-pressed={persona === id} onClick={() => setPersona(id)}>
                {nombre}
              </button>
            ))}
          </div>
        )}

        {lecturas === null && !fallo ? (
          <p className="texto-detalle text-taupe">Leyendo lo escaneado…</p>
        ) : tramos.length === 0 ? (
          <Vacio tamano="chico" icono={<ListChecks />}>
            Todavía no se escaneó nada en este barrido.
          </Vacio>
        ) : (
          <ul className="space-y-3">
            {tramos.map((t) => {
              const abierto = abiertos.has(t.clave);
              const confirmando = confirmar?.tipo === "tramo" && confirmar.clave === t.clave;
              const nombre = t.nombre.split(" ")[0] || t.nombre;
              return (
                <li key={t.clave} className="vd-placa rounded-[var(--radius-tarjeta,1rem)] p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-tinta">
                        {nombre} · {textoDeTramo(t.desde, t.hasta)}
                      </p>
                      <p className="texto-detalle text-taupe">
                        {t.unidades === 1 ? "1 prenda" : `${t.unidades.toLocaleString("es-PE")} prendas`}
                        {t.vivas.length < t.lecturas.length && ` · ${(t.lecturas.length - t.vivas.length).toLocaleString("es-PE")} quitadas`}
                      </p>
                    </div>
                    {t.vivas.length > 0 && !confirmando && (
                      <Boton peso="peligro" className="btn-chico" onClick={() => setConfirmar({ tipo: "tramo", clave: t.clave })}>
                        Quitar tramo
                      </Boton>
                    )}
                  </div>
                  {confirmando && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-tinta">
                        ¿Quitar {t.unidades === 1 ? "la prenda" : `las ${t.unidades.toLocaleString("es-PE")} prendas`} que {nombre} escaneó {textoDeTramo(t.desde, t.hasta).includes(" a ") ? "de" : "a las"}{" "}
                        {textoDeTramo(t.desde, t.hasta)}?
                      </span>
                      <Boton peso="primario" className="btn-chico" cargando={quitando} textoCargando="Quitando…" onClick={() => void quitar(t.vivas, "tramo")}>
                        Sí, quitar {t.unidades.toLocaleString("es-PE")}
                      </Boton>
                      <Boton peso="fantasma" className="btn-chico" disabled={quitando} onClick={() => setConfirmar(null)}>
                        No
                      </Boton>
                    </div>
                  )}
                  <BotonVerMas
                    forma="enlace"
                    className="mt-2"
                    abierto={abierto}
                    texto={t.lecturas.length === 1 ? "Ver la prenda" : `Ver las ${t.lecturas.length.toLocaleString("es-PE")}`}
                    onCambiar={(a) =>
                      setAbiertos((s) => {
                        const n = new Set(s);
                        if (a) n.add(t.clave);
                        else n.delete(t.clave);
                        return n;
                      })
                    }
                  />
                  {abierto && (
                    <ul className="mt-2 divide-y divide-tinta/10">
                      {t.lecturas.map((l) => {
                        const p = porId.get(l.varianteId);
                        const quitada = Boolean(l.anuladaEn);
                        const pregunta = confirmar?.tipo === "lectura" && confirmar.id === l.id;
                        return (
                          <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
                            <MiniaturaPrenda fotoUrl={p?.fotoUrl ?? null} colorHex={p?.colorHex ?? null} tamano="md" {...categoriaDe(p)} />
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-sm ${quitada ? "text-taupe line-through" : "text-tinta"}`}>
                                {nombreDe(l.varianteId)}
                                {l.cantidad > 1 && ` · ${l.cantidad}`}
                              </p>
                              <p className="texto-detalle text-taupe">
                                {textoDeTramo(l.escaneadaEn, l.escaneadaEn)}
                                {quitada && ` · quitada${l.anuladaPor ? ` por ${l.anuladaPor.split(" ")[0]}` : ""} a las ${textoDeTramo(l.anuladaEn!, l.anuladaEn!)}`}
                              </p>
                            </div>
                            {quitada ? (
                              <Chip tono="apagado" versalitas={false}>
                                Quitada
                              </Chip>
                            ) : pregunta ? (
                              <span className="flex items-center gap-2">
                                <Boton peso="primario" className="btn-chico" cargando={quitando} textoCargando="Quitando…" onClick={() => void quitar([l.id], "repetida")}>
                                  Sí, quitar
                                </Boton>
                                <Boton peso="fantasma" className="btn-chico" disabled={quitando} onClick={() => setConfirmar(null)}>
                                  No
                                </Boton>
                              </span>
                            ) : (
                              <Boton peso="peligro" className="btn-chico" onClick={() => setConfirmar({ tipo: "lectura", id: l.id })}>
                                Quitar
                              </Boton>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {tope && tope.total > tope.tope && (
          <p className="texto-detalle text-taupe">Se muestran las {tope.tope.toLocaleString("es-PE")} más recientes de {tope.total.toLocaleString("es-PE")}.</p>
        )}
      </div>
    </Modal>
  );
}
