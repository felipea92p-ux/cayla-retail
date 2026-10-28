"use client";

import { useState, type KeyboardEvent } from "react";
import { ChevronRight, Shirt } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ElegirOpcion } from "@/components/recepcion-envio/BloquePrenda";
import {
  type Alcance,
  type Cifra,
  type CambiosDeCosto,
  type CambiosDePrecio,
  type Combinacion,
  type ValeEn,
  combinacionesDistintas,
  costoEfectivo,
  describirCambio,
  destinosDelAlcance,
  etiquetaDe,
  leerCifra,
  matrizDe,
  MENSAJE_SIN_CONTEO,
  montoTexto,
  precioEfectivo,
  textoDeRango,
} from "@/lib/recepcion-combinaciones-reglas";

// El costo y el precio de venta de UNA prenda, por color y talla (Felipe 2026-10-28, ADR-0393): la fila de la prenda dice cuánto cuesta y a cuánto se
// vende (o entre cuánto y cuánto), y al abrirla sale la matriz de lo que se contó, como cuando se contó: colores en filas, tallas en columnas, UNA caja
// por casilla y un interruptor «Costo | Precio de venta» que cambia qué cifra se edita. Lo escrito NO se aplica solo: abre la barra de alcance (esta
// combinación, ese color, esa talla o todas), que dice qué va a cambiar y, en el precio, dónde vale. Las reglas están en
// `lib/recepcion-combinaciones-reglas.ts`; aquí solo se dibuja. Nada se guarda: lo escrito viaja con el cierre del envío (`CerrarEnvio`).

const dosDecimales = (n: number | null): string => (n === null ? "" : n.toFixed(2));

