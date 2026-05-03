import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type FstackConfig = {
  agent_id: string;
  brain_url: string;
  brain_anon_key: string;
  machine: string;
  auto_upgrade: boolean;
  telemetry: "off" | "local" | "on";
};

const CONFIG_PATH =
  process.env.FSTACK_HOME
    ? join(process.env.FSTACK_HOME, "config.yaml")
    : join(homedir(), ".fstack", "config.yaml");

/**
 * Tiny YAML parser — only handles the flat key: value shape we ship.
 * No nested maps, no arrays, no anchors. Avoids a dep.
 */
function parseFlatYaml(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of src.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

export function loadConfig(): FstackConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `fstack config not found at ${CONFIG_PATH}. Run ./setup from your fstack install root.`
    );
  }
  const raw = readFileSync(CONFIG_PATH, "utf8");
  const parsed = parseFlatYaml(raw);

  const required = ["agent_id", "brain_url", "brain_anon_key"] as const;
  for (const k of required) {
    if (!parsed[k]) {
      throw new Error(`fstack config ${CONFIG_PATH} missing required field: ${k}`);
    }
  }

  return {
    agent_id: parsed.agent_id!,
    brain_url: parsed.brain_url!,
    brain_anon_key: parsed.brain_anon_key!,
    machine: parsed.machine ?? "unknown",
    auto_upgrade: parsed.auto_upgrade === "true",
    telemetry: (parsed.telemetry as FstackConfig["telemetry"]) ?? "off",
  };
}

/** Try to load config; return null if missing (used by doctor and graceful hooks). */
export function tryLoadConfig(): FstackConfig | null {
  try {
    return loadConfig();
  } catch {
    return null;
  }
}

export const CONFIG_PATH_FOR_TESTS = CONFIG_PATH;
