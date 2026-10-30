/** 极简 CLI 参数解析：--key value / --flag / --key=value */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      i += 1;
      continue;
    }
    const eq = token.indexOf("=");
    if (eq !== -1) {
      result[token.slice(2, eq)] = token.slice(eq + 1);
      i += 1;
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      result[key] = next;
      i += 2;
    } else {
      result[key] = true;
      i += 1;
    }
  }
  return result;
}

export function requireString(
  args: Record<string, string | boolean>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`缺少参数 --${key}`);
  }
  return value;
}

export function optionalString(
  args: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}
