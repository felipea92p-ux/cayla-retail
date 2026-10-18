## 2026-10-17 (La pila local de clientes de la tienda vuelve a arrancar)
Qué hice: la pila local del proyecto de clientes (`apps/tienda/supabase/`) no arrancaba en la Mac de Felipe: el README decía
`npx supabase start` sin versión, y la CLI guardada allí (2.109) leía la ruta del aviso «cambió tu correo» desde `supabase/` y no desde la
raíz («open supabase/supabase/plantillas/correo-cambiado.html»). Ahora se levanta con `pnpm --filter tienda pila` (y `pila:parar`,
`pila:llaves`), que fija la CLI a la versión del CI (2.118.0); `lib/pila-local.test.ts` exige que sean la misma.
Por qué así: el `config.toml` estaba bien: la 2.115 (cambio #6160, 2026-08-18) hizo que plantillas y avisos se lean igual, desde la raíz.
Cambiar la ruta lo arreglaba en la 2.109 y lo rompía en toda CLI nueva; fijar la versión es lo mismo que ya hace el CI, por la misma razón.
Felipe se lleva: la tienda se vuelve a probar en local con cuentas (entrar, crear cuenta, el buzón de prueba) en cualquier máquina.
