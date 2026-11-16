# 2026-11-16 · Lo que queda de la estación de impresión (ADR-0670)

Rama `claude/estacion-de-impresion`.

## POR PEGAR en producción (Felipe)

- [ ] `supabase/migrations/20261116204000_cola_de_impresion.sql`, una sola parte (tabla y funciones nuevas, sin políticas). Se puede pegar
  antes o después de publicar la web: los interruptores nacen apagados. Comprobar: `select count(*) from retail.impresiones;` responde 0.
  Después, `pnpm datos:generar:produccion` para el diccionario.

## Probar en una tienda

- [ ] Una PC de caja con la guía «Imprimir sin diálogo» (Windows): calibrar «CAYLA Caja» y «CAYLA Etiquetas» y hacer su prueba final.
- [ ] Un celular del piso con «Imprimir en la caja» y la caja con «Imprimir lo que se vende en el piso»: una venta de verdad.

## Para después

- [ ] Ctrl+P en «CAYLA Caja» no pasa por el freno de la ventana (sale en la térmica). Si molesta, interceptar `beforeprint`.
- [ ] Cuando llegue la impresora inalámbrica del piso: apagar «Imprimir en la caja» en ese equipo y calibrar su Chrome.
