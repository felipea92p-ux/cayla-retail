"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { EtiquetaAhora } from "@/components/alta-producto/guia";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { CuadroEstampado } from "@/components/ui/MuestraEstampado";
import { useFotosDeEstampados } from "@/components/recepcion-envio/useFotosDeEstampados";
import { esEstampado } from "@/lib/color-estampado-reglas";
import { ElegirOpcion } from "@/components/recepcion-envio/BloquePrenda";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Desplegable } from "@/components/ui/campos";
import { leerCantidad, limpiarCantidad, type ColorAlta } from "@/lib/alta-producto";
import { conMiles } from "@/lib/recepcion-modelos-reglas";
import { matrizDe, nombreDeVariante, SOLUCIONES_DANADA, sumasDe, type Conteo, type MatrizRecepcion, type PrendaRecepcion, type SolucionDanada, type TallaDeLaCategoria } from "@/lib/recepcion-envio-reglas";
import {
  claveDeEje,
  coloresPorAgregar,
  cuadreDeTallas,
  ordenarTallasVisibles,
  quitarColor,
  quitarTalla,
  tallasPorAgregar,
  type BorradorTallas,
} from "@/lib/recepcion-tallas-reglas";
import { prefiereQuieto } from "@/lib/movimiento-cliente";

// Tallas y colores en la misma pantalla de Contar (Felipe 2026-11-02, de su boceto; antes se abrían en una hoja). La tabla arranca con las tallas de siempre de la categoría y a cada talla y
// color se le quita o se le agrega. Quitar solo esconde y limpia lo escrito (si había algo, el aviso ofrece «Deshacer»); nunca se borra una variante del catálogo. Agregar lo que la prenda ya
// tiene lo vuelve a mostrar; lo que no tiene se crea con la hoja de siempre. No hay más permisos que los de esa hoja: no se ofrecen tallas que la categoría no ofrece.
//
// Lo escrito se guarda solo cuando reparte justo lo contado, porque en la base las tallas de una prenda siempre suman su cantidad: mientras tanto espera aquí, y esta pantalla lo dice.

type Eje = { clave: string; texto: string };

