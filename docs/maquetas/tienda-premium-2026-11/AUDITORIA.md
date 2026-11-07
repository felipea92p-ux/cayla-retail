# Auditoría de la tienda online (`apps/tienda`) — 2026-11-07

Solo lectura del código (`apps/tienda`, `packages/shared`) y de cayla.pe con capturas automáticas que **no escriben nada** (todo lo
que no es GET se bloquea, y también el `sendBeacon` de visitas y mediciones). Las rutas `archivo:línea` cuelgan de `apps/tienda/`.

**Comprobado** = se ve en la captura o en el código. **Observado** = se vio en una captura automática y conviene confirmarlo en un
aparato real. **Propuesta** = lo que cambia la maqueta Premium.

## 1. Lo que hay

| Pieza | Hoy |
|---|---|
| Framework | Next.js 16 (App Router, Server Components), React 19, sin Tailwind: CSS propio en `app/globals.css` + 30 hojas en `app/estilos/` (5 047 líneas) |
| Identidad activa | `app/estilos/diseno-nuevo.css`, encendida con `<html data-diseno="nuevo">` (ADR-0615) sobre la base «G · Pasarela» de `globals.css` |
| Letras | Playfair Display (títulos) + Public Sans (texto), con `next/font` (`app/layout.tsx:31-32`) |
| Colores | rojo del logo `#d13730`, rojo hondo `#ad2a24`, rojo de letra `#a8281f`, vino `#7f1d16`, marfil `#faf7f3`, arena `#f5ece4`/`#e9d9cc`, rosa `#f2e4e0`, cacao `#35201e`, taupe `#6f5a55` |
| Medidas | radios 8/14/20/999, controles 48/40/44, espacios 4…48 (`diseno-nuevo.css:18-29`); ancho 1440 px; corte dominante 960 px por consulta de contenedor |
| Datos | Solo funciones `retail.tienda_*` (catálogo, ficha, bolsa, separar, pedido, looks, probador, puntos, ayuda, sedes) |
| Stock | La base manda un nivel («hay» o 0–3), nunca la cifra; `notaDeStock` (`lib/stock.ts:51-66`) lo vuelve «Disponible / Quedan N / Última / Hay en X» |
| Bolsa | Cookie `tienda-bolsa` (httpOnly, 30 días), de UNA tienda; máx. 20 prendas y 2 por prenda (`lib/bolsa.ts`) |
| Separar | Sin pago web: pedido W-XXXX → WhatsApp ya escrito → la tienda confirma (24 h) → pagas (48 h) → recoges (7 días después de pagar) |
| Club | Puntos por sol pagado, canje de 100 en 100 por cupón `CAY-XXXX-XXXX`, puntos de cumpleaños; se entra al completar documento y celular |
| Arma tu outfit | `/looks/arma` (`Probador`): zonas arriba/abajo/vestido/bolso, candado, Sorpréndeme, guardar y compartir |
| Cuenta | Proyecto de clientes aparte; código de 6 números al crear; Google programado pero **apagado** (`NEXT_PUBLIC_TIENDA_GOOGLE`) |

Rutas (30 `page.tsx`): `/inicio`, `/catalogo` (+ `lista=nuevo|ofertas|vendidos|favoritos`, `grupo`, `categoria`, color, talla, orden),
`/catalogo/[id]`, `/looks`, `/looks/[id]`, `/looks/arma`, `/looks/guardado/[id]`, `/tu-look`, `/bolsa`, `/bolsa/separado/[numero]`,
`/cuenta` (+ `pedidos`, `pedidos/[numero]`, `club`, `correo`, `eliminar`), `/notificaciones`, `/recomendaciones`, `/entrar`, `/crear-cuenta`,
`/olvide-mi-contrasena`, `/nueva-contrasena`, `/restablecer-acceso`, `/como-separar`, `/cambios-y-devoluciones`, `/tiendas`, `/privacidad`,
`/terminos-del-club`, `/vista-previa/[llave]`. Piden sesión: `/cuenta/**`, `/bolsa/separado/**`, `/recomendaciones`, favoritos.

## 2. Inconsistencias visuales (comprobadas)

