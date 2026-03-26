import { CronJob } from "cron";
import fs from "fs/promises";
import path from "path";
import type { ZodJSONSchema } from "zod";

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

export async function findFiles(
  dir: string,
  filter?: RegExp | ((path: string) => boolean),
) {
  const files: any[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await findFiles(fullPath, filter);
      files.push(...subFiles);
    } else if (
      entry.isFile() &&
      (!filter ||
        (filter instanceof RegExp ? filter.test(fullPath) : filter(fullPath)))
    ) {
      files.push(path.resolve(fullPath));
    }
  }

  return files;
}

export function extendsClass(child: Function, parent: Function) {
  let proto = child.prototype;

  while (proto) {
    proto = Object.getPrototypeOf(proto);
    if (proto === parent.prototype) return true;
  }

  return false;
}


export function schedule(cron: string, runImmediately = false, announce=true) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      ...args: any[]
    ) {
      try {
        if (announce) {
        console
          .withSender("CRON")
          .debug(
            `Running scheduled task ${target.constructor.name}.${propertyKey} with cron "${cron}"`,
          );
        }
        await originalMethod.apply(this, args);
      } catch (error) {
        console
          .withSender("CRON")
          .error(`Error running scheduled task ${target.constructor.name}.${propertyKey}:`, error);
      }
    };


    new CronJob(cron, descriptor.value.bind(target), null, true, undefined, null, runImmediately);
    return descriptor;
  };
}


export function schemaParse(schema: ZodJSONSchema, data: any) {
  try {
    const res = schema.safeParse(data);

    if (!res.success) {
      console.error("Error parsing data with schema:", res.error);
      throw res.error;
    }

    return res.data;
  } catch (error) {
    console.error("Error parsing data with schema:", error);
    throw error;
  }
}


export function parseDuration(durationStr: string): number {
  const units: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    mo: 1000 * 60 * 60 * 24 * 31,
    y: 365 * 24 * 60 * 60 * 1000,
  };

  const normalized = durationStr.replace(/\s+/g, "").toLowerCase();
  if (!normalized) return NaN;

  // Order matters: longer unit tokens (mo, ms) must be checked before m/s.
  const tokenRegex = /(\d+)(mo|ms|y|w|d|h|m|s)/g;
  let total = 0;
  let consumedLength = 0;

  for (const match of normalized.matchAll(tokenRegex)) {
    const value = Number(match[1]);
    const unit = match[2];
    total += value * units[unit];
    consumedLength += match[0].length;
  }

  // Reject malformed strings (e.g. "3mx" or "abc").
  if (consumedLength !== normalized.length) return NaN;

  return total;
}

export function formatDuration(durationMs: any, full=false, noMS=false): string {
  const units = [
    { label: (full ? " year(s)" : 'y'), ms: 1000 * 60 * 60 * 24 * 365 },
    { label: (full ? " month)s)" : 'mo'), ms: 1000 * 60 * 60 * 24 * 31},
    { label: (full ? " week(s)" : 'w'), ms: 1000 * 60 * 60 * 24 * 7 },
    { label: (full ? " day(s)" : 'd'), ms: 1000 * 60 * 60 * 24 },
    { label: (full ? " hour(s)" : 'h'), ms: 1000 * 60 * 60 },
    { label: (full ? " minute(s)" : 'm'), ms: 1000 * 60 },
    { label: (full ? " second(s)" : 's'), ms: 1000 },
    ...(noMS ? [] : [{ label: (full ? " millisecond(s)" : 'ms'), ms: 1 }])
  ];

  let duration = durationMs;
  let durationStr = '';

  for (const unit of units) {
    const count = Math.floor(duration / unit.ms);
    if (count > 0) {
      durationStr += `${count}${full ? (count == 1 ? unit.label.replace("(s)","") : unit.label.replace(/\((.*?)\)/, "$1")) : unit.label} `;
      duration -= count * unit.ms;
    }
  }

  return durationStr.trim();
}


export function deepAssign(target: { [x: string]: any; }, source: { [x: string]: any; }) {
  for (const key in source) {
      if (source[key] instanceof Object) {
          if (!target[key]) {
              target[key] = {};
          }
          deepAssign(target[key], source[key]);
      } else {
          target[key] = source[key];
      }
  }

  return target;
}