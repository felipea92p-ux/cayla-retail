# ADR-0593 — «Avísame»: la tienda ve quién espera, y le escribe solo si ella lo pidió (Felipe, 2026-10-31)

**Estado:** aceptado · migración `20261031181000` solo en local; producción espera el OK de Felipe.
**Maqueta que se eligió mirando:** `docs/maquetas/tienda-avisame-2026-10/index.html` (opción B).

## Problema
La pantalla Tienda web ▸ Vitrina ▸ Esperan una talla (ADR-0408, act. 12) decía cuántas personas tocaron «Avísame», sin quiénes. Su
migración (`20261015030000`) lo decidió a propósito: sin datos personales, porque a cada persona le avisa su cuenta, nunca la tienda por
WhatsApp (ADR-0288 G-5). Felipe pidió ver quiénes eran.

La primera versión (PR #1541, opción C de la maqueta) mostraba nombre, celular y correo de todas. Al revisar el flujo completo apareció el
conflicto: la clienta lee «Te avisaremos **en tu cuenta**» y la política de privacidad dice «sin publicidad por WhatsApp; te escribimos solo
por tus pedidos». Enseñar su celular a la tienda contradecía esa promesa, y el permiso de publicidad del Club (`whatsapp_consentimiento_en`)
es otra cosa: no cubre este uso (Ley 29733).

## Decisión
DECIDÍ: el permiso de escribirle por WhatsApp se pide **al pedir el aviso**, con una casilla «Escríbeme por WhatsApp cuando llegue»
**apagada de fábrica**, y se guarda con su fecha en `retail.esperas_web.whatsapp_pedido_en` (vacío = no lo pidió). `tienda_avisame` gana un
parámetro (`p_whatsapp boolean default false`) y reemplaza al de 3; el permiso se registra solo si la ficha tiene celular.
DECIDÍ: `fn_vitrina_esperan()` devuelve `quienes` por prenda y tienda: **nombre y desde cuándo de todas**; **el celular solo de quien lo
pidió** (`pidio_whatsapp`). Nunca el correo. Quitar el aviso retira el permiso (la espera quitada no sale).
DESCARTÉ: C (todo a la vista con una marca «sin permiso»): la marca avisa pero no impide escribirle. Y A (solo el nombre): no deja
avisarle a quien sí quiere que le escriban. Felipe eligió B mirando la maqueta.
SE ROMPE SI: la casilla se pre-marca o se esconde en la tienda (el permiso deja de valer); si alguien lee `esperas_web` por fuera de estas
dos funciones; o si se usa el celular de quien pidió el aviso de una prenda para ofrecerle otras.

## Cómo se cuida
- Ficha anonimizada o cuenta cerrada: sin nombre ni celular (cuenta como persona, no se muestra).
- Mismo candado de siempre en el ERP: módulo `vitrina_web` (el vigilante de fichas lo conoce: `DE_VITRINA_ESPERAN`). La tabla sigue sin
  políticas ni grants; `tienda_avisame` es solo de `tienda_web`.
- Las esperas que ya existían quedan sin permiso (`whatsapp_pedido_en` vacío): nadie ve su celular hasta que pida un aviso nuevo.
- La política de privacidad de la tienda lo dice (`apps/tienda/app/privacidad/page.tsx`).
- Pruebas: `pruebas:tienda-club` (permiso por espera, firma de 4 argumentos, sin correo ni DNI) y `lib/vitrina-esperan-reglas.test.ts`.

## No incluido
«Marcar avisada» (el botón que aparece en la maqueta B): necesita una función que escribe y firma con el responsable; queda para otra ronda.
El Probador de la Vitrina queda oculto en las pestañas, no borrado (la pantalla abre por URL).
