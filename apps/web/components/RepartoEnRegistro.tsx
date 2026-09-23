"use client";

import { Check } from "lucide-react";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CampoSelectNativo } from "@/components/ui/campos";
import { campoEtiqueta } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { puedeQuitarseDelReparto, repartirEnPartesIguales, textoDelReparto, type RepartoLinea } from "@/lib/reparto-reglas";

// Repartir un comprobante entre tiendas al REGISTRARLO (ADR-0139). Un mismo comprobante puede traer mercadería para
// varias tiendas y cada una recibe lo suyo; aquí se dice cuánto le toca a cada una, línea por línea.
//
// Dos piezas, sin estado propio (todo vive en `CompraFormV2`, que es quien envía):
//   · `DestinoDeLaMercaderia` — «Una tienda» (como siempre) o «Repartir entre tiendas», y cuáles tiendas.
//   · `RepartoDeLinea`        — bajo cada línea, una casilla por tienda y, en vivo, cuánto falta o sobra.
//
// Principio de UX que manda aquí: el sistema dice LO QUE FALTA, no solo que hay un error («Faltan 4 por repartir», no
// «suma inválida»). La suma la exige la base con un candado diferido; esto evita mandarle algo que ya se sabe que
// rechazará y le pone palabras a cada cifra.

type Tienda = { id: string; nombre: string };

// Los <input type=number> sin las flechitas del navegador (mismo criterio que la cantidad de la línea).
const NUMERO = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const TONO_DEL_REPARTO: Record<"ok" | "falta" | "sobra", TonoChip> = { ok: "verde", falta: "ambar", sobra: "rojo" };

