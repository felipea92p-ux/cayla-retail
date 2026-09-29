# ADR-0287 · Categorías: un ícono por prenda, en la tarjeta de Atributos y con el tono de su familia

- **Fecha:** 2026-09-29 · **Estado:** aceptado. Solo web, **sin migración, sin RPC nueva, sin cambio de datos**.
- **Pedido:** Felipe, 2026-09-29: que las tarjetas de Catálogo ▸ Categorías dejen de repetir la percha y digan de qué prenda
  es cada una; «solo lo visual». Con un spike (`docs/maquetas/categorias-iconos-2026-09/`: Hoy, A, B, C, D y una hoja con los
  42 íconos) y una investigación de mercado (`docs/investigacion/2026-09-29-categorias-como-se-muestran.md`), **eligió D**
  («Banner arriba»), con píldoras por familia y color por familia.
- **Complementa:** ADR-0261 (el kit y la tarjeta de las seis pestañas de Atributos), ADR-0262 (cabecera, Vista rápida y
  «Desactivar» en la tarjeta), ADR-0169 (paleta: nunca rojo, sin sombras). **No depende del PR #600 (ADR-0262)**, que toca la misma pantalla: ver «Pendiente».

## Qué había

1. **`CategoriasLista.tsx` pintaba `IconoFamilia` en cada tarjeta:** un ícono por FAMILIA, no por categoría. Indumentaria
   tiene 18 categorías activas y las 18 mostraban la misma percha, a 20 px y al 30 % de tinta. El ícono ocupaba el lugar más
   vistoso de la tarjeta y no informaba nada.
2. **Una tarjeta propia**, distinta de la de Atributos (`TarjetaAtributo`), con su propia barra y sus secciones con borde.
   Dos gramáticas de tarjeta dentro de Catálogo, que ADR-0261 se escribió para evitar.
3. **No existe un set público** con blazer, body ni conjunto (18 sistemas de íconos medidos); jeans solo en emoji.

## Decisión

1. **Cuarenta y dos íconos dibujados a mano**, en el trazo de la percha de hoy (24×24, trazo 1,5, sin relleno, esquinas
   redondas): `lib/icono-categoria-reglas.ts`. Sin dependencia nueva ni mezcla de autores o licencias.
2. **La clave es el PREFIJO, no el nombre.** Los nombres se renombran (`Poleras/Sudaderas` → `Poleras`, migración
   `20260917110000`); el prefijo (`SUD`) queda fijo apenas hay un producto. **Una categoría sin ícono propio cae al de su
   familia** (`IconoFamilia`, que ahora expone `formasDeFamilia`), exactamente como era.
3. **La pantalla usa las piezas que ya existen:** `BarraAtributos`, `BotonFiltro`, `TituloGrupo`, `GRILLA_ATRIBUTOS`,
   y `TarjetaAtributo` (kit de ADR-0261), y `MuestraIcono` para el banner (dibujo grande al centro, dos ecos
   al 18 % y el tinte del grupo). **No se creó ningún componente de tarjeta**: solo `MuestraCategoria` (el `dibujo` y el tono) y
   `IconoCategoria` (el ícono suelto, para la Vista rápida).
4. **Color por familia** con los tonos que ya usan Etiquetas y Temporadas (`lib/categoria-tonos.ts`): Indumentaria taupe,
   Calzado y Papelería pizarra, Accesorios ámbar, Bisutería verde, Belleza neutro. **Nunca rojo.** Es identidad, no estado:
   esta pantalla no tiene estados. Una familia que el mapa no conoce (un Líder puede crearla) cae al neutro. La pizarra, que
   vivía privada en `MuestraTemporada`, pasó a `TONO_PIZARRA` en `MuestraEtiqueta.tsx` junto a `TONOS`.
5. **Píldoras por familia** (`BotonFiltro`, como Etiquetas): «Todas 42 · Indumentaria 18 · Calzado 7…». Es estado de pantalla
   en el navegador: no cambia qué se lee ni qué se guarda. Una familia vacía sigue viéndose (con «Sin categorías todavía») si no
   se busca; buscando, las familias sin coincidencias no aparecen.
6. **Cambios de aspecto que Felipe aprobó en el spike:** la tarjeta usa el tipo de Atributos (sans, 15 px) y no el serif de
   antes; el prefijo pasa de chip a texto mono; «N sub» y la temporada quedan como líneas chicas; el conteo «N de M
   categorías» del buscador se va (Atributos no lo tiene; las píldoras y «Ninguna categoría coincide…» cubren el caso).
7. **Lo que NO cambia:** el modal de Nuevo/Editar (con su «Desactivar categoría»), sus guardados, `buscarCategorias`, la
   sección de Desactivadas, la Vista rápida (solo su bloque de ícono, que ahora lleva el ícono de la categoría en el tono de su
   familia) ni `app/(app)/productos/categorias/page.tsx`. «Desactivar» sigue en la ventana de Editar: llevarlo al pie de la
   tarjeta es lo que hace el PR #600.

