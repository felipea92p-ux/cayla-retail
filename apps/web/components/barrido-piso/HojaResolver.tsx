"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, Campo, CampoTexto, Desplegable } from "@/components/ui/campos";
import { ComboBuscable, type OpcionCombo } from "@/components/ui/ComboBuscable";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ElegirDueno } from "@/components/existencias/ElegirDueno";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { conDueno, faltaElegirDueno, hayQueElegirDueno } from "@/lib/dueno-reglas";
import { useEmpresasDeSede } from "@/lib/useEmpresasDeSede";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import {
  NOTA_MAXIMA_HALLAZGO,
  RPC_RESOLVER_PENDIENTE,
  camposGuiaResolver,
  detalleDePrenda,
  dondeEstaNoCargada,
  ejemploDeNotaResolver,
  leerPorResolver,
  opcionesDeResolver,
  textoDeComo,
  textoDeErrorResolver,
  type ApartadoPendiente,
  type ComoResolver,
  type NoCargadaPendiente,
  type PorResolver,
  type PrendaBarrido,
} from "@/lib/barrido-piso-reglas";

/* ====================================================================
   HojaResolver · cerrar lo que un barrido confirmado dejó «por resolver» (ADR-0690, actividad 8)

   Una NO CARGADA (se escaneó colgada pero el sistema no la tiene en la tienda) o algo APARTADO (sin etiqueta, o con un código que no
   existe). Tres salidas, y la base decide si se puede (`resolver_pendiente_barrido`):
     · «Ya está en el almacén» — llegó en un traslado ya recibido o la cargaron después: se baja al piso.
     · «La encontré: sumarla» — el sistema no la tiene: entra con «Encontré prendas» y queda en el piso. No se ofrece si viene en camino.
     · «No era de aquí» — se devolvió o era de otra persona: no mueve nada.
   Lo apartado dice además QUÉ prenda era (se busca por nombre o código). Se resuelve por partes: «Cuántas» va de 1 a lo que falta.
   El id se elige al abrir la hoja: tocar «Resolver» dos veces no lo hace dos veces.
   ==================================================================== */

export type QueSeResuelve = { tipo: "no_cargada"; n: NoCargadaPendiente } | { tipo: "apartado"; a: ApartadoPendiente; fotoUrl: string | null };

