"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Buscador } from "@/components/ui/Buscador";
import { Casilla as CasillaDeMarcar } from "@/components/ui/Casilla";
import { CampoMonto } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Casilla } from "@/components/ConfiguracionCasilla";
import { useLuzDelMouse } from "@/components/vitrinas-sedes/useLuzDelMouse";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { montoEscrito } from "@/lib/margen-a-la-vista";
import { soles } from "@/lib/compras-reglas";
import {
  leerReglas,
  MARGEN_BASE_RECOMENDADO,
  NOMBRE_RASGO,
  problemaDeReglas,
  RASGOS,
  rebajaQueAguanta,
  sugerirPrecio,
  type ItemDeLista,
  type ListasDePrecio,
  type Rasgo,
  type ReglasDePrecio,
} from "@/lib/margen-por-rasgos";

// Configuración ▸ Precios (ADR-0700, Felipe 2026-11-24; maqueta https://claude.ai/artifact/H769t9La8QMYkJEv4QZQUx): la base del margen (con
// la recomendada a la vista), el % que suma cada casilla y las dos listas (tejidos que se notan, marcas que el cliente conoce). Solo un Admin cambia algo; la base lo vuelve
// a exigir. Las casillas se guardan solas al salir, firmadas con el responsable, como en el resto de Configuración. «Así queda» muestra el
// efecto con un costo de ejemplo, con la misma cuenta que usará quien fija el precio.

const conVar = (x: Record<string, string | number>) => x as CSSProperties;

/** De dónde sale cada casilla, en una línea. */
const DE_DONDE: Readonly<Record<Rasgo, string>> = {
  nadie_la_tiene: "La marca quien compra.",
  en_tendencia: "La marca quien compra.",
  tela_que_se_nota: "Llega marcada por tu lista de tejidos.",
  marca_conocida: "Sale sola de tu lista de marcas.",
};

/** Los que se ven sin abrir la lista: los que más modelos llevan. */
const A_LA_VISTA = 12;


