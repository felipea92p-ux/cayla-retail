import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getPorRegularizar } from "@/lib/por-regularizar";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { PorRegularizarLista } from "@/components/PorRegularizarLista";

// Ventas sin registrar (ADR-0179), en Existencias desde el 2026-10-04 (ADR-0330): prendas que caja vendió antes de estar en el
// sistema. Hasta hoy eran la tercera pestaña de Recibir mercadería, que es de lo que LLEGA; esto es una diferencia de stock que deja
// Vender, y quien cuida el stock la ve desde Existencias. La lista (`PorRegularizarLista`) y la función (`regularizar_prenda`) no
// cambian: solo cambió dónde viven. `/recibir?vista=por-regularizar` redirige aquí.
export default async function PorRegularizarPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("existencias");
  const esLider = persona.rol === "lider";
  // El líder ve las de todas sus sedes (cada fila dice cuál); los demás, las de la suya (RLS igual lo cuida). Es el mismo alcance
  // que cuenta el botón de Existencias (`contarPorRegularizar`).
  const [filas, catalogo] = await Promise.all([getPorRegularizar(esLider ? null : persona.ubicacionId), getCatalogo()]);
  // Solo lo que almacén necesita para reconocer la prenda: el costo no sale del servidor.
  const prendas = catalogo
    .filter((v) => v.activo && v.varianteId !== ID_CARGO_ESPECIAL)
    .map((v) => ({ id: v.varianteId, nombre: v.referencia, codigo: v.codigo ?? v.sku, categoria: v.categoria ?? "", talla: v.talla ?? "", color: v.color ?? "", precio: v.precio }));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={esLider ? "Tus tiendas" : persona.ubicacionEtiqueta}
        titulo="Ventas sin registrar"
        subtitulo="Prendas que caja vendió antes de estar en el sistema. Dile al sistema qué prenda era cada una y el stock queda cuadrado."
        pie={veModulo(persona, "existencias") && <Volver forma="boton" href="/inventario" a="Existencias" />}
      />
      <PorRegularizarLista filas={filas} prendas={prendas} ubicacionEtiqueta={esLider ? "tus tiendas" : persona.ubicacionEtiqueta} variasSedes={esLider} />
    </div>
  );
}
