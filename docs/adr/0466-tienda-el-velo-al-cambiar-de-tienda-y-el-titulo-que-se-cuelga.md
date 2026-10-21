# ADR-0466 — La tienda: el velo al cambiar de tienda y el título que se cuelga al cambiar de pestaña

**Estado:** aceptada · **Fecha:** 2026-10-20 · **Decidió:** Felipe (eligió mirando la maqueta: «velo y cuelga»)
**Relacionados:** ADR-0445 (esqueletos fieles y paso suave entre vistas), ADR-0455 (la tienda minimalista y siempre una tienda), ADR-0430 y
ADR-0136 (movimiento: «ricas, una vez, sin rebote ni bucle»), ADR-0432 (cáscara armada por adelantado). Maqueta con las seis opciones:
`docs/maquetas/tienda-cambio-de-sede-y-pestana-2026-10/`.

## Contexto

Felipe pidió dos cosas para la tienda web (`apps/tienda`): una animación que **muestre el cambio de tienda** y otra, **rápida, al pasar de una
pestaña a otra** (Lo nuevo, Ropa, Looks, Ofertas…). Se dibujaron tres de cada una; las miró en computador y celular, pidió que se vean bien a
375 px y que **funcionen como pantallas de carga**, y pidió que el cambio de tienda **«no sea tan invasivo: un blur oscuro, no negro»**.

Lo que había antes, medido en `apps/tienda`:

- **Cambiar de tienda** es la misma vista para `claveDeVista` (`?sede=`): Next no muestra ningún `loading.tsx` ni esqueleto. La lista de antes se
  quedaba quieta —a lo sumo atenuada— mientras llegaba la nueva (0,3 a 1,3 s con red lenta, ADR-0445) y el nombre de la cabecera cambiaba de
  golpe. Nada decía «ahora estás en Lima».
- **Cambiar de pestaña** funde la pantalla en 0,24 s y muestra el esqueleto de la lista que viene (`EnCamino`, `loading.tsx`), con el título real
  ya escrito pero quieto: no decía hacia dónde se fue ni le daba lugar al título.

## Lo que se decidió

**1. El velo (cambio de tienda).** Al elegir otra tienda en el selector de la cabecera, un velo oscuro y desenfocado (el grafito al 62 % con
`backdrop-filter: blur(14px)`) cubre lo que hay **bajo la cabecera** —la lista de antes se sigue viendo detrás, borrosa—, escribe «Ahora ves lo que hay
en LIMA» con las letras subiendo y un hilo que barre bajo el nombre, y **se disipa cuando llega la página**. Entonces el nombre de la cabecera rueda
hacia arriba y el nuevo sube (la cédula de un museo). Entra en 320 ms, se queda **al menos 300 ms** después de cubrir (si la página llega al
instante, no parpadea), sale en 380 ms. Piezas: `components/VeloDeSede.tsx` (el velo, en el `<body>` por un portal, y `NombreQueRueda`),
`components/CabeceraConCuenta.tsx` (`SelectorTienda`), `lib/sede-velo.ts` (cuándo se queda y cuándo se va, con su prueba) y `app/estilos/cabecera.css`.

**2. El título se cuelga (cambio de pestaña).** El **esqueleto** de la lista, que ya trae el título real de la pestaña tocada, ahora lo escribe
**palabra por palabra subiendo desde su línea** (retraso de 55 ms entre palabras, la última —la cursiva— cierra); la ceja y la frase aparecen; y las
tarjetas vacías se cuelgan en cascada (32 ms entre una y otra, tope en la octava). Lo hacen `CabeceraDeLista` y `Looks` de
`components/FormaDelEsqueleto.tsx` (`TituloQueSeCuelga`, `Tarjeta i`) y `app/estilos/vistas.css`. Al llegar, la página escribe el mismo título quieto en
el mismo lugar y cada foto aparece en su marco con el fundido que ya tiene `FotoTarjeta`. El título **espera 120 ms** antes de empezar: si la página
llega casi al instante, el esqueleto ni alcanza a mostrarlo y nada parpadea.

**3. La regla que siguen los dos: la pantalla de carga manda sobre la animación.** La animación no dura un tiempo fijo: cubre la espera real y
termina cuando llega la página. Lo que ya se sabe (la tienda elegida, el título de la pestaña) sale al instante; lo que falta se espera con la
señal de espera de la tienda (el esqueleto que brilla, el hilo del velo).

DECIDÍ: el velo con desenfoque para el cambio de tienda y el título que se cuelga, sobre el esqueleto que ya existe, para el cambio de pestaña.
DESCARTÉ: el telón negro de lado a lado (Felipe: «tan invasivo»), porque tapa del todo lo que la clienta venía mirando; la cédula (solo las prendas
se atenúan: quien no mira la cabecera no nota que cambió de tienda) y el mapa de la costa (reemplaza un selector que ADR-0455 quiso como enlaces
compartibles y es lo más caro de mantener si hay una sede nueva); y para pestañas, la raya que viaja y «desde la palabra», porque no le dan lugar al título.
SE ROMPE SI: una clienta cambia de tienda dos veces seguidas antes de que llegue la primera página (el segundo cambio reemplaza al primero: el velo se
reinicia con el nombre nuevo y `cambiando` sigue en true hasta que la última llega; no se probó con dos toques en menos de 100 ms); o si la base no
responde y la página nunca llega (por eso el tope de 8 s: el velo se disipa solo y la tienda sigue donde estaba, sin perder la bolsa).

