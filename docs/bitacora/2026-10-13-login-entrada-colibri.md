## 2026-10-13 (La entrada al ERP: el colibrí se abre)
Qué hice: al iniciar sesión, el colibrí del login ahora cruza al centro de la pantalla, el fondo se oscurece y, en el centro, se abre una ventana con la
forma del colibrí por la que se ve la pantalla de destino de verdad; el ave se agranda hasta salirse y la ventana cubre todo (≈3,5 s). Si la pantalla
tarda en cargar, el colibrí flota aleteando en el centro y espera. Es una capa nueva en el layout raíz (`components/login/EntradaColibri.tsx`) que
sobrevive a la navegación; el loader general se aparta mientras dura; el login la inicia en `app/login/page.tsx`.
Por qué así: Felipe lo pidió y eligió la maqueta (`docs/maquetas/login-entrada-2026-10/`). La ventana es un agujero en el velo (no un dibujo de Inicio), así
que muestra la pantalla real —la que toque según el rol— sin duplicarla. Con «reducir movimiento» no empieza y el login entra como siempre. Excepción de
movimiento escrita en ADR-0136 act. 2026-10-13 (b) y en CLAUDE.md.
Felipe se lleva: inicia sesión en `/login` (pantalla ancha, o celular: sale desde la marca chica) y ve la entrada; el correo, la clave y los avisos
funcionan igual. Probado en local con una pantalla de destino de prueba (sin iniciar sesión real): cruza, flota mientras carga, abre y termina limpio;
`lib/login-entrada.test.ts` (21 pruebas) mide que la silueta cubre la pantalla de 375×812 a 1920×1080. Pendiente: verlo con una cuenta real (Inicio de un
líder, Vender de una terminal, el Observatorio de un Admin).
Además: alisé la línea punteada del vuelo (Felipe: «¿por qué se ve doblada?»). Eran tres curvas encadenadas que ondulaban; ahora es la vuelta, una diagonal
recta por detrás del lema y un solo arco ancho hasta el ave, con la misma dirección a los dos lados de cada empalme (`trazoDelVuelo`, con prueba en
`lib/login-vuelo.test.ts` que la mide a cuatro tamaños de panel).
