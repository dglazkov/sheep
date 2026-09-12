/**
 * `sheep --help`: the verb-by-verb reference, and one of the four
 * documents the fence reads (stile phase 1). A shepherd's surface: the
 * herd's verbs, `sheep setup`, `sheep home`, `sheep home deploy` as the
 * upgrade, and `sheep home delete`. The developer's rig — the local home,
 * its stop, the scripted model, the container switch — is the checkout's,
 * and its words are in the README's developer half and nowhere here;
 * `packages/cli/test/surface.test.ts` holds this file to that.
 */
import { INSTALL_SPEC } from "./setup.js";

export const USAGE = `sheep — pi, running in a cell

usage:
  sheep new [--name <name>] [--pasture <name>] [--secret <NAME>]... [--detach] [--wait] [-- <prompt>]
                                            mint a session at the home, born into a pasture or into none; attach pi's
                                            terminal, or send the prompt; with --detach alone, print the id and exit;
                                            each --secret's value is a line of stdin, for this sheep alone
  sheep -c | --continue [--detach] [--wait] [-- <prompt>]       the same, on the newest session
  sheep attach <id> [--detach] [--wait] [-- <prompt>]           the same, on a named session; a second terminal on the same cell
  sheep ls [--pasture <name>]               the home's sessions: id, name, created, lane state, pasture, secret names; one
                                            per line, tab separated, the pasture empty for a pastureless sheep and the
                                            names (comma separated, never a value) empty for none; with --pasture, that herd
  sheep status <id>                         the lane now: open operation, last tool call, tokens so far, and last the
                                            pasture's setup.sh, from the sheep's row: setup: none | running (1m 40s) |
                                            ok (1m 52s) | failed (exit 1, 12.4 s). A sheep whose setup is running is
                                            answered from the row alone when the cell cannot answer in two seconds
  sheep wait [--timeout <seconds>] <id>...  block until every named session is idle; print each one's last assistant message
  sheep abort <id>                          stop the open operation
  sheep rm <id>                             end the session: its open turn aborted, its container and browser released, its
                                            rows gone, the pasture kept; prints <id>\\tended, with no undo (export first)
  sheep log [--since <entry id | ISO time>] [--last <n>] <id>   the transcript as text, oldest first, one block per entry,
                                            and a [setup] block where each of this sheep's setup.sh runs happened, with
                                            how it ended and the tail of what it printed (the last twenty are kept)
  sheep export <id> [file]                  write the session as a pi SQLite file (default <id>.sqlite)
  sheep config                              print the resolved home and this directory's kennel (never the token)
  sheep setup [--explain] [--no-install]    at a terminal: the sitting that readies this machine, seven steps that fill
                                            in — the command, where the settings go, the Cloudflare account token, the
                                            plan, the home deployed, the model key, and where it all is. The two values
                                            are typed at a hidden prompt, kept in ~/.sheep/credentials (mode 600), and
                                            asked for once; --explain opens every step's words. With no terminal, or
                                            with --json, it asks nothing and is the report an agent reads: the command on
                                            PATH (installed with npm install -g ${INSTALL_SPEC} when absent),
                                            the skill under .agents/skills/sheep with the .claude/skills doorway, a
                                            kennel .sheep/ here when no home is reachable, the home reported. Idempotent
  sheep --agent-help                        the guide for an agent: what sheep is, the verbs, the home, what needs a person
  sheep --version

  sheep home deploy [--name <worker>] [--subdomain <name>] [--json]
                                            the station: this package's home on the shepherd's Cloudflare account, a
                                            container beside every cell. Nothing without the account token and the model
                                            key, kept on this machine: absent, it prints what it needs and
                                            costs and exits 2. The name is the kennel's, minted at the first deploy and
                                            recorded in the config; run again, it redeploys the same Worker from this
                                            package and keeps its secrets
  sheep home delete [--name <worker>] [--json]
                                            end the station: lists what goes (the Worker at its address, its Durable
                                            Objects, its container application, how many sessions and pastures are in
                                            it, the config), then waits for the name typed at a terminal (one line of
                                            stdin without one; anything else is exit 2 with nothing deleted); deletes
                                            all of it and clears the config
  sheep home join <address> [--json]        a second machine's way in: the station's token is one line of stdin, piped,
                                            never an argument; the home is asked to answer as a sheep home and to take the
                                            token, then this kennel's config names it; prints the address, both stamps,
                                            and the image
  sheep home                                which kennel, which home the config names, its station's name once minted,
                                            which credentials are kept and where (never a value),
                                            whether it answers, and its build stamp beside this command's, with one line
                                            on stderr when they differ; the pen image its config named, when it says;
                                            whether it has eyes (a station deployed before they existed says no until
                                            \`sheep home deploy\` upgrades it)

  sheep pasture new <name> [--repo <url> | --repo .] [--branch <branch>]
                                            make a pasture: a shared tree, a repository or none, and the sheep born into it;
                                            --repo . reads this checkout's origin and stores the URL, uploading nothing;
                                            prints name, repository, branch
  sheep pasture ls                          the home's pastures: name, created
  sheep pasture <name>                      the meta, then the herd: id, name, state, born, task
  sheep pasture ls <name> [path]            the tree, or a directory in it; one path per line, a directory with its slash
  sheep pasture cat <name> <path>           a file of the tree, to stdout
  sheep pasture put <name> <path> [file]    write a file, or stdin, to the tree at <path>; whole, last write wins
  sheep pasture rm <name> <path>            remove a file, or a directory and what is under it
  sheep pasture secret set <name> <KEY>     set a secret; the value is stdin, never an argument (GIT_TOKEN is the credential)
  sheep pasture secret ls <name>            the secrets' names, one per line, never a value

options:
  --home <url>    which home; also SHEEP_HOME or the kennel's config ({"home": "...", "token": "..."})
  --json          machine output, pi's shapes: entries are pi entries, status is pi's lane snapshot,
                  a queued prompt is pi's queue response, a detached prompt is pi's operation response;
                  a held turn's entries stream as they land, one per line, the last assistant entry last;
                  ls rows carry "pasture": null | "<name>", "task": null | "<first line of the first prompt>", and
                  "secrets": [<the sheep's secret names, sorted>];
                  rm is {"id": …, "ended": true, "aborted": <whether a turn was stopped>};
                  status is the snapshot with "setup" beside it, or {"id", "state", "setup", "snapshot": null} while a
                  setup holds the cell; ls rows carry the same "setup"; log gives each setup block "type": "setup"
  --pasture <name>  with new: the pasture to be born into; with ls: only that herd
  --secret <NAME> with new, repeatable: a secret for this sheep alone, its value one line of stdin per name in the
                  order given, never an argument; laid over its pasture's secret of the same name in setup, and as
                  GIT_TOKEN over the pasture's and the home's when git asks; ended with the sheep. Refused at a terminal,
                  without --detach or a prompt, and on attach and -c
  --detach        with a prompt: send it and exit before the first token; the id is the first line of stdout.
                  With new and no prompt: mint the session, print its id, and exit; the sheep is idle, costs
                  nothing, and is born into its pasture at the first thing that asks it (a prompt, status, log)
  --wait          with a prompt to a busy session: stream the queued turn when it starts
  --subdomain <name>  with home deploy: the workers.dev subdomain to register when the account has none
  --no-install    with setup: report the command missing rather than installing it
  --explain       with setup at a terminal: open every step's words as it is reached

The kennel is .sheep/ at or above the working directory, found the way git finds .git, and ~/.sheep when there is
none: this directory's config, and the home it names. sheep setup settles where it goes; two directories share
nothing but the command, and cd is how you switch.

With a prompt after --, the reply streams and sheep exits when the turn ends. A prompt to a busy session is
queued behind the running turn, as pi queues a prompt typed mid-turn; sheep prints "queued <id>" and exits 0.
Without a prompt, sheep attaches pi's interactive terminal. wait exits 124 on timeout, with what had finished.
`;
