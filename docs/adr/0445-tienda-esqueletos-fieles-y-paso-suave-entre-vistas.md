# ADR-0445 — La tienda online: cada esqueleto es su página, y de una vista a otra la pantalla se funde

- **Fecha:** 2026-10-17 · **Estado:** aceptado (pedido de Felipe). Sin migraciones: entra al fusionar y publicar la tienda.
- **Relacionados:** ADR-0408 (la tienda online), ADR-0432 (cáscara armada por adelantado), `docs/bitacora/2026-10-17-tienda-vistas-fdbd9c.md`.

## El problema

Felipe: «la velocidad subió un poco, pero quiero que mejore la sensación de carga; los esqueletos todavía no están acorde y quisiera que
sea más fiel a lo que mostrará el contenido; cuando cambia de vista es muy abrupto».

Medido con red lenta (cada respuesta retrasada 1,2 y 4 s), a 1280 y a 375 px:

- **La cabecera cambiaba en cada toque.** El esqueleto dibujaba una cabecera vacía: sin «Ropa», «Accesorios» ni «Arma el tuyo», sin el
  nombre ni los globos de favoritos y bolsa; la franja de las tiendas eran píldoras grises y, en la bolsa y la cuenta, la franja de
  anuncios quedaba en blanco y al llegar volvía a su primera frase. Todo se encogía y se volvía a estirar.
- **El esqueleto no era la página.** El del Inicio era una grilla color crema, y llegaba un héroe rojo con su campaña. La lista no tenía
  título ni filtros; la bolsa y Recomendaciones eran «una lista»; los looks iban de a dos y la página de a tres. Varias páginas un
  segmento adentro (un look, «Arma el tuyo», los pedidos, el pedido separado) no tenían esqueleto: la de antes se quedaba quieta, sin
  ninguna señal, hasta que llegaba la nueva.
- **Todo aparecía en un cuadro**, sin ningún paso entre la vista de antes y la que llega.

## Decisión

1. **Lo que no cambia, no parpadea.** La cabecera de una página que espera (`CabeceraConCuenta deEspera`, la arma `CabeceraDeEspera`) es
   la última que se vio, con la sección de destino ya marcada (`seccionDeLaRuta`). La franja de anuncios (`Anuncio`) sigue en la frase que
   se veía (`estadoDeFrase(…, desde)`), la de las tiendas trae sus tiendas con la elegida marcada (`TiendasRecordadas`), y la bolsa
   recuerda cuántas prendas tenía (`BolsaRecordada`). Todo vive en la memoria de la pestaña: al recargar, la primera espera es la de antes
   (es lo que manda el servidor, así que hidrata igual; por eso se lee con `useSyncExternalStore` y su versión de servidor en `null`).
2. **Cada esqueleto es su página.** `FormaDelEsqueleto` tiene una forma por página (`formaDeLaRuta`: inicio, grilla, ficha, looks, look,
   probador, perfil, lista, bolsa, recomendaciones) armada con las MISMAS clases de la página (`.t-hero`, `.t-lista-cab`, `.t-pdp`,
   `.t-looks`, `.t-bolsa`, `.r-pag`, `.pf-perfil`), y escribe ya lo que se sabe sin preguntarle a nadie: el héroe con la campaña guardada
   (`leerPortada`, la de la franja; `HeroeDelInicio enEspera`), el título de la lista (`tituloDeEspera`, con `lib/listas.ts` sin zod), los
   textos fijos de cada página. Solo brilla lo que de verdad falta. Cada línea que brilla ocupa el renglón de lo que va a escribirse en su
   lugar (11 px de línea en 17 de renglón). Medido: títulos, fotos y botones a 0 px de la página; lo demás, a lo sumo 2.
3. **Toda página a la que se llega desde una hermana tiene su `loading.tsx`.** Next 16.4 muestra un `loading.tsx` solo cuando se entra a
   su carpeta: su límite se arma con la clave del segmento hijo, que es el nombre del segmento (`id|d`) y NO lleva los parámetros ni la
   dirección. Por eso cambiar un filtro, la tienda o «ver más» nunca enseña el esqueleto (y no debe), y por eso un look, «Arma el tuyo»,
   los pedidos y el pedido separado necesitan el suyo. De una ficha a otra (o de un look a otro) tampoco sale, por lo mismo.
4. **La ficha llega con lo que la tarjeta ya mostraba.** La tarjeta lleva sus `data-*` (nombre, precio, categoría) y, al tocarla,
   `RecordarPrendaTocada` los guarda con la foto que el navegador ya descargó (`lib/prenda-tocada.ts`). El esqueleto de la ficha pone esa
   foto, el nombre, el precio y la ruta; la ficha, mientras baja su foto grande, deja debajo la chica (solo si es la misma foto,
   `esLaMismaFoto`, y se va al cargar la grande: las dos se multiplican con el fondo y juntas oscurecerían la foto).
