/**
 * `collie --help`: the verb-by-verb reference for the second command of
 * sheep's package (collie phase 1). The shepherd's surface: what this
 * build does. The rig (`collie local`) is the developer's and the rings',
 * and is not named here, as `sheep --help` names no local home.
 */
import { INSTALL_SPEC } from "../setup.js";

export const COLLIE_USAGE = `collie — isocan's rc, standing by at your Cloudflare account beside your sheep

usage:
  collie [--json]                           the report: standing by since when, or off; each canvas it stands by on;
                                            each agent on it with its sheep's id and lane, whether it was born here or
                                            handed over, and its turns in the last hour against the ceiling
  collie log [--follow] [--last <n>] [--since <seq>] [--json]
                                            the narration, one line per row, the clock first, then the rc's line; the
                                            newest 100 by default, the newest n with --last, those after a seq with
                                            --since; --follow asks for more every two seconds until Ctrl-C;
                                            --json is one row per line
  collie off                                release every hold at once: each canvas reads nobody listening, and the
                                            enrolments, the badge, and the sheep stay
  collie on                                 stand by again; what was mentioned meanwhile is the next summons
  collie new --pass                         hand the collie a pass isocan minted for this shepherd; the pass's
                                            address is typed at a hidden prompt, or one line of stdin without a
                                            terminal; never an argument, never kept in a file
  collie pass                               hand it another pass the same way: a second canvas becomes a room, a pass
                                            minted for an agent makes that agent the collie's
  collie --agent-help                       the guide for an agent: what a collie is, and what is whose
  collie --version

Each verb talks to the collie this kennel's config names (.sheep/ at or above the working directory, else
~/.sheep). A refusal is one line on stderr, collie: <why>, and exit 1; the collie's own refusals are its words
as it said them. A mistake in the arguments is exit 2.

Any verb says on stderr, once, that a newer build is out, and once that the collie's build and this command's
differ: npm install -g ${INSTALL_SPEC} updates the command, collie deploy the collie.
`;
