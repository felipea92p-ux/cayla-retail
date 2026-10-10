import { exigirModulo } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getPlazosColaArranque, getPorRegularizar } from "@/lib/por-regularizar";
import { getDisponiblePorSede } from "@/lib/por-regularizar-stock";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { armarListasPrendaLibre, leerListasPrendaLibre } from "@/lib/prenda-sin-registrar-listas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { PorRegularizarLista } from "@/components/PorRegularizarLista";

// Ventas sin registrar (ADR-0179), en Existencias desde el 2026-10-04 (ADR-0330): prendas que caja vendió antes de estar en el
// sistema. Hasta hoy eran la tercera pestaña de Recibir mercadería, que es de lo que LLEGA; esto es una diferencia de stock que deja
// Vender, y quien cuida el stock la ve desde Existencias. La lista (`PorRegularizarLista`) y la función (`regularizar_prenda`) no
// cambian: solo cambió dónde viven. `/recibir?vista=por-regularizar` redirige aquí.
export default async function PorRegularizarPage({ searchParams }: { searchParams: Promise<{ ubicacion?: string; item?: string }> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("existencias");
  const esLider = persona.rol === "lider";
  const { ubicacion, item } = await searchParams;
  // El líder ve las de todas sus sedes (cada fila dice cuál); los demás, las de la suya (RLS igual lo cuida). Un líder que llega desde
  // «Para hoy» de Existencias trae la sede (`?ubicacion=`, ADR-0331): ve la cola de ESA sede, la misma que contó allá
  // (`contarPorRegularizar`). Una sede que no existe se ignora y vuelve a «todas».
  // Si la lista de sedes no responde, la página no se cae: muestra todas, como antes de traer la sede.
  const ubicaciones = esLider && ubicacion ? await getUbicaciones().catch(() => []) : [];
  const unaSede = ubicaciones.find((u) => u.id === ubicacion) ?? null;
  // Los plazos del cierre de arranque (ADR-0334) solo los necesita el líder: es quien cierra. Sin ellos la pantalla sigue entera.
  // Las listas de la hoja con que caja anota la prenda: «Corregir lo anotado» (ADR-0369) usa la misma.
  const [filas, catalogo, plazos, listasLeidas] = await Promise.all([
    getPorRegularizar(esLider ? (unaSede?.id ?? null) : persona.ubicacionId),
    getCatalogo(),
    esLider ? getPlazosColaArranque() : Promise.resolve({} as Record<string, string>),
    leerListasPrendaLibre(),
  ]);
  // Cuántas unidades libres hay de cada prenda en la tienda de cada venta pendiente (para «3 en TRU» y la sugerida). Es lo accesorio:
  // si no se puede leer, la pantalla sigue y se regulariza igual (`getDisponiblePorSede` nunca lanza).
  const disponibles = await getDisponiblePorSede(filas.filter((f) => f.estado === "pendiente").map((f) => f.ubicacionId));
  const etiqueta = esLider ? (unaSede?.nombre ?? "tus tiendas") : persona.ubicacionEtiqueta;
  // De vuelta a Existencias en la misma sede que se miraba (la de la cabecera no necesita el parámetro).
  const volverA = unaSede && unaSede.id !== persona.ubicacionId ? `/inventario?ubicacion=${unaSede.id}` : "/inventario";
  // Solo lo que almacén necesita para reconocer la prenda: el costo no sale del servidor.
  const prendas = catalogo
    .filter((v) => v.activo && v.varianteId !== ID_CARGO_ESPECIAL)
    .map((v) => ({
      id: v.varianteId,
      nombre: v.referencia,
      codigo: v.codigo ?? v.sku,
      categoria: v.categoria ?? "",
      talla: v.talla ?? "",
      color: v.color ?? "",
      precio: v.precio,
      // Lo que dibuja la prenda sin foto (ADR-0333): su color y el ícono de su categoría.
      colorHex: v.colorHex,
      categoriaPrefijo: v.categoriaPrefijo ?? null,
      categoriaFamilia: v.categoriaFamilia ?? null,
    }));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={esLider && !unaSede ? "Tus tiendas" : etiqueta}
        titulo="Ventas sin registrar"
        subtitulo="Prendas que caja vendió antes de estar en el sistema. Dile al sistema qué prenda era cada una y el stock queda cuadrado."
        volver={<Volver href={volverA} a="Existencias" />}
      />
      <PorRegularizarLista
        filas={filas}
        prendas={prendas}
        disponibles={disponibles}
        ubicacionEtiqueta={etiqueta}
        variasSedes={esLider && !unaSede}
        esLider={esLider}
        plazos={plazos}
        sedeInicial={unaSede?.id ?? null}
        abrirItemId={item ?? null}
        listas={armarListasPrendaLibre(listasLeidas, catalogo)}
      />
    </div>
  );
}
