"use client";

import { usePrendasCreadas } from "@/components/recepcion-envio/usePrendasCreadas";
import { productosDelEnvio } from "@/lib/recepcion-igual-que-anterior";
import { LoQueEntro } from "./LoQueEntro";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";
import { AvisoRecibido } from "./AvisoRecibido";
import { ArrowDownToLine, Layers, ListChecks, Sparkles } from "lucide-react";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { diaYHoraLima } from "@/lib/fechas-lima";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buenasDeRecibidos, CAUSAS_FALTANTE, CAUSAS_SOBRANTE, VALOR_OTRO, despuesDeRecibirEnvio, textoCausa, type CatalogoParaRecibir, type DetalleEnvio, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import { unirConY } from "@/lib/precio-sede-reglas";
import { BOTON_DE_PENDIENTE, cifrasDelEnvio, lineaDelAviso, loQueEntroPorPrenda, noCuadroAgrupado, paraDespues, urlEtiquetasDeLoQueEntro, proveedoresDeLasLineas, textoNoSeReabre, veredictoDelCerrado, type ConteosDelEnvio, type LineaParaContar, type ParaDespues } from "@/lib/recepcion-conteo-reglas";
import { HacerAhora } from "./HacerAhora";
import { Lacre } from "./Lacre";
import { Odometro } from "./Odometro";
import { ReabrirEnvio } from "./ReabrirEnvio";

// El envío cerrado (ADR-0393): lo contado ya es oficial. Liviano desde el 2026-11-16 (Felipe: «hay tanta información que ver»): la tarjeta del lacre dice
// cómo llegó en una línea, lo que no cuadró (agrupado por respuesta, con su nota) y lo que queda para después con su «Hacer ahora» (decisión 3: lo hace
// cualquiera que tenga Recibir), y lo que sigue: imprimir y bajar al piso. «Reabrir» (decisión 5) va en «Más»; el rastro de cierres, en su hoja. Al cerrar
// en esta pantalla, el aviso «ENV-… recibido» deja elegir qué hacer (`AvisoRecibido`).

/** Qué pasa después con lo que no cuadró (la misma ayuda que se lee al elegir la causa). «Otro» de más no tiene una; «Otro» de menos lo asume CAYLA (2026-11-16). */
function consecuencia(causa: string, tipo: "faltante" | "sobrante"): string | null {
  if (causa === VALOR_OTRO) return tipo === "faltante" ? "Lo asume CAYLA" : null;
  return [...CAUSAS_FALTANTE, ...CAUSAS_SOBRANTE].find((c) => c.valor === causa)?.ayuda.replace(/\.$/, "") ?? null;
}