1. **Dos capas de botón.** `.t-btn` de Pasarela (negro, cuadrado, 54 px, versalitas: `globals.css:112`) y la píldora roja de 48 px que lo pisa
   (`diseno-nuevo.css:121-129`), más familias por página con sus alturas: `.fp-ver` 48, `.pb-sorpresa` 40, `.pb-agregar` 52 punteado, `.rv-boton` 46.
2. **185 `border-radius: 0`** en hojas por página: solo se redondea lo que `diseno-nuevo.css:168-171` nombra; el resto queda cuadrado.
3. **Letras mezcladas.** `global-error.tsx:17` usa DM Serif y blanco y negro; las imágenes para compartir usan EB Garamond + Heebo
   (`lib/fuentes-og.ts:11`); `globals.css` aún describe DM Serif.
4. **Cursivas a medias.** `diseno-nuevo.css:61` anula las cursivas pero el marcado sigue partiendo títulos en `<em>`; en el Inicio los
   nombres de outfits salen en cursiva y los demás títulos no.
5. **Tres rojos plenos en una pantalla** (franja, «Arma tu outfit», Club): el rojo deja de señalar la acción.
6. **«Nuevo» en cada tarjeta de «Lo nuevo»** y en 119 de 239 prendas de Trujillo: el sello ya no distingue nada.
7. **El botón de WhatsApp sale rojo**, no verde (`bolsa.css:151` pierde contra `diseno-nuevo.css:121`).
8. **`themeColor` blanco** (`app/layout.tsx:44-47`, `manifest.ts:18-19`) con fondo marfil `#faf7f3`.
9. **«Un solo CSS» no se cumple:** 30 hojas por página; restos de Pasarela (50+ `uppercase`, el escenario negro del desfile).
10. **Botón flotante «Recomendaciones»** sobre carriles y tarjetas en todas las páginas (observado en las capturas).
11. **Ficha (observado):** a 1440 px la foto principal sale sobre un rectángulo gris oscuro, distinto de la placa rosa.
12. **Anchos de corte sueltos:** 1400, 1359, 1200, 1179, 1100, 699.98, 479, 374, 359 + `@media` por viewport mezclados con consultas de contenedor.

## 3. Problemas funcionales (comprobados en el código)

1. `/looks/guardado/[id]` sin sesión muestra «Es un problema de conexión de nuestro lado» en vez de pedir entrar (`looks/guardado/[id]/page.tsx:40-42,82`).
2. Los `redirect("/entrar")` de páginas privadas pierden `?volver=` (`cuenta/correo/page.tsx:19`, `bolsa/separado/[numero]/page.tsx:28`).
3. El Inicio puede decir «Eres del club» si falla la lectura de la cuenta (`inicio/page.tsx:278`).
4. «Pasaron N horas sin confirmar» usa el plazo de hoy, no el que regía al separar (`pedidos/[numero]:258`).
5. Sin cookie, la tienda por defecto es la primera alfabética (Arequipa), no la más cercana (`lib/sede-elegida.ts:43`).
6. Privacidad y Términos muestran «Borrador: lo revisa el abogado» al cliente (`privacidad/page.tsx:46`, `terminos-del-club/page.tsx:52,60`).
7. Cambiar de tienda **vacía la bolsa** (`CabeceraConCuenta.tsx:508`).
8. Los plazos que se le dicen al cliente salen de columnas `aviso_*` (migración `20261016001000`): un cambio de «avisos» cambia promesas.
9. Comentarios que contradicen al código (`looks/arma/page.tsx:26`, `globals.css:193`, `lib/panel-entrada.ts:24`) y CSS muerto `.ae*` (`probador.css:465-490`).

## 4. Textos que se contradicen — propuesta de unificación (para revisión de Felipe)

