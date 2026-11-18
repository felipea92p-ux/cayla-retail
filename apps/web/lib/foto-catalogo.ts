import "server-only";
import { MODELO_OPENAI_POR_DEFECTO } from "@/lib/openai-imagen-reglas";

/**
 * «Catálogo con IA» solo se ofrece si el servidor tiene la llave de OpenAI (`OPENAI_API_KEY`, en Vercel para producción). Sin ella la opción no
 * aparece y las fotos se suben tal cual, como siempre (ADR-0442): el ERP no depende de la IA para funcionar (principio 9).
 */
export function fotoCatalogoDisponible(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function llaveOpenAI(): string {
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

/** El modelo de imagen. Se retiran rápido (`gpt-image-1` ya se apagó): se cambia con `OPENAI_IMAGEN_MODELO`, sin tocar código. */
export function modeloOpenAI(): string {
  return process.env.OPENAI_IMAGEN_MODELO?.trim() || MODELO_OPENAI_POR_DEFECTO;
}