export function TallasDeLaPlaca({
  prenda,
  cargar,
  tallasCategoria,
  coloresCatalogo,
  contadas,
  traerALaVista,
  borrador,
  onCambiar,
  onDejarSuma,
  onCrear,
  onCambiarPrenda,
}: {
  /** `null` mientras se leen sus tallas y colores. */
  prenda: PrendaRecepcion | null;
  /** Lee la prenda con sus tallas y colores. Responde `false` si no se pudo. */
  cargar: () => Promise<boolean>;
  tallasCategoria: readonly TallaDeLaCategoria[];
  coloresCatalogo: readonly ColorAlta[];
  contadas: number;
  /** Se acaba de pedir: la tabla sube a la vista y el cursor va a su primera celda. */
  traerALaVista: boolean;
  borrador: BorradorTallas | null;
  onCambiar: (b: BorradorTallas) => void;
  /** «Corrige lo contado a N»: lo repartido manda. */
  onDejarSuma: (n: number) => void;
  /** Lo que la prenda no tiene: se crea con la hoja de la prenda. */
  onCrear: (pedida: { tallaId?: string; colorCodigo?: string }) => void;
  /** «Cambiar de prenda»: al repartir se vio que era otra. */
  onCambiarPrenda: () => void;
}) {
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  const leida = !!prenda;
  useEffect(() => {
    if (leida) return;
    let vigente = true;
    void cargar().then((ok) => vigente && setFallo(!ok));
    return () => {
      vigente = false;
    };
    // `cargar` cambia en cada dibujo; lo que importa es si ya está leída y si se pidió reintentar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leida, intento]);

  if (!prenda || !borrador) {
    return (
      <div className="rc-seccion" data-guia="recepcion.tallas">
        <p className="rc-seccion-titulo">Tallas y colores</p>
        {fallo ? (
          <Aviso tono="error" chico accion={<button type="button" className="btn-cayla btn-enlace" onClick={() => { setFallo(false); setIntento((n) => n + 1); }}>Reintentar</button>}>
            No se pudieron leer las tallas y colores de esta prenda.
          </Aviso>
        ) : (
          <p className="text-sm text-taupe">Leyendo sus tallas y colores…</p>
        )}
      </div>
    );
  }
  return <Reparto prenda={prenda} tallasCategoria={tallasCategoria} coloresCatalogo={coloresCatalogo} contadas={contadas} traerALaVista={traerALaVista} borrador={borrador} onCambiar={onCambiar} onDejarSuma={onDejarSuma} onCrear={onCrear} onCambiarPrenda={onCambiarPrenda} />;
}

function Reparto({
  prenda,
  tallasCategoria,
  coloresCatalogo,
  contadas,
  traerALaVista,
  borrador,
  onCambiar,
  onDejarSuma,
  onCrear,
  onCambiarPrenda,
}: {
  prenda: PrendaRecepcion;
  tallasCategoria: readonly TallaDeLaCategoria[];
  coloresCatalogo: readonly ColorAlta[];
  contadas: number;
  traerALaVista: boolean;
  borrador: BorradorTallas;
  onCambiar: (b: BorradorTallas) => void;
  onDejarSuma: (n: number) => void;
  onCrear: (pedida: { tallaId?: string; colorCodigo?: string }) => void;
  onCambiarPrenda: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const matriz = matrizDe(prenda, coloresCatalogo.map((c) => c.codigo));
  const { conteo } = borrador;
  const s = sumasDe(conteo, prenda);
  const cuadre = cuadreDeTallas(conteo, prenda, contadas);
  const cuadra = cuadre.estado === "cuadra";
  const tallas: Eje[] = ordenarTallasVisibles(matriz, borrador.tallas).map((clave) => ({ clave, texto: matriz.tallas.find((t) => claveDeEje(t.id) === clave)?.texto ?? "" }));
  const visiblesColor = new Set(borrador.colores);
  const colores: Eje[] = matriz.colores.filter((c) => visiblesColor.has(claveDeEje(c.codigo))).map((c) => ({ clave: claveDeEje(c.codigo), texto: c.nombre }));
  const porAgregarTalla = tallasPorAgregar(matriz, borrador.tallas, tallasCategoria);
  const porAgregarColor = coloresPorAgregar(matriz, borrador.colores, coloresCatalogo);

  // Se acaba de pedir: en la prueba ciega la tabla quedó bajo el borde y parecía que el botón no había hecho nada. Mueve solo la columna; en el teléfono, donde la columna no se desplaza, la página.
  useEffect(() => {
    const el = raiz.current;
    if (!traerALaVista || !el) return;
    const caja = el.closest<HTMLElement>(".rc-scroll");
    const suave: ScrollBehavior = document.hidden || prefiereQuieto() ? "auto" : "smooth";
    const alto = el.getBoundingClientRect().top;
    if (caja && caja.scrollHeight > caja.clientHeight) caja.scrollTo({ top: caja.scrollTop + alto - caja.getBoundingClientRect().top - 8, behavior: suave });
    else window.scrollBy({ top: alto - 88, behavior: suave });
    if (window.matchMedia("(pointer: fine)").matches) el.querySelector<HTMLInputElement>("input.rc-celda:not(:disabled)")?.focus({ preventScroll: true });
    // Una sola vez, al llegar la tabla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El cursor va a la talla o al color que se acaba de sumar, para seguir escribiendo.
  const cursor = useRef<string | null>(null);
  useEffect(() => {
    if (!cursor.current) return;
    raiz.current?.querySelector<HTMLInputElement>(`input[${cursor.current}]:not(:disabled)`)?.focus();
    cursor.current = null;
  });

  function quitar(tipo: "talla" | "color", eje: Eje) {
    const r = tipo === "talla" ? quitarTalla(conteo, prenda, eje.clave) : quitarColor(conteo, prenda, eje.clave);
    const antes = borrador;
    onCambiar(tipo === "talla" ? { ...borrador, conteo: r.conteo, tallas: borrador.tallas.filter((t) => t !== eje.clave) } : { ...borrador, conteo: r.conteo, colores: borrador.colores.filter((c) => c !== eje.clave) });
    // Quitar no pregunta: si tenía cantidades, el aviso ofrece deshacerlo (se confirma solo lo que no se puede volver atrás).
    if (r.perdidas > 0) {
      avisar.exito(tipo === "talla" ? `Quitaste la talla ${eje.texto}` : `Quitaste ${eje.texto}`, {
        detalle: `${conMiles(r.perdidas)} ${r.perdidas === 1 ? "prenda" : "prendas"} por repartir otra vez.`,
        accion: { texto: "Deshacer", onClick: () => onCambiar(antes) },
      });
    }
  }

  function agregar(tipo: "talla" | "color", valor: string) {
    const clave = valor.slice(2);
    const lista = tipo === "talla" ? porAgregarTalla : porAgregarColor;
    const elegida = lista.find((x) => x.clave === clave);
    if (!elegida) return;
    if (elegida.crear) return onCrear(tipo === "talla" ? { tallaId: clave } : { colorCodigo: clave });
    onCambiar(tipo === "talla" ? { ...borrador, tallas: [...borrador.tallas, clave] } : { ...borrador, colores: [...borrador.colores, clave] });
    cursor.current = `data-${tipo}="${CSS.escape(clave)}"`;
  }

  const opciones = (lista: readonly { clave: string; texto: string; crear: boolean }[], nombre: string) =>
    lista.map((x) => ({ valor: `v:${x.clave}`, texto: x.texto, grupo: x.crear ? `${nombre} que se crean en la prenda` : `${nombre} de esta prenda` }));

  return (
    <div ref={raiz} className="rc-seccion" data-guia="recepcion.tallas">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="rc-seccion-titulo">
          Tallas y colores
          {!cuadra && <EtiquetaAhora />}
        </p>
        <button type="button" className="btn-cayla btn-enlace" onClick={onCambiarPrenda}>
          Cambiar de prenda
        </button>
      </div>

      <TablaDeTallas
        matriz={matriz}
        productoId={prenda.productoId}
        catalogo={coloresCatalogo}
        tallas={tallas}
        colores={colores}
        valores={conteo.cantidades}
        pregunta="Cuántas llegaron de"
        onValor={(id, texto) => onCambiar({ ...borrador, conteo: { ...conteo, cantidades: { ...conteo.cantidades, [id]: texto } } })}
        onQuitar={quitar}
        onCrear={onCrear}
      />

      <div className="rc-matriz-pie">
        <span className="rc-matriz-botones">
          {porAgregarColor.length > 0 && <Desplegable<string> forma="pildora" valor="" marcador="Agregar color" etiquetaAccesible="Agregar un color" opciones={opciones(porAgregarColor, "Colores")} onValor={(v) => agregar("color", v)} />}
          {porAgregarTalla.length > 0 && <Desplegable<string> forma="pildora" valor="" marcador="Agregar talla" etiquetaAccesible="Agregar una talla" opciones={opciones(porAgregarTalla, "Tallas")} onValor={(v) => agregar("talla", v)} />}
        </span>
        <span className="rc-matriz-total" data-tono={cuadra ? "verde" : "ambar"} aria-live="polite">
          {cuadre.texto} · <b>{conMiles(s.contado)}</b> de {conMiles(contadas)}
        </span>
      </div>
      {s.invalidas > 0 && <p className="text-sm text-ambar">Las cantidades son números enteros, de 0 a 9999.</p>}
      {(cuadre.estado === "faltan" || cuadre.estado === "sobran") && (
        <p className="text-sm text-taupe">
          {cuadre.estado === "faltan" ? "Lleva estas al stock, o sigue repartiendo." : "Se guarda cuando cuadre con lo contado."} Si en total llegaron {conMiles(s.contado)},{" "}
          <button type="button" className="btn-cayla btn-enlace" onClick={() => onDejarSuma(s.contado)}>
            corrige lo contado a {conMiles(s.contado)}
          </button>
        </p>
      )}

      <Danadas prenda={prenda} matriz={matriz} catalogo={coloresCatalogo} tallas={tallas} colores={colores} conteo={conteo} onConteo={(c) => onCambiar({ ...borrador, conteo: { ...conteo, ...c } })} />
    </div>
  );
}

/** Si hay más de una talla o color, cada uno se puede quitar; lo que no existe en la prenda sale con su «—», y tocarlo la crea. */
function TablaDeTallas({
  matriz,
  productoId,
  catalogo,
  tallas,
  colores,
  valores,
  pregunta,
  topes,
  onValor,
  onQuitar,
  onCrear,
}: {
  matriz: MatrizRecepcion;
  /** La prenda, para leer la foto de sus estampados. Sin ella, cada color lleva su punto. */
  productoId?: string;
  catalogo: readonly ColorAlta[];
  tallas: readonly Eje[];
  colores: readonly Eje[];
  valores: Readonly<Record<string, string>>;
  pregunta: string;
  /** En «dañadas»: lo que llegó de cada variante (una celda que pasa su tope se marca, y sin nada no se escribe). */
  topes?: Readonly<Record<string, number>>;
  onValor: (varianteId: string, texto: string) => void;
  onQuitar?: (tipo: "talla" | "color", eje: Eje) => void;
  onCrear?: (pedida: { tallaId?: string; colorCodigo?: string }) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const porCodigo = new Map(catalogo.map((c) => [c.codigo, c]));
  const fotosEstampado = useFotosDeEstampados(productoId, colores.map((c) => c.clave).filter((c) => { const color = porCodigo.get(c); return color ? esEstampado(color) : false; }));
  // La columna del color se fija solo si la tabla no cabe y hay que desplazarla.
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => el.toggleAttribute("data-desborda", el.scrollWidth > el.clientWidth + 1);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [tallas.length, colores.length]);
  const numero = (id: string) => leerCantidad(valores[id] ?? "") ?? 0;
  const conQuitar = !!onQuitar;
  return (
    <div ref={caja} className="rc-matriz-caja scroll-cayla">
      <table // unificar-fijo: la matriz talla por color de un modelo, no una lista de registros
        className="rc-tabla-tallas"
      >
        <thead>
          <tr>
            <th scope="col">Color</th>
            {tallas.map((t) => (
              <th key={t.clave} scope="col">
                <span className="rc-talla">
                  <span>{t.texto}</span>
                  {conQuitar && tallas.length > 1 && (
                    <button type="button" className="rc-talla-quitar" aria-label={`Quitar la talla ${t.texto}`} title={`Quitar la talla ${t.texto}`} onClick={() => onQuitar("talla", t)}>
                      <X aria-hidden className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </th>
            ))}
            <th scope="col">Total</th>
            {conQuitar && colores.length > 1 && (
              <th scope="col">
                <span className="sr-only">Quitar</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {colores.map((c) => {
            const codigo = c.clave === "" ? null : c.clave;
            const color = codigo ? porCodigo.get(codigo) : undefined;
            const total = tallas.reduce((a, t) => {
              const v = matriz.celda(t.clave === "" ? null : t.clave, codigo);
              return a + (v ? numero(v.id) : 0);
            }, 0);
            return (
              <tr key={c.clave}>
                <td>
                  <span className="rc-color">
                    {codigo && fotosEstampado.get(codigo) ? <CuadroEstampado fotoUrl={fotosEstampado.get(codigo)!} hex={color?.hex} className="h-8 w-8" /> : color && <Punto hex={color.hex} familia={color.familiaColor} tipo={color.tipo} />}
                    {c.texto}
                  </span>
                </td>
                {tallas.map((t) => {
                  const v = matriz.celda(t.clave === "" ? null : t.clave, codigo);
                  if (!v) {
                    return (
                      <td key={t.clave}>
                        {onCrear ? (
                          <button
                            type="button"
                            className="rc-celda-falta"
                            title={`La prenda no tiene ${c.texto} en talla ${t.texto}. Tócala para crearla.`}
                            aria-label={`Crear ${c.texto} en talla ${t.texto}`}
                            onClick={() => onCrear({ tallaId: t.clave || undefined, colorCodigo: codigo ?? undefined })}
                          >
                            —
                          </button>
                        ) : (
                          <span className="rc-celda-falta">—</span>
                        )}
                      </td>
                    );
                  }
                  const tope = topes?.[v.id];
                  const sinNada = topes !== undefined && (tope ?? 0) === 0;
                  const deMas = tope !== undefined && numero(v.id) > tope;
                  return (
                    <td key={v.id}>
                      <input // unificar-fijo: la celda de la matriz, sin los botones de sumar: aquí se reparte escribiendo y con Tab pasa a la siguiente
                        className="rc-celda"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={7}
                        autoComplete="off"
                        placeholder="0" // sugerir-fijo: una cantidad vacía es cero, sea la prenda que sea
                        data-talla={t.clave}
                        data-color={c.clave}
                        aria-label={`${pregunta} ${nombreDeVariante(v)}`}
                        aria-invalid={deMas || leerCantidad(valores[v.id] ?? "") === null || undefined}
                        disabled={sinNada}
                        value={valores[v.id] ?? ""}
                        onChange={(e) => onValor(v.id, limpiarCantidad(e.target.value))}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </td>
                  );
                })}
                <td className="rc-fila-total">{conMiles(total)}</td>
                {conQuitar && colores.length > 1 && (
                  <td>
                    <button type="button" className="icono-fila grid h-8 w-8 place-items-center" aria-label={`Quitar ${c.texto}`} title={`Quitar ${c.texto}`} onClick={() => onQuitar("color", c)}>
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {colores.length === 0 && (
            <tr>
              <td colSpan={tallas.length + 2} className="text-sm text-taupe">
                Agrega el primer color que llegó.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** «¿Llegó algo dañado?», plegado: cuántas de las contadas, en su talla y color, y si tienen arreglo. Las dañadas no se venden: entran a la cuarentena de la sede. */
function Danadas({
  prenda,
  matriz,
  catalogo,
  tallas,
  colores,
  conteo,
  onConteo,
}: {
  prenda: PrendaRecepcion;
  matriz: MatrizRecepcion;
  catalogo: readonly ColorAlta[];
  tallas: readonly Eje[];
  colores: readonly Eje[];
  conteo: Conteo;
  onConteo: (c: Partial<Conteo>) => void;
}) {
  const s = sumasDe(conteo, prenda);
  const topes: Record<string, number> = {};
  for (const v of prenda.variantes) topes[v.id] = leerCantidad(conteo.cantidades[v.id] ?? "") ?? 0;
  return (
    <div className="space-y-2" data-guia="recepcion.danadas-contar">
      <button
        type="button"
        aria-expanded={conteo.conDanadas}
        onClick={() => onConteo(conteo.conDanadas ? { conDanadas: false, danadas: {}, arreglo: null } : { conDanadas: true })}
        className="flex items-center gap-1.5 text-sm font-semibold text-tinta hover:text-rojo-profundo"
      >
        <ChevronDown aria-hidden className={`h-4 w-4 transition-transform duration-200 ease-cayla motion-reduce:transition-none ${conteo.conDanadas ? "rotate-180" : ""}`} />
        {conteo.conDanadas ? "Llegó algo dañado" : "¿Llegó algo dañado?"}
        {s.danadas > 0 && <span className="font-normal text-taupe">· {conMiles(s.danadas)}</span>}
      </button>
      {conteo.conDanadas && (
        <div className="anim-revelar space-y-2">
          <p className="text-sm text-taupe">De las que contaste arriba, en su talla y color.</p>
          <TablaDeTallas matriz={matriz} productoId={prenda.productoId} catalogo={catalogo} tallas={tallas} colores={colores} valores={conteo.danadas} pregunta="Cuántas llegaron dañadas de" topes={topes} onValor={(id, texto) => onConteo({ danadas: { ...conteo.danadas, [id]: texto } })} />
          {s.danadasDeMas.length > 0 && <p className="text-sm text-ambar">No puede haber más dañadas que las que llegaron de esa talla y color.</p>}
          {s.danadas > 0 && (
            <>
              <p className="text-sm font-semibold text-tinta">¿{s.danadas === 1 ? "Tiene" : "Tienen"} arreglo?</p>
              <ElegirOpcion etiqueta="¿Tienen arreglo?" opciones={SOLUCIONES_DANADA.map((o) => ({ valor: o.valor, texto: s.danadas === 1 ? o.textoUna : o.texto }))} valor={conteo.arreglo} onValor={(arreglo) => onConteo({ arreglo: arreglo as SolucionDanada })} />
              <p className="text-sm text-taupe">
                {conteo.arreglo ? SOLUCIONES_DANADA.find((o) => o.valor === conteo.arreglo)?.ayuda : "Las dañadas no se venden: entran a la cuarentena de la sede. Desde Existencias se arreglan, liquidan, regalan, desechan o devuelven."}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