export function HojaResolver({
  ubicacionId,
  que,
  prendas,
  porId,
  firma,
  listo,
  onListo,
  onClose,
}: {
  ubicacionId: string;
  que: QueSeResuelve;
  prendas: PrendaBarrido[];
  porId: ReadonlyMap<string, PrendaBarrido>;
  firma: () => Firma | null;
  listo: boolean;
  /** Se resolvió: la lista nueva que devolvió la base. */
  onListo: (lista: PorResolver) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [id] = useState(() => crypto.randomUUID());
  const esApartado = que.tipo === "apartado";
  const maximo = esApartado ? que.a.pendientes : que.n.pendientes;
  const enCamino = esApartado ? 0 : que.n.enCamino;
  const [como, setComo] = useState<ComoResolver | "">("");
  const [varianteId, setVarianteId] = useState("");
  const [cantidad, setCantidad] = useState(maximo);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  // En Tienda LIM (dos empresas) lo que se baja o se suma dice de quién es, con un botón y sin respuesta de fábrica (ADR-0542).
  const empresas = useEmpresasDeSede(ubicacionId);
  const pideDueno = hayQueElegirDueno(empresas) && como !== "" && como !== "no_era";
  const [duenoId, setDuenoId] = useState("");
  const guia = useGuiaCampos(camposGuiaResolver({ esApartado, como, varianteId, pideDueno, duenoElegido: !faltaElegirDueno(empresas, duenoId) }));

  // El catálogo entero como opciones (se busca por nombre, talla, color o código). Solo lo apartado lo necesita.
  const opciones = useMemo<OpcionCombo<string>[]>(
    () => (esApartado ? prendas.map((p) => ({ valor: p.varianteId, texto: p.referencia, detalle: detalleDePrenda(p) || p.sku, claves: [p.sku, ...p.codigosBarras] })) : []),
    [esApartado, prendas]
  );
  const prenda = esApartado ? (varianteId ? porId.get(varianteId) : undefined) : porId.get(que.n.varianteId);

  async function resolver() {
    if (!listo) {
      setFallo("Elige quién eres arriba, en «Quién escanea», antes de resolver.");
      return;
    }
    if (!como) return;
    setGuardando(true);
    setFallo(null);
    const { data, error } = await firmar(
      conDueno(
        supabase.rpc(
        RPC_RESOLVER_PENDIENTE as never,
        {
          p_id: id,
          p_barrido_id: esApartado ? que.a.barridoId : que.n.barridoId,
          p_hallazgo_id: esApartado ? que.a.id : null,
          p_variante_id: esApartado ? (como === "no_era" ? null : varianteId || null) : que.n.varianteId,
          p_como: como,
          p_cantidad: cantidad,
          p_nota: nota.trim() || null,
        } as never
        ),
        pideDueno ? duenoId : null
      ),
      firma()
    );
    setGuardando(false);
    if (error) {
      setFallo(textoDeErrorResolver(error));
      return;
    }
    onListo(leerPorResolver(data));
    onClose();
  }

  const titulo = esApartado ? (que.a.tipo === "sin_etiqueta" ? "Prenda sin etiqueta" : "Código que no existe") : que.n.prenda;
  return (
    <Modal titulo={titulo} subtitulo={esApartado ? `Apartó ${que.a.por.split(" ")[0]}` : dondeEstaNoCargada(que.n)} tamano="angosta" onClose={onClose}>
      <form
        className="space-y-4"
        onKeyDown={enterNoGuarda}
        onSubmit={(e) => {
          e.preventDefault();
          void resolver();
        }}
      >
        <div className="vd-placa flex items-center gap-3 rounded-2xl p-3">
          {esApartado && que.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- un enlace firmado de 10 minutos del bucket privado, no una imagen del sitio
            <img src={que.fotoUrl} alt="La foto que se tomó al apartarla" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
          ) : (
            <MiniaturaPrenda fotoUrl={prenda?.fotoUrl ?? null} colorHex={prenda?.colorHex ?? null} tamano="xl" {...categoriaDe(prenda)} />
          )}
          <div className="min-w-0 flex-1">
            {esApartado ? (
              <>
                <p className="text-[15px] text-tinta">{que.a.nota ?? (que.a.codigo ? `Código ${que.a.codigo}` : "Sin etiqueta, con su foto")}</p>
                <p className="texto-detalle text-taupe">{que.a.pendientes === 1 ? "Falta 1" : `Faltan ${que.a.pendientes}`}</p>
              </>
            ) : (
              <>
                <p className="text-[15px] text-tinta">{prenda ? detalleDePrenda(prenda) || prenda.sku : que.n.prenda}</p>
                <p className="texto-detalle text-taupe">
                  {que.n.pendientes === 1 ? "1 colgada que el sistema no tiene aquí" : `${que.n.pendientes} colgadas que el sistema no tiene aquí`}
                </p>
              </>
            )}
          </div>
        </div>

        {enCamino > 0 && (
          <Aviso
            tono="info"
            titulo="Viene en un traslado"
            accion={
              <BotonVer href="/inventario/traslados" chico>
                Ir a Traslados
              </BotonVer>
            }
          >
            Recíbelo y después elige «Ya está en el almacén».
          </Aviso>
        )}

        <CampoGuiado id="como" guia={guia} titulo="Qué pasó">
          <Campo etiqueta="Qué pasó" etiquetaOculta pie={textoDeComo(como, enCamino) || undefined}>
            <Desplegable<ComoResolver | ""> valor={como} onValor={setComo} opciones={opcionesDeResolver(enCamino)} marcador="Elige" etiquetaAccesible="Qué pasó" />
          </Campo>
        </CampoGuiado>

        {esApartado && como !== "no_era" && (
          <CampoGuiado id="prenda" guia={guia} titulo="Qué prenda es">
            <Campo etiqueta="Qué prenda es" etiquetaOculta>
              <ComboBuscable valor={varianteId} onValor={setVarianteId} opciones={opciones} marcador="Nombre, talla o código" etiquetaAccesible="Qué prenda es" />
            </Campo>
          </CampoGuiado>
        )}

        {pideDueno && empresas && (
          <CampoGuiado id="dueno" guia={guia} titulo="De quién es">
            <ElegirDueno empresas={empresas} duenoId={duenoId} onElegir={setDuenoId} deshabilitado={guardando} guia="barrido.resolver-dueno" />
          </CampoGuiado>
        )}

        {maximo > 1 && (
          <Campo etiqueta="Cuántas">
            <PasoCantidad
              menos={{ onClick: () => setCantidad((n) => Math.max(1, n - 1)), deshabilitado: cantidad <= 1, etiqueta: "Una menos" }}
              mas={{ onClick: () => setCantidad((n) => Math.min(maximo, n + 1)), deshabilitado: cantidad >= maximo, etiqueta: "Una más" }}
            >
              {cantidad}
            </PasoCantidad>
          </Campo>
        )}

        <CampoTexto etiqueta="Nota (opcional)" value={nota} maxLength={NOTA_MAXIMA_HALLAZGO} onChange={(e) => setNota(e.target.value)} placeholder={ejemploDeNotaResolver(como)} />

        {fallo && <Aviso tono="error">{fallo}</Aviso>}
        <PieGuia guia={guia} listo="Listo para resolver." />
        <div className="pie-acciones pie-hoja-fijo">
          <Boton peso="fantasma" type="button" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton peso="primario" type="submit" cargando={guardando} textoCargando="Resolviendo…" confirma={guia}>
            Resolver {cantidad.toLocaleString("es-PE")}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
