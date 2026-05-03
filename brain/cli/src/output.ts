/**
 * Dual output: human-readable on TTY, JSON on non-TTY for subagent consumption.
 * Mirrors gbrain's convention.
 */

export const isTTY = Boolean(process.stdout.isTTY);

export function emit(human: string, structured: unknown): void {
  if (isTTY) {
    process.stdout.write(human.endsWith("\n") ? human : human + "\n");
  } else {
    process.stdout.write(JSON.stringify(structured) + "\n");
  }
}

export function emitError(message: string, code: number = 1): never {
  if (isTTY) {
    process.stderr.write(`fstack: ${message}\n`);
  } else {
    process.stderr.write(JSON.stringify({ error: message }) + "\n");
  }
  process.exit(code);
}
