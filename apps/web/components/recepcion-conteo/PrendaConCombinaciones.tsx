"use client";

import { useState, type KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ElegirOpcion } from "@/components/recepcion-envio/BloquePrenda";
import { nombreCorto } from "@/lib/precio-sede-reglas";
import { caraDeVitrina } from "@/lib/recepcion-vitrina-reglas";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";
import { SinFoto } from "@/components/ui/PrendaCelda";
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
  categoria,
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
  /** La categoría de la prenda: sin foto, la cara de la vitrina dibuja su ícono (ADR-0333). */
  categoria: CategoriaDePrenda;
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

  return (
    <div className="rc-vitrina" data-prenda-comb={nombre}>
      <Vitrina
        nombre={nombre}
        sub={sub}
        categoria={categoria}
        combinaciones={combinaciones}
        cambiosCosto={cambiosCosto}
        cambiosPrecio={cambiosPrecio}
        puedeCosto={puedeCosto}
        sede={sede}
        soloSede={soloSede}
        hayCostoCambiado={hayCostoCambiado}
        hayPrecioCambiado={hayPrecioCambiado}
        abierta={abierta}
        onAlternar={onAlternar}
        onCosto={onCosto}
        onPrecio={onPrecio}
        guia={guia}
      />
      {abierta && (
        <div className="rc-vitrina-matriz">
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
    const r: { valor: Alcance; texto: string }[] = [{ valor: "esta", texto: "Esta" }];
    if (n("color") > 1 && n("color") < todas) r.push({ valor: "color", texto: `${origen.color?.trim() || "Sin color"} (${n("color")})` });
    if (n("talla") > 1 && n("talla") < todas) r.push({ valor: "talla", texto: `Talla ${origen.talla?.trim() || "Única"} (${n("talla")})` });
    if (todas > 1) r.push({ valor: "todas", texto: `Todas (${todas})` });
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
    <div className="space-y-2">
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
        <Boton type="button" peso="discreto" className="btn-chico ml-auto" onClick={paraTodas}>
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
        <div className="rc-comb-barra space-y-1.5" data-comb-barra>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <p className="text-[13px] text-tinta">
              <b>{etiquetaDe(origen)}</b>
              {valorDe(origen) !== null ? ` ${montoTexto(valorDe(origen) as number)}` : ""} a <b>{lectura?.valor != null ? montoTexto(lectura.valor) : "…"}</b>
            </p>
            {cifraActiva === "precio" && !soloSede && (
              <SegmentoDeslizante
                forma="modo"
                etiqueta="Dónde vale este precio: solo en esta tienda o en todas las sedes"
                valor={valeEnVigente}
                onCambio={(v) => setValeEn(v as ValeEn)}
                opciones={[
                  { clave: "sede", etiqueta: `Solo ${nombreCorto(sede)}` },
                  { clave: "todas", etiqueta: "Todas" },
                ]}
              />
            )}
            {cifraActiva === "precio" && soloSede && <span className="text-xs text-taupe">Vale solo en {nombreCorto(sede)}.</span>}
            {opcionesAlcance.length > 1 && <span className="label-cayla text-[11px] text-taupe">Aplicar a</span>}
            {opcionesAlcance.length > 1 && <ElegirOpcion chico etiqueta="Aplicar a: hasta dónde llega lo que escribiste" opciones={opcionesAlcance} valor={alcanceVigente} onValor={(v) => setAlcance(v as Alcance)} />}
            <span className="ml-auto flex gap-2">
              <Boton type="button" peso="fantasma" className="btn-chico" onClick={cancelar}>
                Cancelar
              </Boton>
              <Boton type="button" peso="primario" className="btn-chico" onClick={aplicar} disabled={!valido || !descripcion || descripcion.cuantas === 0}>
                Aplicar
              </Boton>
            </span>
          </div>
          {lectura?.problema && <Aviso tono="error" chico titulo={lectura.problema} />}
          {/* Lo que cambia, en una línea de texto: solo cuando dice algo que la primera línea no dice (varias casillas, o una tienda con su propio precio). */}
          {descripcion && (descripcion.cuantas > 1 || descripcion.avisos.length > 0) && (
            <p className="text-xs text-taupe" data-comb-resumen>
              {descripcion.cuantas > 1 ? `${descripcion.titulo} ${descripcion.detalle}` : ""} {descripcion.avisos.join(" ")}
            </p>
          )}
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

/**
 * La Vitrina (rediseño «B», Felipe 2026-10-29): la cara de la prenda en el cierre. La tarjeta con su etiqueta de precio y, al lado, el costo,
 * lo que se gana por prenda y dónde vale el precio. Lo escrito aquí cambia TODAS sus combinaciones a la vez —lo mismo que «Mismo precio para
 * las N» de la matriz— y se aplica al dejar la caja o con Enter (Escape lo devuelve); «Distinto por talla o color» abre la matriz. Nada se
 * guarda todavía: viaja con el cierre, que confirma los precios antes de guardar, como siempre.
 */
function Vitrina({
  nombre,
  sub,
  categoria,
  combinaciones,
  cambiosCosto,
  cambiosPrecio,
  puedeCosto,
  sede,
  soloSede,
  hayCostoCambiado,
  hayPrecioCambiado,
  abierta,
  onAlternar,
  onCosto,
  onPrecio,
  guia,
}: {
  nombre: string;
  sub: string;
  categoria: CategoriaDePrenda;
  combinaciones: readonly Combinacion[];
  cambiosCosto: CambiosDeCosto;
  cambiosPrecio: CambiosDePrecio;
  puedeCosto: boolean;
  sede: string;
  soloSede: boolean;
  hayCostoCambiado: boolean;
  hayPrecioCambiado: boolean;
  abierta: boolean;
  onAlternar: () => void;
  onCosto: (ids: string[], valor: number) => void;
  onPrecio: (ids: string[], valor: number, valeEn: ValeEn) => void;
  guia?: string;
}) {
  const cara = caraDeVitrina(combinaciones, cambiosCosto, cambiosPrecio);
  const [elegido, setElegido] = useState<ValeEn>("sede");
  const valeEn: ValeEn = soloSede ? "sede" : (cara.valeEn ?? elegido);
  const [precioEscrito, setPrecioEscrito] = useState<string | null>(null);
  const [costoEscrito, setCostoEscrito] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const ids = combinaciones.map((c) => c.varianteId);
  const sinCombinaciones = combinaciones.length === 0;

  /** Deja lo escrito en la caja: si es un número que vale, va a todas las combinaciones; si no, dice por qué y no cambia nada. */
  function dejar(cifra: Cifra, texto: string | null) {
    if (texto === null) return;
    if (cifra === "precio") setPrecioEscrito(null);
    else setCostoEscrito(null);
    const l = leerCifra(cifra, texto);
    if (l.problema) return setProblema(l.problema);
    setProblema(null);
    if (l.valor === null || ids.length === 0) return;
    if (cifra === "precio" && l.valor !== cara.precio) onPrecio(ids, l.valor, valeEn);
    if (cifra === "costo" && l.valor !== cara.costo) onCosto(ids, l.valor);
  }
  const teclas = (cifra: Cifra, texto: string | null) => (e: KeyboardEvent<HTMLInputElement>) => {
    // La caja vive dentro del formulario del cierre: Enter deja lo escrito, nunca cierra el envío.
    if (e.key === "Enter") {
      e.preventDefault();
      dejar(cifra, texto);
    } else if (e.key === "Escape" && texto !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (cifra === "precio") setPrecioEscrito(null);
      else setCostoEscrito(null);
      setProblema(null);
    }
  };
  /** Cambiar dónde vale: si ya se escribió un precio para todas, se vuelve a dejar con el lugar nuevo. */
  function cambiarDonde(v: ValeEn) {
    setElegido(v);
    if (hayPrecioCambiado && cara.precio !== null) onPrecio(ids, cara.precio, v);
  }

  return (
    <div className="rc-vitrina-cara" data-guia={guia}>
      <div className="rc-vitrina-tarjeta">
        <span className="rc-vitrina-foto">
          <SinFoto tamano="h-full w-full" {...categoria} />
        </span>
        <span className="min-w-0">
          <b className="block truncate text-[15px] text-tinta">{nombre}</b>
          <span className="block truncate text-[13px] text-taupe">{sub}</span>
        </span>
        {/* La etiqueta con su título a la vista (Formidable 2026-10-29: la ciega no la reconocía como el precio). No se vuelve a montar al cambiar
            el precio: así Enter no saca el cursor de la caja ni la etiqueta parpadea; el cambio se nota en su color. */}
        <span className="rc-vitrina-precio">
          <label className="rc-vitrina-etiqueta" data-cambio={hayPrecioCambiado ? "" : undefined}>
            <small>S/</small>
            <input // unificar-fijo: la etiqueta de precio de la Vitrina se escribe en su lugar, sin caja de campo (Felipe 2026-10-29)
              inputMode="decimal"
              autoComplete="off"
              disabled={sinCombinaciones}
              aria-label={`Precio de venta de ${nombre}, para todas sus tallas y colores`}
              value={precioEscrito ?? (cara.precio !== null ? cara.precio.toFixed(2) : "")}
              // sugerir-fijo: un monto de soles no depende de nada elegido antes
              placeholder={cara.precio === null && cara.precioTexto ? "varía" : "0.00"}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setPrecioEscrito(e.target.value)}
              onBlur={() => dejar("precio", precioEscrito)}
              onKeyDown={teclas("precio", precioEscrito)}
            />
          </label>
          <span className="rc-vitrina-precio-tit">Precio de venta</span>
        </span>
      </div>

      <div className="rc-vitrina-info">
        <div className="rc-vitrina-linea">
          <span className="text-[14px] text-taupe">Costo c/u {hayCostoCambiado && <Chip tono="ambar" versalitas={false}>cambiado</Chip>}</span>
          {puedeCosto ? (
            <CampoTexto
              caja
              sinPie
              antes="S/"
              etiqueta={`Costo de ${nombre}, para todas sus tallas y colores`}
              inputMode="decimal"
              disabled={sinCombinaciones}
              value={costoEscrito ?? (cara.costo !== null ? cara.costo.toFixed(2) : "")}
              // sugerir-fijo: un monto de soles no depende de nada elegido antes
              placeholder={cara.costo === null && cara.costoTexto ? "varía" : "0.00"}
              className="w-24 text-right tabular-nums"
              onChange={(e) => setCostoEscrito(e.target.value)}
              onBlur={() => dejar("costo", costoEscrito)}
              onKeyDown={teclas("costo", costoEscrito)}
            />
          ) : (
            <b className="text-[15px] text-tinta">—</b>
          )}
        </div>
        <div className="rc-vitrina-linea">
          <span className="text-[14px] text-taupe">Ganas por prenda</span>
          <b className="rc-vitrina-gana" data-pierde={cara.pierde ? "" : undefined}>
            {puedeCosto && cara.ganaTexto ? cara.ganaTexto : "—"}
          </b>
        </div>
        {problema && <Aviso tono="error" chico titulo={problema} />}
        {sinCombinaciones ? (
          <p className="text-[13px] text-taupe">{MENSAJE_SIN_CONTEO} Su precio se pone cuando tenga tallas y colores.</p>
        ) : (
          <div className="space-y-2">
            <span className="label-cayla block text-[11px] text-taupe">El precio vale en</span>
            {soloSede ? (
              <p className="text-[13px] text-taupe">Desde esta terminal, el precio vale solo en {nombreCorto(sede)}.</p>
            ) : (
              <SegmentoDeslizante
                forma="modo"
                etiqueta={`Dónde vale el precio de ${nombre}: solo en esta tienda o en todas las sedes`}
                valor={valeEn}
                onCambio={(v) => cambiarDonde(v as ValeEn)}
                opciones={[
                  { clave: "sede", etiqueta: `Solo ${nombreCorto(sede)}` },
                  { clave: "todas", etiqueta: "Todas" },
                ]}
              />
            )}
            <p className="text-[13px] text-taupe">{hayPrecioCambiado ? "Precio nuevo: se guarda al cerrar el envío." : "Lo que cambies se guarda al cerrar el envío."}</p>
          </div>
        )}
        <button type="button" className="rc-vitrina-abrir btn-cayla btn-enlace" onClick={onAlternar} aria-expanded={abierta}>
          Distinto por talla o color
          <ChevronRight aria-hidden className={`h-4 w-4 transition-transform duration-300 ease-cayla ${abierta ? "rotate-90" : ""}`} />
        </button>
      </div>
    </div>
  );
}
