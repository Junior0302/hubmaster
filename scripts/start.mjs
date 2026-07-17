import { spawn } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const port = process.env.PORT || "3000";

const child = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "0.0.0.0", "--port", port],
  { stdio: "inherit", env: process.env },
);

child.on("exit", (code) => process.exit(code ?? 0));
