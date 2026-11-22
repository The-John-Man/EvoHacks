import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The Vercel site serves the same static entry points as the local screener.
// Keep server functions, provider credentials and automation tools out of its public output.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist");
await mkdir(output, { recursive: true });
for (const asset of ["index.html", "styles.css", "js", "auth", "apply", "practice"]) {
  await cp(join(root, asset), join(output, asset), { recursive: true });
}