Alturas medidas en el spike a 1180 px (mismo dato en todas), Indumentaria / pantalla entera: hoy 552 / 1.631 px; **D 727 /
1.911 (+32 % / +17 %)**. Es la versión más alta; se aceptó a cambio de cero componentes nuevos y de verse igual a Atributos.

- **DECIDÍ:** el ícono de cada categoría se busca por su prefijo, se dibuja en el banner de `TarjetaAtributo` y el tono lo pone
  su familia.
- **DESCARTÉ:** (a) buscarlo por el nombre, que se rompe al primer renombre; (b) una tarjeta horizontal propia con el banner
  a la izquierda («C» del spike), que deja la altura igual a la de hoy y crea una segunda gramática de tarjeta; (c) sacar los íconos de
  un set público, que no trae blazer, body ni conjunto y mezcla estilos; (d) foto del producto en la miniatura, que pide un
  dato nuevo (función) y hoy casi no hay fotos.
- **SE ROMPE SI:** se crea una categoría nueva («Ropa de baño», prefijo `RBA`): no tiene ícono propio y muestra la percha de su
  familia. No se rompe nada, pero tampoco gana dibujo; que un Líder lo elija desde «Editar categoría» exigiría una columna en
  `categorias` (esquema). Y si abrigo, casaca, blazer, chompa y polera —que se parecen a tamaño chico— no se distinguen en la
  prueba con colaboradoras (`Solo íconos` del spike, método de NN/g), hay que cambiarles la silueta o dejarlas con el nombre.

## Cómo se verificó

- `tsc --noEmit` sin errores, `eslint` de los 8 archivos tocados y `vitest run` completo en verde: 251 archivos, 153.195 pruebas
  (11 nuevas: `icono-categoria-reglas.test.ts` —las 42 categorías activas tienen ícono, ninguno repite dibujo, formas válidas,
  prefijo desconocido → `null`, sin distinguir mayúsculas— y `categoria-tonos.test.ts` —vecinas nunca comparten tono, sin rojo,
  familia desconocida → neutro—).
- En el navegador contra la base local, con sesión de Líder, a 1440 px y a 375 px: 42 tarjetas con su banner, 7 píldoras y 6
  grupos; «Calzado» deja solo sus 7; buscar `sud` deja solo Poleras (el prefijo encuentra lo que el nombre ya no dice); `zzzz`
  muestra «Ninguna categoría coincide…» y «Quitar filtros» devuelve las 42; clic en «Blazers» abre la Vista rápida con su ícono y
  «Editar» abre la ventana con su «Desactivar categoría» (no se tocó ningún dato); a 375 px, 2 columnas y sin scroll horizontal.
  **Fallback:** quitándole temporalmente el ícono a `BOD` («Bodys»), su tarjeta dibujó la percha de la familia en el mismo tono y
  sin relleno; se restauró y las pruebas siguieron verdes. Consola y servidor sin errores. El recorrido completo se hizo sobre una
  versión apilada en #600; sobre la final (sobre `main` limpio) se repitió lo esencial: 42 tarjetas, 7 píldoras y Vista rápida →
  Editar.

## Pendiente

- **El PR #600 (ADR-0262) toca la misma `CategoriasLista` y `kit.tsx`.** Al fusionarse el segundo de los dos, hay que agregarle a
  `TarjetaCategoria` el pie con `PieTarjeta` + `DesactivarTarjeta` (5 líneas) y su `onDesactivar`.
- **Y #600 hoy no puede fusionarse contra el `main` de hoy** (hallazgo al apilar este trabajo encima; hay un chip lanzado):
  `DetalleMuestraModal.tsx` usa `responsable`, que `main` quitó (2026-09-29, «ya no piden responsable»), así que `tsc` falla con 6
  errores; los modales de `MarcasLista`, `NuevaMarcaForm` y `kit.tsx` no están en `lib/guia-de-foco-pantallas.ts`
  (`lib/guia-de-foco.test.ts` falla); y su ADR se llama 0262 cuando `main` ya tiene otro 0262 (`pnpm adr:numeros`).
- **`MuestraEtiqueta.tsx` guarda los tonos como hex de antes del 2026-09-22** (ámbar `#8C631F`, verde `#556E49`; los tokens de hoy
  son `#74501a` y `#48603f`). Categorías los reusa y hereda la deriva; corregirlo en un solo lugar cambia un poco el tono de
  Etiquetas, Temporadas y Categorías (chip lanzado).
- **Sin hacer (fuera de lo visual):** el mismo ícono en `alta-producto/ArbolCategoria.tsx:196-205` (hoy botones de solo texto,
  donde elegir mal la categoría es «el error más caro del alta»); y la prueba `Solo íconos` con colaboradoras.
