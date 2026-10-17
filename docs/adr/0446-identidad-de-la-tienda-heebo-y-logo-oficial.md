# ADR-0446 — La identidad de la tienda: Heebo, el logo oficial y Ahellya en espera

- **Fecha:** 2026-10-17 · **Estado:** aceptado (Felipe eligió la variante B mirando la maqueta A/B). Solo `apps/tienda`, sin migración.
- **Relacionados:** ADR-0408 (la tienda online), ADR-0431 (sus íconos, que este rehace), ADR-0169 y ADR-0336 (la paleta y el modo oscuro
  del ERP, que no cambian). Investigación: `docs/investigacion/2026-10-17-identidad-tienda-web.html` y
  `docs/investigacion/2026-10-17-fuentes-dafont/`. Maqueta elegida: `docs/maquetas/tienda-ahellya-2026-10/` (variante B).

## El problema

- **La tienda no tenía letra propia.** Usaba casi la misma paleta y la misma serif que la web de Hermès (crema, rojo ladrillo, EB
  Garamond), medido leyendo el código de hermes.com.
- **Los precios no quedaban en columna.** DM Sans no tiene cifras del mismo ancho: veinte reglas de la tienda pedían `tabular-nums` y no
  pasaba nada (medido con los archivos oficiales de Google Fonts).
- **La marca no era la del escaparate.** La palabra CAYLA se escribía en EB Garamond junto a un colibrí dibujado a mano, y el logo de
  las tiendas físicas es otro dibujo, con otra A y otro rojo.

## Decisión

1. **Variante B.** Ahellya (Dmitry Barsukov, dafont) para la marca y los títulos; **Heebo** (OFL, Google Fonts) para el texto, los botones,
   los formularios y los precios. Felipe la eligió frente a A (Ahellya en todo) mirando las dos en la tienda.
2. **CAYLA no se escribe con ninguna letra: es el dibujo del logo oficial**, calcado del archivo en alta. Va en los encabezados, el pie,
   el menú y la tarjeta del Club, y también **dentro del título de una campaña** («Semana CAYLA», «Lo nuevo de CAYLA»). En una frase
   («Club CAYLA», «Añade CAYLA a tu celular») sigue como texto, en la letra de la frase.
3. **Ahellya espera un permiso escrito.** dafont la marca «100% Free», pero el archivo dice «© D.N.Barsukov 2014. All Rights Reserved»,
   el zip no trae licencia y el propio FAQ de dafont dice que su etiqueta «es solo una indicación». El repo y la tienda son públicos:
   subirla la redistribuye. Hasta que el autor confirme por escrito el uso comercial y en la web, **los títulos siguen en EB Garamond**.
4. **El rojo del logo es el del logo.** El dibujo usa su rojo oficial, `#d13730` (`--t-logo`), igual en claro y en oscuro. El texto rojo
   sigue en `--rojo` (`#b8412d`, y `#e8806a` en oscuro): `#d13730` sobre crema da 4,3:1 y no alcanza el 4,5:1 del texto chico.
5. **Solo la tienda.** El ERP, los tickets y las etiquetas siguen con su isotipo y su rojo; pasarlos al logo oficial toca más de un
   módulo y lo decide Felipe aparte.

## Cómo está hecho

- **`lib/marca.ts`**: el colibrí, la palabra y el logo completo (colibrí + palabra, sin repetir el trazo) en las coordenadas del archivo
  oficial (2000 × 580). El calcado se simplificó con media unidad de tolerancia: pesa 3,3 KB y, superpuesto al original, solo difiere en
  el suavizado del borde (2,8 % de los píxeles de tinta, lo mismo que el calcado fino de 28 KB). `partirPorLaMarca(texto)` separa la
  palabra CAYLA de un título (entera, en mayúsculas o no; no la de «CAYLAS»), con su prueba en `lib/marca.test.ts`.
- **`components/Marca.tsx`** (`Logo`, `PalabraCayla`, `TextoConMarca`) y **`components/Isotipo.tsx`** (el colibrí), todos con `currentColor` (cada lugar pone su color y
  su alto, y el ancho sigue solo). Escondidos para el lector de pantalla —el enlace o la tarjeta ya dicen «CAYLA»—, salvo la palabra dentro
  de un título, que se lee «CAYLA». Va escrito en la página: con 3,3 KB no hace falta un archivo aparte ni hay un instante sin logo.
- **Dónde:** `Cabecera`, `CabeceraConCuenta` (la fila y el menú del celular), `Pie`, `CabeceraNeutra` (páginas sin salida y la de error),
  `TarjetaClub`, los títulos de campaña de la portada y del Inicio, y el colibrí de la campaña, de la entrada, de las ayudas y del ícono de
  instalar. `<Isotipo>` sigue en su archivo de siempre (otros PR de la tienda lo importan) y ahora dibuja el colibrí oficial;
  `public/cayla-isotipo.png` se borró.
- **Las imágenes para compartir un look** (`lib/imagenes-del-look.tsx`) arman el logo y el colibrí desde el mismo trazo, como SVG en
  línea: ya no piden el PNG a la red (antes, si no respondía, la imagen salía sin colibrí). Su letra de texto también pasó a Heebo
  (`lib/fuentes-og.ts`).
- **Los íconos de la app** (`public/cayla-app-*.png`, `cayla-apple-180.png`) se rehicieron con el colibrí oficial en la misma caja que
  ocupaba el de antes (ADR-0431), en `#d13730` sobre `#f5f0e8`.
- **Heebo** entra por `next/font/google` (`--font-heebo`) en `app/layout.tsx` y en `--sans`.
- **Una trampa:** un SVG con `max-width: 100%` dentro de un enlace que se ajusta a su contenido cuenta como «comprimible» y queda en 0 px.
  La clase base `.t-marca` no lleva `max-width` en porcentaje.

## Lo que se descartó

- **A, Ahellya en todo:** tiene un solo grosor (los botones y los precios no pueden ir en negrita) y sus cifras no tienen el mismo ancho.
- **Escribir CAYLA con una letra parecida:** ninguna de cien fuentes medidas tiene la A con la barra al 17 % del alto; el dibujo calcado es
  exacto y no depende de ninguna licencia.
- **Libre Franklin** (la sans más parecida al logo): no tiene cifras del mismo ancho. Heebo las trae de fábrica.
- **El logo como archivo aparte** (`<use href>` o PNG): una petición más y un instante sin logo, por ahorrar 3,3 KB.

## Cómo se verifica

- `pnpm --filter tienda test` (`lib/marca.test.ts`), `typecheck`, `lint`, `pnpm knip`, `pnpm knip:produccion` y `pnpm --filter tienda build`.
- En el navegador (2026-10-17): sin sesión la portada, entrar, crear cuenta, una página que no existe y cómo separar, a 375 y a 1280 px,
  en claro y en oscuro, sin desborde; con sesión el Inicio, el menú del celular y la fila a 320 px; la imagen `/tu-look/vista`.

## Pendiente

- **Ahellya**, cuando llegue el permiso: `next/font/local` en `app/layout.tsx`, `--serif` en `globals.css` y `lib/fuentes-og.ts`. Es más
  ancha que EB Garamond: en la maqueta, el título de la campaña en la computadora tuvo que topar en 100 px para no montarse sobre las fotos.
- **Sin probar:** la imagen de la historia de un look guardado (pide una cuenta con un look guardado); usa la misma pieza que `/tu-look/vista`.
- **Decisión de Felipe:** si el ERP, los tickets y las etiquetas pasan al colibrí y al rojo del logo oficial.
