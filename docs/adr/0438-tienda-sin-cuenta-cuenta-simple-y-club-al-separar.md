# ADR-0438 · La tienda se ve sin cuenta; la cuenta es simple; el Club empieza al separar

- **Fecha:** 2026-10-17 · **Estado:** construido y verificado en local (suite de base nueva 60/60, suites vecinas, vitest 522, tipos, Knip, y el recorrido
  completo en el navegador: ver el catálogo → bolsa → crear cuenta → completar datos → «Separar en Lima»). **La migración
  `20261017175000` NO está en producción** (cambia funciones de la base): espera el OK de Felipe. **Google no se probó de punta a punta**: falta el
  cliente de Google Cloud (a mano). Rama `claude/catalog-without-required-login-dba019`.
- **Pedido:** Felipe, 2026-10-17: «el catálogo debe aparecer sin necesidad de iniciar sesión; el inicio de sesión debe ser cuando se realice el
  pedido o cuando el mismo usuario quiera […]; crear la cuenta lo más simple posible, solo los datos necesarios; DNI y celular después, y
  cuando lo haga recién forma parte del Club CAYLA; que se pueda iniciar sesión con Google; no obligatorio para ver los productos, ni los precios,
  ni el stock». Decidió con `AskUserQuestion`: al separar se piden **documento + celular**, y el **código de 6 cifras del correo se mantiene**.
- **Revierte:** «precio, tallas y cuánto hay, solo con cuenta» (maqueta v4 y 2026-10-16, la portada sin precios) y, en parte, «el Club empieza al
  crear la cuenta» (`20261016154000`, Felipe 2026-10-16): ahora el Club empieza al completar el documento y el celular. **Descarta** la idea que se
  exploró el 2026-10-16 y se dejó («Google y DNI + WhatsApp al primer pedido»): ya es la decisión.

## El problema primero

Para ver una prenda, su precio o cuánto había en cada tienda, la persona tenía que crear una cuenta con correo, contraseña, documento, celular y
cumpleaños, y confirmar un código. Quien llegaba por un enlace de WhatsApp se encontraba con un formulario de diez campos antes de ver nada. La
tienda no pierde ningún dato por abrirse (el catálogo, los precios y el stock ya eran lo mismo para todos: `tienda_catalogo` nunca recibió quién
mira), pero perdía a quien no quería dar su DNI para mirar.

## Lo que se decidió

1. **Se ve sin cuenta:** Inicio, catálogo, ficha de prenda con su stock por tienda, looks, «Arma el tuyo» y la bolsa. `/` lleva al Inicio. El proxy
   (`lib/sesion.ts`) solo pide cuenta para lo que es DE la persona: `/cuenta`, un pedido ya separado, `/recomendaciones` y su lista de favoritos.
2. **La bolsa se arma sin cuenta** (ya vivía en una cookie). La cuenta se pide al «Separar» («Entra para separar», que vuelve a la bolsa) o cuando
   la persona quiere guardar algo suyo (un favorito, un aviso).
3. **La cuenta se crea con lo mínimo:** correo con su código de 6 cifras, nombre, contraseña y aceptar los términos; o **Google**, que no pide nada más.
   Crear la cuenta crea una **ficha mínima** en `clientas` (solo el nombre, origen web, sin documento, celular ni Club).
4. **El Club empieza al completar los datos:** la primera vez que separa (o cuando quiera, desde «Mi perfil») la persona da su documento (DNI con el
   nombre del padrón, carné o pasaporte) y su celular; el cumpleaños y los avisos por WhatsApp son opcionales. Si ya había una ficha con ese documento
   (la de la caja), la cuenta **pasa a ESA ficha** y la mínima se archiva. `tienda_separar` rechaza (`tienda_sin_club`) a quien aún no es del Club.

## Cómo quedó en la base (`20261017175000`)

