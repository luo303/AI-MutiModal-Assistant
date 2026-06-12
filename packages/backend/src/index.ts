import express from "express";
import { createServer } from "node:http";
import cors from "cors";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

server.listen(PORT, () => {
  console.log(`backend listening on http://localhost:${PORT}`);
});