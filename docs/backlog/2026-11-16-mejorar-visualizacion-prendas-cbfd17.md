# Fotos de prenda: la puerta única (hecho) y el «pantalón que sale buzo» (pendiente)

Rama `claude/mejorar-visualizacion-prendas-cbfd17`, 2026-11-16.

## Hecho (fase 1)
- Toda foto de prenda se lee y se abre al elegirla (`lib/foto-elegida-cliente.ts`): la que no abre no deja tarjeta rota ni error en
  inglés, y la que abre queda copiada en memoria. HEIC/AVIF que el navegador abre se pasan a JPG.

## Pendiente (fase 2: la IA dibuja un pantalón de tela como buzo)
- [ ] **El pedido con molde no sabe de la cintura** (`PROMPT_CON_MOLDE`, `lib/openai-imagen-reglas.ts`): nombra «mangas, cuello, el
      elástico» y copia la forma del primer color. Si el primero salió buzo, todos salen buzo. Que hable de pretina, pierna y basta.
- [ ] **Un primer color descartado no es molde**: si la persona eligió «Usar mi foto» en el primer color, el segundo se arma desde cero.
- [ ] **Medir con una lámina de pantalones** (lino, drill, jean, un buzo de verdad, una falda) en el laboratorio de fotos, como se hizo
      con las blusas (ADR-0659). El código lo dice: «Sin medir todavía con una lámina de pantalones».
- [ ] **Una línea de cómo tomar la foto** donde se sube: «Pantalón: extendido sobre la mesa, con las dos piernas y la pretina a la vista».
- [ ] (A decidir) mandar también la foto de detalle de la tela en Nuevo producto; hoy solo viaja el frente.
