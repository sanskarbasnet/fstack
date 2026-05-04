#!/usr/bin/env bun
/**
 * fstack-brain CLI — entry point.
 *
 * Subcommands:
 *   doctor                              health check
 *   sync                                pull brain digest
 *   heartbeat [--status S]              write presence
 *   log-edit  --file P [--op O] [--summary S]
 *   intent get|write|infer|ship
 *   handoff write|auto|list
 *   conflict-precheck
 *   presence
 *   decide write|search
 *   standup [--window day|week]
 *   why --target P
 */

import { doctor } from "./commands/doctor.ts";
import { syncCmd } from "./commands/sync.ts";
import { heartbeat } from "./commands/heartbeat.ts";
import { logEditCmd } from "./commands/log-edit.ts";
import {
  intentGet,
  intentWrite,
  intentInfer,
  intentShip,
} from "./commands/intent.ts";
import {
  handoffWrite,
  handoffAuto,
  handoffsList,
} from "./commands/handoff.ts";
import { conflictPrecheck } from "./commands/conflict-precheck.ts";
import { presenceShow } from "./commands/presence.ts";
import { decideWrite, decideSearch } from "./commands/decide.ts";
import { standupCmd } from "./commands/standup.ts";
import { whyCmd } from "./commands/why.ts";
import { flushCmd, queueStatusCmd } from "./commands/flush.ts";
import { handoffPickup } from "./commands/pickup.ts";
import { coordinate } from "./commands/coordinate.ts";
import { blameCmd } from "./commands/blame.ts";
import {
  wishlistAdd,
  wishlistList,
  wishlistPromote,
  wishlistReject,
  wishlistSnooze,
} from "./commands/wishlist.ts";

function parseArgs(rest: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a) continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

const HELP = `fstack-brain — multi-agent coordination CLI

Usage:
  fstack-brain <command> [subcommand] [--flags]

Commands:
  doctor                              run health checks
  sync                                pull brain digest (used by SessionStart hook)
  heartbeat [--status S] [--files A,B,C]
  log-edit --file P [--op O] [--summary S]
  intent get
  intent write --title T [--body B] [--promises P] [--not-touching NT]
  intent infer --prompt P
  intent ship [--pr-url U]
  handoff write --note N [--blocker B] [--next-step S] [--to-agent A]
  handoff auto                        used by SessionEnd hook
  handoff list
  handoff pickup [--id <uuid>]        claim + hydrate context (used by /pickup)
  conflict-precheck                   used by PreToolUse on git push
  presence                            show other agents' live state
  decide write --title T --body B
  decide search --query Q [--limit N]
  standup [--window day|week]
  why --target P
  coordinate --topic "<text>"         scan brain for collisions before coding
  blame --file P [--line N]           git blame + brain context (intents, decisions)
  wishlist add --title T [--body B] [--tags csv]   capture a future idea
  wishlist list [--status S]          list ideas (default status=open)
  wishlist promote --id <prefix>      promote idea → intent on current branch
  wishlist reject --id <prefix> [--reason R]
  wishlist snooze --id <prefix>
  flush                               manually drain the local write queue
  queue                               show local queue depth
`;

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const args = parseArgs(rest);

  try {
    switch (cmd) {
      case "doctor":
        return await doctor();
      case "sync":
        return await syncCmd();
      case "heartbeat":
        return await heartbeat({
          status: typeof args.status === "string" ? args.status : undefined,
          activeFiles:
            typeof args.files === "string"
              ? args.files.split(",").map((s) => s.trim()).filter(Boolean)
              : undefined,
        });
      case "log-edit":
        return await logEditCmd({
          file: typeof args.file === "string" ? args.file : undefined,
          op: typeof args.op === "string" ? (args.op as any) : "edit",
          summary: typeof args.summary === "string" ? args.summary : undefined,
        });
      case "intent": {
        const sub = rest[0];
        const subArgs = parseArgs(rest.slice(1));
        if (sub === "get") return await intentGet();
        if (sub === "write")
          return await intentWrite({
            title: str(subArgs.title),
            body: str(subArgs.body),
            promises: str(subArgs.promises),
            notTouching: str(subArgs["not-touching"]),
          });
        if (sub === "infer")
          return await intentInfer({ prompt: str(subArgs.prompt) });
        if (sub === "ship")
          return await intentShip({ prUrl: str(subArgs["pr-url"]) });
        process.stderr.write(`unknown intent subcommand: ${sub}\n`);
        process.exit(2);
      }
      case "handoff": {
        const sub = rest[0];
        const subArgs = parseArgs(rest.slice(1));
        if (sub === "write")
          return await handoffWrite({
            note: str(subArgs.note),
            blocker: str(subArgs.blocker),
            nextStep: str(subArgs["next-step"]),
            toAgent: str(subArgs["to-agent"]),
          });
        if (sub === "auto") return await handoffAuto();
        if (sub === "list") return await handoffsList();
        if (sub === "pickup")
          return await handoffPickup({ id: str(subArgs.id) });
        process.stderr.write(`unknown handoff subcommand: ${sub}\n`);
        process.exit(2);
      }
      case "conflict-precheck":
        return await conflictPrecheck();
      case "presence":
        return await presenceShow();
      case "decide": {
        const sub = rest[0];
        const subArgs = parseArgs(rest.slice(1));
        if (sub === "write")
          return await decideWrite({
            title: str(subArgs.title),
            body: str(subArgs.body),
          });
        if (sub === "search")
          return await decideSearch({
            query: str(subArgs.query),
            limit: typeof subArgs.limit === "string" ? parseInt(subArgs.limit, 10) : undefined,
          });
        process.stderr.write(`unknown decide subcommand: ${sub}\n`);
        process.exit(2);
      }
      case "standup":
        return await standupCmd({
          window: str(args.window) === "week" ? "week" : "day",
        });
      case "why":
        return await whyCmd({ target: str(args.target) });
      case "flush":
        return await flushCmd();
      case "queue":
        return await queueStatusCmd();
      case "coordinate":
        return await coordinate({ topic: str(args.topic) });
      case "blame":
        return await blameCmd({
          file: str(args.file),
          line: typeof args.line === "string" ? parseInt(args.line, 10) : undefined,
        });
      case "wishlist": {
        const sub = rest[0];
        const subArgs = parseArgs(rest.slice(1));
        if (sub === "add")
          return await wishlistAdd({
            title: str(subArgs.title),
            body: str(subArgs.body),
            tags: str(subArgs.tags),
          });
        if (sub === "list")
          return await wishlistList({
            status: str(subArgs.status),
            limit:
              typeof subArgs.limit === "string"
                ? parseInt(subArgs.limit, 10)
                : undefined,
          });
        if (sub === "promote")
          return await wishlistPromote({ id: str(subArgs.id) });
        if (sub === "reject")
          return await wishlistReject({
            id: str(subArgs.id),
            reason: str(subArgs.reason),
          });
        if (sub === "snooze")
          return await wishlistSnooze({ id: str(subArgs.id) });
        process.stderr.write(`unknown wishlist subcommand: ${sub}\n`);
        process.exit(2);
      }
      default:
        process.stdout.write(HELP);
        process.exit(2);
    }
  } catch (err: any) {
    process.stderr.write(`fstack-brain: ${err?.message ?? err}\n`);
    process.exit(1);
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

main();
