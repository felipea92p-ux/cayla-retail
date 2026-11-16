# 2026-11-16 · Recibir: cerrar un envío

Rama `claude/receipt-closing-screens-5255cd`. ADR-0393, actualización 2026-11-16. Maquetas en `docs/maquetas/recibir-cierre-recibo-2026-11/` (sin commitear).

## Esperan una decisión de Felipe (tocan plata y stock)

- [x] **«Otro» también en lo que falta** (Felipe 2026-11-16): sin deuda, lo asume CAYLA. Migración `20261116230000` en el PR #1906.
- [ ] **Las demás opciones de «¿Qué pasó?»** al cerrar: sumar «Era para otra sede» (con cuál) a lo que sobra y que «Llegó a otra sede» también pida cuál.
  Hoy 203 de 205 prendas que no cuadraron se cerraron con «Otro».
- [ ] **El freno «¿Son de este envío?»** cuando lo de fuera de la guía supera a lo de la guía (maqueta, pantalla 1, forma B). ¿Ese tope u otro?
- [ ] **«No, son de otra compra» → pasar esas prendas a un envío sin aviso** del mismo proveedor y cerrar este con lo suyo. Necesita base.

## SQL en producción

- [x] `supabase/migrations/20261116230000_recepcion_otro_tambien_si_falta.sql` **pegada el 2026-11-16** con el OK de Felipe (md5 de `cerrar_conteo_envio` después:
  `54512ceb43e9ca4836b7d5aab1ac9419`). Comprobación:
  `select position('recepcion_faltante_otro' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) > 0;` → `t`.

## Para revisar en producción (no es código)

- [ ] **ENV-000023:** 203 prendas de MIYAN 777 (138 Polo Básico Cayla, 58 Pantalón Cayla Lino, 7 Vestido Amapola) entraron a Tienda TRU fuera de la guía con
  «Otro: Se mando a otra sede». Que Compras confirme de qué compra son y si están pagadas.
- [ ] **Polo Básico Cayla (POL-0083):** entró con talla «Estándar» además de S, M y L, y el Blanco sin L. ¿Se contó bien? Lo dejó ver la tabla nueva.

## Sin verificar

- [ ] Con una cuenta real y la base: cerrar de punta a punta (la firma, el aviso, «Volver» con el aviso de 7 s en la lista). Se probó con una página temporal sin
  base: la vuelta terminó en el login y el aviso de la lista no se vio.
- [ ] `guias:recorrer` de `/recibir/envio/[id]` y `tema:auditar` (no hay un envío cerrado en la base local compartida).
- [ ] La prueba ciega de `/formidable` sobre la pantalla nueva.
