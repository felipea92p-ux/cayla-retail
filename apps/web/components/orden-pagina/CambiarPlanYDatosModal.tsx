"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto, Interruptor } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { traducirError } from "@/lib/error-escritura";
import { RPC_CAMBIAR_DATOS_ORDEN, RPC_CAMBIAR_PLAN_ORDEN, problemasDelPlan, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// Cambiar una orden abierta (ADR-0614, actividades 11 y 12; P-29 de Felipe: «cambiarlo con motivo», según lo avanzado). Dos hojas cortas: las cantidades por talla y color, que nunca bajan
// de lo ya cortado, y los datos de la orden, que solo informan. La base lo vuelve a exigir todo y deja cada cambio en la historia.

/** Las tiendas activas, para decir a dónde va una orden. Solo informa: lo que se traslada lo decide quien traslada. */
export function useTiendasDeDestino(): { valor: string; texto: string }[] {
  const [tiendas, setTiendas] = useState<{ valor: string; texto: string }[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await (createClient().from("ubicaciones").select("id, nombre").eq("tipo", "tienda").eq("activo", true).order("nombre") as unknown as PromiseLike<{ data: { id: string; nombre: string }[] | null }>);
      setTiendas((data ?? []).map((u) => ({ valor: u.id, texto: u.nombre })));
    })();
  }, []);
  return tiendas;
}

type FilaPlan = { varianteId: string; nombre: string; escrito: string; cortado: number; plan: number };

const leer = (t: string): number | null => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : null);

export function CambiarPlanModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const { orden, lineas, fases } = datos;
  const primera = fases.find((f) => !f.hito);
  const cortadoDe = (varianteId: string) => {
    const v = primera?.porVariante.find((x) => x.varianteId === varianteId);
    return v ? Math.max(v.hechas, v.salieron) : 0;
  };
  const [filas, setFilas] = useState<FilaPlan[]>(() =>
    lineas.map((l) => ({ varianteId: l.varianteId, nombre: [l.colorNombre, l.talla].filter(Boolean).join(" · ") || (l.codigo ?? "Prenda"), escrito: String(l.cantidadPlan), cortado: cortadoDe(l.varianteId), plan: l.cantidadPlan })),
  );
  const [otras, setOtras] = useState<{ id: string; nombre: string }[]>([]);
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const responsable = useResponsable({ ubicacionId: orden.ubicacionId, etiqueta: orden.ubicacionNombre });

  useEffect(() => {
    void (async () => {
      const { data } = await (createClient().from("variantes").select("id, talla:tallas ( valor ), color:colores ( nombre )").eq("producto_id", orden.producto.id).eq("activo", true) as unknown as PromiseLike<{ data: { id: string; talla: { valor: string } | null; color: { nombre: string } | null }[] | null }>);
      setOtras((data ?? []).map((v) => ({ id: v.id, nombre: [v.color?.nombre, v.talla?.valor].filter(Boolean).join(" · ") || "Prenda" })));
    })();
  }, [orden.producto.id]);

  const faltantes = useMemo(() => otras.filter((o) => !filas.some((f) => f.varianteId === o.id)).map((o) => ({ valor: o.id, texto: o.nombre })), [otras, filas]);
  const problemas = problemasDelPlan(filas.map((f) => ({ nombre: f.nombre, cantidad: leer(f.escrito), cortado: f.cortado })), motivo);
  const cambiadas = filas.filter((f) => leer(f.escrito) !== f.plan);
  const total = filas.reduce((s, f) => s + (leer(f.escrito) ?? 0), 0);
  const listo = problemas.length === 0 && cambiadas.length > 0 && responsable.listo;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo || enVuelo.current) return;
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      resultado = await firmar(
        createClient().rpc(RPC_CAMBIAR_PLAN_ORDEN as never, { p_produccion_id: orden.id, p_lineas: cambiadas.map((f) => ({ variante_id: f.varianteId, cantidad: leer(f.escrito) })), p_motivo: motivo.trim() } as never),
        responsable.firma(),
      );
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "cambiar las cantidades"));
      return;
    }
    avisar.exito(`Ahora son ${total} prendas`, { detalle: orden.numeroTexto });
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="Cambiar cantidades" subtitulo={`${orden.numeroTexto} · ${orden.producto.referencia} · hoy ${orden.cantidadPlan} prendas`} variante="hoja" tamano="mediana" onClose={onClose}>
      <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="mt-3.5 space-y-4">
        <ul className="space-y-2">
          {filas.map((f) => (
            <li key={f.varianteId} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3">
              <span className="min-w-0 text-sm text-tinta">
                {f.nombre}
                {f.cortado > 0 && <span className="block text-sm text-tinta/65">ya se cortaron {f.cortado}</span>}
              </span>
              <CampoTexto etiqueta="Cantidad" aria-label={`Cantidad de ${f.nombre}`} inputMode="numeric" value={f.escrito} onChange={(e) => setFilas((fs) => fs.map((x) => (x.varianteId === f.varianteId ? { ...x, escrito: e.target.value } : x)))} />
            </li>
          ))}
        </ul>
        {faltantes.length > 0 && (
          <CampoSelect
            etiqueta="Sumar otra talla o color"
            valor=""
            marcador="Elige cuál"
            onValor={(v) => {
              const o = otras.find((x) => x.id === v);
              if (o) setFilas((fs) => [...fs, { varianteId: o.id, nombre: o.nombre, escrito: "1", cortado: 0, plan: 0 }]);
            }}
            opciones={faltantes}
          />
        )}
        <CampoTexto etiqueta="Por qué cambia" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
        <p className="text-sm text-tinta/70">Quedan {total} prendas. Cambia la cantidad; la tela declarada se revisa aparte, en «Editar».</p>
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        {problemas.length > 0 && (
          <Aviso tono="atencion" chico>
            {problemas[0]}
          </Aviso>
        )}
        <PieAcciones className="pie-hoja-fijo">
          <Boton type="button" peso="fantasma" onClick={onClose} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} disabled={!listo}>
            Guardar
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}

