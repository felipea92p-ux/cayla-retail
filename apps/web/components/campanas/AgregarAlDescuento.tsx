"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Buscador } from "@/components/ui/Buscador";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ListaSugerencias, ariaDelBuscador } from "@/components/ui/ListaSugerencias";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { traducirError } from "@/lib/error-escritura";
import { rpcRebaja, type ErrorDeRebaja } from "@/lib/rebaja-rapida";
import {
  claveModeloColor,
  leerPrendasBuscadas,
  leerRebajaDePrenda,
  nombreDePrenda,
  nombreDeLugar,
  pctQueCobra,
  precioConPct,
  quedaBajoCosto,
  sugerenciasDeAgregar,
  textoPct,
  type AlcanceRebaja,
  type DescuentoDeLista,
  type PrendaBuscada,
  type RebajaDePrenda,
} from "@/lib/rebaja-rapida-reglas";
import { firmar } from "@/lib/responsable-reglas";
import type { useResponsable } from "@/lib/useResponsable";

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
/** Lo que se escribe a mano espera esta pausa; lo que lee la pistola termina en Enter y se busca al instante. */
const PAUSA_MS = 300;

/** Lo que el panel necesita para avisar y deshacer: qué tallas entraron, dónde estaba cada una (`null`: no se pudo saber) y qué decir. */
export type Agregado = { variantes: string[]; claves: string[]; antes: Map<string, string> | null; texto: string; detalle?: string };

/**
 * Agregar prendas a un descuento abierto (ADR-0677, actividad 3 de la maqueta `docs/maquetas/campanas-simple-2026-11/`). El % ya lo dice el
 * descuento, así que no se pregunta. Con la pistola (el código exacto) solo pregunta «Solo esta» o «Todo el modelo», y Enter repite la última
 * respuesta para escanear seguido; por nombre, sugiere cada modelo en su color con «Agregar». Antes de agregar lee dónde está cada talla
 * (`campanas_rebaja_de_variantes`) para que «Deshacer» la devuelva a su lugar. Reemplaza al escáner suelto y a su hoja (PR #1898).
 */
