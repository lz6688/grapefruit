import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import rootPkg from "../../package.json" with { type: "json" };
import fridaPkg from "../../node_modules/frida/package.json" with { type: "json" };
import frida16Pkg from "../../node_modules/frida16/package.json" with {
  type: "json",
};

const staticVersions = {
  igf: rootPkg.version,
  frida: fridaPkg.version,
  frida16: frida16Pkg.version,
} as const satisfies Record<string, string>;

export default async function get(pkg: string) {
  const known = staticVersions[pkg as keyof typeof staticVersions];
  if (known) return known;

  const {
    default: { version },
  } = await pkgJSON(pkg);
  return version;
}

async function pkgJSON(pkg: string): Promise<{ default: { version: string } }> {
  return import(path.join(pkg, "package.json")).catch((_) => {
    const abs = fileURLToPath(import.meta.resolve(pkg));
    const needle = "node_modules" + path.sep;
    const index = abs.lastIndexOf(needle);
    const prefix = abs.substring(0, index + needle.length);
    const url = pathToFileURL(path.join(prefix, pkg, "package.json")).href;
    return import(url, {
      with: { type: "json" },
    });
  });
}