export function CambiarDatosModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const { orden } = datos;
  const tiendas = useTiendasDeDestino();
  const [motivoOrden, setMotivoOrden] = useState<string>(orden.motivoOrden ?? "");
  const [tienda, setTienda] = useState(orden.tiendaDestinoId ?? "");
  const [urgente, setUrgente] = useState(orden.urgente);
  const [aprobo, setAprobo] = useState(orden.muestraAprobadaPor ?? "");
  const [cargando, setCargando] = useState(false);
  const responsable = useResponsable({ ubicacionId: orden.ubicacionId, etiqueta: orden.ubicacionNombre });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!responsable.listo || cargando) return;
    setCargando(true);
    const { error } = await firmar(
      createClient().rpc(RPC_CAMBIAR_DATOS_ORDEN as never, { p_produccion_id: orden.id, p_motivo_orden: motivoOrden || null, p_tienda_destino_id: tienda || null, p_urgente: urgente, p_muestra_aprobada_por: aprobo.trim() || null } as never),
      responsable.firma(),
    );
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "guardar los datos"));
      return;
    }
    avisar.exito("Datos de la orden guardados", { detalle: orden.numeroTexto });
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="Datos de la orden" subtitulo={`${orden.numeroTexto} · ${orden.producto.referencia}`} variante="hoja" tamano="mediana" onClose={onClose}>
      <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="mt-3.5 space-y-4">
        <CampoSelect etiqueta="¿Reposición o novedad?" valor={motivoOrden} onValor={setMotivoOrden} marcador="Sin decir" opciones={[{ valor: "reposicion", texto: "Reposición" }, { valor: "novedad", texto: "Novedad" }]} />
        <CampoSelect etiqueta="¿A qué tienda va?" pie="El traslado se decide después" valor={tienda} onValor={setTienda} marcador="Sin decir" opciones={tiendas} />
        <CampoTexto etiqueta="¿Quién aprobó la muestra?" value={aprobo} onChange={(e) => setAprobo(e.target.value)} maxLength={120} />
        <Interruptor etiqueta="Es urgente" activo={urgente} onActivo={setUrgente} pie="Solo se marca: no cambia el orden de nada." />
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <PieAcciones className="pie-hoja-fijo">
          <Boton type="button" peso="fantasma" onClick={onClose} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} disabled={!responsable.listo}>
            Guardar
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
