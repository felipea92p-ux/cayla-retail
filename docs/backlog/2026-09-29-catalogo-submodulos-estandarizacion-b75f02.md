## 🧾 Catálogo: cabecera, Vista rápida y «Desactivar» en la tarjeta (2026-09-29, ADR-0262) — solo web, sin migración; rama `claude/catalogo-submodulos-estandarizacion-b75f02`

- [x] `EncabezadoPagina` en Categorías, Marcas y Atributos (`app/(app)/productos/{categorias,marcas,atributos}/page.tsx`) — mismo patrón que Productos (ADR-0254).
- [x] Alta de Marcas pasa de panel inline a `<Modal>` (`NuevaMarcaForm` con el prop nuevo `dentroDeModal`).
- [x] Vista rápida antes de Editar en Marcas (`VistaRapidaMarca`, nuevo, en `MarcasLista.tsx`), Colores, Tallas y Etiquetas (`VistaRapidaAtributo`, nuevo componente compartido en `components/atributos/kit.tsx`).
- [x] «Editar nombre»: modal nuevo en Tallas; botón nuevo dentro de `DetalleMuestraModal` (Tejidos y Patrones) — los tres contra el mismo endpoint PATCH que ya aceptaba el campo.
- [x] «Desactivar» siempre en la tarjeta: sacado del modal de Editar en Categorías y en Colores (`ColorEditarModal` perdió su confirmación de doble clic; `desactivar()` subió a `ColoresLista`).
- [x] Verificado con los componentes reales montados en una ruta de prueba temporal (`app/auth/prueba-catalogo-real`, sin sesión, borrada al cerrar) — cada clic Listado → Vista rápida → Editar/Agregar, en el navegador.
- [x] `npx tsc --noEmit`, `eslint` (los 10 archivos tocados) y `vitest run` (220 archivos, 152 473 pruebas) en verde.
- [x] Temporadas queda fuera a propósito (calendario fijo de 9, ADR-0246 — no es una tarjeta que se edita).
- [ ] **Sin decidir:** si alguna otra pantalla del ERP (fuera de Catálogo) copiaba el patrón viejo de «Desactivar dentro de Editar» — no se auditó, solo Categorías y Colores por ser las que el spike señaló.