- `tienda_registrar_cuenta_simple`, `tienda_revisar_registro_simple`, `tienda_revisar_club`, `tienda_unirse_al_club`: todas `security definer`, solo
  `tienda_web`. `tienda_registrar_cuenta` y `tienda_revisar_registro` quedan, sin llamador en la web (las usan las suites del Club).
- `fn_cuenta_web_reglas`: la ficha de una cuenta sigue inmutable **salvo** la ficha mínima (`fn_ficha_minima_de_cuenta`: origen web, sin documento,
  celular, Club, compras, pedidos ni apartados), que puede dejarse para pasar a la ficha que ya existía con el documento. Reemplazo completo con guarda
  de md5.
- `tienda_separar`: reemplazo anclado con guarda de md5 (`tienda_sin_club`).

## Decidí / Descarté (con el porqué)

- **DECIDÍ ficha mínima, no `clienta_id` nulo.** Las 14 funciones de la tienda que leen la ficha siguen funcionando sin tocarlas: una ficha sin Club ya
  existe hoy (las que abre la caja con el DNI de una boleta) y `tienda_mi_club` ya contesta `sin_club` para ellas. Nulo tocaba ~35 migraciones de contrato.
- **DECIDÍ que la ficha mínima no guarda el correo.** Si lo guardara, el índice único de correos y la regla «un correo, una persona» harían chocar a
  quien después se une a una ficha que ya lo tenía. El correo de contacto se completa al unirse, con la regla de siempre.
- **DECIDÍ mantener el código del correo** (Felipe lo eligió): nadie crea una cuenta con el correo de otra persona. Con Google no hace falta: Google ya
  confirmó el correo, y el servidor lo comprueba (`lib/google.ts`) antes de crear nada.
- **DESCARTÉ guardar una bolsa «de invitado» en la base.** La cookie ya alcanza y no escribe datos de quien no se identificó.
- **DESCARTÉ borrar la portada sin precios por completo:** su franja de confianza («Separas sin pagar», «Recoges en tu tienda»…) sigue en el Inicio de
  quien no tiene sesión.

## Lo que Felipe tiene que hacer a mano (producción)

1. **Pegar la migración `20261017175000`** (una sola parte, repetible, sin políticas: sin riesgo de deadlock) y refrescar el volcado del diccionario.
2. **Para Google** (en el proyecto de inicio de sesión de CLIENTES, no el del ERP): crear un cliente OAuth en Google Cloud con la dirección de vuelta
   `https://<proyecto>.supabase.co/auth/v1/callback`; en Authentication ▸ Providers ▸ Google, pegar su id y su secreto y encenderlo; agregar
   `https://<dominio>/auth/google` a las direcciones permitidas; **encender «Allow new users to sign up»** (con «Confirm email» ya encendido) —sin eso
   un Google nuevo recibe «Signups not allowed»—; y en Vercel de la tienda `NEXT_PUBLIC_TIENDA_GOOGLE=si`. Sin el último paso el botón no sale.
3. **Revisar los textos legales** (Términos del Club y Política de privacidad, siguen siendo un borrador): ahora dicen que la cuenta se crea con lo mínimo y
   que el Club empieza al dar el documento y el celular.

## Se rompe si

- Alguien pone documento o celular a una ficha mínima por fuera de `tienda_unirse_al_club`: deja de ser mínima y su cuenta ya no puede pasar a otra ficha.
- Se apaga «Confirm email» en el proyecto de clientes teniendo «Allow new users to sign up» encendido: cualquiera ocuparía correos ajenos.

## Cómo se verifica

`pnpm pruebas:tienda-cuenta-simple` (60 escenarios, con `APLICAR_ANTES=1` antes de pegar), `pnpm pruebas:tienda-cuentas`, `-bolsa`, `-ficha`, `-separadas`,
`-club`, `-puerta`, `-mi-cuenta` y `pruebas:clientas-correo` (esta última se ajustó: la PARTE 2 de 20261015055000 no pisa una `fn_cuenta_web_reglas`
posterior); `pnpm --filter tienda test` (522), `typecheck`, `lint`; `pnpm knip` y `pnpm knip:produccion`.
