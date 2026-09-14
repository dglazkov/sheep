/**
 * The peek's verb (drove phase 1): `sheep sh <id> [-- <line>]`, one line
 * in a sheep's shell for the dog, outside any turn. The line is the words
 * after `--`, joined as a prompt's are; stdin is sent when it is a pipe or
 * a regular file, read to its end before the home is asked, and left alone
 * when it is anything else (a terminal, `/dev/null`, a socket a tool runner
 * holds open), so a verb run under such a runner never waits on it. The
 * bytes are sent as read: whether they are text is the line's to decide.
 *
 * What the home answers is printed as given: the line's stdout on stdout,
 * its stderr on stderr, nothing added, and the line's code is the verb's.
 * The verb's own words are the home's refusals: a sheep mid-turn, and a
 * session the home does not have, each its sentence on stderr and exit 2,
 * as every verb gives them.
 */
import { fstatSync, readSync } from "node:fs";
import { type Home, Sentence } from "./home.js";

/**
 * Stdin for a peek: its bytes when fd 0 is a pipe or a regular file and it
 * held something; `undefined` when it is anything else or empty. Read
 * synchronously to the end, which a pipe's writer closing, or a file's
 * length, ends.
 */
export function readPeekStdin(fd = 0): Uint8Array | undefined {
  let kind;
  try {
    kind = fstatSync(fd);
  } catch {
    return undefined;
  }
  if (!kind.isFIFO() && !kind.isFile()) return undefined;
  const chunks: Buffer[] = [];
  const buffer = Buffer.alloc(64 * 1024);
  for (;;) {
    let read: number;
    try {
      read = readSync(fd, buffer, 0, buffer.length, null);
    } catch (error) {
      // A pipe opened non-blocking says so instead of waiting; wait a moment and read again.
      if (error instanceof Error && "code" in error && error.code === "EAGAIN") {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        continue;
      }
      if (error instanceof Error && "code" in error && error.code === "EOF") break;
      throw error;
    }
    if (read === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, read)));
  }
  const bytes = Buffer.concat(chunks);
  return bytes.length === 0 ? undefined : new Uint8Array(bytes);
}

interface PeekOutput {
  out(text: string): void;
  err(text: string): void;
}

/** The verb: the line through the home's peek, the streams printed as given, the code returned. */
export async function runPeek(home: Home, id: string, line: string, stdin: Uint8Array | undefined, output: PeekOutput): Promise<number> {
  try {
    const answer = await home.sh(id, line, stdin);
    output.out(answer.stdout);
    output.err(answer.stderr);
    return answer.exit;
  } catch (error) {
    if (!(error instanceof Sentence)) throw error;
    // Mid-turn, a session the home does not have, a home below the floor: each the home's sentence and exit 2, as `fail` gives them.
    output.err(`sheep: ${error.message}\n`);
    return 2;
  }
}
