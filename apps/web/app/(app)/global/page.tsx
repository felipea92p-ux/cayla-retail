import Link from "next/link";
import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getCoberturaGlobal } from "@/lib/cayla-global";
import { getPreparacionMotor } from "@/lib/motor-demanda";
import { PreparacionMotor } from "@/components/motor-demanda/PreparacionMotor";
import { estadoDeCobertura, fechaCorta, resumenCobertura } from "@/lib/cayla-global-tablero";
import { NOMBRE_VISTA_GLOBAL } from "@/lib/vista-global";
import type { ClaveModulo } from "@/lib/modulos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Encabezado, Tabla, TABLA, celda, fila, type Columna } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";

// CAYLA Global ▸ Salud del negocio (ADR-0275, paso 1: la puerta). La pregunta de esta pantalla es «¿qué tan sano está
// CAYLA y qué decido?» (Felipe, 2026-09-28): los cuatro veredictos —crea valor, crece, es rentable, tiene caja—, las
// decisiones de la semana y cada negocio de CAYLA llegan cuando Felipe apruebe la maqueta
// (`docs/maquetas/cayla-global-2026-09/`). Mientras tanto dice lo primero que un tablero de toda la empresa tiene que
// decir: con qué datos cuenta —sede por sede, sin convertir «no opera en el ERP» en un cero— y dónde se ve ya CAYLA
// entera. Solo lee.

const PLANTILLA = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]";
const COLUMNAS: Columna[] = [
  { titulo: "Sede" },
  { titulo: "En el ERP" },
  { titulo: "Vende desde" },
  { titulo: "Ventas", subtitulo: "últimos 30 días", alinear: "der" },
  { titulo: "Unidades", subtitulo: "en stock hoy", alinear: "der" },
];

/** Dónde se ve ya CAYLA entera. Cada acceso sale si la cuenta ve su módulo (o, el panel comercial, si es líder). */
const ACCESOS: { modulo: ClaveModulo | "lider"; href: string; pregunta: string; donde: string }[] = [
  { modulo: "cuentas_dinero", href: "/finanzas/dinero", pregunta: "¿Cuánta plata tenemos?", donde: "Cuentas y efectivo de todas las sedes, y lo que se debe" },
  { modulo: "reportes_financieros", href: "/finanzas/resumen", pregunta: "¿Tiene caja? ¿Cada tienda cubre sus costos?", donde: "La caja de las próximas 6 semanas y lo que conviene decidir hoy" },
  { modulo: "reportes_financieros", href: "/finanzas/reportes", pregunta: "¿Ganamos este mes?", donde: "Estado de resultados de cada sede y de CAYLA entera" },
  { modulo: "lider", href: "/comercial", pregunta: "¿Cómo van las ventas?", donde: "Cada tienda contra su meta: hoy, en la semana y en el mes" },
  { modulo: "configuracion", href: "/configuracion", pregunta: "Metas y presupuesto", donde: "La meta de venta y el tope de gasto de cada tienda" },
  { modulo: "clientas", href: "/clientas", pregunta: "Clientes", donde: "Una sola lista para todas las sedes" },
];

const entero = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