export function EnvioCerrado({
  detalle,
  lineas,
  conteos,
  catalogo,
  lotes,
  veExistencias,
  responsable,
  prendas,
  soloSede = false,
  sinAviso = false,
  veDinero = true,
  onPrendaVista,
  onCambio,
  onReabierto,
  recienCerrado = false,
}: {
  detalle: DetalleEnvio;
  lineas: readonly LineaParaContar[];
  conteos: ConteosDelEnvio | null;
  catalogo: CatalogoParaRecibir | null;
  lotes: string[];
  veExistencias: boolean;
  responsable: ControlResponsable;
  prendas: ReadonlyMap<string, PrendaRecepcion>;
  /** Una terminal (ADR-0531): el precio de venta vale solo en su sede; no se ofrece «Todas las sedes». */
  soloSede?: boolean;
  /** Llegó sin aviso y quien ve el dinero de Compras: de ellos depende quién escribe el costo de lo de fuera de la guía (`HacerAhora`). */
  sinAviso?: boolean;
  veDinero?: boolean;
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  onCambio: () => void;
  onReabierto: () => void;
  /** Se acaba de cerrar en esta pantalla: se abre el aviso «ENV-… recibido» (Felipe 2026-11-16). Al volver a entrar a un envío ya cerrado, no. */
  recienCerrado?: boolean;
}) {
  const [haciendo, setHaciendo] = useState<ParaDespues | null>(null);
  // «Igual que la anterior» también en «Crear ahora» (innovar `recibir-crear-prenda#1`): las prendas del envío creadas al recibirlo.
  const creadas = usePrendasCreadas(productosDelEnvio(lineas), detalle.abiertoEn);
  // Al pasar un modelo a su categoría cambia de línea: se relee el envío y, cuando la lista ya lo trae en la línea nueva, se sigue con él. `crear`: la persona pidió crearla.
  // En una línea del aviso el modelo no cambia de línea: cambia la línea misma, así que también se sigue cuando su categoría o su marca ya no son las de antes (`huellaAntes`).
  const [seguir, setSeguir] = useState<{ pendienteId: string; lineaAntes: string; huellaAntes: string; crear: boolean } | null>(null);
  const [creando, setCreando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const cifras = cifrasDelEnvio(lineas);
  const lista = paraDespues(lineas);
  const huellaDe = (clave: string) => {
    const l = lineas.find((x) => x.clave === clave);
    return `${l?.categoria?.id ?? ""}|${l?.marca?.id ?? ""}`;
  };
  const movido = seguir
    ? lista.find((p) => p.tipo !== "separar" && p.pendiente.id === seguir.pendienteId && (p.linea !== seguir.lineaAntes || huellaDe(p.linea) !== seguir.huellaAntes))
    : undefined;
  if (seguir && movido) {
    setSeguir(null);
    setCreando(seguir.crear);
    setHaciendo(movido);
  }
  // Qué dice el envío sobre el stock: listas para etiquetar o, si nada entró, por qué y qué lo resuelve (formidable 2026-10-13, cambio 1).
  const veredicto = veredictoDelCerrado(lineas, lista);
  const buenas = buenasDeRecibidos(detalle.recibidos);
  const bajar = despuesDeRecibirEnvio({ lotes, envioId: detalle.id, buenas, unidades: cifras.enStock, unidadesBuenas: buenas.reduce((a, b) => a + b.cantidad, 0), veExistencias }).find(
    (a) => a.clave === "bajar",
  );
  const noCuadro = noCuadroAgrupado(detalle.diferencias ?? [], lineas);
  const router = useRouter();
  const [aviso, setAviso] = useState(recienCerrado);
  const sumaDe = (tipo: "faltante" | "sobrante") => noCuadro.filter((g) => g.tipo === tipo).reduce((a, g) => a + g.cantidad, 0);
  const sobran = sumaDe("sobrante");
  const faltan = sumaDe("faltante");
  const lineaAviso = lineaDelAviso({ alAlmacen: cifras.enStock, paraDespues: cifras.porDetallar, sobran, faltan, conGuia: cifras.dijeron != null });
  const queEntro = loQueEntroPorPrenda(detalle.recibidos);
  // De cuáles imprimir: todo lo que entró, salvo lo que se saque con «Más → Elegir de cuáles imprimir». Un solo botón de imprimir, arriba.
  const [elegir, setElegir] = useState(false);
  const [fuera, setFuera] = useState<ReadonlySet<string>>(new Set());
  const imprimirTodo = urlEtiquetasDeLoQueEntro(detalle.id, queEntro, new Set(queEntro.flatMap((p) => p.combinaciones.map((c) => c.varianteId)).filter((id) => !fuera.has(id))));
  const cuando = detalle.cerradoEn ? diaYHoraLima(detalle.cerradoEn) : null;
  const reabrir = conteos?.reabrir ?? null;
  // La insignia: lo que no cuadró manda; si no, lo que quedó para después; con guía y todo en orden, «Completo». Sin guía no hay con qué compararse.
  const insignia = noCuadro.length > 0 ? { tono: "ambar" as const, texto: "Con diferencias" } : lista.length > 0 ? { tono: "ambar" as const, texto: "Con pendientes" } : cifras.dijeron != null ? { tono: "verde" as const, texto: "Completo" } : null;
  const mas: ItemMenu[] = [
    ...(queEntro.length > 0 && !elegir
      ? [
          {
            clave: "elegir",
            etiqueta: "Elegir de cuáles imprimir",
            onSelect: () => {
              setElegir(true);
              requestAnimationFrame(() => document.getElementById("rc-que-entro")?.scrollIntoView({ block: "start", behavior: "smooth" }));
            },
          },
        ]
      : []),
    { clave: "reabrir", etiqueta: "Reabrir el conteo", onSelect: () => setReabriendo(true), motivo: reabrir?.sePuede === false ? textoNoSeReabre(reabrir.porQueNo) : undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Lo recibido, liviano (Felipe 2026-11-16: «hay tanta información que ver»; maqueta `docs/maquetas/recibir-cierre-recibo-2026-11/`, «A · Lo recibido,
          liviano»): la tarjeta del lacre dice cómo llegó en una línea, lo que no cuadró y lo que queda para después en una fila cada uno, y lo que sigue
          (imprimir, bajar al piso). Reabrir va en «Más»; lo que entró, plegado abajo. Antes eran seis bloques: cuatro cifras, la lista de casillas,
          «Para después», «Lo que no cuadró», «¿Encontraste algo más?» y dos botones más. */}
      <section data-guia="recepcion.cerrado" className="rc-lacre" aria-label="Envío cerrado">
        <Lacre />
        <p className="label-cayla pr-24 text-[11px] text-taupe">
          Envío cerrado{cuando ? ` · ${cuando.dia} ${cuando.hora}` : ""}
          {detalle.cerradoPor ? ` · ${detalle.cerradoPor}` : ""}
        </p>
        <h2 className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pr-24 font-display text-[34px] leading-tight text-tinta">
          {detalle.numero} recibido
          {insignia && <Chip tono={insignia.tono}>{insignia.texto}</Chip>}
        </h2>
        <p className="rc-cerrado-cifras">
          {cifras.dijeron != null && (
            <span>
              <b><Odometro valor={cifras.dijeron} entra /></b>
              esperadas
            </span>
          )}
          <span>
            <b><Odometro valor={cifras.contadas} entra /></b>
            {cifras.contadas === 1 ? "llegó" : "llegaron"}
          </span>
          {sobran > 0 && (
            <span>
              <b data-tono="ambar">+<Odometro valor={sobran} entra /></b>
              de más
            </span>
          )}
          {faltan > 0 && (
            <span>
              <b data-tono="ambar">−<Odometro valor={faltan} entra /></b>
              {faltan === 1 ? "falta" : "faltan"}
            </span>
          )}
        </p>
        {cifras.enStock === 0 && <p className="text-sm text-taupe">{veredicto.texto}</p>}
        {(noCuadro.length > 0 || lista.length > 0) && (
          <ul className="space-y-2" aria-label="Lo que no cuadró y lo que queda para después" data-guia={lista.length > 0 ? "recepcion.para-despues" : undefined}>
            {noCuadro.map((g, i) => (
              <li key={`nc-${i}`} className="rc-cerrado-fila">
                <b className="rc-cerrado-cifra" data-tono="ambar">
                  {g.tipo === "faltante" ? "−" : "+"}
                  {g.cantidad.toLocaleString("es-PE")}
                </b>
                <span className="min-w-0 flex-1 text-sm text-tinta">
                  <b className="font-semibold">{unirConY(g.que)}</b>
                  {g.causa ? ` · ${textoCausa(g.causa)}` : ""}
                  {g.nota ? <i> · «{g.nota}»</i> : null}
                  {g.causa && consecuencia(g.causa, g.tipo) ? <span className="block text-taupe">{consecuencia(g.causa, g.tipo)}</span> : null}
                </span>
              </li>
            ))}
            {lista.map((p, i) => (
              <li key={`${p.tipo}-${p.linea}-${i}`} className="rc-cerrado-fila" data-tipo={p.tipo}>
                <span aria-hidden className="rc-cat-ic" data-tamano="chico">
                  {p.tipo === "separar" ? <Layers className="h-4 w-4" /> : p.tipo === "detalle" ? <ListChecks className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <b className="block font-semibold text-tinta">{p.titulo}</b>
                  <span className="block text-taupe">{p.sub}</span>
                </span>
                <Boton type="button" peso="fantasma" onClick={() => setHaciendo(p)}>
                  {BOTON_DE_PENDIENTE[p.tipo]}
                </Boton>
              </li>
            ))}
          </ul>
        )}
        <div data-guia="recepcion.despues" className="flex flex-wrap items-center gap-2.5">
          {imprimirTodo ? (
            <BotonImprimir href={imprimirTodo.href} peso="primario">
              {`Imprimir ${imprimirTodo.etiquetas.toLocaleString("es-PE")} ${imprimirTodo.etiquetas === 1 ? "etiqueta" : "etiquetas"}`}
            </BotonImprimir>
          ) : queEntro.length > 0 ? (
            <p className="text-sm text-taupe">Marca de qué prendas quieres la etiqueta.</p>
          ) : veredicto.accion && lista.length > 0 ? (
            <Boton type="button" peso="primario" onClick={() => setHaciendo(lista[0])}>
              {veredicto.accion}
            </Boton>
          ) : null}
          {bajar && (
            <BotonEnlace href={bajar.href} peso="fantasma">
              <span className="inline-flex items-center gap-2">
                <ArrowDownToLine aria-hidden className="h-4 w-4" />
                {bajar.texto}
              </span>
            </BotonEnlace>
          )}
          <MenuAcciones etiqueta="Más acciones del envío" texto="Más" items={mas} guia="recepcion.reabrir" />
        </div>
      </section>

      {queEntro.length > 0 && (
        <section id="rc-que-entro" className="card-cayla scroll-mt-28 space-y-3 p-4 sm:p-5" aria-label="Qué entró">
          <TituloSeccion cuenta={queEntro.length}>Qué entró</TituloSeccion>
          <LoQueEntro
            prendas={queEntro}
            elegir={elegir}
            fuera={fuera}
            onCambiar={(ids, imprimir) =>
              setFuera((f) => {
                const n = new Set(f);
                for (const id of ids) {
                  if (imprimir) n.delete(id);
                  else n.add(id);
                }
                return n;
              })
            }
            onListo={() => setElegir(false)}
          />
        </section>
      )}

      {haciendo && (
        <HacerAhora
          detalle={detalle}
          item={haciendo}
          linea={lineas.find((l) => l.clave === haciendo.linea) ?? null}
          empezarCreando={creando}
          catalogo={catalogo}
          responsable={responsable}
          prendas={prendas}
          anteriorDe={creadas.anteriorDe}
          onRecordar={creadas.recordar}
          soloSede={soloSede}
          sinAviso={sinAviso}
          nProveedores={proveedoresDeLasLineas(lineas)}
          veDinero={veDinero}
          onPrendaVista={onPrendaVista}
          onCategoriaCambiada={(crear) => {
            if (haciendo.tipo === "separar") return;
            setSeguir({ pendienteId: haciendo.pendiente.id, lineaAntes: haciendo.linea, huellaAntes: huellaDe(haciendo.linea), crear });
            setCreando(false);
            setHaciendo(null);
            onCambio();
          }}
          onListo={() => {
            setCreando(false);
            setHaciendo(null);
            onCambio();
          }}
          // La prenda de un «crear» ya existe aunque no se hayan metido sus tallas: «Para después» se relee para decirlo.
          onCerrar={(huboCambio) => {
            setCreando(false);
            setHaciendo(null);
            if (huboCambio) onCambio();
          }}
        />
      )}

      {aviso && (
        <AvisoRecibido
          numero={detalle.numero}
          linea={lineaAviso}
          imprimir={imprimirTodo}
          onVer={() => setAviso(false)}
          onVolver={() => {
            setAviso(false);
            router.push("/recibir");
            // En la lista, un aviso de 7 s con «Ver» por si quería volver a lo recibido (ADR-0146: con acción, 7 s como mínimo).
            avisar.exito(`${detalle.numero} recibido`, { detalle: lineaAviso, accion: { texto: "Ver", onClick: () => router.push(`/recibir/envio/${detalle.id}`) }, duracion: 7000 });
          }}
        />
      )}

      {reabriendo && (
        <ReabrirEnvio
          cierres={conteos?.cierres ?? []}
          detalle={detalle}
          responsable={responsable}
          onReabierto={() => {
            setReabriendo(false);
            onReabierto();
          }}
          onCerrar={() => setReabriendo(false)}
        />
      )}
    </div>
  );
}
