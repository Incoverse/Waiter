import fs from "fs/promises";
import path from "path";

export function getStaticProps(cls: any) {
  return Object.getOwnPropertyNames(cls)
    .filter((p) => !["length", "name", "prototype"].includes(p))
    .map((p) => [p, cls[p]]);
}

export async function importLocalModule(modulePath: string) {
  return await import(
    (process.platform == "win32" ? "file://" : "") + path.resolve(modulePath)
  );
}

export async function getAllModules(
  dir: string,
  filter?: RegExp | ((path: string) => boolean),
) {
  const modules: any[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subModules = await getAllModules(fullPath, filter);
      modules.push(...subModules);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(`.${global.isCompiled ? "js" : "ts"}`) &&
      (!filter ||
        (filter instanceof RegExp ? filter.test(fullPath) : filter(fullPath)))
    ) {
      modules.push(path.resolve(fullPath));
    }
  }

  return modules;
}

export function extendsClass(child: Function, parent: Function) {
  let proto = child.prototype;

  while (proto) {
    proto = Object.getPrototypeOf(proto);
    if (proto === parent.prototype) return true;
  }

  return false;
}
