// Empacota o código do motor (engine/) num JSON que vai junto com a aplicação.
// A API copia esses arquivos para cada Vercel Sandbox, então o motor que roda a
// edição é sempre o da mesma versão da interface publicada.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const engine = join(web, "..", "engine");

const files = [];
for (const name of readdirSync(join(engine, "elotake_engine")).sort()) {
  if (name.endsWith(".py")) {
    files.push({ path: `elotake_engine/${name}`, content: readFileSync(join(engine, "elotake_engine", name), "utf8") });
  }
}
for (const name of ["setup.sh", "run.sh"]) {
  files.push({ path: name, content: readFileSync(join(engine, "sandbox", name), "utf8") });
}

const out = join(web, "src", "generated", "engine.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ files }));
console.log(`motor empacotado: ${files.length} arquivos → src/generated/engine.json`);