export function AgregarAlDescuento({
  descuento,
  ubicacionId,
  responsable,
  enElDescuento,
  tallasPorClave,
  tallasPorModelo,
  onAgregado,
}: {
  descuento: DescuentoDeLista;
  ubicacionId: string;
  responsable: ReturnType<typeof useResponsable>;
  /** Los modelos en su color que ya tiene el descuento. */
  enElDescuento: ReadonlySet<string>;
  /** Las tallas a la venta de cada modelo en su color, y de cada modelo entero (la vitrina de la pantalla). */
  tallasPorClave: ReadonlyMap<string, string[]>;
  tallasPorModelo: ReadonlyMap<string, string[]>;
  onAgregado: (a: Agregado) => void;
}) {
  const { etiquetaId, pct, todas } = descuento;
  const idLista = useId();
  const buscador = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [buscadas, setBuscadas] = useState<PrendaBuscada[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [leida, setLeida] = useState<RebajaDePrenda | null>(null);
  const [ultimoAlcance, setUltimoAlcance] = useState<AlcanceRebaja>("prenda");
  const [agregando, setAgregando] = useState(false);
  const pedido = useRef(0);
  // Tras agregar, el foco vuelve al buscador para leer la siguiente con la pistola (cuando ya se puede escribir).
  const enfocarAlTerminar = useRef(false);
  useEffect(() => {
    if (agregando || !enfocarAlTerminar.current) return;
    enfocarAlTerminar.current = false;
    buscador.current?.focus();
  }, [agregando]);

  async function buscar(texto: string) {
    const n = ++pedido.current;
    if (texto.trim().length < 2) {
      setBuscadas([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const { data, error } = await rpcRebaja("buscar_prenda_para_rebaja", { p_texto: texto.trim(), p_ubicacion_id: ubicacionId });
    if (n !== pedido.current) return;
    setBuscando(false);
    if (error) {
      setBuscadas([]);
      avisar.error(traducirError(error, "buscar la prenda", { lectura: true }));
      return;
    }
    const filas = leerPrendasBuscadas(data);
    const exacta = filas.find((f) => f.exacta);
    if (exacta) {
      // La pistola: la prenda leída, con lo que tiene hoy, y la pregunta.
      setBuscadas([]);
      const { data: json } = await rpcRebaja("campanas_rebaja_de_prenda", { p_variante_id: exacta.varianteId, p_ubicacion_id: ubicacionId });
      if (n !== pedido.current) return;
      setLeida(leerRebajaDePrenda(json));
      return;
    }
    setLeida(null);
    setBuscadas(filas);
  }

  useEffect(() => {
    const t = window.setTimeout(() => void buscar(q), PAUSA_MS);
    return () => window.clearTimeout(t);
    // `buscar` lee el último pedido: solo lo escrito la dispara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sugerencias = sugerenciasDeAgregar(buscadas, enElDescuento);

  /** Pone el % a las tallas: con una llamada si es una talla o todo el modelo, talla por talla si es un color. Para en el primer error. */
  async function agregar(variantes: string[], llamadas: { varianteId: string; alcance: AlcanceRebaja }[], texto: string, detalle?: string) {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setAgregando(true);
    // Dónde estaba cada talla, para «Deshacer». Sin la lectura (una base vieja), se agrega igual y el aviso sale sin «Deshacer».
    const { data: donde, error: errorDonde } = await rpcRebaja<{ variante_id: string; etiqueta_id: string }[]>("campanas_rebaja_de_variantes", {
      p_variantes: variantes,
      p_ubicacion_id: ubicacionId,
      p_todas: todas,
    });
    const antes = errorDonde ? null : new Map((donde ?? []).map((d) => [d.variante_id, d.etiqueta_id]));
    const sacadas = new Set<string>();
    let error: ErrorDeRebaja | null = null;
    for (const l of llamadas) {
      const r = await firmar(
        rpcRebaja<{ sacadas_de?: string[] }>("poner_rebaja", {
          p_variante_id: l.varianteId,
          p_alcance: l.alcance,
          p_pct: todas ? pct : null,
          p_etiqueta_id: todas ? null : etiquetaId,
          p_ubicacion_id: ubicacionId,
          p_todas: todas,
        }),
        responsable.firma(),
      );
      responsable.despues(r.error);
      if (r.error) {
        error = r.error;
        break;
      }
      for (const s of r.data?.sacadas_de ?? []) sacadas.add(s);
    }
    enfocarAlTerminar.current = true;
    setAgregando(false);
    setLeida(null);
    setQ("");
    setBuscadas([]);
    const claves = [...new Set(variantes.map((v) => tallasClave.get(v)).filter((c): c is string => Boolean(c)))];
    if (error) {
      avisar.error(traducirError(error, "poner el %"));
      onAgregado({ variantes: [], claves, antes: null, texto: "" });
      return;
    }
    onAgregado({ variantes, claves, antes, texto, detalle: sacadas.size > 0 ? `Sale de ${[...sacadas].join(", ")}` : detalle });
  }

  // De qué modelo en su color es cada talla (para saber qué tarjetas entraron).
  const tallasClave = new Map<string, string>();
  for (const [clave, vs] of tallasPorClave) for (const v of vs) tallasClave.set(v, clave);

  function elegirAlcance(alcance: AlcanceRebaja) {
    if (!leida) return;
    const p = leida.prenda;
    setUltimoAlcance(alcance);
    tallasClave.set(p.varianteId, claveModeloColor(p.productoId, p.color));
    const variantes = alcance === "modelo" ? (tallasPorModelo.get(p.productoId) ?? [p.varianteId]) : [p.varianteId];
    void agregar(variantes, [{ varianteId: p.varianteId, alcance }], alcance === "modelo" ? `${p.referencia} (todo el modelo) con ${textoPct(pct)}` : `${p.referencia} con ${textoPct(pct)}`, nombreDePrenda(p));
  }

  function agregarSugerencia(i: number) {
    const s = sugerencias[i];
    if (!s || s.yaEsta) return;
    const variantes = tallasPorClave.get(s.clave) ?? buscadas.filter((b) => claveModeloColor(b.productoId, b.color) === s.clave).map((b) => b.varianteId);
    for (const v of variantes) tallasClave.set(v, s.clave);
    void agregar(
      variantes,
      variantes.map((v) => ({ varianteId: v, alcance: "prenda" as const })),
      `${s.referencia} con ${textoPct(pct)}`,
      s.color ?? undefined,
    );
  }

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Mientras guarda, la pistola no repite lo anterior: el buscador sigue escribiendo y no se pierde lo leído.
      if (agregando) return;
      // Con la prenda leída a la vista, Enter repite la última respuesta: se escanea seguido sin tocar la pantalla.
      if (leida) elegirAlcance(ultimoAlcance);
      else if (sugerencias.length > 0) agregarSugerencia(0);
      else void buscar(q);
    } else if (e.key === "Escape" && (leida || q)) {
      e.stopPropagation();
      setLeida(null);
      setQ("");
      setBuscadas([]);
    }
  }

  const abierta = !leida && sugerencias.length > 0;
  const p = leida?.prenda ?? null;
  const yaTiene = leida ? leida.tiene.filter((t) => t.como === "a_mano" && t.movible && t.etiquetaId !== etiquetaId) : [];
  const cobra = leida ? pctQueCobra(leida.tiene, etiquetaId, pct) : pct;

  return (
    <div className="lc-agregar">
      <Buscador
        ref={buscador}
        valor={q}
        onCambio={(v) => setQ(v)}
        buscando={buscando}
        icono="barras"
        atajo
        etiqueta={`Agregar una prenda al ${textoPct(pct)} por su nombre o su código`}
        placeholder="Agrega una prenda: nombre o código"
        guia="rebaja.agregar"
        onKeyDown={teclas}
        {...ariaDelBuscador(idLista, abierta, abierta ? 0 : null)}
      />
      {abierta && (
        <ListaSugerencias
          id={idLista}
          etiqueta="Prendas que coinciden"
          sugerencias={sugerencias.map((s) => ({
            clave: s.clave,
            miniatura: <MiniaturaPrenda fotoUrl={s.fotoUrl} colorHex={s.colorHex} tamano="md" prefijo={s.categoria?.prefijo} familia={s.categoria?.familia} categoria={s.categoria?.nombre} />,
            titulo: s.referencia,
            detalle: s.color ?? undefined,
            derecha: s.yaEsta ? "Ya está" : `${soles(precioConPct(s.precio, pct))}`,
          }))}
          onElegir={agregarSugerencia}
        />
      )}
      {leida && p && (
        <div className="lc-leida anim-revelar" role="dialog" aria-label="¿Solo esta o todo el modelo?">
          <div className="flex items-center gap-3">
            <MiniaturaPrenda fotoUrl={p.foto} colorHex={p.colorHex} tamano="md" prefijo={p.categoria.prefijo} familia={p.categoria.familia} categoria={p.categoria.nombre} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{p.referencia}</p>
              <p className="text-sm text-tinta/70">{[p.color, p.talla].filter(Boolean).join(" · ")}</p>
            </div>
            <p className="lc-pieza-precio shrink-0 justify-end">
              <b>{soles(precioConPct(p.precio, pct))}</b>
              <s>{soles(p.precio)}</s>
            </p>
          </div>
          {(yaTiene.length > 0 || cobra > pct || quedaBajoCosto(p, pct)) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {yaTiene.map((t) => (
                <Chip key={t.etiquetaId} tono="pizarra" versalitas={false} title="Al agregarla aquí, sale de ahí">
                  {`Hoy: ${nombreDeLugar(t)}`}
                </Chip>
              ))}
              {cobra > pct && (
                <Chip tono="ambar" versalitas={false} title="Le llega por otra campaña que aquí no se cambia: la caja cobra el mayor">
                  {`La caja cobra ${textoPct(cobra)}`}
                </Chip>
              )}
              {quedaBajoCosto(p, pct) && (
                <Chip tono="ambar" title="Con este % se vende por debajo de lo que costó">
                  Bajo costo
                </Chip>
              )}
            </div>
          )}
          <div className="lc-leida-botones mt-4">
            <Boton peso={ultimoAlcance === "prenda" ? "primario" : "fantasma"} cargando={agregando && ultimoAlcance === "prenda"} textoCargando="Agregando…" disabled={agregando} onClick={() => elegirAlcance("prenda")}>
              Solo esta
            </Boton>
            <Boton peso={ultimoAlcance === "modelo" ? "primario" : "fantasma"} cargando={agregando && ultimoAlcance === "modelo"} textoCargando="Agregando…" disabled={agregando} onClick={() => elegirAlcance("modelo")}>
              {p.modeloColores > 1 ? `Todo el modelo · ${p.modeloColores} colores` : "Todo el modelo"}
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}
