import { DevolverFondo, EntregarFondo, PagarDeudaFondo } from "@/components/fondos/AccionesFondos";
import { BandejaRevisar } from "@/components/mi-plata/BandejaRevisar";
import { CerrarRonda } from "@/components/compras/CerrarRonda";
import { DetalleComprador } from "@/components/compras/DetalleComprador";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCompradores, getCompradoresSinRonda } from "@/lib/compradores";
import { getDatosFondos } from "@/lib/fondos";
import { getPlataPorConfirmar } from "@/lib/mi-plata";
import { getRevisarCompras } from "@/lib/revisar-compras";
import { faltaPagarDeCompra, lineasDeCuenta, porRevisarDeRonda, puedeCerrarseDesdeCompras } from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { tramoDeUrl } from "@/lib/rendimiento-vista-reglas";
import { primerNombre, topeDevolucion } from "@/lib/fondos-reglas";
import { estadoPorFondo } from "@/lib/rendicion-reglas";
import { deudasPorPersona } from "@/lib/deuda-fondo-reglas";
import { hoyLima } from "@/lib/fechas-lima";

// Compras ▸ Compradores ▸ una persona (ADR-0704, act. d): su resumen, su estado de cuenta por fechas y, debajo, lo que espera revisión. Lo que se revisa es la
// bandeja de siempre (`BandejaRevisar`: confirmar su plata, completar el papel, revisar un gasto, recibir su cierre), filtrada a esta persona:
// reemplaza a la pestaña «Revisar compras», donde se mezclaba lo de todas. El layout de Compradores ya pidió el módulo «fondos».

export default async function CompradorPage({ params, searchParams }: { params: Promise<{ personaId: string }>; searchParams: Promise<{ vista?: string; desde?: string; hasta?: string }> }) {
  const [{ personaId }, periodo] = await Promise.all([params, searchParams]);
  const hoy = hoyLima();
  // El período del estado de cuenta va en la URL, con las reglas del control de Rendimiento (Hoy, 7 días, Este mes o un rango de hasta 30 días).
  const tramo = tramoDeUrl(periodo, hoy);
  const [yo, rondas, sinRonda, datos, plata, revisar] = await Promise.all([
    requirePersonaActualV2(),
    getCompradores(),
    getCompradoresSinRonda(),
    getDatosFondos(),
    getPlataPorConfirmar(),
    getRevisarCompras(),
  ]);
  const suyas = (rondas ?? []).filter((r) => r.personaId === personaId);
  // Su ronda abierta manda el resumen; el estado de cuenta junta las compras de todas sus rondas y se mira por fechas.
  const ronda = suyas.find((r) => r.cerradaEn === null) ?? null;
  // Un id que no es de nadie (o mal escrito) no inventa un nombre: la vista dice que no encontró a la persona (/chaos 2026-11-26, NAV-07).
  const nombreCompleto = suyas[0]?.persona ?? sinRonda?.find((p) => p.personaId === personaId)?.persona ?? datos.fondos.find((f) => f.personaId === personaId)?.persona ?? null;
  const nombre = nombreCompleto ? primerNombre(nombreCompleto) : null;

  // Lo suyo de la bandeja de Revisar compras: la plata que anotó, sus compras por completar, sus gastos y su cierre por recibir.
  const deEl = <T extends { personaId: string }>(xs: readonly T[] | undefined) => (xs ?? []).filter((x) => x.personaId === personaId);
  const suPlata = deEl(plata ?? undefined);
  const susPapeles = deEl(revisar?.papeles);
  const susGastos = deEl(revisar?.gastos);
  const susCierres = deEl(revisar?.cierres);
  const hayQueRevisar = suPlata.length + susPapeles.length + susGastos.length + susCierres.length > 0;

  const tiene = Object.fromEntries(datos.fondos.map((f) => [f.personaId, Math.max(f.saldo, 0)]));
  // Lo que se hacía desde «Quién tiene plata» con la fila de esta persona (antes `compras/fondos`): registrar lo que devuelve y lo que paga de
  // una deuda por faltante. Con su propio fondo no se ofrece nada: la base tampoco lo deja.
  const fondo = datos.fondos.find((f) => f.personaId === personaId);
  const rinde = fondo ? estadoPorFondo(datos.rendiciones).get(fondo.cuentaId)?.porAprobar : undefined;
  const deuda = deudasPorPersona(datos.deudas).get(personaId);
  const susMovimientos = datos.movimientos.filter((m) => m.personaId === personaId);
  const acciones = datos.falla ? undefined : (
    <>
      {fondo && !fondo.esMio && topeDevolucion(fondo.saldo, rinde?.faltante).monto > 0.005 && (
        <DevolverFondo fondo={fondo} cuentas={datos.opciones.cuentas} porAprobar={rinde?.faltante ?? 0} />
      )}
      {fondo && !fondo.esMio && deuda && deuda.debe > 0.005 && <PagarDeudaFondo deuda={deuda} cuentas={datos.opciones.cuentas} />}
      <EntregarFondo opciones={datos.opciones} tiene={tiene} />
    </>
  );
  const pendiente = {
    porRevisar: suyas.reduce((a, r) => a + porRevisarDeRonda(r), 0),
    faltaPagar: suyas.flatMap((r) => r.compras).reduce((a, c) => a + faltaPagarDeCompra(c), 0),
  };
  return (
    <DetalleComprador
      nombre={nombre}
      ronda={ronda}
      lineas={lineasDeCuenta(suyas, susMovimientos, tramo, soles)}
      tramo={tramo}
      hoy={hoy}
      pendiente={pendiente}
      tieneSinRonda={sinRonda?.find((p) => p.personaId === personaId)?.tiene}
      acciones={acciones}
      cerrarRonda={ronda && nombre && puedeCerrarseDesdeCompras(ronda) ? <CerrarRonda rondaId={ronda.id} nombre={nombre} /> : undefined}
      bandeja={
        hayQueRevisar ? (
          <BandejaRevisar
            plata={suPlata}
            papeles={susPapeles}
            gastos={susGastos}
            cierres={susCierres}
            proveedores={revisar?.proveedores ?? []}
            cuentas={datos.opciones.cuentas}
            esLider={yo.rol === "lider"}
          />
        ) : null
      }
    />
  );
}