export default async function SaludDelNegocioPage() {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("cayla_global");
  const [cobertura, motor] = await Promise.all([getCoberturaGlobal(), getPreparacionMotor()]);
  const resumen = resumenCobertura(cobertura.datos);
  const accesos = ACCESOS.filter((a) => (a.modulo === "lider" ? persona.rol === "lider" : veModulo(persona, a.modulo)));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={NOMBRE_VISTA_GLOBAL}
        titulo="Salud del negocio"
        subtitulo="Cómo está CAYLA como una sola empresa —las tiendas, el Taller y la empresa juntos— y qué conviene decidir."
      />

      {cobertura.falla ? (
        <p className="nota-cayla" role="alert">
          {cobertura.falla}. Las cifras de abajo no se muestran para no confundir un error con un cero.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <TarjetaCifra etiqueta="Sedes con datos en el ERP" valor={`${resumen.conDatos} de ${resumen.total}`}>
            {resumen.desde ? `Historia propia desde el ${fechaCorta(resumen.desde)}` : "Todavía ninguna venta en el ERP"}
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Ventas en 30 días" valor={entero.format(resumen.ventas30d)}>
            Todas las tiendas, sin anuladas ni de prueba
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Unidades en stock hoy" valor={entero.format(resumen.unidadesStock)}>
            Tiendas y Taller, en piso y almacén
          </TarjetaCifra>
        </div>
      )}

      {!cobertura.falla && (
        <section aria-labelledby="cobertura-titulo" className="space-y-3">
          <div>
            <h2 id="cobertura-titulo" className="font-display text-xl text-tinta">Con qué datos cuenta esta vista</h2>
            <p className="mt-1 text-sm text-tinta/75">
              Una sede que todavía no opera en el ERP dice eso, no «vendió cero»: sus cifras siguen en Alegra.
            </p>
          </div>
          <Tabla>
            <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
            {cobertura.datos.length === 0 ? (
              <p className={TABLA.vacio}>No hay sedes activas.</p>
            ) : (
              cobertura.datos.map((f) => {
                const estado = estadoDeCobertura(f);
                return (
                  <div key={f.ubicacionId} className={fila(PLANTILLA)} role="row">
                    <span className={celda("izq", "font-medium text-tinta")}>{f.nombre}</span>
                    <span className={celda()}>
                      <Chip tono={estado.tono}>{estado.texto}</Chip>
                    </span>
                    <span className={celda("izq", "text-tinta/75")}>
                      <span className="text-taupe sm:hidden">Vende desde </span>
                      {f.tipo === "tienda" ? fechaCorta(f.primeraVenta) : "No vende a clientes"}
                    </span>
                    <span className={celda("der")}>
                      <span className="text-taupe sm:hidden">Ventas en 30 días: </span>
                      {f.tipo === "tienda" && f.primeraVenta ? entero.format(f.ventas30d) : "—"}
                    </span>
                    <span className={celda("der")}>
                      <span className="text-taupe sm:hidden">Unidades en stock: </span>
                      {entero.format(f.unidadesStock)}
                    </span>
                  </div>
                );
              })
            )}
          </Tabla>
        </section>
      )}

      {/* Motor de demanda, etapa 0 (ADR-0346): antes de recomendar nada, si los datos de cada tienda ya dicen la verdad. */}
      <section aria-labelledby="motor-titulo" className="space-y-3">
        <div>
          <h2 id="motor-titulo" className="font-display text-xl text-tinta">¿El sistema ya puede recomendar?</h2>
          <p className="mt-1 text-sm text-tinta/75">
            Para sugerir qué colgar, trasladar, producir o comprar, cada tienda necesita tres cosas: que al menos 9 de cada 10
            prendas vendidas se registren con su prenda durante 14 días seguidos, el piso cuadrado y el almacén contado.
          </p>
        </div>
        {motor.falla ? (
          <p className="nota-cayla" role="alert">
            {motor.falla}. Vuelve a intentarlo en un momento.
          </p>
        ) : (
          <PreparacionMotor sedes={motor.sedes} />
        )}
      </section>

      {accesos.length > 0 && (
        <section aria-labelledby="accesos-titulo" className="space-y-3">
          <h2 id="accesos-titulo" className="font-display text-xl text-tinta">Lo que ya puedes ver de toda CAYLA</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accesos.map((a) => (
              <Link key={a.href} href={a.href} className="card-cayla alza-cayla block p-5 hover:bg-sand/30">
                <span className="block font-display text-lg text-tinta">{a.pregunta}</span>
                <span className="mt-1 block text-sm text-tinta/75">{a.donde}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="nota-cayla">
        Pronto en esta pantalla: los cuatro veredictos —¿crea valor?, ¿crece?, ¿es rentable?, ¿tiene caja?—, las decisiones
        de la semana con su botón (trasladar, pedir al Taller, mover dinero, ajustar metas) y cada negocio de CAYLA con lo
        que rinde su capital. Crecer y crear valor necesitan 12 meses de historia: se traerán de Alegra como totales
        mensuales por sede.
      </p>
    </div>
  );
}