/** «Mercadería destinada a»: una tienda (el flujo de siempre) o repartida entre varias, con cuáles participan. */
export function DestinoDeLaMercaderia({
  ubicaciones,
  ubicacionesPropia,
  puedeRepartir = true,
  repartir,
  onRepartir,
  ubicacionId,
  onUbicacionId,
  tiendas,
  onTiendas,
}: {
  ubicaciones: Tienda[];
  /** ADR-0179: solo para un comprador de tienda. Con esto, «Mercadería destinada a» (una tienda) ofrece SOLO estas —
   *  la tienda gestora tiene que ser una de las suyas, la base lo exige — y repartir no permite dejar el reparto sin
   *  ninguna de ellas (la gestora, sea cual sea, tiene que conservar parte). `undefined` = sin restricción, como hoy
   *  para el líder: puede elegir cualquiera de `ubicaciones` y el reparto puede quedar sin ella. */
  ubicacionesPropia?: Tienda[];
  /** `false` cuando la base todavía no tiene el reparto: solo el selector de siempre, sin «Repartir entre tiendas». */
  puedeRepartir?: boolean;
  repartir: boolean;
  onRepartir: (repartir: boolean) => void;
  /** El destino cuando va todo a una tienda. */
  ubicacionId: string;
  onUbicacionId: (id: string) => void;
  /** Las tiendas que participan cuando se reparte (en el orden de `ubicaciones`). */
  tiendas: string[];
  onTiendas: (ids: string[]) => void;
}) {
  const propiaIds = ubicacionesPropia?.map((u) => u.id);
  // La tienda del comprador siempre disponible en el selector de «una tienda», aunque `ubicaciones` (todas) no la
  // tuviera por algún motivo — no debería pasar, pero mejor no dejarlo sin ninguna opción.
  const opcionesUna = ubicacionesPropia ?? ubicaciones;

  function alternar(id: string) {
    const activa = tiendas.includes(id);
    if (activa && !puedeQuitarseDelReparto(id, tiendas, propiaIds)) return;
    const nuevas = activa ? tiendas.filter((t) => t !== id) : [...tiendas, id];
    onTiendas(ubicaciones.filter((u) => nuevas.includes(u.id)).map((u) => u.id));
  }

  // Sin reparto en la base: exactamente el selector de antes.
  if (!puedeRepartir) {
    return (
      <CampoSelectNativo etiqueta="Mercadería destinada a" value={ubicacionId} onChange={(e) => onUbicacionId(e.target.value)}>
        {opcionesUna.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </CampoSelectNativo>
    );
  }

  return (
    <div className={repartir ? "sm:col-span-2" : ""}>
      <p className={campoEtiqueta}>Mercadería destinada a</p>
      <SegmentoDeslizante
        etiqueta="Destino de la mercadería"
        className="mt-2"
        valor={repartir ? "varias" : "una"}
        onCambio={(c) => onRepartir(c === "varias")}
        opciones={[
          { clave: "una", etiqueta: "Una tienda" },
          { clave: "varias", etiqueta: "Repartir entre tiendas" },
        ]}
      />
      {repartir ? (
        <div className="cr-revela mt-3 space-y-2">
          <div role="group" aria-label="Tiendas entre las que se reparte" className="flex flex-wrap gap-1.5">
            {ubicaciones.map((u) => {
              const activa = tiendas.includes(u.id);
              const bloqueada = activa && !puedeQuitarseDelReparto(u.id, tiendas, propiaIds);
              const esUltimaPropia = bloqueada && !!propiaIds?.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => alternar(u.id)}
                  title={bloqueada ? (esUltimaPropia ? "Tu tienda tiene que quedar en el reparto: es la que gestiona la factura" : "Tiene que quedar al menos una tienda") : undefined}
                  className={`label-cayla inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors ${
                    activa ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/75 hover:border-rojo hover:text-rojo"
                  }`}
                >
                  {activa && <Check aria-hidden className="h-3 w-3" />}
                  {u.nombre}
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-snug text-tinta/55">
            Marca las tiendas que reciben mercadería de este comprobante. Abajo, en cada línea, dices cuántas unidades le toca a cada una.
            {propiaIds && " Tu tienda tiene que quedar en el reparto: es la que gestiona la factura."}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <CampoSelectNativo etiqueta={<span className="sr-only">Tienda que recibe la mercadería</span>} value={ubicacionId} onChange={(e) => onUbicacionId(e.target.value)}>
            {opcionesUna.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </CampoSelectNativo>
        </div>
      )}
    </div>
  );
}

/** Bajo cada línea, cuando se reparte: una casilla por tienda y en vivo «Repartidas 24 de 24 ✓» / «Faltan 4 por repartir» / «Sobran 2». */
export function RepartoDeLinea({
  id,
  numeroLinea,
  cantidad,
  tiendas,
  reparto,
  onReparto,
}: {
  /** Id de la PRIMERA casilla: a ella lleva el cursor el aviso «reparte la línea N». */
  id: string;
  numeroLinea: number;
  cantidad: number;
  tiendas: Tienda[];
  reparto: RepartoLinea;
  onReparto: (reparto: RepartoLinea) => void;
}) {
  const estado = textoDelReparto(cantidad, reparto);

  function cambiar(tiendaId: string, texto: string) {
    const n = Math.max(0, Math.min(999999, Math.floor(Number(texto) || 0)));
    const siguiente = { ...reparto };
    // Cero = «a esta tienda no le toca»: la casilla se queda vacía en vez de mostrar un 0 que estorba al tipear.
    if (n === 0) delete siguiente[tiendaId];
    else siguiente[tiendaId] = n;
    onReparto(siguiente);
  }

  return (
    <div className="cr-revela rounded-lg bg-tinta/[0.04] px-3 py-2.5 sm:col-span-full">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="label-cayla text-[10.5px] text-tinta/65">Reparto de esta línea</span>
        {tiendas.map((t, k) => (
          <label key={t.id} className="flex items-center gap-2 text-sm text-tinta/75">
            <span className="max-w-[10rem] truncate">{t.nombre}</span>
            <input
              id={k === 0 ? id : undefined}
              type="number"
              min={0}
              max={cantidad}
              inputMode="numeric"
              placeholder="0"
              aria-label={`Unidades para ${t.nombre} · línea ${numeroLinea}`}
              value={reparto[t.id] ? reparto[t.id] : ""}
              onChange={(e) => cambiar(t.id, e.target.value)}
              onFocus={(e) => e.target.select()}
              className={`${NUMERO} w-16 border-b border-tinta/25 bg-transparent px-0.5 py-1 text-center text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/35 focus:border-b-2 focus:border-rojo`}
            />
          </label>
        ))}
        <span className="ml-auto flex items-center gap-3">
          <span aria-live="polite">
            <Chip tono={TONO_DEL_REPARTO[estado.tono]}>
              {estado.tono === "ok" ? (
                <span className="inline-flex items-center gap-1">
                  <Check aria-hidden className="h-3 w-3" />
                  {estado.texto}
                </span>
              ) : (
                estado.texto
              )}
            </Chip>
          </span>
          {tiendas.length > 1 && (
            <button
              type="button"
              onClick={() => onReparto(repartirEnPartesIguales(cantidad, tiendas.map((t) => t.id)))}
              className="label-cayla text-[10.5px] text-rojo hover:underline"
            >
              Partes iguales
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