5. **De una vista a otra, la pantalla se funde** con las transiciones de vista de React 19.3 (las trae Next 16.4 sin configurar nada). Lo
   hace una marca de 1 px por vista (`MarcaDeVista`, `MarcaDeEspera`, `components/Vistas.tsx`) y `app/estilos/vistas.css`: lo nuevo aparece
   encima de lo de antes en 0,24 s (lo de antes no se apaga, así no hay un parpadeo claro a la mitad); la cabecera, la franja de anuncios y
   la de las tiendas tienen nombre propio y quedan quietas; la foto de la tarjeta tocada vuela a su lugar en la ficha (`t-foto-<prenda>`,
   clase `t-viaja`, 0,42 s). Una lista distinta, un menú o una página funden; un filtro de la lista no (`claveDeVista`): un filtro apaga la
   lista mientras llega la nueva, como antes. Con «reducir movimiento», nada se mueve. Sin soporte del navegador, se ve como antes.
6. **El lugar de la barra de desplazamiento se guarda** (`scrollbar-gutter: stable`): donde la barra ocupa espacio (Windows), una página
   corta (un esqueleto, la bolsa vacía) y una larga tienen el mismo ancho y nada se corre de lado.
7. **Las tallas del «Agregar» rápido van por `GET /api/tallas`**, no por una acción del servidor: Next ejecuta las acciones de a una y pasar
   el mouse por varias tarjetas las ponía en fila (y «Agregar a la bolsa» esperaba detrás).

## Lo que cuesta no saber (trampas medidas, para quien toque esto)

- **Una `<ViewTransition>` solo anima su entrada o su salida si no tiene ningún elemento encima en lo que aparece o se va.** La primera
  versión puso la marca dentro de `<main>` y React no hacía nada al cambiar de sección (dentro de una misma lista sí, porque ahí la marca
  misma era lo que cambiaba). Por eso la marca es lo primero que dibujan `MarcoCatalogo`, `MarcoCuenta` (antes de su caja `.tienda`), el
  esqueleto y los `loading.tsx` que arman su caja.
- **La foto que viaja usa el nombre en el estilo, no una `<ViewTransition name>`**: la tarjeta lo recibe recién al tocarla (y se le quita a
  los 1,5 s), porque el Inicio repite una prenda en dos carriles y dos elementos visibles con el mismo nombre hacen que el navegador
  aborte la transición entera.
- **Una pestaña que no se ve no funde** (`visibilityState: hidden`): el navegador aborta con «invalid state». Para probarlo hay que mirar
  una página a la vista (se probó con Playwright, que la tiene).
- **Si se toca una prenda antes de que llegue su precarga, Next espera esa precarga para mostrar el esqueleto.** Con red muy lenta y una
  grilla de 24 tarjetas que se precargan en fila, eso fue hasta 1,3 s. Es de Next y ya pasaba; queda en el backlog.

## Alternativas descartadas

- **Llamar a `document.startViewTransition` a mano al tocar un enlace.** El navegador toma la foto de la vista de antes en el cuadro
  siguiente, y React puede haber dibujado ya el esqueleto: la transición fundiría el esqueleto consigo mismo. React la pide justo antes
  de cambiar la página, que es el único momento correcto.
- **Deslizar de lado al avanzar y al volver** (el ejemplo de Next): mueve toda la pantalla en cada toque; para una tienda que se recorre
  rápido, el fundido dice «llegó» sin marear.
- **Un fundido con CSS al montar cada página** (sin transiciones de vista): la página de antes desaparece en el mismo cuadro y la nueva
  sube desde transparente, así que a la mitad se ve el fondo vacío (un parpadeo claro). La transición de vista deja lo de antes debajo
  hasta que lo nuevo terminó de aparecer.

## Cómo se verifica

- Pruebas puras: `lib/esqueleto.test.ts` (forma, sección, título y clave de vista), `lib/prenda-tocada.test.ts`, `lib/anuncio.test.ts`
  (la franja que sigue en su frase), `lib/rapido.test.ts`.
- En el navegador, con la tienda compilada y red lenta: el esqueleto sale a los 10 ms con la cabecera igual; las posiciones del esqueleto
  y de la página se miden pieza por pieza (`getBoundingClientRect`); en una página a la vista, cada cambio de vista pide su transición y
  termina bien (`ready` sin error), con el grupo `t-foto-<prenda>` cuando se toca una prenda.