function AsiQueda({ reglas }: { reglas: ReglasDePrecio }) {
  const [costo, setCosto] = useState("30.90");
  const c = montoEscrito(costo);
  const filas: [string, Rasgo[]][] = [["Sin casillas", []], ...RASGOS.map((r): [string, Rasgo[]] => [`Solo «${NOMBRE_RASGO[r]}»`, [r]]), ["Con las cuatro", [...RASGOS]]];
  return (
    <section className="vs-liquido cv-bloque" data-luz data-guia="config.precios-ejemplo" style={conVar({ "--e": 1 })}>
      <TituloSeccion ayuda="Con un costo de ejemplo, el precio que se sugeriría y la rebaja que aguanta sin perder. No guarda nada.">Así queda</TituloSeccion>
      <div className="mt-3 max-w-[14rem]">
        <CampoMonto etiqueta="Lo que pagaste (ejemplo)" sinPie inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
      </div>
      <div className="cv-tarjetas una">
        {filas.map(([nombre, rasgos], i) => {
          const s = c !== null && c > 0 ? sugerirPrecio({ costo: c, reglas, rasgos }) : null;
          const aguanta = s ? rebajaQueAguanta(c!, s.precio) : null;
          return (
            <div key={nombre} className="cv-fila" style={conVar({ "--i": i })}>
              <span className="cv-fila-tx">
                <b>{nombre}</b>
                <span className="vs-rotulo">{s ? `Margen ${s.margen} % · aguanta hasta ${aguanta} % de rebaja` : "Escribe lo que pagaste"}</span>
              </span>
              <span className="font-display text-lg tabular-nums">{s ? soles(s.precio) : "—"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Lista({
  titulo,
  ayuda,
  guia,
  items,
  esAdmin,
  enCurso,
  alMarcar,
}: {
  titulo: string;
  ayuda: string;
  guia: string;
  items: ItemDeLista[];
  esAdmin: boolean;
  enCurso: string | null;
  alMarcar: (item: ItemDeLista) => void;
}) {
  const [busca, setBusca] = useState("");
  const [abierto, setAbierto] = useState(false);
  const filtrados = useMemo(() => {
    const q = busca.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
    return q ? items.filter((i) => i.nombre.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().includes(q)) : items;
  }, [busca, items]);
  const marcados = items.filter((i) => i.marcado).length;
  const fila = (item: ItemDeLista, i: number) => (
    <label key={item.id} className="cv-fila cursor-pointer" style={conVar({ "--i": i })}>
      <CasillaDeMarcar marcada={item.marcado} onCambio={() => alMarcar(item)} etiqueta={item.nombre} disabled={!esAdmin || enCurso === item.id} />
      <span className="cv-fila-tx">
        {/* Un nombre sin espacios (un código de marca) se parte en vez de empujar la pantalla de costado. */}
        <b className="[overflow-wrap:anywhere]">{item.nombre}</b>
        <span className="vs-rotulo">{item.modelos === 1 ? "1 modelo" : `${item.modelos} modelos`}</span>
      </span>
    </label>
  );
  const id = `cv-${guia.replace(".", "-")}-mas`;
  const resto = busca ? [] : filtrados.slice(A_LA_VISTA);
  return (
    <section className="vs-liquido cv-bloque" data-luz data-guia={guia} style={conVar({ "--e": 2 })}>
      <TituloSeccion cuenta={marcados} dato={`de ${items.length}`} ayuda={ayuda}>
        {titulo}
      </TituloSeccion>
      {items.length > 8 && (
        <div className="mt-3">
          <Buscador valor={busca} onCambio={setBusca} etiqueta={`Buscar en ${titulo.toLowerCase()}`} conteo={busca ? filtrados.length : undefined} />
        </div>
      )}
      <div className="cv-tarjetas">{(busca ? filtrados : filtrados.slice(0, A_LA_VISTA)).map(fila)}</div>
      {resto.length > 0 && (
        <>
          <FilasDeMas abierto={abierto} id={id}>
            <div className="cv-tarjetas">{resto.map(fila)}</div>
          </FilasDeMas>
          <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={`Ver ${resto.length} más`} controla={id} className="cv-ver-mas" />
        </>
      )}
    </section>
  );
}

export function VistaPrecios({
  reglas: reglasIniciales,
  registradoPor,
  listas: listasIniciales,
  esAdmin,
}: {
  reglas: ReglasDePrecio;
  registradoPor: string | null;
  listas: ListasDePrecio | null;
  esAdmin: boolean;
}) {
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  useLuzDelMouse(raiz);
  const responsable = useResponsable();
  const [reglas, setReglas] = useState(reglasIniciales);
  const [listas, setListas] = useState(listasIniciales);
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const listo = () => {
    if (responsable.listo) return true;
    avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
    return false;
  };

  /** Guarda la regla con un valor cambiado. Lo mal escrito se dice antes de ir a la base, con el mismo texto que la base. */
  const guardar = (aplicar: (r: ReglasDePrecio, n: number) => ReglasDePrecio, que: string) => async (tipeado: string) => {
    const n = Number(tipeado.trim().replace(/^\+/, "").replace(/\s*%$/, ""));
    if (!Number.isInteger(n)) {
      avisar.error(`${que}: escribe un número entero.`);
      return false;
    }
    const nueva = aplicar(reglas, n);
    const problema = problemaDeReglas(nueva);
    if (problema) {
      avisar.error(problema);
      return false;
    }
    if (!listo()) return false;
    const { data, error } = await firmar(
      createClient().rpc("guardar_reglas_de_precio" as never, { p_margen_base: nueva.margenBase, p_puntos: nueva.puntos } as never) as never,
      responsable.firma(),
    );
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, "guardar las reglas del precio"));
      return false;
    }
    setReglas(leerReglas(data));
    avisar.exito(`${que}: ${tipeado.trim()}.`);
    router.refresh();
    return true;
  };

  const marcar = (tipo: "tejidos" | "marcas") => async (item: ItemDeLista) => {
    if (!listas || !listo()) return;
    const valor = !item.marcado;
    const poner = (v: boolean) => setListas((l) => (l ? { ...l, [tipo]: l[tipo].map((i) => (i.id === item.id ? { ...i, marcado: v } : i)) } : l));
    poner(valor);
    setEnCurso(item.id);
    const rpc = tipo === "tejidos" ? "marcar_tejido_que_se_nota" : "marcar_marca_conocida";
    const args = tipo === "tejidos" ? { p_tejido_id: item.id, p_se_nota: valor } : { p_marca_id: item.id, p_conocida: valor };
    const { error } = await firmar(createClient().rpc(rpc as never, args as never) as never, responsable.firma());
    setEnCurso(null);
    responsable.despues(error as never);
    if (error) {
      poner(!valor);
      avisar.error(traducirError(error as never, "cambiar la lista"));
      return;
    }
    avisar.exito(`${item.nombre}: ${valor ? "entra a la lista" : "sale de la lista"}.`);
  };

  const tope = RASGOS.reduce((t, r) => t + reglas.puntos[r], reglas.margenBase);
  return (
    <div className="vs-raiz" ref={raiz}>
      {esAdmin ? (
        <div className="vs-firma" data-guia="config.guardado">
          <ComboResponsable control={responsable} />
        </div>
      ) : (
        <Aviso tono="info" titulo="Solo un Admin cambia los precios">
          Aquí ves con qué reglas se sugiere el precio de cada prenda.
        </Aviso>
      )}
      <div className="cv-dos">
        <section className="vs-liquido cv-bloque" data-luz data-guia="config.precios-regla" style={conVar({ "--e": 0 })}>
          <TituloSeccion
            dato={`${reglas.margenBase} % a ${tope} %`}
            ayuda={`El margen es lo que te queda del precio sin IGV, la misma cuenta de «Te quedan». Toda prenda pide la base; cada casilla que tiene le suma su %. Recomiendo una base de ${MARGEN_BASE_RECOMENDADO} %: con los gastos de octubre, Trujillo paga su propia tienda desde 37 %, y Arequipa, tienda y oficina, desde 36 %.${registradoPor ? ` Lo puso ${registradoPor}.` : ""}`}
          >
            El margen de cada prenda
          </TituloSeccion>
          <div className="cv-tarjetas una">
            <div className="cv-fila cv-tope">
              <span className="vs-textos">
                <span className="cv-frase">Margen base</span>
                <span className="vs-rotulo">
                  Recomendado: {MARGEN_BASE_RECOMENDADO} %.{" "}
                  {esAdmin && reglas.margenBase !== MARGEN_BASE_RECOMENDADO && (
                    <button
                      type="button"
                      className="btn-cayla btn-enlace"
                      data-guia="config.precios-recomendado"
                      onClick={() => void guardar((r, n) => ({ ...r, margenBase: n }), "Margen base")(String(MARGEN_BASE_RECOMENDADO))}
                    >
                      Usar {MARGEN_BASE_RECOMENDADO} %
                    </button>
                  )}
                </span>
              </span>
              {esAdmin ? (
                <Casilla valor={String(reglas.margenBase)} etiqueta="Margen base, en %" ancho="w-16" alGuardar={guardar((r, n) => ({ ...r, margenBase: n }), "Margen base")} />
              ) : (
                <b className="tabular-nums">{reglas.margenBase}</b>
              )}
              <span className="cv-unidad">%</span>
            </div>
            {RASGOS.map((rasgo, i) => (
              <div key={rasgo} className="cv-fila cv-tope" style={conVar({ "--i": i + 1 })}>
                <span className="vs-textos">
                  <span className="cv-frase">{NOMBRE_RASGO[rasgo]}</span>
                  <span className="vs-rotulo">{DE_DONDE[rasgo]}</span>
                </span>
                <span className="cv-unidad">+</span>
                {esAdmin ? (
                  <Casilla
                    valor={String(reglas.puntos[rasgo])}
                    etiqueta={`Cuánto % suma «${NOMBRE_RASGO[rasgo]}»`}
                    ancho="w-16"
                    alGuardar={guardar((r, n) => ({ ...r, puntos: { ...r.puntos, [rasgo]: n } }), NOMBRE_RASGO[rasgo])}
                  />
                ) : (
                  <b className="tabular-nums">{reglas.puntos[rasgo]}</b>
                )}
                <span className="cv-unidad">%</span>
              </div>
            ))}
          </div>
        </section>
        <AsiQueda reglas={reglas} />
      </div>
      {listas ? (
        <div className="cv-dos">
          <Lista
            titulo="Tejidos que se notan"
            ayuda="La prenda de un tejido de esta lista llega con «Tela que se nota» marcada. Quien compra puede quitarla en una prenda que no la merezca."
            guia="config.precios-tejidos"
            items={listas.tejidos}
            esAdmin={esAdmin}
            enCurso={enCurso}
            alMarcar={marcar("tejidos")}
          />
          <Lista
            titulo="Marcas que el cliente conoce"
            ayuda="La prenda de una marca de esta lista suma «Marca que el cliente conoce» sola. Están las marcas con algún modelo activo."
            guia="config.precios-marcas"
            items={listas.marcas}
            esAdmin={esAdmin}
            enCurso={enCurso}
            alMarcar={marcar("marcas")}
          />
        </div>
      ) : (
        <Aviso tono="error" titulo="No se pudieron leer los tejidos y las marcas">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      )}
    </div>
  );
}
