import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getCandidatasPorRegularizar, getCategoriasParaSugerir, getPorRegularizar, getSinCargarPorRegularizar } from "@/lib/por-regularizar";
import { categoriasPorLoEscrito } from "@/lib/por-regularizar-candidatas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { PorRegularizarLista } from "@/components/PorRegularizarLista";

// Ventas sin registrar (ADR-0179), en Existencias desde el 2026-10-04 (ADR-0330): prendas que caja vendió antes de estar en el
// sistema. Hasta hoy eran la tercera pestaña de Recibir mercadería, que es de lo que LLEGA; esto es una diferencia de stock que deja
// Vender, y quien cuida el stock la ve desde Existencias. La lista (`PorRegularizarLista`) y la función (`regularizar_prenda`) no
// cambian: solo cambió dónde viven. `/recibir?vista=por-regularizar` redirige aquí.
export default async function PorRegularizarPage({ searchParams }: { searchParams: Promise<{ ubicacion?: string }> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("existencias");
  const esLider = persona.rol === "lider";
  const { ubicacion } = await searchParams;
  // El líder ve las de todas sus sedes (cada fila dice cuál); los demás, las de la suya (RLS igual lo cuida). Un líder que llega desde
  // «Para hoy» de Existencias trae la sede (`?ubicacion=`, ADR-0331): ve la cola de ESA sede, la misma que contó allá
  // (`contarPorRegularizar`). Una sede que no existe se ignora y vuelve a «todas».
  // Si la lista de sedes no responde, la página no se cae: muestra todas, como antes de traer la sede.
  const ubicaciones = esLider && ubicacion ? await getUbicaciones().catch(() => []) : [];
  const unaSede = ubicaciones.find((u) => u.id === ubicacion) ?? null;
  // ADR-0328 (act. 5): con las prendas del stock que pueden ser cada venta. Si esa lectura falla, la cola sale igual, sin sugerencias.
  const sedeDeLaCola = esLider ? (unaSede?.id ?? null) : persona.ubicacionId;
  // Ajuste ADR-0328 (2026-10-04): qué ventas son de prendas que su sede nunca cargó, y si su carga sigue abierta. Si falla, {}.
  const [filas, catalogo, candidatas, categorias, sinCargar] = await Promise.all([
    getPorRegularizar(sedeDeLaCola),
    getCatalogo(),
    getCandidatasPorRegularizar(sedeDeLaCola),
    getCategoriasParaSugerir(),
    getSinCargarPorRegularizar(sedeDeLaCola),
  ]);
  // Las ventas cuya descripción nombra otra categoría que la anotada («Jean…» como Pantalones): sus candidatas se leen otra vez,
  // en la categoría escrita. Va después porque depende de lo que dicen las filas; casi siempre no hay ninguna y no se pide nada.
  const escritas = categoriasPorLoEscrito(filas, categorias);
  const releer = Object.fromEntries(Object.entries(escritas).map(([id, s]) => [id, s.categoriaId]));
  const porLoEscrito = Object.keys(releer).length > 0 ? await getCandidatasPorRegularizar(sedeDeLaCola, releer) : { hechos: [], fallo: null };
  const etiqueta = esLider ? (unaSede?.nombre ?? "tus tiendas") : persona.ubicacionEtiqueta;
  // De vuelta a Existencias en la misma sede que se miraba (la de la cabecera no necesita el parámetro).
  const volverA = unaSede && unaSede.id !== persona.ubicacionId ? `/inventario?ubicacion=${unaSede.id}` : "/inventario";
  // Solo lo que almacén necesita para reconocer la prenda: el costo no sale del servidor.
  const prendas = catalogo
    .filter((v) => v.activo && v.varianteId !== ID_CARGO_ESPECIAL)
    .map((v) => ({ id: v.varianteId, productoId: v.productoId, nombre: v.referencia, codigo: v.codigo ?? v.sku, categoria: v.categoria ?? "", talla: v.talla ?? "", color: v.color ?? "", precio: v.precio }));
  // La salida de una prenda sin cargar es la ficha del producto (cargar su stock o «Encontré prendas»): pide editar el catálogo
  // (la ficha) y ajustar stock (su matriz). Sin los dos, el aviso dice qué hacer pero no ofrece un enlace que termine en «Sin acceso».
  const puedeCargarStock = puede(persona, "editarCatalogo") && puede(persona, "ajustarStock");

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={esLider && !unaSede ? "Tus tiendas" : etiqueta}
        titulo="Ventas sin registrar"
        subtitulo="Prendas que caja vendió antes de estar en el sistema. Dile al sistema qué prenda era cada una y el stock queda cuadrado."
        pie={veModulo(persona, "existencias") && <Volver forma="boton" href={volverA} a="Existencias" />}
      />
      <PorRegularizarLista
        filas={filas}
        prendas={prendas}
        hechos={candidatas.hechos}
        hechosPorLoEscrito={porLoEscrito.hechos}
        escritas={escritas}
        avisoCandidatas={candidatas.fallo ?? porLoEscrito.fallo}
        ubicacionEtiqueta={etiqueta}
        variasSedes={esLider && !unaSede}
        esLider={esLider}
        sinCargar={sinCargar}
        puedeCargarStock={puedeCargarStock}
      />
    </div>
  );
}
