import { z } from "zod";

const envSchema = z.object({
  PORT: z
    .string()
    .default("3001")
    .transform((v) => Number(v)),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DOUBAO_ASR_APP_ID: z.string().min(1, "DOUBAO_ASR_APP_ID is required"),
  DOUBAO_ASR_ACCESS_TOKEN: z.string().min(1, "DOUBAO_ASR_ACCESS_TOKEN is required"),
  DOUBAO_TTS_APP_ID: z.string().min(1, "DOUBAO_TTS_APP_ID is required"),
  DOUBAO_TTS_ACCESS_TOKEN: z.string().min(1, "DOUBAO_TTS_ACCESS_TOKEN is required"),
  GLM_API_KEY: z.string().min(1, "GLM_API_KEY is required"),
  GLM_API_BASE_URL: z.string().url("GLM_API_BASE_URL must be a valid URL"),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`[env] Configuration errors:\n${errors}`);
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
