import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 从当前文件向上查找 monorepo 根目录的 .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../../.env") });

import { z } from "zod";

const envSchema = z.object({
  PORT: z
    .string()
    .default("3001")
    .transform((v) => Number(v)),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DOUBAO_ASR_APP_ID: z.string().min(1, "DOUBAO_ASR_APP_ID is required"),
  DOUBAO_ASR_ACCESS_TOKEN: z.string().min(1, "DOUBAO_ASR_ACCESS_TOKEN is required"),
  DOUBAO_TTS_APP_ID: z.string().optional().default(""),
  DOUBAO_TTS_ACCESS_TOKEN: z.string().optional().default(""),
  GLM_API_KEY: z.string().optional().default(""),
  GLM_API_BASE_URL: z.string().optional().default("https://open.bigmodel.cn/api/paas/v4"),
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