## Todo puede fallar (principio 9)

- **La página no llega** (corte de red, base caída): a los 8 s el velo se disipa solo (`VELO_TOPE_MS`). La tienda sigue en la tienda de antes; el aviso
  de base caída ya lo da `/sin-base` (ADR-0450). El velo nunca guarda ni pierde datos: solo cubre.
- **Con prendas en la bolsa**, cambiar de tienda sigue pidiendo confirmación («Tu bolsa se vaciará.») y la bolsa se vacía antes de navegar, igual que antes.
  El velo empieza al confirmar, no al elegir.
- **Elegir la misma tienda** no navega ni cubre (`debeCubrir`): un velo sin nada que esperar se quedaría hasta el tope.
- **Un clic con modificador** (abrir en otra pestaña) sigue siendo un enlace normal.
- **«Reducir movimiento»:** el velo queda quieto (sigue diciendo que la página está llegando: sin fundido, sin letras que suben, sin hilo) y el título y las
  tarjetas del esqueleto aparecen de una vez. Las animaciones del título se apagan con `animation: none`, no con duración casi cero: el retraso de
  cada palabra no se anula con la regla global y las dejaría invisibles un instante.

## Lo que se aprendió (y no estaba escrito)

**El empaquetador de CSS de la tienda se queda solo con la versión con prefijo de `backdrop-filter` si se escriben las dos.** Con
`backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px)` en la misma regla, el CSS que sirve Next (Turbopack, en desarrollo) trae **solo**
`-webkit-backdrop-filter`, y Chrome ya no lo entiende (`CSS.supports('-webkit-backdrop-filter', …)` es falso): el velo salía oscuro pero **sin
desenfoque**. Escribiendo **solo** `backdrop-filter`, el empaquetador agrega el prefijo que Safari necesita y deja las dos. El velo nuevo va así, con una
nota en `cabecera.css`. **Lo que ya existía con el mismo problema, sin tocar:** `.t-cab` (la cabecera), `.t-velo` (el velo del menú del celular) y
`.t-look-hoja::backdrop` escriben las dos versiones; en el CSS servido de desarrollo solo queda la prefijada. En la cabecera (92 % opaca) no se nota; en el
velo del menú, sí (el desenfoque de 3 px desaparece en Chrome). **No se midió en producción.** Corregirlo es borrar la línea con prefijo en esas tres
reglas: cambio visual chico, pero toca todas las páginas, así que queda para que Felipe lo mire.

## Lo que no se hizo

- **La caída del título viejo** (en la maqueta el título de antes caía por su línea mientras el nuevo subía): en la tienda real la página de antes se
  reemplaza por el esqueleto con el fundido de ADR-0445; hacer caer solo el título viejo pide una transición de vista con nombre por palabra. Eran
  220 ms; no se construyó.
- **El título real de una lista** (`.t-lista-cab h1`, mínimo de 48 px) **se sale por la derecha a 375 px con un nombre de 10 letras** («Accesorios»): ya
  pasaba antes y no se cambió. En la maqueta se bajó a 36 px.
- **Probado en la tienda real con sesión y con datos:** no. La base local no tiene tiendas publicadas en la web y le falta una migración
  (`tienda_puntos_config`), así que el selector se probó con la cabecera real y un servidor que tarda (página de prueba temporal, ya borrada) y el esqueleto,
  montado solo. Falta verlo en local con la pila de clientes completa y tiendas publicadas. **La tienda no tiene vista previa de rama** (sus variables viven solo en
  Producción: `scripts/ci/vercel-ignorar-tienda.mjs`), así que fusionar publica: esto se mira antes de fusionar.

## Pruebas

- `lib/sede-velo.test.ts` (13): el mínimo es lo que cubre más lo que se lee; si la página llega al instante el velo espera lo que falta; si tardó,
  sale ya; un reloj que va para atrás no alarga la espera; el tope de 8 s; elegir la misma tienda no cubre; las letras del nombre (una «Ñ» no se parte).
- `pnpm --filter tienda test` (748), `typecheck` y `lint` limpios.
- En el navegador (cabecera real, servidor que tarda 3 y 4 s, computador y 375 px): el velo sale al tocar, empieza justo bajo la cabecera, se queda
  hasta que cambia la dirección y se disipa; el nombre rueda de Lima a Trujillo; a 375 px «TRUJILLO» cabe en una línea (254 px de 343) y no hay
  desborde. El esqueleto real: «Las ofertas», «Más vendidos» y «Arma tu look» con sus palabras subiendo (retrasos de 120 ms y 55 ms por palabra) y
  las tarjetas cayendo en cascada de 32 ms; sin desborde a 375 px.