export function PrendaConCombinaciones({
  nombre,
  unidades,
  combinaciones,
  abierta,
  onAlternar,
  cambiosCosto,
  cambiosPrecio,
  puedeCosto,
  sede,
  soloSede,
  totalActivas,
  rechazo,
  onCosto,
  onPrecio,
  onQuitar,
  guia,
}: {
  nombre: string;
  unidades: number;
  /** Lo contado por color y talla; vacío si todavía no se contó así (se dice, sin cajas). */
  combinaciones: readonly Combinacion[];
  abierta: boolean;
  onAlternar: () => void;
  cambiosCosto: CambiosDeCosto;
  cambiosPrecio: CambiosDePrecio;
  /** Quien cierra puede escribir el costo (un envío sin aviso, solo quien ve el dinero de Compras; un regalo entra a S/ 0). */
  puedeCosto: boolean;
  sede: string;
  /** Una terminal: el precio vale solo en su sede (la base no le deja cambiar el general). */
  soloSede: boolean;
  /** Cuántas tallas activas tiene la prenda (para decir si «solo esta tienda» con todas queda como el precio de la prenda); `null` si no se sabe. */
  totalActivas: number | null;
  /** Por qué la base no guardaría lo escrito (`validar_precios_en_recepcion`): sale en la prenda y se borra al cambiar algo. */
  rechazo: string | null;
  onCosto: (ids: string[], valor: number) => void;
  onPrecio: (ids: string[], valor: number, valeEn: ValeEn) => void;
  onQuitar: (cifra: Cifra, ids: string[]) => void;
  /** El ancla de la guía interactiva de la fila (solo la de la primera prenda). */
  guia?: string;
}) {
  const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  const colores = new Set(combinaciones.map((c) => (c.color ?? "").trim().toLowerCase())).size;
  const tallas = new Set(combinaciones.map((c) => (c.talla ?? "").trim().toUpperCase())).size;
  const sub = combinaciones.length === 0 ? `${cuenta(unidades, "unidad", "unidades")} · sin color ni talla todavía` : `${cuenta(unidades, "unidad", "unidades")} · ${cuenta(colores, "color", "colores")} × ${cuenta(tallas, "talla", "tallas")}`;

  const costoCambia = (c: Combinacion) => cambiosCosto[c.varianteId] !== undefined && cambiosCosto[c.varianteId] !== c.costoHeredado;
  const precioCambia = (c: Combinacion) => cambiosPrecio[c.varianteId] !== undefined && cambiosPrecio[c.varianteId].valor !== c.precioSede;
  const hayCostoCambiado = combinaciones.some(costoCambia);
  const hayPrecioCambiado = combinaciones.some(precioCambia);
  const costos = textoDeRango(combinaciones.map((c) => costoEfectivo(c, cambiosCosto)));
  const precios = textoDeRango(combinaciones.map((c) => precioEfectivo(c, cambiosPrecio)));

  return (
    <div className="border-t border-sand first:border-t-0" data-prenda-comb={nombre}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        data-guia={guia}
        className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 text-left @min-[1000px]:grid-cols-[minmax(0,1fr)_9rem_9rem_2rem]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-hueso text-taupe">
            <Shirt aria-hidden className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-tinta">{nombre}</span>
            <span className="block truncate text-xs text-taupe">{sub}</span>
          </span>
        </span>
        <span className="col-start-1 flex flex-wrap items-center gap-1.5 text-xs @min-[1000px]:col-start-auto @min-[1000px]:flex-col @min-[1000px]:items-start @min-[1000px]:gap-0">
          <span className="text-taupe">Costo</span>
          <span className="tabular-nums text-tinta">{puedeCosto ? (costos ?? "—") : "—"}</span>
          {hayCostoCambiado && <Chip tono="ambar" versalitas={false}>cambiado</Chip>}
        </span>
        <span className="col-start-1 flex flex-wrap items-center gap-1.5 text-xs @min-[1000px]:col-start-auto @min-[1000px]:flex-col @min-[1000px]:items-start @min-[1000px]:gap-0">
          <span className="text-taupe">Precio de venta</span>
          <span className="tabular-nums text-tinta">{precios ?? "—"}</span>
          {hayPrecioCambiado && <Chip tono="ambar" versalitas={false}>cambiado</Chip>}
        </span>
        <ChevronRight aria-hidden className={`col-start-2 row-start-1 h-4 w-4 justify-self-end text-taupe transition-transform duration-300 ease-cayla @min-[1000px]:col-start-auto @min-[1000px]:row-start-auto ${abierta ? "rotate-90" : ""}`} />
      </button>
      {abierta && (
        <div className="pb-4 pl-0 @min-[1000px]:pl-10">
          {combinaciones.length === 0 ? (
            <p className="text-xs text-taupe" data-sin-conteo-combinaciones>
              {MENSAJE_SIN_CONTEO}
            </p>
          ) : (
            <Matriz
              nombre={nombre}
              combinaciones={combinaciones}
              cambiosCosto={cambiosCosto}
              cambiosPrecio={cambiosPrecio}
              puedeCosto={puedeCosto}
              sede={sede}
              soloSede={soloSede}
              totalActivas={totalActivas}
              rechazo={rechazo}
              onCosto={onCosto}
              onPrecio={onPrecio}
              onQuitar={onQuitar}
              costoCambia={costoCambia}
              precioCambia={precioCambia}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Matriz({
  nombre,
  combinaciones,
  cambiosCosto,
  cambiosPrecio,
  puedeCosto,
  sede,
  soloSede,
  totalActivas,
  rechazo,
  onCosto,
  onPrecio,
  onQuitar,
  costoCambia,
  precioCambia,
}: {
  nombre: string;
  combinaciones: readonly Combinacion[];
  cambiosCosto: CambiosDeCosto;
  cambiosPrecio: CambiosDePrecio;
  puedeCosto: boolean;
  sede: string;
  soloSede: boolean;
  totalActivas: number | null;
  rechazo: string | null;
  onCosto: (ids: string[], valor: number) => void;
  onPrecio: (ids: string[], valor: number, valeEn: ValeEn) => void;
  onQuitar: (cifra: Cifra, ids: string[]) => void;
  costoCambia: (c: Combinacion) => boolean;
  precioCambia: (c: Combinacion) => boolean;
}) {
  const [cifra, setCifra] = useState<Cifra>(puedeCosto ? "costo" : "precio");
  // Lo que se está escribiendo: una casilla y su texto. No se aplica hasta «Aplicar» (la barra dice qué va a cambiar).
  const [borrador, setBorrador] = useState<{ origenId: string; texto: string } | null>(null);
  const [alcance, setAlcance] = useState<Alcance>("esta");
  const [valeEn, setValeEn] = useState<ValeEn>("sede");

  const cifraActiva: Cifra = puedeCosto ? cifra : "precio";
  const matriz = matrizDe(combinaciones);
  const valorDe = (c: Combinacion): number | null => (cifraActiva === "costo" ? costoEfectivo(c, cambiosCosto) : precioEfectivo(c, cambiosPrecio));
  const cambiada = cifraActiva === "costo" ? costoCambia : precioCambia;
  const distintas = combinacionesDistintas(combinaciones, valorDe);
  const origen = borrador ? (combinaciones.find((c) => c.varianteId === borrador.origenId) ?? null) : null;
  const lectura = borrador ? leerCifra(cifraActiva, borrador.texto) : null;
  const valido = lectura !== null && lectura.valor !== null && lectura.problema === null;

  // Hasta dónde llega: solo se ofrece lo que de verdad es distinto (una prenda de un solo color no ofrece «todo el color»).
  const opcionesAlcance = (() => {
    if (!origen) return [];
    const n = (a: Alcance) => destinosDelAlcance(combinaciones, origen.varianteId, a).length;
    const todas = n("todas");
    const r: { valor: Alcance; texto: string }[] = [{ valor: "esta", texto: "Solo esta" }];
    if (n("color") > 1 && n("color") < todas) r.push({ valor: "color", texto: `Todo ${origen.color?.trim() || "Sin color"} (${n("color")})` });
    if (n("talla") > 1 && n("talla") < todas) r.push({ valor: "talla", texto: `Toda talla ${origen.talla?.trim() || "Única"} (${n("talla")})` });
    if (todas > 1) r.push({ valor: "todas", texto: `Las ${todas}` });
    return r;
  })();
  const alcanceVigente: Alcance = opcionesAlcance.some((o) => o.valor === alcance) ? alcance : "esta";
  const valeEnVigente: ValeEn = soloSede ? "sede" : valeEn;
  const destinos = origen ? destinosDelAlcance(combinaciones, origen.varianteId, alcanceVigente) : [];
  const descripcion =
    valido && lectura?.valor != null
      ? describirCambio({
          cifra: cifraActiva,
          todas: combinaciones,
          destinos: combinaciones.filter((c) => destinos.includes(c.varianteId)),
          valor: lectura.valor,
          valeEn: cifraActiva === "precio" ? valeEnVigente : "todas",
          sede,
          antes: Object.fromEntries(combinaciones.map((c) => [c.varianteId, valorDe(c)])),
          totalActivas,
        })
      : null;

  const cancelar = () => {
    setBorrador(null);
    setAlcance("esta");
  };
  const aplicar = () => {
    if (!valido || !lectura || lectura.valor === null || destinos.length === 0) return;
    if (cifraActiva === "costo") onCosto(destinos, lectura.valor);
    else onPrecio(destinos, lectura.valor, valeEnVigente);
    cancelar();
  };
  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    // Esta caja vive dentro del formulario del cierre: Enter aplica lo escrito, nunca cierra el envío.
    if (e.key === "Enter") {
      e.preventDefault();
      aplicar();
    } else if (e.key === "Escape" && borrador) {
      e.preventDefault();
      e.stopPropagation();
      cancelar();
    }
  };
  const escribir = (c: Combinacion, texto: string) => {
    if (borrador?.origenId !== c.varianteId) setAlcance("esta");
    setBorrador({ origenId: c.varianteId, texto });
  };
  const paraTodas = () => {
    const primera = combinaciones[0];
    setAlcance("todas");
    setBorrador({ origenId: primera.varianteId, texto: dosDecimales(valorDe(primera)) });
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-celda="${CSS.escape(primera.varianteId)}"] input`)?.select());
  };
  const cambiadas = combinaciones.filter(cambiada).map((c) => c.varianteId);
  const palabra = cifraActiva === "costo" ? "costo" : "precio";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {puedeCosto && (
          <SegmentoDeslizante
            forma="modo"
            etiqueta={`Qué cifra editas en ${nombre}`}
            valor={cifraActiva}
            onCambio={(v) => {
              cancelar();
              setCifra(v as Cifra);
            }}
            opciones={[
              { clave: "costo", etiqueta: "Costo" },
              { clave: "precio", etiqueta: "Precio de venta" },
            ]}
          />
        )}
        <p className="min-w-0 basis-full text-xs text-taupe sm:flex-1 sm:basis-0">
          {cifraActiva === "costo" ? "Costo de cada combinación, en soles." : "Precio de venta de cada combinación, en soles."} Lo que escribas pide primero hasta dónde llega.
        </p>
        <Boton type="button" peso="discreto" className="btn-chico" onClick={paraTodas}>
          {combinaciones.length === 1 ? `Cambiar el ${palabra}` : `Mismo ${palabra} para las ${combinaciones.length}`}
        </Boton>
      </div>

      <div className="overflow-x-auto">
        <div className="rc-matriz" style={{ gridTemplateColumns: `minmax(6.5rem, 9rem) repeat(${matriz.tallas.length}, minmax(5.25rem, 7rem))` }} role="group" aria-label={`${cifraActiva === "costo" ? "Costo" : "Precio de venta"} por color y talla de ${nombre}`}>
          <span />
          {matriz.tallas.map((t) => (
            <span key={t} className="label-cayla text-center text-[11px] text-taupe">
              {t}
            </span>
          ))}
          {matriz.filas.map((f) => (
            <FilaDeMatriz key={f.color} color={f.color}>
              {f.celdas.map((c, i) =>
                c === null ? (
                  <span key={`${f.color}-${matriz.tallas[i]}`} className="rc-comb-vacia" aria-hidden>
                    —
                  </span>
                ) : (
                  <div key={c.varianteId} className="rc-comb-celda" data-celda={c.varianteId} data-estado={cambiada(c) ? "cambio" : distintas.has(c.varianteId) ? "propio" : undefined}>
                    <CampoTexto
                      caja
                      sinPie
                      etiqueta={`${cifraActiva === "costo" ? "Costo" : "Precio de venta"} de ${nombre}, ${etiquetaDe(c)}`}
                      inputMode="decimal"
                      value={borrador?.origenId === c.varianteId ? borrador.texto : dosDecimales(valorDe(c))}
                      // sugerir-fijo: un monto de soles no depende de nada elegido antes
                      placeholder="0.00"
                      tono={borrador?.origenId === c.varianteId && lectura?.problema ? "error" : undefined}
                      className="text-right tabular-nums"
                      onChange={(e) => escribir(c, e.target.value)}
                      onKeyDown={alTeclear}
                    />
                  </div>
                ),
              )}
            </FilaDeMatriz>
          ))}
        </div>
      </div>

      {cambiadas.length > 0 && !borrador && (
        <p className="text-xs text-taupe">
          Las casillas en ámbar ya tienen otro {palabra} que el de hoy.{" "}
          <BotonDeshacer onClick={() => onQuitar(cifraActiva, cambiadas)}>{`Deshacer los ${cambiadas.length === 1 ? "cambios" : `${cambiadas.length} cambios`}`}</BotonDeshacer>
        </p>
      )}

      {borrador && origen && (
        <div className="rc-comb-barra space-y-3" data-comb-barra>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[13px] text-tinta">
              <b>{etiquetaDe(origen)}</b> · {palabra}
              {valorDe(origen) !== null ? ` de ${montoTexto(valorDe(origen) as number)}` : ""} a <b>{lectura?.valor != null ? montoTexto(lectura.valor) : "…"}</b>
            </p>
            {cifraActiva === "precio" && !soloSede && (
              <SegmentoDeslizante
                forma="modo"
                etiqueta="Dónde vale este precio"
                valor={valeEnVigente}
                onCambio={(v) => setValeEn(v as ValeEn)}
                opciones={[
                  { clave: "sede", etiqueta: `Solo ${sede}` },
                  { clave: "todas", etiqueta: "Todas las sedes" },
                ]}
              />
            )}
            {cifraActiva === "precio" && soloSede && <span className="text-xs text-taupe">Vale solo en {sede}.</span>}
          </div>
          {opcionesAlcance.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-cayla text-[11px] text-taupe">Aplicar a</span>
              <ElegirOpcion chico etiqueta="Hasta dónde llega lo que escribiste" opciones={opcionesAlcance} valor={alcanceVigente} onValor={(v) => setAlcance(v as Alcance)} />
            </div>
          )}
          {lectura?.problema && <Aviso tono="error" chico titulo={lectura.problema} />}
          {descripcion && (
            <Aviso tono="atencion" titulo={descripcion.titulo}>
              {descripcion.detalle}
              {descripcion.avisos.map((a) => (
                <span key={a} className="mt-1 block text-xs">
                  {a}
                </span>
              ))}
            </Aviso>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Boton type="button" peso="fantasma" className="btn-chico" onClick={cancelar}>
              Cancelar
            </Boton>
            <Boton type="button" peso="primario" className="btn-chico" onClick={aplicar} disabled={!valido || !descripcion || descripcion.cuantas === 0}>
              Aplicar
            </Boton>
          </div>
        </div>
      )}

      {rechazo && !borrador && (
        <Aviso tono="error" titulo="La base no guardaría este precio">
          {rechazo}
        </Aviso>
      )}
    </div>
  );
}

/** El color de la fila y, a su derecha, sus casillas (un `display: contents` para que toda la matriz sea UNA cuadrícula y las tallas queden alineadas). */
function FilaDeMatriz({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <>
      <span className="rc-comb-color flex min-h-10 items-center text-[13px] font-semibold text-tinta">{color}</span>
      {children}
    </>
  );
}
