import fs from "node:fs";
import path from "node:path";

export const listApiRouteFiles = () => {
  const root = path.resolve(process.cwd(), "src", "app", "api");
  const output: string[] = [];

  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(resolved);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith("route.ts")) continue;
      output.push(path.relative(root, resolved).replaceAll("\\", "/"));
    }
  };

  walk(root);
  return output.sort();
};