| Tema | Hoy dice | Propuesta única |
|---|---|---|
| Cuándo se entra al Club | «se activa cuando separas tu primera prenda» (`panel-entrada.ts:28`) · «al completar tu documento y tu celular» (`como-separar:76`) · «Tu cuenta es tu invitación» (`SeccionClub.tsx:70`) | «Entras al Club al completar tu documento y tu celular: la primera vez que separas, o antes desde Mi perfil.» |
| Recojo | «7 días para recoger» (`BloquesDelRediseno.tsx:8`) · «Hasta 7 días después de pagar» (`lib/ficha.ts:321`) | «Hasta 7 días después de pagar.» en todas partes |
| Plazo para pagar | «Pagas dentro de 48 horas» (`lib/ayuda.ts:108`) · el pedido confirmado solo dice «Coordina el pago por WhatsApp» (`pedidos/[numero]:217`) | El pedido confirmado repite «Tienes 48 horas para pagarlo» |
| Vencimiento | «mándalo por WhatsApp para que te confirmen» (`separado:56`) · al vencer: «la tienda no llegó a confirmarlo» (`pedidos/[numero]:260`) | «Pasaron 24 horas sin confirmar. Puedes volver a separarlo.» (sin culpar) |
| Traer de otra tienda | «la tienda lo trae de otra» (comentario, `bolsa/page.tsx:60`) · «la tienda no trae de otra» (`lib/ficha.ts:193`) · el pedido sí dice «Una prenda llega el …» | Decide Felipe: o se dice «Cada tienda maneja lo suyo» en todas partes o se explica cuándo sí se trae |
| Borrado de datos | «3 años sin compras ni entradas» (`cuentas-mensajes.ts:83`) · «3 años desde tu última compra» (`terminos:147`, `puntos.ts:178`) | Igualar al texto legal vigente (lo decide el abogado) |
| Cumpleaños | «Agrégalo en cualquier tienda» (`BloquesDelClub.tsx:129`) · el formulario web también lo pide | «Agrégalo en Mi perfil o en cualquier tienda CAYLA.» |
| Nombres | «Arma el tuyo» · «Crear mi outfit» · «probador» · «Outfits» = «Arma tu outfit» (`looks/page.tsx:18`) | **Outfits listos** (lo armado por CAYLA) y **Arma tu outfit** (la herramienta) |
| Perfil | «Mi perfil» y «Mi cuenta» | **Mi perfil** |
| Buscador | «¿Qué estás buscando?» · «Prenda o color» | «Busca blusas, jeans, vestidos…» |
| Beneficios sin respaldo | «Lo nuevo, primero» (`SeccionClub.tsx:9`) no está en los términos · «Mira cuánto hay en cada tienda» se vende como beneficio de la cuenta, pero es público | Solo los que existen: puntos, puntos de cumpleaños, cupones, pedidos en un lugar |

## 5. Componentes: qué hacer con cada uno

- **Conservar:** `EscenaPortada` (la portada), `BeneficiosDeLaTienda`, `FilaDeCategorias`, `ArmaTuOutfit` (banner), `NuestrasTiendas`, `EstadoDeTienda`, `Pie`, `AsiSeSepara`, `FormularioEntrar`/`Registro` (lógica), `bolsa/*` (lógica).
- **Refinar:** `TarjetaPrenda` (una etiqueta, disponibilidad con punto), `FichaPrenda` (stock de las tres tiendas, barra fija en el celular), `CabeceraConCuenta` (900 líneas: menú grande con foto, tienda a la vista), `OfertasPorCampana` (campañas como tarjetas), `SeccionClub` (vino, beneficios reales), `PantallaDeEntrada` (una tarjeta en dos columnas).
- **Rediseñar:** `FiltrosDeLista` + `filtros/*` (columna fija en escritorio, cajón en el celular, píldoras quitables), `Probador` (todo tocando: zona → prenda, flechas, candado, sin depender de arrastrar), `global-error.tsx` (al sistema actual).
- **Unificar:** las tres portadas (`EscenaPortada`, `HeroeDelInicio`, `EscenarioDelDesfile`); las dos tarjetas del Club (`InvitacionClub`, `TarjetaClub`); los dos códigos de 6 cifras (`FormularioRegistro:300-390`, `CorreoConCodigo`); las dos cuentas atrás (`CuentaRegresiva`, `CuentaAtras`); las familias de botón en `.btn` + 4 pesos.
- **Eliminar (redundante):** CSS `.ae*` de `probador.css`; reglas de Pasarela que `diseno-nuevo.css` pisa siempre; el botón flotante «Recomendaciones» como flotante (pasa al pie y a Mi perfil, no se quita la función).
