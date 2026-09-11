#!/usr/bin/env node
/**
 * The rings: prove a release the way a user meets it, in an environment
 * this checkout's state cannot reach. Collar phase 0 built the package
 * ring; collar phase 1 gave it the local home; collar phase 2 gave it
 * setup, so the walk is journey 1 whole, from `npx <spec> setup` to
 * `sheep --version`, with the installed command and nothing else.
 *
 *   pnpm hermetic --ring package [ref]     ref defaults to refs/heads/release of this repository
 *   pnpm hermetic --ring machine [ref]     the package ring inside a container from node:22-slim, then node:24-slim (collar phase 3)
 *   pnpm hermetic --ring dog [ref|spec]    the machine ring's container with Claude Code in it, given the skill and journey 1's sentence (collar phase 4)
 *   pnpm hermetic --ring account [ref|spec] the package ring's install, then a station on the shepherd's Cloudflare account: deployed, walked, deleted (station phase 1)
 *   --docker                               package ring: the blog home with a container (station phase 4); exit 2 on a machine without Docker
 *   --no-eyes                              package ring: e1 (the look) skipped with one line and named at the end; what the machine ring passes to its container's walk (eyes phase 2)
 *   --repo <path>                          the repository the ref is read from and installed from (default: this checkout; a bare repository works)
 *   --spec <spec>                          install this spec instead of a ref: `github:dglazkov/sheep#release` needs no repository at all
 *   --commit <sha>                         with --spec: the installed build must be stamped with this commit
 *   --image <name>                         machine ring: one image instead of both (repeatable); dog ring: instead of node:24-slim
 *   --keep                                 leave the ring's directory, and its local home running, and say where
 *   --yes                                  dog and account rings: the shepherd has read the estimate; do not ask
 *   --dry-run                              dog ring: build, probe, add the skill, print the `claude -p` command, and stop before it; no key is needed
 *                                          account ring: the preflight alone: the price, the account, its listing, the image on the registry; nothing deployed
 *   --name <worker>                        account ring: the station's name (default sheep-hermetic-<sha>)
 *   --older <ref>                          account ring: the release deployed first and upgraded from (default: the ref's first parent when it is a release commit; refused otherwise)
 *   --budget <usd>                         dog ring: Claude Code's --max-budget-usd (default 5)
 *   --timeout <minutes>                    dog ring: the container is killed after this long (default 30)
 *   --agent <name>                         dog ring: claude-code, the only dog so far
 *
 * These are the outer rings, which prove a release. The inner three —
 * `checkout`, `command`, `home` — are `pnpm test --ring <name>` and prove
 * this checkout; `scripts/rings.mjs` holds both halves of the ladder and
 * the reasoning. The rule is the same on either side of it.
 *
 * The rings are one script with one walk: the ring chooses the environment,
 * never the steps. The machine ring exports the ref into a build context as
 * a bare repository, builds an image from `node:22-slim` and one from
 * `node:24-slim` with git and procps added (git because the README names
 * it as a prerequisite and npm's git installer needs it; procps because
 * this script reads `ps`), copies itself in, and runs `node hermetic.mjs
 * --ring package --repo /src.git <sha>` in a container with nothing
 * mounted and no Docker socket. A machine without Docker says so and
 * exits 2. CI's second job runs `--spec github:dglazkov/sheep#release` on
 * a bare runner: the string a user types, with no repository beside it.
 *
 * The dog ring is the machine ring's image from `node:24-slim` with Claude
 * Code installed by `npm install -g` at its current version, run once, as
 * root, with `ANTHROPIC_API_KEY` from this process's environment passed
 * through `docker run -e` (never an argument, never a build arg, never a
 * file) and nothing else of this machine. Inside, this script's other
 * half (`--inside`) adds the skill to a fresh working directory under the
 * container's HOME with `npx skills add dglazkov/sheep --skill sheep` (the
 * root SKILL.md, the one skill a bare `skills add` finds). That directory
 * becomes a kennel when the dog runs setup in it, the way any directory
 * does, and the assertions after the run read the kennel `sheep home
 * --json` names rather than assuming `~/.sheep`. The ring
 * prints the exact `claude -p` command, and runs it with journey 1's
 * sentence and no steps: `--allowedTools` for Bash, Read, Edit, Write,
 * Glob, and Grep, `--permission-prompts none` so nothing can ask and
 * anything that would is denied and reported, `--max-budget-usd` as the
 * cap, and `--output-format stream-json`, which this script renders as
 * the transcript. Afterwards, in the same container, the installed
 * `sheep --version`, `sheep ls --json`, and `sheep home --json` must show
 * the ref's build, a sheep, and the local home answering with the key
 * held; then `sheep home stop`. A ref is exported as `refs/heads/release`
 * of `/src.git` and the container's git is told that
 * `github.com/dglazkov/sheep` is `/src.git`, so the string the dog types
 * from the README installs the ref; the spec `github:dglazkov/sheep#release`
 * exports nothing and the dog's string reaches GitHub. The ring spends the
 * shepherd's tokens and says so before the image is built, waiting for a
 * `y` unless `--yes`; `--dry-run` needs neither the key nor the yes.
 *
 * The package ring makes one temp directory and points three variables
 * inside it: `npm_config_prefix`, `npm_config_cache`, and `HOME`,
 * asserted before anything runs. Kennel phase 0 retired the other two:
 * `SHEEP_CONFIG` and `SHEEP_LOCAL` are gone, and the ring reads the config
 * where `sheep setup` wrote it, in the kennel each working directory
 * became. A fresh `HOME` and a fresh working directory are the whole
 * override now, which is the discovery a dog does. It puts the prefix's
 * `bin` first on PATH with this checkout's directories stripped from it,
 * and walks with the installed `sheep`, never `bin/sheep.js`. One line per
 * step; the first failure prints its command and output and exits 1; the
 * end names what was not checked.
 *
 * Two working directories under the ring, `blog` (a git work tree) and
 * `pi` (not one), walk kennel's journey 1 steps 1 to 5 and journey 2 steps
 * 1 and 2 between them: two kennels, two homes on two ports with two
 * tokens, each `sheep ls` its own sheep, a subdirectory finding its
 * parent's home, one home stopped while the other runs, and a walk from
 * outside both falling back to `~/.sheep`. Journey 2's half is git's: the
 * `.gitignore` gains one line, `.sheep/` is ignored and never untracked,
 * and the directory outside git gets no `.gitignore` at all. Wrangler is
 * fetched once, into `~/.sheep/tools`, and the second kennel finds it
 * there; nothing else is ever under the ring's `HOME/.sheep`.
 *
 * Collar's own walk is journey 1 steps 1 to 7 with the faux provider, from
 * `blog`. Step 1 is `npx <spec> setup --json` in that directory,
 * with `SHEEP_INSTALL_SPEC` naming the ring's ref as `git+file://<this
 * repo>#<sha>`, so setup's own `npm install -g` runs npm's git installer,
 * where isocan's #47 lived, against the ring's prefix and cache, never a
 * tarball and never GitHub, whose branch collar phase 3 pushes. The ring
 * then reads the install the way phase 0 did, and the report: the command
 * at the prefix's bin, the skill and its doorway in the working directory,
 * the kennel made there with its ignore entry, no home, and the next
 * sentence. Step 2's `sheep home local --faux` starts the home under
 * `blog/.sheep/local` (wrangler fetched into the ring's `~/.sheep/tools`
 * at the manifest's pin, through the ring's npm cache) and writes
 * `blog/.sheep/config`; every later command run in that directory finds
 * the home through that config, with no `SHEEP_HOME` or `SHEEP_TOKEN` in
 * the environment. `ps` is read while the
 * home runs, and polled for the whole walk, to see that the token is in
 * no process's arguments: the daemon gets its secrets from `.dev.vars`,
 * mode 600, through `--env-file`. Step 5 is `sheep --agent-help`, which
 * must print `dist/agent-guide.md` from beside the bundle, and setup a
 * second time, which must report everything current. Step 6's `sheep home
 * --json`, with the home started on demand, must show the two stamps
 * equal: `build.home`, which the Worker reports from what
 * `scripts/bundle.mjs` defined into it, and `build.cli`, the manifest's,
 * both the release's commit and time (station phase 0). The CLI runs with no
 * `NODE_NO_WARNINGS`: a warning on stderr from `sheep --version` (collar
 * phase 0's `ExperimentalWarning: SQLite`) fails the walk.
 *
 * Step 4 has two halves. `sheep attach <id> -- "again"` streams the reply
 * through sheep's own client, inside `dist/sheep.mjs`. `sheep attach
 * <id>` with no prompt spawns pi's client, `dist/pi-client.mjs` beside
 * the bundle; with no terminal, pi's client attaches, prints
 * `<server>\t<session>\tattached`, and exits, and the ring reads `ps`
 * while it runs to see the child and where it runs from.
 *
 * The account ring (station phase 1) is the package ring's fresh world
 * and install, then the station: with `CLOUDFLARE_API_TOKEN` in this
 * process's environment (else exit 2, nothing done) it asks the account
 * whose token it is, which plan, which subdomain, and what it holds, asks
 * Docker Hub for the image the ref's `home/wrangler.jsonc` names, states
 * the price, and waits for a `y` unless `--yes` (no terminal and no
 * `--yes` is exit 2). Then, from `blog`: `sheep home deploy` with the token
 * removed exits 2 and the listing is identical before and after; `sheep
 * home deploy --faux --name sheep-hermetic-<sha> --json`, timed under
 * three minutes, the address answering `sheep`, `sheep home --json`
 * showing the two stamps equal; a faux program posted through the address
 * and `sheep new` answering `git, node, pnpm` from a container whose
 * shell names `git version` in `sheep log`; `sheep home local --faux` in
 * `pi` reached from `blog` with `--home` for one command while blog's
 * config keeps naming the station; the redeploy, same Worker, same token,
 * same stamp, the sheep still listed; and `sheep home delete` with the
 * name on stdin, the account listed afterwards holding neither the Worker
 * nor the application. The token and the key reach `sheep home deploy`'s
 * environment and nothing else; `ps` is polled for the token, the key,
 * and the station's `SHEEP_TOKEN` across the whole walk. A failure after
 * the deploy deletes first and says so. Without `ANTHROPIC_API_KEY`, a
 * placeholder is set as the secret, since the faux provider uses none.
 *
 * Station phase 2 adds two steps between the redeploy and the delete, and
 * the image by digest. The image: the ref's config names the pen image,
 * by digest when the workflow's push came before the release; the ring
 * asks Docker Hub for the digest of the tag at the release's commit and
 * asserts the two are the same, then after the deploy asserts `GET
 * /home`'s `image` equals the config's line and the deployed container
 * application's `configuration.image`. That is "the ring says which". The
 * second machine (journey 2, step a7): a container from the machine
 * ring's image (`node:24-slim`, the ref as `/src.git`), run with `--rm
 * --init -i` and nothing mounted, the station's token piped on its stdin,
 * the address and the sheep's id as arguments; inside, this script's
 * other half (`--second`, never typed by hand) installs the release from
 * `/src.git` into a fresh world under the container's HOME, runs `sheep
 * home join <address>` with the token from its own stdin, `sheep home
 * --json`, `sheep ls --json` listing the sheep the first machine minted,
 * a promptless `sheep attach <id>`, and then, once the outer half has
 * started a turn on that sheep from `blog` with `sheep attach <id> -- …`
 * and killed that process with SIGKILL two seconds in (lamb's journey 2:
 * the first terminal closed mid-turn), `sheep wait <id>` and `sheep log
 * <id>` showing the turn's end. The token is asserted absent from `ps`
 * inside the container as it is outside. Journey 3 (step a8): pasture's
 * journey 1 against `dglazkov/lamb-playground` with the shepherd's
 * fine-grained token, read from `LAMB_PLAYGROUND_TOKEN` in this process's
 * environment and piped into `sheep pasture secret set`: two sheep born
 * into a pasture named for the commit, each cloning at birth in its
 * container, each pushing a branch with the pasture's credential and
 * naming it in the tree; both branches seen on GitHub anonymously, the
 * token absent from every transcript, export, and `ps` sample; the two
 * branches deleted afterwards through a `GIT_ASKPASS` helper reading the
 * environment, so the scratch repository is left as found. Without the
 * variable the step is one `skip` line and the ring goes on.
 *
 * Station phase 3 makes the walk an upgrade (journey 4) and the delete
 * whole. `--older <ref>` names the release deployed first; its default is
 * the ring ref's first parent when that ref is a release commit with two
 * parents (a release's first parent is the release before it; a candidate
 * built here has `origin/release` as its first parent), and the ring
 * refuses to guess otherwise. Preflight reads both stamps and both images
 * and asks the registry for the older's too. The walk installs the older
 * release into the fresh prefix (`npx <older spec> setup`), refuses
 * without the token (a1), deploys the older (a2), mints one sheep and one
 * pasture on it (a2b), then upgrades: `npm install -g <newer spec>` into
 * the same prefix, `sheep --version` naming the newer stamp, `sheep home`
 * printing the skew line on stderr (the home older than the command,
 * naming `sheep home deploy`), and `sheep home deploy --faux --json`
 * redeploying the same Worker from the newer package (`redeployed`, the
 * stamp moved, the image the newer's, a container healthy) with the
 * older's sheep and pasture still listed and the sheep's turn still in
 * `sheep log` (the "up" step). Then a3 to a8 as before, on the newer, then
 * n1 (end phase 1): `sheep rm <id>` on every sheep the walk minted, each
 * printing `<id>\tended`, none listed after, and a verb on an ended id the
 * one sentence with exit 2; and a6 last: the delete's listing (the Worker
 * at its address, its Durable Objects, its container application by id,
 * `sessions: 0` since n1 ended them all, and `pastures: <n>` counted
 * against what the walk made, the config), the three lines, `sessions
 * deleted: 0`, and the account listed with the name absent and the
 * listing equal to the one before the walk.
 *
 * Station phase 4 gives the package ring `--docker`, journey 6 on a
 * machine with Docker. Without it every ring starts its homes with
 * `--no-container`, so the machine and dog rings and the account ring's
 * a4 are what they were, and the ring's list says journey 6 was not
 * walked. With it, `blog`'s home is started without the flag and must
 * report `container: running`; after step 6 (the home restarted on demand,
 * which honours the record's choice) come four steps: d1, `sheep home
 * --json` reporting `container: true` and `GET /home` agreeing, its image
 * the one the installed `home/wrangler.jsonc` names; d2, a faux program
 * whose bash step runs `git --version && node --version && pnpm
 * --version`, `sheep new -- "which tools?"` printing `git, node, pnpm`,
 * `sheep log` naming `git version`, and `docker ps` showing the home's
 * container (`workerd-`-named, not there before the walk) running the
 * image the config names, by image id; d3, pasture's journey 1 against
 * the scratch repository (the account ring's `journeyThree`, a pasture
 * named `local-<sha7>`), skipped with one line without
 * `LAMB_PLAYGROUND_TOKEN`; d4, `docker ps` showing every container of the
 * home's gone within the idle the report named plus a minute of the last
 * command. `--docker` on a machine where `docker version` fails is exit 2
 * before anything runs. The daemon runs over `<blog>/.sheep/local/wrangler.jsonc`,
 * derived from the installed config, with the one-line `Dockerfile`
 * beside it (`FROM <the config's image>`), since wrangler demands a
 * Cloudflare login before pulling any registry image itself; step 2's
 * `ps` line and d1 read those. Docker builds it with buildx, which the
 * docker CLI finds under `~/.docker/cli-plugins` of the real HOME, so
 * with `--docker` alone the ring's environment carries
 * `DOCKER_CONFIG=<the real HOME>/.docker`: Docker is the machine's, like
 * `docker` on PATH; nothing else of the real HOME reaches the walk.
 *
 * Eyes phase 2 gives both rings the look: journey 1 steps 1 to 4 of the
 * eyes project with the faux provider, one sheep, two turns. The first
 * turn's program writes the eyes suite's four files (a counter page, its
 * stylesheet, a module that throws a `ReferenceError`, and `items.json`),
 * runs `look index.html`, and reads `look.png`; the second runs `look
 * index.html --click "#inc" --click "#inc"` and says one sentence. `sheep
 * log <id>` must then show both reports (`errors:` with the
 * `ReferenceError`, `console:`, `tree:` with the heading, the button, and
 * the items, `"2"` after the clicks, `wrote look.png 1024x768` twice) and
 * the read tool's `Read image file [image/png]`, and `sheep home --json`
 * must say `eyes: true`. Each look's closing line carries the look's own
 * clock, which starts before the browser is opened, so the first look's
 * time is the launch and the second's the connect; both go in the step's
 * summary. In the package ring the step is `e1`, after step 6, on blog's
 * local home: the ring's `HOME` is fresh and `XDG_CACHE_HOME` is stripped
 * from its environment, so the first look fetches the Chrome miniflare
 * pins into `<HOME>/Library/Caches/.wrangler/chrome` (macOS) or
 * `<HOME>/.cache/.wrangler/chrome` (Linux), and the step asserts the
 * directory was absent before and holds a build after. In the account
 * ring the step is `e2`, after a3, on the station, where the first look
 * pays the platform's launch and the browser stays warm ten minutes: two
 * looks and the keep-alive, about eleven browser minutes a run. The
 * machine ring does not walk the look: the image its Dockerfile builds
 * has none of Chrome's shared libraries, and Chrome for Testing has no
 * linux/arm64 build at all, which is what a container on an arm64 Mac
 * is, so no package added to the image would fix it there. It passes
 * `--no-eyes` to the package ring inside the container, which prints one
 * `skip` line for e1 and names it among what was not checked. The dog
 * ring's container half runs no package walk, so it has no e1 to skip.
 *
 * Serve phase 2 gives both rings the served look, one turn with the faux
 * provider: `s1` in the package ring, after e1 and only with `--docker`,
 * since a server needs a container; `s2` in the account ring, after e2,
 * on the station. The program writes a page and a `server.mjs` of Node's
 * own `http` — a hermetic ring reaches no registry, and a Vite scaffold
 * cannot come in through the workspace either, `node_modules` being one
 * of the container's kept directories — runs `look --serve 'node
 * server.mjs' --click "#ping" /`, reads the PNG, and then probes the port
 * from inside the container. The step reads the command's own lines out
 * of the report's `server` section (one per request the page made), the
 * served page out of the tree, the closing line's one clock, and the
 * kill out of the container rather than the report: nothing listening on
 * either loopback, and the pid the server wrote to `/tmp/served.marker`
 * gone from `/proc`. Without `--docker` s1 is one `skip` line and is
 * named among what was not checked, as journey 6 is.
 *
 * Mint phase 1 gives the account ring `m1`, after a3 (mint's journey 3
 * step 3): `sheep new --detach` with no prompt printing the id alone and
 * nothing on stderr, `sheep ls --json` listing it idle with `task: null`,
 * its first prompt through `sheep attach <id> --detach -- "hello"` (the
 * id printed after the send), and its reply through `sheep wait <id>`,
 * `<id>\tok`, the task then `hello`. The program is one text step posted
 * to `/faux` before the mint, so the turn rents no container; e2 posts
 * its own after. The sheep is among those n1 ends, one more for a6's
 * count. No step of the walk sends a prompt to get an id.
 *
 * Earmark phase 1 gives the account ring `s1`, after a8 (earmark's
 * journey 2 steps 1 and 2; the package ring's `s1` is serve's, a
 * different ring): a pasture named `earmark-<sha7>` on the scratch
 * repository with no secret, on a station with no `PEN_GIT_TOKEN`; one
 * sheep minted with `sheep new --secret GIT_TOKEN`, the playground token
 * on its stdin and on no pasture, and a sibling with none, each scripted
 * to branch, commit, and push. `sheep ls` names `GIT_TOKEN` on the one
 * and nothing on the other; the earmarked sheep's branch is on GitHub,
 * seen anonymously, and the sibling's push is refused for want of any
 * credential (the helper gets nothing from the broker, and git cannot read
 * a username), its branch absent. The token is in no transcript, export,
 * row, or output, and in no `ps` sample; both sheep are among those n1
 * ends, and the branch is deleted after. The broker's own sentence for the
 * refusal is a line of the station's log, which no verb reads, and is
 * named among what was not checked. Skipped as a8 is, with one line,
 * without `LAMB_PLAYGROUND_TOKEN`.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Where this script lives, one level up: the checkout, or `/ring` inside the machine ring's container. Stripped from PATH. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAUX_REPLY = "ok";

/** The one string a dog needs, as `packages/cli/src/setup.ts` holds it: with this spec the ring leaves `SHEEP_INSTALL_SPEC` unset and setup runs its own default. */
const INSTALL_SPEC = "github:dglazkov/sheep#release";

/** The machine ring's images, in the order they run. */
const MACHINE_IMAGES = ["node:22-slim", "node:24-slim"];

/** The dog ring: one image, one dog, the sentence from journey 1, and the tools the dog is given. */
const DOG_IMAGE = "node:24-slim";
const DOG_AGENT = "claude-code";
const AGENT_PACKAGE = "@anthropic-ai/claude-code";
const SENTENCE = "Install sheep from github.com/dglazkov/sheep and try it out.";
const DOG_TOOLS = "Bash,Read,Edit,Write,Glob,Grep";
/** How the skill reaches the dog before the prompt: the `skills` CLI, reading `main` of the public repository, this skill alone, into Claude Code's directory, with no prompts. */
const SKILLS_ADD = ["npx", "-y", "skills", "add", "dglazkov/sheep", "--skill", "sheep", "--agent", DOG_AGENT, "-y"];

/**
 * Journey 1 of the eyes (eyes phase 2): the eyes suite's fixture
 * (`packages/cell/test/eyes.test.ts`), copied since the ring imports
 * nothing of the checkout: a counter page, its stylesheet, a module that
 * fetches its JSON, logs, warns, and then calls a function that is not
 * there, and the JSON. What a sheep might have written, bug and all.
 */
const COUNTER_FILES = {
  "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>counter</title>
<link rel="stylesheet" href="style.css"><script type="module" src="app.js"></script></head>
<body><main><h1>Counter</h1><button id="inc">+1</button><output id="n">0</output>
<ul id="items"></ul></main></body></html>`,
  "style.css": `body{font-family:system-ui,sans-serif;background:#0b1020;color:#e8ecff;margin:0}
main{max-width:480px;margin:40px auto;padding:24px;border:1px solid #334;border-radius:12px}
button{font-size:20px;padding:8px 16px;border-radius:8px;border:0;background:#5b7cff;color:#fff}
output{margin-left:16px;font-size:28px;font-variant-numeric:tabular-nums}
li{padding:4px 0;border-bottom:1px dashed #334}`,
  "app.js": `const n = document.getElementById("n"); let count = 0;
document.getElementById("inc").addEventListener("click", () => { n.textContent = String(++count); });
const items = await (await fetch("./items.json")).json();
for (const item of items) { const li = document.createElement("li"); li.textContent = item; document.getElementById("items").append(li); }
console.log("app ready, items:", items.length);
console.warn("a warning the sheep should see");
undefinedFunction(); // a bug the sheep should see`,
  "items.json": JSON.stringify(["wool", "grass", "fence"]),
};

/** Journey 1 step 1's sentence, and the dog's second ask; the faux sheep's two one-sentence answers. */
const LOOK_SENTENCE = "Write a counter page: index.html, style.css, and app.js as a module. A button increments a number. Load the list in items.json into a <ul>. Then look at it and fix anything wrong.";
const LOOK_AGAIN_SENTENCE = "Click the button twice and tell me what the page looks like.";
const LOOK_REPLY = "I wrote the four files and looked: the page renders, and errors lists a ReferenceError from app.js that I should fix.";
const LOOK_AGAIN_REPLY = "The page shows the Counter heading, the +1 button, and the three items, and after two clicks the number reads 2; the button works.";

/**
 * The first turn's program: the four files written to the workspace, the
 * first look, and the PNG read back with the read tool; the second turn's:
 * the look with two clicks. The last step of each is the sentence.
 */
const LOOK_PROGRAM = {
  steps: [
    ...Object.entries(COUNTER_FILES).map(([name, content]) => ({ tool: { name: "write", args: { path: `/workspace/${name}`, content } } })),
    { tool: { name: "bash", args: { command: "look index.html" } } },
    { tool: { name: "read", args: { path: "/workspace/look.png" } } },
    { text: LOOK_REPLY },
  ],
};
const LOOK_AGAIN_PROGRAM = { steps: [{ tool: { name: "bash", args: { command: 'look index.html --click "#inc" --click "#inc"' } } }, { text: LOOK_AGAIN_REPLY }] };

/** The port a served look uses when `--serve` is given no `--port`: `DEFAULT_PORT` in `look-command.ts`, and the number `PORT` carries. */
const SERVE_PORT = 5173;

/**
 * Serve phase 2, s1 and s2: what a sheep writes before a served look.
 * The server is Node's own `http`, not Vite, and the reason is the ring's
 * rule rather than a preference — a hermetic ring reaches no registry, and
 * a Vite scaffold cannot come in through the workspace either, since
 * `node_modules` is one of the container's kept directories and never
 * syncs in. What a served look must prove is the mechanism, not the
 * framework: a command the container runs, a port it listens on, a page
 * the browser reads through the forward, and a server that is gone
 * afterwards. So the fixture serves four files of its own and says, on
 * stdout, what it answered — which is what the report's `server` section
 * carries back, and the only place a page's every request can be read.
 *
 * Two details are deliberate. The server listens on `localhost`, as Vite
 * does, which in this image is `::1` and not `127.0.0.1` (serve phase 1's
 * first finding): a forward that reached one loopback only would fail
 * here. And it writes its pid to `/tmp/served.marker`, outside the
 * workspace, so the probe that runs after the look can say it is in the
 * same container and that that pid is gone from `/proc` — the project's
 * one rule, read from the container rather than from the report.
 */
const SERVED_FILES = {
  "server.mjs": `import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) { console.error(\`PORT is \${JSON.stringify(process.env.PORT)}; a served look sets it\`); process.exit(1); }
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json" };
createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  // The browser asks for one on every page; answered, the report's errors are the page's own and nothing else.
  if (path === "/favicon.ico") { console.log(\`\${request.method} \${path} 204\`); response.writeHead(204).end(); return; }
  const name = path === "/" ? "index.html" : path.replace(/^\\/+/, "");
  try {
    const body = await readFile(new URL(name, import.meta.url));
    console.log(\`\${request.method} \${path} 200 \${body.length}\`);
    response.writeHead(200, { "content-type": types[extname(name)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    console.log(\`\${request.method} \${path} 404\`);
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }
}).listen(port, "localhost", async () => {
  await writeFile("/tmp/served.marker", String(process.pid));
  console.log(\`serving on localhost:\${port} as pid \${process.pid}\`);
});`,
  "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>served</title>
<link rel="stylesheet" href="/style.css"><script type="module" src="/app.js"></script></head>
<body><main><h1>Served</h1><button id="ping">ping</button><output id="n">0</output>
<ul id="rows"></ul></main></body></html>`,
  "style.css": `body{font-family:system-ui,sans-serif;background:#101a10;color:#e8ffe8;margin:0}
main{max-width:480px;margin:40px auto;padding:24px;border:1px solid #354;border-radius:12px}
button{font-size:20px;padding:8px 16px;border-radius:8px;border:0;background:#4caf50;color:#fff}
output{margin-left:16px;font-size:28px;font-variant-numeric:tabular-nums}`,
  "app.js": `const n = document.getElementById("n"); let count = 0;
document.getElementById("ping").addEventListener("click", () => { n.textContent = String(++count); });
const rows = await (await fetch("/rows.json")).json();
for (const row of rows) { const li = document.createElement("li"); li.textContent = row; document.getElementById("rows").append(li); }
console.log("served page ready, rows:", rows.length);`,
  "rows.json": JSON.stringify(["port", "forward", "kill"]),
  "probe.mjs": `import { connect } from "node:net";
import { existsSync, readFileSync } from "node:fs";
const port = Number(process.argv[2]);
const dial = (host) => new Promise((done) => {
  const socket = connect({ host, port });
  const answer = (text) => { socket.destroy(); done(\`\${host} \${text}\`); };
  socket.setTimeout(2000);
  socket.on("connect", () => answer("listening"));
  socket.on("timeout", () => answer("timed out"));
  socket.on("error", (error) => answer(error.code ?? error.message));
});
const dialed = [await dial("127.0.0.1"), await dial("::1")];
const marker = existsSync("/tmp/served.marker") ? readFileSync("/tmp/served.marker", "utf8").trim() : "";
const alive = marker !== "" && existsSync(\`/proc/\${marker}\`);
const pid1 = existsSync("/proc/1/cmdline") ? readFileSync("/proc/1/cmdline", "utf8").replace(/[\\0\\s]+/g, " ").trim() : "(no /proc/1)";
console.log(\`probe port \${port}: \${dialed.join("; ")}\`);
console.log(\`probe pid: marker \${marker === "" ? "absent (a different container)" : marker}, /proc/\${marker} \${alive ? "still there" : "gone"}\`);
console.log(\`probe container: pid 1 is \${pid1}\`);`,
};

/** Journey 2's shape in one turn: the sheep writes the page and its server, looks at it served with a click, reads the picture, and checks nothing is left listening. */
const SERVED_SENTENCE = "Write a small page with a server.mjs that serves the files beside it on $PORT, look at it served with a click on ping, and check that nothing is left listening afterwards.";
const SERVED_REPLY = "I looked at the page served on 5173: it shows Served, the ping button, and the three rows, the click made the counter read 1, and afterwards nothing was listening on the port and the server's process was gone.";
const SERVED_LOOK = `look --serve 'node server.mjs' --click "#ping" /`;
const SERVED_PROGRAM = {
  steps: [
    ...Object.entries(SERVED_FILES).map(([name, content]) => ({ tool: { name: "write", args: { path: `/workspace/${name}`, content } } })),
    { tool: { name: "bash", args: { command: SERVED_LOOK } } },
    { tool: { name: "read", args: { path: "/workspace/look.png" } } },
    // Two commands, so the line is never the tier-1 shape (`node <file>`) and always runs in the container the look served from.
    { tool: { name: "bash", args: { command: `node probe.mjs ${SERVE_PORT} && echo probe done` } } },
    { text: SERVED_REPLY },
  ],
};

/**
 * Where miniflare puts the Chrome the local home's eyes need, under a
 * HOME: `<wrangler cache>/chrome`, the cache being `~/Library/Caches/
 * .wrangler` on macOS, `~/AppData/Local/xdg.cache/.wrangler` on Windows,
 * and `~/.cache/.wrangler` elsewhere. Miniflare honours `XDG_CACHE_HOME`
 * over all three, which is why the ring strips it (`env()`), so that a
 * fresh HOME is a fresh cache and the first look is the cold one.
 */
function chromeCacheOf(home) {
  const cache = process.platform === "darwin" ? join(home, "Library", "Caches") : process.platform === "win32" ? join(home, "AppData", "Local", "xdg.cache") : join(home, ".cache");
  return join(cache, ".wrangler", "chrome");
}
/** The URLs npm's git installer may try for `github:dglazkov/sheep`; in repo mode the container's git is told each one is `/src.git`. */
const GITHUB_URLS = ["https://github.com/dglazkov/sheep.git", "git+https://github.com/dglazkov/sheep.git", "ssh://git@github.com/dglazkov/sheep.git", "git+ssh://git@github.com/dglazkov/sheep.git"];

function usage(message) {
  console.error(
    `hermetic: ${message}\nusage: pnpm hermetic --ring package|machine [ref] [--repo <path>] [--spec <spec> [--commit <sha>]] [--image <name>] [--docker] [--no-eyes] [--keep]\n       pnpm hermetic --ring dog [ref|${INSTALL_SPEC}] [--repo <path>] [--commit <sha>] [--image <name>] [--yes] [--dry-run] [--budget <usd>] [--timeout <minutes>] [--agent claude-code] [--keep]\n       pnpm hermetic --ring account [ref|${INSTALL_SPEC}] [--repo <path>] [--commit <sha>] [--older <ref>] [--yes] [--dry-run] [--name <worker>] [--keep]`,
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = {
    ring: undefined,
    ref: undefined,
    repo: root,
    spec: undefined,
    commit: undefined,
    images: [],
    keep: false,
    // The package ring's blog home with a container (station phase 4).
    docker: false,
    // The package ring without e1 (eyes phase 2): what the machine ring passes to the run inside its container.
    noEyes: false,
    yes: false,
    dryRun: false,
    budget: 5,
    timeout: 30,
    agent: DOG_AGENT,
    name: undefined,
    // The account ring's older release (station phase 3): a ref in --repo, deployed first and upgraded from.
    older: undefined,
    // The container's half of the dog ring, and what the outer half tells it: never typed by hand.
    inside: false,
    redirect: false,
    expect: undefined,
    // The container's half of the account ring's second machine (station phase 2), and what the outer half tells it: never typed by hand.
    second: false,
    address: undefined,
    sheep: undefined,
    expectImage: undefined,
  };
  const value = (flag) => {
    const next = args.shift();
    if (next === undefined || next.startsWith("--")) usage(`${flag} needs a value`);
    return next;
  };
  let positional;
  while (args.length > 0) {
    const arg = args.shift();
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (inline !== undefined) args.unshift(inline);
    if (flag === "--ring") parsed.ring = value(flag);
    else if (flag === "--repo") parsed.repo = resolve(value(flag));
    else if (flag === "--spec") parsed.spec = value(flag);
    else if (flag === "--commit") parsed.commit = value(flag);
    else if (flag === "--image") parsed.images.push(value(flag));
    else if (flag === "--keep") parsed.keep = true;
    else if (flag === "--docker") parsed.docker = true;
    else if (flag === "--no-eyes") parsed.noEyes = true;
    else if (flag === "--yes") parsed.yes = true;
    else if (flag === "--dry-run") parsed.dryRun = true;
    else if (flag === "--budget") parsed.budget = Number(value(flag));
    else if (flag === "--timeout") parsed.timeout = Number(value(flag));
    else if (flag === "--agent") parsed.agent = value(flag);
    else if (flag === "--name") parsed.name = value(flag);
    else if (flag === "--older") parsed.older = value(flag);
    else if (flag === "--inside") parsed.inside = true;
    else if (flag === "--redirect") parsed.redirect = true;
    else if (flag === "--expect") parsed.expect = value(flag);
    else if (flag === "--second") parsed.second = true;
    else if (flag === "--address") parsed.address = value(flag);
    else if (flag === "--sheep") parsed.sheep = value(flag);
    else if (flag === "--expect-image") parsed.expectImage = value(flag);
    else if (flag.startsWith("--")) usage(`unknown flag ${flag}`);
    else if (positional !== undefined) usage(`one ref at most: ${positional} and ${flag}`);
    else positional = flag;
  }
  if (parsed.ring === undefined) usage("--ring is required");
  if (parsed.ring !== "package" && parsed.ring !== "machine" && parsed.ring !== "dog" && parsed.ring !== "account") usage(`unknown ring ${parsed.ring}`);
  // The dog and account rings' one argument is a ref or the spec a user types; the other rings take a ref there and a spec by flag.
  if (positional !== undefined) {
    if ((parsed.ring === "dog" || parsed.ring === "account") && /^(github:|git\+|git:|https?:|ssh:)/.test(positional)) parsed.spec = positional;
    else parsed.ref = positional;
  }
  if (parsed.spec !== undefined && parsed.ref !== undefined) usage(`a ref (${parsed.ref}) or a spec (${parsed.spec}), not both`);
  if (parsed.commit !== undefined && parsed.spec === undefined) usage("--commit goes with --spec; a ref names its own commit");
  if (parsed.commit !== undefined && !/^[0-9a-f]{7,40}$/.test(parsed.commit)) usage(`--commit ${parsed.commit} is not a sha`);
  if (parsed.ring === "machine" && parsed.spec !== undefined) usage("the machine ring takes a ref; it exports the ref into the container as a bare repository");
  if (parsed.images.length > 0 && parsed.ring === "package") usage("--image is the machine and dog rings'");
  if (parsed.docker && parsed.ring !== "package") usage("--docker is the package ring's: the machine and dog rings' containers have no Docker, and the account ring's local home is a4's, without one");
  if (parsed.noEyes && parsed.ring !== "package") usage("--no-eyes is the package ring's: the machine ring passes it to the walk inside its container, whose image cannot run Chrome; the account ring's station has eyes");
  for (const [flag, on] of [["--inside", parsed.inside], ["--redirect", parsed.redirect], ["--expect", parsed.expect !== undefined]]) {
    if (on && parsed.ring !== "dog") usage(`${flag} is the dog ring's`);
  }
  for (const [flag, on] of [["--second", parsed.second], ["--address", parsed.address !== undefined], ["--sheep", parsed.sheep !== undefined], ["--expect-image", parsed.expectImage !== undefined]]) {
    if (on && parsed.ring !== "account") usage(`${flag} is the account ring's second machine's`);
  }
  if (parsed.second && (parsed.address === undefined || parsed.sheep === undefined || parsed.expectImage === undefined)) usage("--second needs --address, --sheep, and --expect-image; the outer half passes them, and nobody types them");
  for (const [flag, on] of [["--yes", parsed.yes], ["--dry-run", parsed.dryRun]]) {
    if (on && parsed.ring !== "dog" && parsed.ring !== "account") usage(`${flag} is the dog and account rings'`);
  }
  if (parsed.name !== undefined && parsed.ring !== "account") usage("--name is the account ring's");
  if (parsed.name !== undefined && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(parsed.name)) usage(`--name ${parsed.name} is not a Worker name`);
  if (parsed.older !== undefined && parsed.ring !== "account") usage("--older is the account ring's");
  if (parsed.images.length > 0 && parsed.ring === "account") usage("--image is the machine and dog rings'");
  if (parsed.ring === "dog") {
    if (parsed.spec !== undefined && parsed.spec !== INSTALL_SPEC) usage(`the dog types the README's spec, ${INSTALL_SPEC}; a spec that is not that one cannot be what it installs (a ref installs through /src.git)`);
    if (parsed.agent !== DOG_AGENT) usage(`--agent ${parsed.agent}: ${DOG_AGENT} is the only dog so far; pi is the second, deliberately open`);
    if (!Number.isFinite(parsed.budget) || parsed.budget <= 0) usage(`--budget ${parsed.budget} is not a number of dollars`);
    if (!Number.isFinite(parsed.timeout) || parsed.timeout <= 0) usage(`--timeout ${parsed.timeout} is not a number of minutes`);
    if (parsed.images.length > 1) usage("the dog ring runs one image; the walk is the point, not the matrix");
    if (parsed.images.length === 0) parsed.images = [DOG_IMAGE];
  }
  if (parsed.spec === undefined && parsed.ref === undefined) parsed.ref = "refs/heads/release";
  if (parsed.images.length === 0) parsed.images = [...MACHINE_IMAGES];
  return parsed;
}

/** `git` in a repository: this checkout by default, or the one `--repo` named, which may be bare. */
const gitIn =
  (dir) =>
  (...args) => {
    const done = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (done.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${dir}: ${(done.stderr || "").trim()}`);
    return (done.stdout || "").trim();
  };

/** Runs a command to completion, collecting output; never throws on a nonzero exit. `input` is written to stdin, which is otherwise closed. */
function run(command, args, options) {
  const { input, ...rest } = options ?? {};
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], ...rest });
    if (input !== undefined) child.stdin.end(input);
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.once("error", reject);
    options?.onSpawn?.(child);
    child.once("close", (code, signal) => resolveRun({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? (signal ? 1 : 0) }));
  });
}

/** Every process's pid and arguments, one line each, from `ps`: no shell, so no argument of this ring's own carries what it looks for. */
function psLines() {
  return spawnSync("ps", ["-Ao", "pid=,args="], { encoding: "utf8" }).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * `ps` over every process, polled while something runs; the first line
 * holding any of the needles is kept, and the samples counted. Two tokens
 * (one per kennel) are two needles, watched by one timer.
 */
function watchPs(needle, everyMs = 15) {
  const needles = Array.isArray(needle) ? needle : [needle];
  let seen;
  let samples = 0;
  const timer = setInterval(() => {
    samples++;
    if (seen) return;
    const line = psLines().find((candidate) => needles.some((one) => candidate.includes(one)));
    if (line) seen = line;
  }, everyMs);
  return { stop: () => clearInterval(timer), line: () => seen, samples: () => samples };
}

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok && (await response.text()).startsWith("sheep");
  } catch {
    return false;
  }
}

class Ring {
  /**
   * A ref in a repository (the spec becomes `git+file://<repo>#<sha>`, and
   * the ring reads the ref's tree to check the install against it), or a
   * spec alone (`github:dglazkov/sheep#release`: no repository, and the
   * build stamp is read from the install; `--commit` says what it must be).
   */
  constructor({ ref, repo, spec, commit, keep, dir, docker, noEyes }) {
    if (spec === undefined) {
      this.git = gitIn(repo);
      // The ref first: a ref that does not resolve leaves no directory behind.
      this.sha = this.git("rev-parse", "--verify", `${ref}^{commit}`);
      this.ref = ref;
      this.repo = repo;
      this.spec = `git+file://${repo}#${this.sha}`;
      this.stamp = JSON.parse(this.git("show", `${this.sha}:package.json`)).sheep;
    } else {
      this.git = undefined;
      this.sha = undefined;
      this.ref = undefined;
      this.repo = undefined;
      this.spec = spec;
      this.stamp = undefined;
    }
    this.commit = commit;
    this.keep = keep;
    this.docker = docker === true;
    // e1 skipped (eyes phase 2): the walk inside the machine ring's container, whose image cannot run Chrome.
    this.noEyes = noEyes === true;
    // The world: a temp directory, or the one the caller made (the second machine's, under the container's HOME).
    this.dir = dir ?? mkdtempSync(join(tmpdir(), "sheep-ring-"));
    this.prefix = join(this.dir, "prefix");
    this.cache = join(this.dir, "npm-cache");
    this.home = join(this.dir, "home");
    // Two dogs, two directories: `blog` is a git work tree (journey 2 step 1), `pi` is not (step 2). Neither is a kennel yet; setup makes them.
    this.blog = join(this.dir, "blog");
    this.pi = join(this.dir, "pi");
    // A subdirectory of blog, where journey 1 step 3 stands: it has no kennel of its own and must find blog's.
    this.deep = join(this.blog, "posts", "2026");
    for (const dir of [this.prefix, this.cache, this.home, this.blog, this.pi, this.deep]) mkdirSync(dir, { recursive: true });
    gitIn(this.blog)("init", "--quiet");
    this.lines = [];
    this.unchecked = [];
    // Each kennel's running home, by directory: what `stopLocalHome` ends.
    this.homes = new Map();
    this.watches = [];
  }

  /**
   * Which release the ring installs and asserts against (station phase 3):
   * the account ring installs the older release first and switches to the
   * newer at the upgrade, so `install()` and every step read one of the
   * two from here. Returns what was there, to switch back with.
   */
  use({ sha, ref, spec, stamp, git }) {
    const previous = { sha: this.sha, ref: this.ref, spec: this.spec, stamp: this.stamp, git: this.git };
    this.sha = sha;
    this.ref = ref;
    this.spec = spec;
    this.stamp = stamp;
    // The older is always a ref in a repository, so it brings its `git`; a spec-mode newer brings none, as before.
    this.git = git;
    return previous;
  }

  /** The kennel `sheep setup` made in a working directory: `<dir>/.sheep`, where the config and the local home live. */
  kennel(dir) {
    return join(dir, ".sheep");
  }

  /**
   * The `kennel:` line as the installed command prints it: the path it
   * resolved from its working directory, which on macOS is the realpath
   * under `/private/var` where the ring's own name says `/var`.
   */
  kennelLine(dir) {
    return `kennel: ${realpathSync(this.kennel(dir))}\n`;
  }

  configOf(dir) {
    return join(this.kennel(dir), "config");
  }

  localOf(dir) {
    return join(this.kennel(dir), "local");
  }

  /** The directories stripped from PATH: where this script lives and the repository the ring installs from; never the filesystem root. */
  stripped() {
    return [...new Set([root, this.repo].filter((dir) => dir && dir !== sep))];
  }

  /** The environment every command in the ring runs with: the three variables, and a PATH with this checkout stripped. */
  env() {
    const inherited = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("npm_") || key.startsWith("PNPM_") || key === "NODE_OPTIONS" || key === "NODE_PATH" || key === "INIT_CWD") continue;
      // No home, no token, no key: the walk gets its home from the config the installed command writes, and runs the faux provider.
      if (key === "SHEEP_HOME" || key === "SHEEP_TOKEN" || key === "ANTHROPIC_API_KEY" || key === "SHEEP_INSTALL_SPEC") continue;
      // No account, and none of the test seams (the fake account, wrangler, and station, and SHEEP_TEST_RETRY_MS): the account ring hands the token to one command's environment; a fake would be a facade.
      if (key.startsWith("CLOUDFLARE_") || key.startsWith("SHEEP_TEST_")) continue;
      // The scratch repository's token reaches `sheep pasture secret set`'s stdin and the branch delete's helper, and no command's environment.
      if (key === "LAMB_PLAYGROUND_TOKEN") continue;
      // No cache of this machine's (eyes phase 2): miniflare fetches the eyes' Chrome under XDG_CACHE_HOME when it is set, and the
      // ring's fresh HOME is meant to be the whole override, so the first look in the ring is the cold one.
      if (key === "XDG_CACHE_HOME") continue;
      inherited[key] = value;
    }
    const stripped = this.stripped();
    const path = (process.env.PATH ?? "").split(":").filter((entry) => entry && !stripped.some((dir) => entry === dir || entry.startsWith(dir + sep)));
    return {
      ...inherited,
      // Docker's CLI plugins (buildx) live under the real HOME's .docker; with --docker the daemon's build needs them (station phase 4).
      ...(this.docker ? { DOCKER_CONFIG: join(homedir(), ".docker") } : {}),
      npm_config_prefix: this.prefix,
      npm_config_cache: this.cache,
      HOME: this.home,
      PATH: [join(this.prefix, "bin"), ...path].join(":"),
      npm_config_update_notifier: "false",
      npm_config_fund: "false",
      npm_config_audit: "false",
      npm_config_progress: "false",
    };
  }

  assertFresh() {
    const env = this.env();
    const three = ["npm_config_prefix", "npm_config_cache", "HOME"];
    for (const key of three) {
      const value = env[key];
      if (!value || !(value === this.dir || value.startsWith(this.dir + sep))) throw new Error(`${key}=${value} is not inside the ring ${this.dir}`);
      if (!existsSync(value) || !statSync(value).isDirectory()) throw new Error(`${key}: ${value} is not a fresh directory`);
    }
    // Fresh means empty: no `.sheep` anywhere, not in HOME and not in either working directory. Setup makes the kennels; nothing here does.
    const onlyHolds = (dir, names) => {
      const found = readdirSync(dir);
      if (found.some((name) => !names.includes(name))) throw new Error(`${dir} is not empty: ${found.join(", ")}`);
    };
    onlyHolds(this.prefix, []);
    onlyHolds(this.cache, []);
    onlyHolds(this.home, []);
    onlyHolds(this.blog, [".git", "posts"]);
    onlyHolds(this.pi, []);
    for (const entry of env.PATH.split(":")) {
      for (const dir of this.stripped()) {
        if (entry === dir || entry.startsWith(dir + sep)) throw new Error(`PATH still reaches ${dir}: ${entry}`);
      }
    }
    for (const dir of [this.home, this.blog, this.pi]) {
      if (existsSync(this.kennel(dir))) throw new Error(`${this.kennel(dir)} exists before the walk`);
    }
    if (existsSync(join(this.blog, ".gitignore"))) throw new Error(`${join(this.blog, ".gitignore")} exists before the walk`);
    console.log(`ring: ${this.dir}`);
    for (const key of three) console.log(`  ${key}=${env[key]}`);
    console.log(`  kennels: none yet; ${this.blog} (a git work tree) and ${this.pi} (not one) become two when setup runs in them`);
    console.log(`  PATH=${join(this.prefix, "bin")}:… (${this.stripped().join(" and ")} stripped)`);
  }

  /** Paths as a child saw them, or as the ring named them: on macOS the ring's temp directory is under /var and its realpath under /private/var. */
  samePath(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const real = (path) => {
      try {
        return realpathSync(path);
      } catch {
        return path;
      }
    };
    return a === b || real(a) === real(b);
  }

  /**
   * Journey 1 step 1: `npx <spec> setup --json` in the ring's `blog`
   * directory. Setup installs the command with npm's git installer, the
   * skill into that directory, and the kennel `.sheep/` with the
   * `.gitignore` entry a git work tree needs; the ring reads all three,
   * and the report.
   */
  async install() {
    const spec = this.spec;
    const started = Date.now();
    // Setup's own default is the user's string; any other spec (a ref in a repository) reaches setup through SHEEP_INSTALL_SPEC.
    const env = spec === INSTALL_SPEC ? this.env() : { ...this.env(), SHEEP_INSTALL_SPEC: spec };
    const versions = { node: spawnSync("node", ["--version"], { env, encoding: "utf8" }).stdout.trim(), npm: spawnSync("npm", ["--version"], { env, encoding: "utf8" }).stdout.trim() };
    const command = `npx ${spec} setup --json`;
    const result = await run("npx", [spec, "setup", "--json"], { env, cwd: this.blog });
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    if (result.code !== 0) this.fail("step 1", command, result);
    let report;
    try {
      report = JSON.parse(result.stdout);
    } catch {
      this.fail("step 1", command, { ...result, stderr: `${result.stderr}\nstdout is not the JSON report` });
    }
    const bin = join(this.prefix, "bin", "sheep");
    const pkg = join(this.prefix, "lib", "node_modules", "sheep");
    for (const required of [bin, join(pkg, "package.json"), join(pkg, "dist", "sheep.mjs"), join(pkg, "dist", "pi-client.mjs"), join(pkg, "dist", "agent-guide.md"), join(pkg, "home", "worker.mjs"), join(pkg, "home", "wrangler.jsonc"), join(pkg, "SKILL.md")]) {
      if (!existsSync(required)) this.fail("step 1", command, { ...result, stderr: `${result.stderr}\nmissing after install: ${required}` });
    }
    // With no repository, the build stamp is the install's; it has to be whole, and the commit the caller expected.
    if (this.stamp === undefined) {
      const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
      const stamp = manifest.sheep;
      if (manifest.name !== "sheep" || typeof stamp?.commit !== "string" || typeof stamp?.builtAt !== "string" || typeof stamp?.wrangler !== "string") {
        this.fail("step 1", `cat ${join(pkg, "package.json")}`, { stdout: JSON.stringify(manifest, null, 2), stderr: "expected name sheep and a build stamp under sheep: commit, builtAt, wrangler", code: 1 });
      }
      if (this.commit !== undefined && !this.commit.startsWith(stamp.commit)) {
        this.fail("step 1", `cat ${join(pkg, "package.json")}`, { stdout: JSON.stringify(stamp), stderr: `the install is stamped ${stamp.commit}; expected a build of ${this.commit}`, code: 1 });
      }
      this.stamp = stamp;
      console.log(`installed: sheep ${stamp.commit} (${stamp.builtAt}), wrangler ${stamp.wrangler}`);
    }
    for (const tool of ["esbuild", "wrangler", "workerd"]) {
      if (existsSync(join(pkg, "node_modules", tool))) this.fail("step 1", `ls ${join(pkg, "node_modules")}`, { stdout: readdirSync(join(pkg, "node_modules")).join("\n"), stderr: `${tool} was installed into the release's tree`, code: 1 });
    }
    const which = spawnSync("sh", ["-c", "command -v sheep"], { env, encoding: "utf8" }).stdout.trim();
    if (which !== bin) this.fail("step 1", "command -v sheep", { stdout: which, stderr: `expected ${bin}`, code: 1 });
    // No pi source anywhere under the prefix: pi is inside the two bundles, not a checkout.
    const find = spawnSync("find", [this.prefix, "-name", "*.ts", "-path", "*earendil*"], { encoding: "utf8" });
    if (find.stdout.trim() !== "") this.fail("step 1", `find ${this.prefix} -name '*.ts' -path '*earendil*'`, { stdout: find.stdout, stderr: "pi sources under the prefix", code: 1 });
    // npx ran from the ring's own cache, where its copy of the package will not keep; the durable one is the prefix's.
    if (!existsSync(join(this.cache, "_npx"))) this.fail("step 1", `ls ${this.cache}`, { stdout: readdirSync(this.cache).join("\n"), stderr: "npx left no _npx cache in the ring", code: 1 });
    const installed = readdirSync(join(pkg, "node_modules")).filter((name) => !name.startsWith("."));
    this.pkg = pkg;

    // The report: three states, and the next sentence.
    const version = `sheep ${this.stamp.commit} (${this.stamp.builtAt})`;
    const skillDir = join(this.blog, ".agents", "skills", "sheep");
    const doorway = join(this.blog, ".claude", "skills", "sheep");
    const expected = { cli: { state: "installed", path: bin, version, spec }, skill: { state: "installed", path: skillDir, doorway: { path: doorway, state: "linked" } }, home: { state: "none", home: null }, checkout: null, next: "sheep home local" };
    const wrong = [];
    if (report.cli?.state !== expected.cli.state || !this.samePath(report.cli?.path, bin) || report.cli?.version !== version || report.cli?.spec !== spec) wrong.push("cli");
    if (report.skill?.state !== "installed" || !this.samePath(report.skill?.path, skillDir) || report.skill?.doorway?.state !== "linked" || !this.samePath(report.skill?.doorway?.path, doorway)) wrong.push("skill");
    if (report.home?.state !== "none" || report.home?.home !== null) wrong.push("home");
    // The kennel: made here, with the entry appended to a .gitignore this directory did not have, and nothing of it tracked.
    if (
      report.kennel?.state !== "made" ||
      !this.samePath(report.kennel?.path, this.kennel(this.blog)) ||
      report.kennel?.gitignore?.state !== "added" ||
      !this.samePath(report.kennel?.gitignore?.path, join(this.blog, ".gitignore")) ||
      report.kennel?.tracked !== false
    ) {
      wrong.push("kennel");
    }
    if (report.checkout !== null) wrong.push("checkout");
    if (report.next !== expected.next) wrong.push("next");
    if (wrong.length > 0) this.fail("step 1", command, { ...result, stderr: `${result.stderr}\n${wrong.join(", ")} not as expected: ${JSON.stringify(expected)}` });
    // The skill on disk: this release's root SKILL.md copied under .agents, and .claude/skills/sheep a relative link to it.
    const shipped = readFileSync(join(pkg, "SKILL.md"), "utf8");
    const copied = existsSync(join(skillDir, "SKILL.md")) ? readFileSync(join(skillDir, "SKILL.md"), "utf8") : undefined;
    if (copied !== shipped) this.fail("step 1", `cat ${join(skillDir, "SKILL.md")}`, { stdout: copied ?? "", stderr: "expected the release's SKILL.md", code: 1 });
    if (this.sha !== undefined && shipped.trim() !== this.git("show", `${this.sha}:SKILL.md`)) this.fail("step 1", `git show ${this.sha}:SKILL.md`, { stdout: shipped, stderr: "the installed skill is not the ref's", code: 1 });
    let link;
    try {
      link = lstatSync(doorway);
    } catch {
      this.fail("step 1", `ls -l ${doorway}`, { stdout: "", stderr: "no doorway", code: 1 });
    }
    if (!link.isSymbolicLink() || readlinkSync(doorway) !== "../../.agents/skills/sheep" || !statSync(doorway).isDirectory() || readFileSync(join(doorway, "SKILL.md"), "utf8") !== shipped) {
      this.fail("step 1", `ls -l ${doorway}`, { stdout: link.isSymbolicLink() ? readlinkSync(doorway) : "not a symlink", stderr: "expected a relative symlink ../../.agents/skills/sheep leading to the copy", code: 1 });
    }
    // Nothing else appeared in the working directory, and nothing at all in HOME: setup makes no home and fetches no tool.
    const inWork = readdirSync(this.blog).sort();
    const expectedInWork = [".agents", ".claude", ".git", ".gitignore", ".sheep", "posts"];
    if (JSON.stringify(inWork) !== JSON.stringify(expectedInWork)) this.fail("step 1", `ls -a ${this.blog}`, { stdout: inWork.join("\n"), stderr: `expected ${expectedInWork.join(", ")}`, code: 1 });
    if (readdirSync(this.kennel(this.blog)).length > 0) this.fail("step 1", `ls -a ${this.kennel(this.blog)}`, { stdout: readdirSync(this.kennel(this.blog)).join("\n"), stderr: "the kennel setup made is not empty", code: 1 });
    if (existsSync(join(this.home, ".sheep"))) this.fail("step 1", `ls -a ${this.home}`, { stdout: readdirSync(this.home).join("\n"), stderr: "setup touched HOME/.sheep", code: 1 });
    // Journey 2 step 1: the .gitignore is one line, and git sees nothing under .sheep.
    const ignore = readFileSync(join(this.blog, ".gitignore"), "utf8");
    if (ignore !== ".sheep/\n") this.fail("step 1", `cat ${join(this.blog, ".gitignore")}`, { stdout: ignore, stderr: 'expected exactly ".sheep/"', code: 1 });
    const status = this.git0(this.blog, "status", "--porcelain");
    if (status.includes(".sheep")) this.fail("k2.1", `git status --porcelain in ${this.blog}`, { stdout: status, stderr: "git sees something under .sheep", code: 1 });
    this.ok("step 1", command, `${seconds}s, node ${versions.node}, npm ${versions.npm}; ${installed.length} packages beside sheep; no *.ts under *earendil*`);
    this.ok("step 1", "the report", `cli installed at <ring>/prefix/bin/sheep (${version}); skill installed at <blog>/.agents/skills/sheep, .claude/skills/sheep linked; kennel <blog>/.sheep made; home none; next "${report.next}"`);
    this.ok("k2.1", `cat <blog>/.gitignore; git status --porcelain`, `one line, ".sheep/"; untracked: ${status.trim().split("\n").join(" ") || "(none)"}; nothing under .sheep`);
    if (spec !== INSTALL_SPEC) this.unchecked.push(`journey 1 step 1: the spec ${JSON.stringify(INSTALL_SPEC)}; the ring installed ${spec} through SHEEP_INSTALL_SPEC (CI's second job installs the user's string)`);
    if (this.sha === undefined) this.unchecked.push(`journey 1 step 1: that the installed skill and guide are the ref's: the ring had a spec and no repository, so it read them from the install`);
  }

  /**
   * The installed `sheep`, first on PATH, finding its kennel by walking up
   * from `cwd` and its home through the config it finds there, with
   * nothing in the environment. Every step names the directory it stands
   * in; `blog` is the default, as the dog that opened there.
   */
  sheep(args, options = {}) {
    return run("sheep", args, { env: this.env(), cwd: this.blog, ...options });
  }

  /** `git` in a directory of the ring, for reading: the output, whatever the exit code. */
  git0(dir, ...args) {
    const done = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    return done.stdout ?? "";
  }

  ok(step, command, note) {
    const line = `ok    ${step.padEnd(8)} ${command}${note ? `  → ${note}` : ""}`;
    this.lines.push(line);
    console.log(line);
  }

  skip(step, why, journey = "journey 1") {
    const line = `skip  ${step.padEnd(8)} ${why}`;
    this.lines.push(line);
    console.log(line);
    this.unchecked.push(`${journey} ${step}: ${why}`);
  }

  fail(step, command, result) {
    const error = new Error(`${step}: ${command}`);
    error.ring = { step, command, result };
    throw error;
  }

  /** `home.json` under a kennel's `local/`, as the installed command wrote it. */
  record(dir) {
    return JSON.parse(readFileSync(join(this.localOf(dir), "home.json"), "utf8"));
  }

  /**
   * `sheep home local --faux --json` in a kennel: the report, the address
   * answering, and the two files that are the kennel's own — the config
   * with its token and the local marker, and `.dev.vars` mode 600 holding
   * that same token, the faux provider, and no key. Returns what the
   * caller compares between kennels.
   */
  async startHome(dir, step, expectState) {
    // Station phase 4: a container only for blog's home, only with --docker; every other home is collar's, whatever the machine has.
    const container = this.docker && dir === this.blog;
    const args = ["home", "local", "--faux", "--json", ...(container ? [] : ["--no-container"])];
    const command = `sheep ${args.join(" ")} (in ${dir === this.blog ? "blog" : "pi"})`;
    const started = await this.sheep(args, { cwd: dir });
    let report;
    try {
      report = JSON.parse(started.stdout);
    } catch {
      this.fail(step, command, started);
    }
    // Registered the moment a pid is known, under the kennel the report names (the fallback `~/.sheep`, if the directory was
    // no kennel): a check that fails below still ends this home in `stopLocalHome`, whichever kennel it started under.
    if (typeof report?.pid === "number" && typeof report.home === "string") this.homes.set(typeof report.kennel === "string" ? dirname(report.kennel) : dir, { url: report.home, pid: report.pid });
    if (started.code !== 0 || report.state !== expectState || report.key !== "faux" || typeof report.pid !== "number") this.fail(step, command, started);
    // With --docker the report must say the container is running, and why; without, a release from station phase 4 on says none.
    if (container && report.container !== "running") this.fail(step, command, { ...started, stderr: `${started.stderr}\nexpected container "running" (--docker); got ${JSON.stringify(report.container)}: ${report.reason ?? "no reason given"}` });
    if (!container && report.container !== undefined && report.container !== "none") this.fail(step, command, { ...started, stderr: `${started.stderr}\nexpected container "none" (--no-container); got ${JSON.stringify(report.container)}` });
    const url = report.home;
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !(await answers(url))) this.fail(step, `curl ${url}/`, { ...started, stderr: `${started.stderr}\n${url} does not answer sheep`, code: 1 });
    // The report names the kennel it found, and it is this directory's.
    if (!this.samePath(report.kennel, this.kennel(dir))) this.fail(step, command, { ...started, stderr: `${started.stderr}\nthe report names kennel ${report.kennel}; expected ${this.kennel(dir)}` });
    // The config, in the kennel and nowhere else: the address, a token, and the local marker.
    const configPath = this.configOf(dir);
    if (!existsSync(configPath)) this.fail(step, `cat ${configPath}`, { stdout: "", stderr: "no config was written in the kennel", code: 1 });
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (config.home !== url || typeof config.token !== "string" || config.token.length < 32 || config.local !== true) {
      this.fail(step, `cat ${configPath}`, { stdout: JSON.stringify({ ...config, token: "…" }), stderr: `expected {home: ${url}, token, local: true}`, code: 1 });
    }
    // The secrets file: mode 600, the config's token and the provider in it, no key.
    const devVars = join(this.localOf(dir), ".dev.vars");
    const mode = statSync(devVars).mode & 0o777;
    if (mode !== 0o600) this.fail(step, `stat ${devVars}`, { stdout: mode.toString(8), stderr: "expected mode 600", code: 1 });
    const secrets = readFileSync(devVars, "utf8");
    if (!secrets.includes(`SHEEP_TOKEN=${config.token}\n`) || !secrets.includes("SHEEP_PROVIDER=faux\n") || secrets.includes("SHEEP_ANTHROPIC_API_KEY")) {
      this.fail(step, `cat ${devVars}`, { stdout: secrets.replace(/=.*/g, "=…"), stderr: "expected the config's token, the faux provider, and no key", code: 1 });
    }
    this.homes.set(dir, { url, pid: report.pid });
    return { url, report, token: config.token, port: report.port };
  }

  async walk() {
    const stamp = this.stamp;
    if (this.sha !== undefined) {
      const parents = this.git("log", "-1", "--format=%P", this.sha).split(" ");
      if (!parents.some((parent) => parent.startsWith(stamp.commit))) throw new Error(`the manifest's commit ${stamp.commit} is not a parent of ${this.sha}`);
    } else this.unchecked.push(`journey 2: that the release commit has ${stamp.commit} as a parent: no repository to read; \`git log release\` answers it`);

    // Journey 1 step 7, the second half, first: the installed command names its build, and says nothing on stderr. No home is needed, and none is configured.
    const version = await this.sheep(["--version"]);
    const expected = `sheep ${stamp.commit} (${stamp.builtAt})\n`;
    if (version.code !== 0 || version.stdout !== expected || version.stderr !== "") this.fail("step 7", "sheep --version", { ...version, stderr: `${version.stderr}\nexpected ${JSON.stringify(expected)} and an empty stderr` });
    this.ok("step 7", "sheep --version", `${version.stdout.trim()}; nothing on stderr`);

    // Journey 2 step 2, before the homes: the second dog's directory, which is in no git work tree, becomes a kennel with no .gitignore.
    const piSetup = await this.sheep(["setup", "--json"], { cwd: this.pi });
    let piReport;
    try {
      piReport = JSON.parse(piSetup.stdout);
    } catch {
      this.fail("k2.2", "sheep setup --json (in pi)", piSetup);
    }
    if (
      piSetup.code !== 0 ||
      piReport.cli?.state !== "on-path" ||
      piReport.kennel?.state !== "made" ||
      !this.samePath(piReport.kennel?.path, this.kennel(this.pi)) ||
      piReport.kennel?.gitignore?.state !== "not-git" ||
      piReport.kennel?.gitignore?.path !== null ||
      piReport.kennel?.tracked !== false ||
      piReport.home?.state !== "none" ||
      piReport.skill?.state !== "installed"
    ) {
      this.fail("k2.2", "sheep setup --json (in pi)", { ...piSetup, stderr: `${piSetup.stderr}\nexpected cli on-path, the kennel made, no .gitignore outside a git work tree, home none` });
    }
    if (existsSync(join(this.pi, ".gitignore"))) this.fail("k2.2", `ls -a ${this.pi}`, { stdout: readdirSync(this.pi).join("\n"), stderr: "a .gitignore was written outside a git work tree", code: 1 });
    this.ok("k2.2", "sheep setup --json (in pi)", `cli on-path; skill installed; kennel <pi>/.sheep made; no .gitignore (not a git work tree); home none`);

    // Step 2 / journey 1 step 1: the local home under blog's kennel, with the faux provider in place of a key.
    // What Docker runs before the home starts (station phase 4): the home's own containers are the workerd-named ones not here.
    this.dockerBefore = this.docker ? this.dockerNames() : [];
    const startedAt = Date.now();
    const blog = await this.startHome(this.blog, "step 2", "started");
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
    const { url, report } = blog;
    this.token = blog.token;
    const devVars = join(this.localOf(this.blog), ".dev.vars");
    // The record: pid, port, and the stamp the install's manifest carries.
    const record = this.record(this.blog);
    if (record.pid !== report.pid || record.url !== url || JSON.stringify(record.stamp) !== JSON.stringify(stamp)) {
      this.fail("step 2", `cat ${join(this.localOf(this.blog), "home.json")}`, { stdout: JSON.stringify(record), stderr: `expected pid ${report.pid}, url ${url}, stamp ${JSON.stringify(stamp)}`, code: 1 });
    }
    // The tool: wrangler at the manifest's pin, under the ring's ~/.sheep/tools (the machine's, not the kennel's), and nowhere in the release's tree.
    const tools = join(this.home, ".sheep", "tools");
    const wranglerPkg = join(tools, "node_modules", "wrangler", "package.json");
    const wranglerVersion = existsSync(wranglerPkg) ? JSON.parse(readFileSync(wranglerPkg, "utf8")).version : undefined;
    if (wranglerVersion !== stamp.wrangler) this.fail("step 2", `cat ${wranglerPkg}`, { stdout: String(wranglerVersion), stderr: `expected wrangler ${stamp.wrangler} in ${tools}`, code: 1 });
    if (existsSync(join(this.pkg, "node_modules", "wrangler"))) this.fail("step 2", `ls ${join(this.pkg, "node_modules")}`, { stdout: "", stderr: "wrangler was installed into the release's tree", code: 1 });
    if (report.wrangler?.installed !== true) this.fail("step 2", "sheep home local --faux --json", { stdout: JSON.stringify(report.wrangler), stderr: "expected the first home to have fetched wrangler", code: 1 });
    // Nothing of the kennel is in HOME: the tools alone, which are the machine's.
    const dotSheep = readdirSync(join(this.home, ".sheep")).sort();
    if (JSON.stringify(dotSheep) !== JSON.stringify(["tools"])) this.fail("step 2", `ls ${join(this.home, ".sheep")}`, { stdout: dotSheep.join("\n"), stderr: "expected tools alone under HOME/.sheep: the config and the home are the kennel's", code: 1 });
    // ps: the daemon runs from the tools directory over the release's config with the secrets file's path, and no process's arguments carry the token.
    // Paths as the daemon saw them: it resolves its kennel from its own working directory, so on macOS its paths are realpaths under
    // /private/var where the ring's names say /var. Every comparison takes either form, and never realpaths a string that is not a path.
    const real = (path) => {
      try {
        return realpathSync(path);
      } catch {
        return path;
      }
    };
    const either = (line, path) => line.includes(path) || line.includes(real(path));
    const flagged = (line, flag, path) => line.includes(`${flag} ${path}`) || line.includes(`${flag} ${real(path)}`);
    const lines = psLines();
    const daemon = lines.find((line) => line.startsWith(`${report.pid} `));
    // With --docker the daemon runs the config derived under blog's local/ (station phase 4); without, the release's own.
    const pkgConfig = this.docker ? join(this.localOf(this.blog), "wrangler.jsonc") : join(this.pkg, "home", "wrangler.jsonc");
    if (!daemon || !either(daemon, join(tools, "node_modules", "wrangler")) || !flagged(daemon, "--config", pkgConfig) || !flagged(daemon, "--env-file", devVars)) {
      this.fail("step 2", `ps -Ao pid=,args= | grep ^${report.pid}`, { stdout: daemon ?? "", stderr: `expected the ring's wrangler over ${this.docker ? "the derived <blog>/.sheep/local/wrangler.jsonc" : "the release's home/wrangler.jsonc"} with --env-file blog's .dev.vars`, code: 1 });
    }
    if (this.docker && !(report.daemonConfig?.derived === true && this.samePath(report.daemonConfig.path, pkgConfig))) {
      this.fail("step 2", "sheep home local --faux --json (in blog)", { stdout: JSON.stringify(report.daemonConfig), stderr: `expected daemonConfig derived at ${pkgConfig}`, code: 1 });
    }
    const leaked = lines.filter((line) => line.includes(this.token));
    if (leaked.length > 0) this.fail("step 2", "ps -Ao pid=,args=", { stdout: leaked.join("\n"), stderr: "the token is in a process's arguments", code: 1 });
    // A second call reports the running home at the same address: the same choice again (--no-container unless --docker), so
    // a machine with Docker does not see the product restart the ring's containerless home with a container.
    const againArgs = ["home", "local", "--faux", "--json", ...(this.docker ? [] : ["--no-container"])];
    const again = await this.sheep(againArgs, { cwd: this.blog });
    let againReport;
    try {
      againReport = JSON.parse(again.stdout);
    } catch {
      this.fail("step 2", "sheep home local --faux --json (again)", again);
    }
    if (again.code !== 0 || againReport.state !== "running" || againReport.home !== url || againReport.pid !== report.pid) this.fail("step 2", `sheep ${againArgs.join(" ")} (again)`, { ...again, stderr: `${again.stderr}\nexpected state running at ${url} under pid ${report.pid}` });
    const containerNote = this.docker ? `; container running (${report.reason}; PEN_CELL_ORIGIN ${report.origin}, idle ${report.idle})` : "; --no-container";
    this.ok("step 2", `sheep home local --faux${this.docker ? "" : " --no-container"} (in blog)`, `${url}, pid ${report.pid}, ${seconds}s with wrangler ${stamp.wrangler} fetched into ~/.sheep/tools; <blog>/.sheep/config written; .dev.vars mode 600; again: running${containerNote}`);
    this.ok("step 2", "ps", `${daemon.slice(0, 96)}… --env-file ${devVars.replace(this.dir, "<ring>")}; ${lines.length} processes, none with the token in its arguments`);
    this.unchecked.push("journey 1 step 2: a key from ANTHROPIC_API_KEY held in .dev.vars, and a real model answering; the ring's homes ran the faux provider");
    this.unchecked.push("kennel journey 2 step 3: the warning said when `git ls-files .sheep` names something; the ring's blog never committed its kennel, and packages/cli/test/setup.test.ts drives that line from setup and from `sheep home`");

    // Step 3: a sheep is minted, the reply streams, and ls lists it; the home came from the kennel's config, nothing from the environment.
    const created = await this.sheep(["new", "--", "hello"], { cwd: this.blog });
    const id = /^session ([0-9a-f-]{36})\n/.exec(created.stderr)?.[1];
    if (created.code !== 0 || created.stdout !== `${FAUX_REPLY}\n` || !id) this.fail("step 3", "sheep new -- hello", created);
    const listed = await this.sheep(["ls"], { cwd: this.blog });
    if (listed.code !== 0 || !listed.stdout.split("\n").some((line) => line.startsWith(`${id}\t`))) this.fail("step 3", "sheep ls", listed);
    this.ok("step 3", "sheep new -- hello; sheep ls (in blog)", `${FAUX_REPLY}; session ${id} listed`);

    // Kennel journey 1 step 2: the second dog's home, in its own directory. A different port, a different token, and the tool already fetched.
    const pi = await this.startHome(this.pi, "k1.2", "started");
    if (pi.url === url) this.fail("k1.2", "sheep home local --faux --json (in pi)", { stdout: pi.url, stderr: `pi's home is at blog's address ${url}: two kennels must run two daemons`, code: 1 });
    if (pi.token === this.token) this.fail("k1.2", `cat ${this.configOf(this.pi)}`, { stdout: "(the token)", stderr: "pi's token is blog's: each kennel generates its own", code: 1 });
    if (pi.report.wrangler?.installed !== false || pi.report.wrangler?.version !== stamp.wrangler) {
      this.fail("k1.2", "sheep home local --faux --json (in pi)", { stdout: JSON.stringify(pi.report.wrangler), stderr: `expected wrangler ${stamp.wrangler} already there, installed false: the tools are the machine's`, code: 1 });
    }
    // Both daemons run, and neither token is in any process's arguments. From here the poll watches for both.
    const twoLines = psLines();
    const bothLeaked = twoLines.filter((line) => line.includes(this.token) || line.includes(pi.token));
    if (bothLeaked.length > 0) this.fail("k1.2", "ps -Ao pid=,args=", { stdout: bothLeaked.join("\n"), stderr: "a token is in a process's arguments", code: 1 });
    // The needles the poll watches, by reference: journey 3's step adds the repository's token to them.
    this.needles = [this.token, pi.token];
    this.tokenWatch = watchPs(this.needles, 25);
    const stillDotSheep = readdirSync(join(this.home, ".sheep")).sort();
    if (JSON.stringify(stillDotSheep) !== JSON.stringify(["tools"])) this.fail("k1.2", `ls ${join(this.home, ".sheep")}`, { stdout: stillDotSheep.join("\n"), stderr: "the second home put something under HOME/.sheep", code: 1 });

    // A sheep in pi, and then each `sheep ls` lists exactly its own kennel's.
    const piCreated = await this.sheep(["new", "--", "hello"], { cwd: this.pi });
    const piId = /^session ([0-9a-f-]{36})\n/.exec(piCreated.stderr)?.[1];
    if (piCreated.code !== 0 || piCreated.stdout !== `${FAUX_REPLY}\n` || !piId) this.fail("k1.2", "sheep new -- hello (in pi)", piCreated);
    const ids = async (cwd, step) => {
      const result = await this.sheep(["ls", "--json"], { cwd });
      let rows;
      try {
        rows = JSON.parse(result.stdout);
      } catch {
        this.fail(step, `sheep ls --json (in ${cwd})`, result);
      }
      if (result.code !== 0 || !Array.isArray(rows)) this.fail(step, `sheep ls --json (in ${cwd})`, result);
      return rows.map((row) => row.id);
    };
    const inPi = await ids(this.pi, "k1.2");
    const inBlog = await ids(this.blog, "k1.2");
    if (JSON.stringify(inPi) !== JSON.stringify([piId])) this.fail("k1.2", `sheep ls --json (in pi)`, { stdout: inPi.join("\n"), stderr: `expected exactly ${piId}, the sheep minted from this kennel`, code: 1 });
    if (JSON.stringify(inBlog) !== JSON.stringify([id])) this.fail("k1.2", `sheep ls --json (in blog)`, { stdout: inBlog.join("\n"), stderr: `expected exactly ${id}, the sheep minted from this kennel`, code: 1 });
    this.ok("k1.2", "sheep home local --faux; sheep new; sheep ls (in pi)", `${pi.url} (blog: ${url}), a token of its own, wrangler ${stamp.wrangler} already there; pi lists ${piId} alone, blog lists ${id} alone`);

    // Journey 1 step 3: a working directory under blog with no kennel of its own finds blog's, as git status finds the repository.
    const deepLs = await ids(this.deep, "k1.3");
    if (JSON.stringify(deepLs) !== JSON.stringify([id])) this.fail("k1.3", `sheep ls --json (in blog/posts/2026)`, { stdout: deepLs.join("\n"), stderr: `expected blog's ${id}`, code: 1 });
    const deepHome = await this.sheep(["home", "--json"], { cwd: this.deep });
    let deepReport;
    try {
      deepReport = JSON.parse(deepHome.stdout);
    } catch {
      this.fail("k1.3", "sheep home --json (in blog/posts/2026)", deepHome);
    }
    // Kennel phase 1: a local home has no station's name; the field is there and null until a deploy mints one.
    if (deepHome.code !== 0 || deepReport.home !== url || deepReport.running !== true || !this.samePath(deepReport.kennel, this.kennel(this.blog)) || deepReport.name !== null) {
      this.fail("k1.3", "sheep home --json (in blog/posts/2026)", { ...deepHome, stderr: `${deepHome.stderr}\nexpected kennel ${this.kennel(this.blog)}, home ${url}, running, name null` });
    }
    const deepProse = await this.sheep(["home"], { cwd: this.deep });
    if (!deepProse.stdout.includes(this.kennelLine(this.blog).trim())) {
      this.fail("k1.3", "sheep home (in blog/posts/2026)", { ...deepProse, stderr: `${deepProse.stderr}\nexpected the prose to name blog's kennel` });
    }
    this.ok("k1.3", "sheep ls; sheep home (in blog/posts/2026)", `${id} listed; kennel <blog>/.sheep, home ${url}, running, name null`);

    // Journey 1 step 4: pi's dog stops its home; blog's is untouched, and its next `sheep ls` says nothing about pi.
    const piStopped = await this.sheep(["home", "stop"], { cwd: this.pi });
    if (piStopped.code !== 0 || piStopped.stdout !== `stopped the local home at ${pi.url}\n`) this.fail("k1.4", "sheep home stop (in pi)", piStopped);
    this.homes.delete(this.pi);
    if (await answers(pi.url)) this.fail("k1.4", `curl ${pi.url}/`, { stdout: "", stderr: "pi's home still answers after sheep home stop", code: 1 });
    if (!(await answers(url))) this.fail("k1.4", `curl ${url}/`, { stdout: "", stderr: "stopping pi's home stopped blog's", code: 1 });
    const afterStop = await ids(this.blog, "k1.4");
    if (JSON.stringify(afterStop) !== JSON.stringify([id])) this.fail("k1.4", "sheep ls --json (in blog)", { stdout: afterStop.join("\n"), stderr: `expected blog's ${id} alone, and nothing of pi's`, code: 1 });
    const piDown = await this.sheep(["home"], { cwd: this.pi });
    if (piDown.code !== 0 || piDown.stdout !== `home: ${pi.url} (local, stopped)\n${this.kennelLine(this.pi)}`) this.fail("k1.4", "sheep home (in pi)", { ...piDown, stderr: `${piDown.stderr}\nexpected "home: ${pi.url} (local, stopped)" and ${this.kennelLine(this.pi).trim()}` });
    this.ok("k1.4", "sheep home stop (in pi); sheep ls (in blog)", `pi's ${pi.url} stopped and says so; blog's ${url} still answers and lists ${id} alone`);

    // Journey 1 step 5: a terminal in neither directory falls back to ~/.sheep, which holds no home, and says which kennel that is.
    const outside = await this.sheep(["home", "--json"], { cwd: this.dir });
    let outsideReport;
    try {
      outsideReport = JSON.parse(outside.stdout);
    } catch {
      this.fail("k1.5", `sheep home --json (in ${this.dir})`, outside);
    }
    if (outside.code !== 0 || outsideReport.home !== null || !this.samePath(outsideReport.kennel, join(this.home, ".sheep"))) {
      this.fail("k1.5", `sheep home --json (outside both kennels)`, { ...outside, stderr: `${outside.stderr}\nexpected home null and kennel ${join(this.home, ".sheep")}, the fallback` });
    }
    this.ok("k1.5", "sheep home --json (outside both kennels)", `kennel ~/.sheep, the fallback; home none, and neither dog's home named`);

    // Journey 2 step 1, after the home ran: the token and the key are under .sheep, and git sees neither.
    const ignoreNow = readFileSync(join(this.blog, ".gitignore"), "utf8");
    const statusNow = this.git0(this.blog, "status", "--porcelain");
    const ignored = this.git0(this.blog, "status", "--porcelain", "--ignored");
    if (ignoreNow !== ".sheep/\n" || statusNow.includes(".sheep") || !ignored.includes("!! .sheep/")) {
      this.fail("k2.1", `git status --porcelain --ignored in ${this.blog}`, { stdout: `${statusNow}${ignored}`, stderr: 'expected .gitignore still one line, nothing under .sheep untracked, and "!! .sheep/" ignored', code: 1 });
    }
    this.ok("k2.1", "git status --porcelain [--ignored] (in blog, the home running)", `.gitignore one line; untracked: ${statusNow.trim().split("\n").join(" ")}; ignored: !! .sheep/, holding the config and .dev.vars`);

    // Step 4, first half: a prompt to the sheep, streamed by sheep's own client inside the bundle.
    const again4 = await this.sheep(["attach", id, "--", "again"]);
    if (again4.code !== 0 || again4.stdout !== `${FAUX_REPLY}\n`) this.fail("step 4", `sheep attach ${id} -- again`, again4);
    // Second half: no prompt, no terminal; pi's client from the bundle attaches and says so, and ps sees it run.
    const needle = join(this.pkg, "dist", "pi-client.mjs");
    const ps = watchPs(needle);
    let attached;
    try {
      attached = await this.sheep(["attach", id]);
    } finally {
      ps.stop();
    }
    if (attached.code !== 0 || !attached.stdout.includes(`\t${id}\tattached`)) this.fail("step 4", `sheep attach ${id}`, attached);
    const seen = ps.line();
    if (!seen) this.fail("step 4", `ps -Ao pid=,args= while sheep attach ${id}`, { ...attached, stderr: `${attached.stderr}\nno process running ${needle} was seen`, code: 1 });
    this.ok("step 4", `sheep attach ${id} -- again; sheep attach ${id}`, `${FAUX_REPLY}; attached through pi's client`);
    this.ok("step 4", "ps", seen);
    this.unchecked.push("journey 1 step 4: pi's interactive terminal, which needs a TTY; the ring attached with none");

    // Step 5: the guide is the file beside the bundle, printed whole; and setup again, in the same directory, finds everything current and the home running.
    const guide = await this.sheep(["--agent-help"]);
    const shipped = readFileSync(join(this.pkg, "dist", "agent-guide.md"), "utf8");
    if (guide.code !== 0 || guide.stdout !== shipped || guide.stderr !== "") this.fail("step 5", "sheep --agent-help", { ...guide, stderr: `${guide.stderr}\nexpected ${join(this.pkg, "dist", "agent-guide.md")} on stdout and nothing on stderr` });
    if (this.sha !== undefined && shipped.trim() !== this.git("show", `${this.sha}:dist/agent-guide.md`)) this.fail("step 5", `git show ${this.sha}:dist/agent-guide.md`, { stdout: shipped, stderr: "the installed guide is not the ref's", code: 1 });
    for (const said of ["sheep home local", "ANTHROPIC_API_KEY", "sheep wait", "A hand at a terminal"]) {
      if (!shipped.includes(said)) this.fail("step 5", "sheep --agent-help", { ...guide, stderr: `the guide does not say ${JSON.stringify(said)}`, code: 1 });
    }
    const setupAgain = await this.sheep(["setup", "--json"], { cwd: this.blog });
    let second;
    try {
      second = JSON.parse(setupAgain.stdout);
    } catch {
      this.fail("step 5", "sheep setup --json (again)", setupAgain);
    }
    const bin = join(this.prefix, "bin", "sheep");
    const current =
      setupAgain.code === 0 &&
      second.cli?.state === "on-path" &&
      this.samePath(second.cli.path, bin) &&
      second.cli.version === expected.trim() &&
      second.skill?.state === "current" &&
      second.skill.doorway?.state === "current" &&
      // Idempotent: the kennel is there, the entry is there, and no second line was added.
      second.kennel?.state === "present" &&
      second.kennel.gitignore?.state === "present" &&
      second.kennel.tracked === false &&
      second.home?.state === "local" &&
      second.home.home === url &&
      second.home.running === true &&
      second.home.pid === report.pid &&
      second.checkout === null &&
      second.next === "sheep --agent-help";
    if (!current) this.fail("step 5", "sheep setup --json (again)", { ...setupAgain, stderr: `${setupAgain.stderr}\nexpected cli on-path at ${bin}, skill current, doorway current, kennel present with its entry already there, home ${url} local and running under pid ${report.pid}, next "sheep --agent-help"` });
    if (readFileSync(join(this.blog, ".gitignore"), "utf8") !== ".sheep/\n") this.fail("step 5", `cat ${join(this.blog, ".gitignore")}`, { stdout: readFileSync(join(this.blog, ".gitignore"), "utf8"), stderr: "a second setup added a second line", code: 1 });
    this.ok("step 5", "sheep --agent-help; sheep setup --json (again)", `${shipped.split(/\s+/).length} words, the ref's dist/agent-guide.md; again: cli on-path, skill current, doorway current, kennel present and .gitignore unchanged, home local running, next "${second.next}"`);

    // Step 6: the home stops; the next command starts it and says so; the sheep is still there; `sheep home` reports each state.
    const stopped = await this.sheep(["home", "stop"], { cwd: this.blog });
    // With --docker the stop may add one line, the home's own containers removed by name (the proxy wrangler leaves behind);
    // n = 0 prints none. Without --docker the stop's output is the one line, exactly.
    const stopLine = `stopped the local home at ${url}\n`;
    const removedLine = /^removed (\d+) containers? of the home's \(workerd-sheep-PenContainer-…\)\n$/.exec(stopped.stdout.slice(stopLine.length));
    const stopHeld = stopped.code === 0 && (this.docker ? stopped.stdout === stopLine || (stopped.stdout.startsWith(stopLine) && removedLine !== null) : stopped.stdout === stopLine);
    if (!stopHeld) this.fail("step 6", "sheep home stop", { ...stopped, stderr: `${stopped.stderr}\nexpected ${JSON.stringify(stopLine)}${this.docker ? ' and at most one "removed <n> container(s) of the home\'s (workerd-sheep-PenContainer-…)" line' : " exactly"}` });
    const containersRemoved = removedLine === null ? 0 : Number(removedLine[1]);
    if (await answers(url)) this.fail("step 6", `curl ${url}/`, { stdout: "", stderr: "the home still answers after sheep home stop", code: 1 });
    if (this.record(this.blog).pid !== null) this.fail("step 6", `cat ${join(this.localOf(this.blog), "home.json")}`, { stdout: JSON.stringify(this.record(this.blog)), stderr: "the pid was not cleared", code: 1 });
    const down = await this.sheep(["home"], { cwd: this.blog });
    if (down.code !== 0 || down.stdout !== `home: ${url} (local, stopped)\n${this.kennelLine(this.blog)}`) this.fail("step 6", "sheep home", { ...down, stderr: `${down.stderr}\nexpected "home: ${url} (local, stopped)" and ${this.kennelLine(this.blog).trim()}` });
    const morning = await this.sheep(["ls"], { cwd: this.blog });
    if (morning.code !== 0 || !morning.stderr.includes("sheep: the local home is not running; starting it\n") || !morning.stdout.split("\n").some((line) => line.startsWith(`${id}\t`))) {
      this.fail("step 6", "sheep ls (the home stopped)", morning);
    }
    const up = await this.sheep(["home", "--json"], { cwd: this.blog });
    let upReport;
    try {
      upReport = JSON.parse(up.stdout);
    } catch {
      this.fail("step 6", "sheep home --json", up);
    }
    if (up.code !== 0 || upReport.running !== true || upReport.home !== url || typeof upReport.pid !== "number" || upReport.pid === report.pid || JSON.stringify(upReport.stamp) !== JSON.stringify(stamp)) {
      this.fail("step 6", "sheep home --json", { ...up, stderr: `${up.stderr}\nexpected running at ${url} under a new pid with stamp ${JSON.stringify(stamp)}` });
    }
    // Station phase 0: the two stamps. The home's, from `GET /home`, is what scripts/bundle.mjs defined into the release's
    // Worker; the command's is the manifest's. Both must be the release's commit and time: a checkout-built Worker in an
    // install is a release that did not carry its stamp, and skew between the two is a warning the ring must not see.
    const build = { commit: stamp.commit, builtAt: stamp.builtAt };
    if (JSON.stringify(upReport.build?.home) !== JSON.stringify(build) || JSON.stringify(upReport.build?.cli) !== JSON.stringify(build)) {
      this.fail("step 6", "sheep home --json", { ...up, stderr: `${up.stderr}\nexpected build.home and build.cli both ${JSON.stringify(build)}; got ${JSON.stringify(upReport.build)}` });
    }
    if (up.stderr !== "") this.fail("step 6", "sheep home --json", { ...up, stderr: `${up.stderr}\nexpected nothing on stderr: the two stamps are equal, so no skew line` });
    this.homes.set(this.blog, { url, pid: upReport.pid });
    this.ok("step 6", "sheep home stop; sheep home; sheep ls; sheep home --json", `stopped${this.docker ? ` (${containersRemoved} container${containersRemoved === 1 ? "" : "s"} of the home's removed)` : ""}; "(local, stopped)"; started on demand, pid ${report.pid} → ${upReport.pid}, ${id} listed; stamp ${upReport.stamp.commit} (${upReport.stamp.builtAt}), wrangler ${upReport.stamp.wrangler}; build.home = build.cli = ${build.commit} (${build.builtAt})`);

    // Station phase 4, journey 6: the home restarted on demand kept its container (the record's choice); its sheep name their tools.
    if (this.docker) await this.dockerWalk(url, report.idle);
    else this.unchecked.push("station journey 6: the local home with a container; the ring's homes ran with --no-container (`pnpm hermetic --ring package --docker` on a machine with Docker walks it)");

    // Eyes phase 2, e1: journey 1 of the eyes on blog's home, the Chrome fetched into the ring's fresh HOME by the first look; or,
    // with --no-eyes (the machine ring's container, whose image cannot run Chrome), one skip line, the way journey 6 prints without --docker.
    if (this.noEyes) {
      const why = "not walked inside the machine ring's container; its image has none of Chrome's shared libraries, and Chrome for Testing has no linux/arm64 build";
      const line = `skip  ${"e1".padEnd(8)} ${why}`;
      this.lines.push(line);
      console.log(line);
      this.unchecked.push(`eyes journey 1 steps 1 to 4 (e1): ${why}`);
    } else await this.eyesWalk(url);

    // Serve phase 2, s1: the served look on blog's local home, which needs the container --docker gives it. Without one the step is
    // a skip line and is named at the end, the way journey 6 and e1 are; the container it rents here is cold, d4 having emptied it.
    // No `settleStation` before this one, unlike s2's: nothing deploys to this home, Docker starts its container and nothing else
    // stops it, and there is no rollout on a local home to be caught by. s1 has never failed the way s2 did, and could not.
    if (this.noEyes || !this.docker) {
      const why = this.noEyes
        ? "not walked inside the machine ring's container, which has no eyes to look with and no Docker socket to rent a container of its own"
        : "the ring's home has no container, so there is nowhere to run a server (`pnpm hermetic --ring package --docker` on a machine with Docker walks it)";
      const line = `skip  ${"s1".padEnd(8)} ${why}`;
      this.lines.push(line);
      console.log(line);
      this.unchecked.push(`serve journey 3's third criterion (s1): ${why}`);
    } else await this.servedWalk({ step: "s1", home: url, token: this.token, where: "blog's local home" });

    // Step 7, first half: the export is a SQLite file with the tables the command reports.
    const file = join(this.dir, `${id}.sqlite`);
    const exported = await this.sheep(["export", id, file], { cwd: this.blog });
    if (exported.code !== 0 || !existsSync(file)) this.fail("step 7", `sheep export ${id} ${file}`, exported);
    const counts = Object.fromEntries(exported.stdout.trim().split("\t")[1].split(" ").map((pair) => pair.split("=")));
    // Counted in a child Node told the SQLite warning is known, so the only ExperimentalWarning that can appear in this ring's output is the CLI's.
    const counter = `const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(process.argv[1], { readOnly: true });
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
      console.log(JSON.stringify(Object.fromEntries(tables.map((table) => [table, db.prepare('SELECT count(*) AS n FROM "' + table + '"').get().n]))));`;
    const counted = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "-e", counter, file], { encoding: "utf8" });
    if (counted.status !== 0) this.fail("step 7", `node -e (node:sqlite) ${file}`, { stdout: counted.stdout, stderr: counted.stderr, code: counted.status ?? 1 });
    const inFile = JSON.parse(counted.stdout);
    for (const [table, count] of Object.entries(counts)) {
      if (!(table in inFile)) this.fail("step 7", `sqlite3 ${file} .tables`, { stdout: Object.keys(inFile).join("\n"), stderr: `export reported ${table}=${count}, not in the file`, code: 1 });
      if (String(inFile[table]) !== count) this.fail("step 7", `SELECT count(*) FROM ${table}`, { stdout: String(inFile[table]), stderr: `export reported ${count}`, code: 1 });
    }
    this.ok("step 7", `sheep export ${id}`, `${exported.stdout.trim().split("\t")[1]}; opened with node:sqlite, counts match`);
    this.unchecked.push("journey 1 step 7: pi's own session backend opening the export; node:sqlite opened it and counted");

    // The whole walk: neither kennel's token was in any process's arguments in any sample.
    this.tokenWatch.stop();
    const leak = this.tokenWatch.line();
    if (leak) this.fail("walk", "ps -Ao pid=,args= (polled)", { stdout: leak, stderr: "a token was seen in a process's arguments during the walk", code: 1 });
    this.ok("walk", "ps (polled every 25 ms from k1.2)", `${this.tokenWatch.samples()} samples, neither kennel's token in any process's arguments`);
    // What the ring's HOME holds after everything: the tools, and nothing else. The kennels hold the rest.
    const homeAfter = existsSync(join(this.home, ".sheep")) ? readdirSync(join(this.home, ".sheep")).sort() : [];
    if (JSON.stringify(homeAfter) !== JSON.stringify(["tools"])) {
      this.fail("walk", `ls -a ${join(this.home, ".sheep")}`, { stdout: homeAfter.join("\n"), stderr: "expected tools alone under the ring's HOME/.sheep", code: 1 });
    }
    this.ok("walk", `ls ~/.sheep`, `tools alone (wrangler ${stamp.wrangler}, fetched once for both kennels); the configs and both homes are in <blog>/.sheep and <pi>/.sheep`);
  }

  /**
   * Eyes phase 2, e1: the look on blog's local home. The ring's HOME is
   * fresh and its environment carries no `XDG_CACHE_HOME`, so miniflare's
   * Chrome cache under it is absent before the walk and holds one build
   * after: the first look fetched it, and its time says what that costs.
   */
  async eyesWalk(url) {
    const chrome = chromeCacheOf(this.home);
    if (existsSync(chrome)) this.fail("e1", `ls ${chrome}`, { stdout: readdirSync(chrome).join("\n"), stderr: "a Chrome is in the ring's HOME before any look; the first look must be the one that fetches it", code: 1 });
    const walked = await this.lookWalk({ step: "e1", home: url, token: this.token, where: "blog's local home" });
    const fetched = existsSync(chrome) ? readdirSync(chrome).filter((name) => !name.startsWith(".")) : [];
    if (fetched.length === 0) this.fail("e1", `ls ${chrome}`, { stdout: "", stderr: `no Chrome under the ring's HOME after two looks; expected miniflare to have fetched one into ${chrome}`, code: 1 });
    this.ok("e1", `ls ${chrome.replace(this.home, "~")}`, `absent before the walk; after it ${fetched.join(", ")}: the first look fetched the Chrome into the ring's HOME, in ${walked.first}s launch included, and the second connected in ${walked.second}s`);
    await this.eyesReported("e1", "blog's local home");
  }

  /**
   * `sheep home --json` says `eyes: true`: asked last in both rings' steps,
   * after the look and the transcript are judged, so a release whose look
   * holds but whose report is silent fails on this line and not before.
   */
  async eyesReported(step, where) {
    const homed = await this.sheep(["home", "--json"], { cwd: this.blog });
    let report;
    try {
      report = JSON.parse(homed.stdout);
    } catch {
      this.fail(step, "sheep home --json (in blog)", homed);
    }
    if (homed.code !== 0 || report.eyes !== true) this.fail(step, "sheep home --json (in blog)", { ...homed, stderr: `${homed.stderr}\nexpected eyes true after the look; got ${JSON.stringify(report.eyes)}` });
    this.ok(step, "sheep home --json (in blog)", `eyes true, ${where}`);
  }

  /**
   * Journey 1 of the eyes with the faux provider (eyes phase 2), on a
   * home at `home` with `token`: two programs, two turns on one sheep,
   * and the transcript read back whole. Returns the sheep's id and the
   * two looks' own times, from their closing lines; `eyesReported` is the
   * caller's, last.
   */
  async lookWalk({ step, home, token, where }) {
    const post = async (program) => {
      const posted = await fetch(`${home}/faux`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(program), signal: AbortSignal.timeout(30_000) });
      if (posted.status !== 200) this.fail(step, `POST ${home}/faux`, { stdout: await posted.text(), stderr: `status ${posted.status}; expected 200 from the faux provider's route`, code: 1 });
    };
    // Turn 1: the four files, the first look, the PNG read back; the sheep's sentence is the reply.
    await post(LOOK_PROGRAM);
    const firstStarted = Date.now();
    const created = await this.sheep(["new", "--", LOOK_SENTENCE], { cwd: this.blog });
    const turnOne = ((Date.now() - firstStarted) / 1000).toFixed(1);
    const id = /^session ([0-9a-f-]{36})\n/.exec(created.stderr)?.[1];
    if (created.code !== 0 || created.stdout !== `${LOOK_REPLY}\n` || !id) this.fail(step, `sheep new -- "${LOOK_SENTENCE}" (in blog)`, { ...created, stderr: `${created.stderr}\nexpected the sheep's sentence ${JSON.stringify(LOOK_REPLY)} on stdout and the session id on stderr` });
    // Turn 2: the look with two clicks, within the session's ten minutes, so it connects rather than launches.
    await post(LOOK_AGAIN_PROGRAM);
    const secondStarted = Date.now();
    const again = await this.sheep(["attach", id, "--", LOOK_AGAIN_SENTENCE], { cwd: this.blog });
    const turnTwo = ((Date.now() - secondStarted) / 1000).toFixed(1);
    if (again.code !== 0 || again.stdout !== `${LOOK_AGAIN_REPLY}\n`) this.fail(step, `sheep attach ${id} -- "${LOOK_AGAIN_SENTENCE}" (in blog)`, { ...again, stderr: `${again.stderr}\nexpected the sheep's sentence ${JSON.stringify(LOOK_AGAIN_REPLY)} on stdout` });
    // The program every cell answers from goes back to none before anything is judged, so a failure below leaves the home as it was.
    await post(null);

    // The transcript: both reports, line for line what the eyes suite holds, and the read tool's image.
    const logged = await this.sheep(["log", id], { cwd: this.blog });
    if (logged.code !== 0) this.fail(step, `sheep log ${id}`, logged);
    const log = logged.stdout;
    const reports = log.split(/^errors:$/m);
    const missing = [];
    const must = (what, held) => {
      if (!held) missing.push(what);
    };
    must("two reports, each starting with `errors:`", reports.length === 3);
    const [, first = "", second = ""] = reports;
    must("[tool bash] look index.html", log.includes("look index.html"));
    // The log prints a tool call's arguments as JSON, so the selector's quotes arrive escaped: `--click \"#inc\"`.
    must('[tool bash] look index.html --click "#inc" --click "#inc"', /look index\.html --click \\?"#inc\\?" --click \\?"#inc\\?"/.test(log));
    must("the first report's ReferenceError", /ReferenceError/.test(first));
    must("the first report naming undefinedFunction", first.includes("undefinedFunction"));
    must("console: with `log: app ready, items: 3`", first.includes("console:") && first.includes("log: app ready, items: 3"));
    must("console: with the warning", first.includes("warn: a warning the sheep should see"));
    must("tree:", first.includes("tree:") && second.includes("tree:"));
    must('tree: heading "Counter"', first.includes('heading "Counter"') && second.includes('heading "Counter"'));
    must('tree: button "+1"', first.includes('button "+1"'));
    must("tree: the list items (wool, grass, fence)", ["wool", "grass", "fence"].every((item) => first.includes(item)));
    must('the second report\'s tree with "2" after two clicks', /"2"/.test(second.split(/^wrote look\.png/m)[0] ?? ""));
    must("Read image file [image/png], the read tool's result for look.png", log.includes("Read image file [image/png]"));
    const closings = [...log.matchAll(/^wrote look\.png (\d+)x(\d+) in (\d+\.\d)s$/gm)];
    must("two closing lines `wrote look.png 1024x768 in N.Ns`", closings.length === 2 && closings.every((line) => line[1] === "1024" && line[2] === "768"));
    must("the sheep's two sentences in the transcript", log.includes(LOOK_REPLY) && log.includes(LOOK_AGAIN_REPLY));
    if (missing.length > 0) this.fail(step, `sheep log ${id} (in blog)`, { ...logged, stderr: `${logged.stderr}\nthe transcript lacks: ${missing.join("; ")}` });
    const first0 = closings[0][3];
    const second0 = closings[1][3];
    this.ok(step, `POST /faux; sheep new -- "…"; POST /faux; sheep attach ${id} -- "…"; sheep log ${id} (in blog, on ${where})`, `turn 1 ${turnOne}s with the first look ${first0}s (launch included), turn 2 ${turnTwo}s with the second look ${second0}s (the session kept); errors: ReferenceError undefinedFunction; console: log and warn; tree: heading "Counter", button "+1", wool, grass, fence; "2" after two clicks; wrote look.png 1024x768 twice; Read image file [image/png]`);
    return { id, first: first0, second: second0 };
  }

  /**
   * Serve phase 2, s1 and s2: a served look with the faux provider on a
   * home with a container — journey 2's shape, one turn, no model. The
   * program writes the page and its server, takes the look with a click,
   * reads the PNG, and then probes the port from inside the container.
   * Four things are read off the transcript, and they are the four the
   * phase asks for: the command ran (the `server` section carries the
   * line the server printed for every request the page made, which is the
   * only place a page's requests can be read at all); the page was
   * rendered from its port (the tree is the served page and the click
   * moved it); the report has its `server` section and a closing line
   * whose one clock contains the wait for the port; and the server was
   * stopped — not from the report, which would be the look marking its
   * own homework, but from the container: nothing listening on either
   * loopback, and the pid the server wrote to `/tmp/served.marker` gone
   * from `/proc`. Returns the turn's and the look's seconds.
   *
   * `settled`, when the caller has one, is what it did to make sure the
   * platform was not about to replace the container under the look
   * (`settleStation`); it is said on the step's line so a reader can see
   * whether the look was taken into a rollout or after one.
   */
  async servedWalk({ step, home, token, where, settled }) {
    const post = async (program) => {
      const posted = await fetch(`${home}/faux`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(program), signal: AbortSignal.timeout(30_000) });
      if (posted.status !== 200) this.fail(step, `POST ${home}/faux`, { stdout: await posted.text(), stderr: `status ${posted.status}; expected 200 from the faux provider's route`, code: 1 });
    };
    await post(SERVED_PROGRAM);
    const started = Date.now();
    const created = await this.sheep(["new", "--", SERVED_SENTENCE], { cwd: this.blog });
    const turn = ((Date.now() - started) / 1000).toFixed(1);
    const id = /^session ([0-9a-f-]{36})\n/.exec(created.stderr)?.[1];
    if (created.code !== 0 || created.stdout !== `${SERVED_REPLY}\n` || !id) this.fail(step, `sheep new -- "${SERVED_SENTENCE}" (in blog)`, { ...created, stderr: `${created.stderr}\nexpected the sheep's sentence ${JSON.stringify(SERVED_REPLY)} on stdout and the session id on stderr` });
    // The program every cell answers from goes back to none before anything is judged, so a failure below leaves the home as it was.
    await post(null);

    const logged = await this.sheep(["log", id], { cwd: this.blog });
    if (logged.code !== 0) this.fail(step, `sheep log ${id}`, logged);
    const log = logged.stdout;
    const missing = [];
    const must = (what, held) => {
      if (!held) missing.push(what);
    };
    // The log prints a tool call's arguments as JSON, so the selector's quotes arrive escaped and the command's single quotes do not.
    must(`[tool bash] ${SERVED_LOOK}`, /look --serve 'node server\.mjs' --click \\?"#ping\\?" \//.test(log));
    const report = log.split(/^errors:$/m)[1] ?? "";
    must("one report, starting with `errors:`", log.split(/^errors:$/m).length === 2);
    must("errors: none — the served page had no errors", /^errors:\n {2}none$/m.test(log));
    must("`server:` between errors and console (a served look always has one)", /^server:$/m.test(report) && /^console:$/m.test(report));
    const server = (report.split(/^server:$/m)[1] ?? "").split(/^console:$/m)[0] ?? "";
    must("server: the server's own start line", /serving on localhost:\d+ as pid \d+/.test(server));
    must("server: HEAD / 200, the readiness poll through the forward", server.includes("HEAD / 200"));
    for (const line of ["GET / 200", "GET /style.css 200", "GET /app.js 200", "GET /rows.json 200"]) must(`server: ${line}, the page's request answered from the port`, server.includes(line));
    must("console: the page's module ran and read its JSON from the server", /^console:\n {2}log: served page ready, rows: 3$/m.test(report));
    const tree = ((report.split(/^tree:$/m)[1] ?? "").split(/^wrote look\.png/m)[0] ?? "");
    must('tree: heading "Served"', tree.includes('heading "Served"'));
    must('tree: button "ping"', tree.includes('button "ping"'));
    must("tree: the three rows (port, forward, kill)", ["port", "forward", "kill"].every((row) => tree.includes(row)));
    must('tree: "1" after the click', /"1"/.test(tree));
    must("Read image file [image/png], the read tool's result for look.png", log.includes("Read image file [image/png]"));
    const closing = /^wrote look\.png (\d+)x(\d+) in (\d+\.\d)s, served by `node server\.mjs` on (\d+), ready in (\d+\.\d)s$/m.exec(log);
    must("the closing line `wrote look.png 1024x768 in N.Ns, served by `node server.mjs` on 5173, ready in N.Ns`", closing !== null && closing[1] === "1024" && closing[2] === "768" && closing[4] === String(SERVE_PORT));
    must("one clock: the whole served look is not shorter than the wait for the port inside it", closing !== null && Number(closing[3]) >= Number(closing[5]));
    const probed = /^probe port (\d+): (.*)$/m.exec(log);
    const pidLine = /^probe pid: marker (\S+?),(.*)$/m.exec(log);
    const inside = /^probe container: pid 1 is (.*)$/m.exec(log);
    must(`the probe found nothing listening on ${SERVE_PORT}, on either loopback`, probed !== null && probed[1] === String(SERVE_PORT) && !probed[2].includes("listening"));
    must("the probe ran in the container the look served from (/tmp/served.marker holds the server's pid)", pidLine !== null && /^\d+$/.test(pidLine[1]));
    must("the server's pid gone from that container's /proc", pidLine !== null && pidLine[2].includes("gone"));
    must("the probe's container is the pen agent's", inside !== null && inside[1].includes("pen-agent"));
    must("the probe's line ran whole", log.includes("probe done"));
    if (missing.length > 0) this.fail(step, `sheep log ${id} (in blog)`, { ...logged, stderr: `${logged.stderr}\nthe transcript lacks: ${missing.join("; ")}` });
    this.ok(
      step,
      `POST /faux; sheep new -- "…"; sheep log ${id} (in blog, on ${where})`,
      `${settled === undefined ? "" : `${settled}; `}turn ${turn}s with the served look ${closing[3]}s (the container's start included), ${closing[5]}s of it waiting for the port; server: ${server.trim().split("\n").length} lines, the start line, the poll's HEAD, and every request the page made (/, /style.css, /app.js, /rows.json); errors: none; console: the page's log; tree: heading "Served", button "ping", port, forward, kill, "1" after the click; wrote look.png 1024x768, served by \`node server.mjs\` on ${SERVE_PORT}; Read image file [image/png]; after the look ${probed[2]}, and the server's pid ${pidLine[1]} gone from /proc in the same container (pid 1 ${inside[1]})`,
    );
    return { id, turn, look: closing[3], ready: closing[5] };
  }

  /** What Docker runs now, by name; nothing when docker does not answer. */
  dockerNames() {
    const done = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" });
    return done.status === 0 ? done.stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  }

  /** The containers this ring's home started: wrangler names them `workerd-<worker>-<class>-<id>` (and `…-proxy` beside each), and none was there before the walk. */
  ownContainers() {
    return this.dockerNames().filter((name) => name.startsWith("workerd-") && !this.dockerBefore.includes(name));
  }

  /**
   * Journey 6 (station phase 4), with `--docker`, after step 6: the
   * record and the home agree on the container and the image is the
   * config's (d1); a sheep's shell names git, node, and pnpm from a
   * container running that image (d2); pasture's journey 1 on the scratch
   * repository, or one skip line (d3); and the containers gone after the
   * idle the report named, plus a minute (d4). The faux program is reset
   * afterwards, so step 7 finds the walk as it was.
   */
  async dockerWalk(url, idle) {
    const parse = (step, command, result) => {
      try {
        return JSON.parse(result.stdout);
      } catch {
        this.fail(step, command, result);
      }
    };
    const idleMatch = /^(\d+)(s|m)$/.exec(idle ?? "");
    if (!idleMatch) this.fail("d1", "sheep home local --faux --json (in blog)", { stdout: JSON.stringify(idle), stderr: "expected the report's idle as <n>s or <n>m", code: 1 });
    const idleMs = Number(idleMatch[1]) * (idleMatch[2] === "m" ? 60_000 : 1_000);

    // d1: the record says container, the home says container, and the image the home reports is the line the installed config names.
    const homed = await this.sheep(["home", "--json"], { cwd: this.blog });
    const homeReport = parse("d1", "sheep home --json (in blog)", homed);
    if (homed.code !== 0 || homeReport.running !== true || homeReport.container !== true) this.fail("d1", "sheep home --json (in blog)", { ...homed, stderr: `${homed.stderr}\nexpected running true and container true after the restart on demand` });
    let answer;
    try {
      const response = await fetch(`${url}/home`, { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(10_000) });
      answer = await response.json();
    } catch (error) {
      this.fail("d1", `GET ${url}/home`, { stdout: "", stderr: error.message, code: 1 });
    }
    const config = parseJsonc(readFileSync(join(this.pkg, "home", "wrangler.jsonc"), "utf8"));
    const image = imageOf(config);
    if (typeof image !== "string" || !image.startsWith("docker.io/")) this.fail("d1", `cat ${join(this.pkg, "home", "wrangler.jsonc")}`, { stdout: JSON.stringify(image), stderr: "expected the pen container to name a registry image; a release does", code: 1 });
    if (answer?.container !== true || answer?.image !== image) this.fail("d1", `GET ${url}/home`, { stdout: JSON.stringify(answer), stderr: `expected container true and image ${image}, the installed config's line`, code: 1 });
    // The derived config and its Dockerfile, under blog's local/: the Dockerfile is the one line naming the installed config's image.
    const derivedPath = join(this.localOf(this.blog), "wrangler.jsonc");
    const dockerfile = join(this.localOf(this.blog), "Dockerfile");
    if (!existsSync(derivedPath) || !existsSync(dockerfile)) this.fail("d1", `ls ${this.localOf(this.blog)}`, { stdout: readdirSync(this.localOf(this.blog)).join("\n"), stderr: "expected wrangler.jsonc and Dockerfile, the derived config and its one line", code: 1 });
    const fromLine = readFileSync(dockerfile, "utf8");
    if (fromLine !== `FROM ${image}\n`) this.fail("d1", `cat ${dockerfile}`, { stdout: fromLine, stderr: `expected exactly "FROM ${image}"`, code: 1 });
    const derivedConfig = parseJsonc(readFileSync(derivedPath, "utf8"));
    const derivedContainer = derivedConfig?.env?.pen?.containers?.[0];
    if (derivedContainer?.image !== "./Dockerfile" || derivedContainer?.image_build_context !== "." || typeof derivedConfig.main !== "string" || !derivedConfig.main.startsWith("/")) {
      this.fail("d1", `cat ${derivedPath}`, { stdout: JSON.stringify(derivedContainer), stderr: "expected the pen container's image ./Dockerfile with image_build_context . and an absolute main", code: 1 });
    }
    this.ok("d1", "sheep home --json; GET /home; cat <blog>/.sheep/local/{wrangler.jsonc,Dockerfile} (in blog)", `container true in the record and from the home, running; the home's image is the config's: ${image}; the derived config's container is ./Dockerfile, one line: FROM ${image}`);

    // d2: the program, the sheep, the log, and the container running the image.
    const program = { steps: [{ tool: { name: "bash", args: { command: "git --version && node --version && pnpm --version" } } }, { text: "git, node, pnpm" }] };
    const posted = await fetch(`${url}/faux`, { method: "POST", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: JSON.stringify(program), signal: AbortSignal.timeout(30_000) });
    if (posted.status !== 200) this.fail("d2", `POST ${url}/faux`, { stdout: await posted.text(), stderr: `status ${posted.status}`, code: 1 });
    const sentence = "which tools?";
    const newStarted = Date.now();
    const created = await this.sheep(["new", "--", sentence], { cwd: this.blog });
    const newSeconds = ((Date.now() - newStarted) / 1000).toFixed(1);
    const toolsId = /^session ([0-9a-f-]{36})\n/.exec(created.stderr)?.[1];
    if (created.code !== 0 || created.stdout !== "git, node, pnpm\n" || !toolsId) this.fail("d2", `sheep new -- "${sentence}"`, { ...created, stderr: `${created.stderr}\nexpected "git, node, pnpm" on stdout and the session id on stderr` });
    let lastCommandAt = Date.now();
    const own = this.ownContainers();
    const mains = own.filter((name) => !name.endsWith("-proxy"));
    if (mains.length === 0) this.fail("d2", "docker ps --format {{.Names}}", { stdout: this.dockerNames().join("\n"), stderr: `no workerd-named container appeared for the home's sheep (before the walk: ${this.dockerBefore.join(", ") || "(none)"})`, code: 1 });
    const logged = await this.sheep(["log", toolsId], { cwd: this.blog });
    if (logged.code !== 0 || !logged.stdout.includes("git version")) this.fail("d2", `sheep log ${toolsId}`, { ...logged, stderr: `${logged.stderr}\nexpected the tool result naming git version` });
    const versions = { git: /git version (\S+)/.exec(logged.stdout)?.[1], node: /\n(v\d+\.\d+\.\d+)\n/.exec(logged.stdout)?.[1], pnpm: /\n(\d+\.\d+\.\d+)\n/.exec(logged.stdout)?.[1] };
    // The container is the registry's image and not a facade: its image id is the id Docker holds for the config's reference.
    // A build's base image is pulled into layers and never tagged in the store, so the reference is pulled by name first
    // (the tag or the digest, as the config names it, for linux/amd64), then inspected.
    const pullStarted = Date.now();
    const pulled = spawnSync("docker", ["pull", "--platform", "linux/amd64", image], { encoding: "utf8" });
    const pullSeconds = ((Date.now() - pullStarted) / 1000).toFixed(0);
    if (pulled.status !== 0) this.fail("d2", `docker pull --platform linux/amd64 ${image}`, { stdout: pulled.stdout, stderr: pulled.stderr, code: pulled.status ?? 1 });
    const expectedId = spawnSync("docker", ["image", "inspect", image, "--format", "{{.Id}}"], { encoding: "utf8" });
    if (expectedId.status !== 0) this.fail("d2", `docker image inspect ${image}`, { stdout: expectedId.stdout, stderr: `${expectedId.stderr}\nthe image the config names is not on this machine after the pull, so the home's container cannot be compared with it`, code: expectedId.status ?? 1 });
    const ran = spawnSync("docker", ["inspect", "--format", "{{.Image}} {{.Config.Image}}", ...mains], { encoding: "utf8" });
    const wrong = ran.stdout.trim().split("\n").filter((line) => !line.startsWith(`${expectedId.stdout.trim()} `));
    if (ran.status !== 0 || wrong.length > 0) this.fail("d2", `docker inspect ${mains.join(" ")}`, { stdout: ran.stdout, stderr: `${ran.stderr}\nexpected every container to run image ${expectedId.stdout.trim()} (${image})`, code: 1 });
    this.ok("d2", `POST /faux; sheep new -- "${sentence}"; sheep log ${toolsId}; docker ps; docker pull; docker inspect`, `${newSeconds}s; "git, node, pnpm"; the shell in the container: git version ${versions.git ?? "?"}, node ${versions.node ?? "?"}, pnpm ${versions.pnpm ?? "?"}; ${mains.join(", ")} running ${image} (image ${expectedId.stdout.trim().slice(0, 19)}, pulled by name in ${pullSeconds}s), ${own.length - mains.length} proxy beside`);

    // d3: pasture's journey 1 on the scratch repository, the sheep cloning and pushing from their containers; or one skip line.
    const station = { home: url, token: this.token, pastures: [], minted: [], image };
    await journeyThree(this, station, { needles: this.needles, step: "d3", prefix: "local", journey: "station journey 6 (pasture's journey 1)" });
    if (station.minted.length > 0) lastCommandAt = Date.now();

    // d4: every container of the home's is gone within the idle plus a minute of the last command; the proxies with them.
    const deadline = lastCommandAt + idleMs + 60_000;
    let left = this.ownContainers();
    while (left.length > 0 && Date.now() < deadline) {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 5_000));
      left = this.ownContainers();
    }
    const idleSeconds = ((Date.now() - lastCommandAt) / 1000).toFixed(0);
    if (left.length > 0) this.fail("d4", "docker ps --format {{.Names}} (polled)", { stdout: left.join("\n"), stderr: `still running ${idleSeconds}s after the last command; expected gone within ${idle} plus a minute`, code: 1 });
    this.ok("d4", "docker ps (polled every 5 s)", `the home's containers gone ${idleSeconds}s after the last command (idle ${idle}); nothing workerd-named that was not there before the walk`);

    // The program every cell answers from goes back to none, so step 7's export is of the walk's own sheep and nothing else changes.
    await fetch(`${url}/faux`, { method: "POST", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: "null", signal: AbortSignal.timeout(30_000) });
  }

  /** Every home the walk started, one per kennel: stopped with the installed command, unless kept; whatever is left is signalled. */
  async stopLocalHome() {
    this.tokenWatch?.stop();
    if (this.keep) return;
    for (const [dir, home] of [...this.homes]) {
      const stopped = await this.sheep(["home", "stop"], { cwd: dir }).catch(() => undefined);
      if (stopped?.code !== 0) console.error(`hermetic: sheep home stop in ${dir} exited ${stopped?.code ?? "?"}: ${(stopped?.stderr ?? "").trim()}`);
      let pid = home.pid;
      try {
        pid = this.record(dir).pid ?? pid;
      } catch {
        // no record
      }
      if (pid !== null) {
        for (const target of [-pid, pid]) {
          try {
            process.kill(target, "SIGTERM");
          } catch {
            // gone
          }
        }
      }
      this.homes.delete(dir);
    }
  }

  report(failure, ringName = "package") {
    console.log("");
    if (failure?.ring) {
      const { step, command, result } = failure.ring;
      console.log(`FAIL  ${step}: ${command} (exit ${result.code})`);
      if (result.stdout?.trim()) console.log(`--- stdout ---\n${result.stdout.trimEnd()}`);
      if (result.stderr?.trim()) console.log(`--- stderr ---\n${result.stderr.trimEnd()}`);
    } else if (failure) {
      console.log(`FAIL  ${failure.message}`);
    }
    console.log(`not checked by the ${ringName} ring:`);
    for (const item of [
      ...this.unchecked,
      "that this machine's Node is the user's: the ring ran the node and npm on PATH here (the machine ring runs this walk in containers from node:22-slim and node:24-slim)",
      "that wrangler's fetch works on a cold network: ~/.sheep/tools came through the ring's own npm cache, from the registry the first time",
    ]) {
      console.log(`  - ${item}`);
    }
    if (this.keep) {
      console.log(`kept: ${this.dir}`);
      const blogHome = this.homes.get(this.blog);
      if (blogHome) {
        console.log(`  blog's local home is still running at ${blogHome.url} (pid ${blogHome.pid}); journey 5's file runs against it with`);
        console.log(`    SHEEP_TEST_HOME=${blogHome.url} SHEEP_TEST_TOKEN=${this.token} pnpm --filter @sheep/cli exec vitest --run test/journey5.test.ts`);
        console.log(`  and stops with`);
        console.log(`    (cd ${this.blog} && HOME=${this.home} ${join(this.prefix, "bin", "sheep")} home stop)`);
      }
      for (const [dir, home] of this.homes) {
        if (dir !== this.blog) console.log(`  ${dir}'s home is still running at ${home.url} (pid ${home.pid}); (cd ${dir} && HOME=${this.home} ${join(this.prefix, "bin", "sheep")} home stop)`);
      }
    }
  }

  cleanup() {
    if (this.keep) return;
    rmSync(this.dir, { recursive: true, force: true });
  }
}

/** Streams a command's output line by line under an indent; resolves with the exit code. `onLine` sees each line as it arrives; `input` goes to stdin, which is otherwise ignored. */
function runIndented(command, args, options, indent = "    ", onLine = undefined) {
  const { input, ...rest } = options ?? {};
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], ...rest });
    if (input !== undefined) child.stdin.end(input);
    let pending = "";
    const emit = (chunk) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) {
        console.log(indent + line);
        onLine?.(line);
      }
    };
    child.stdout.on("data", emit);
    child.stderr.on("data", emit);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (pending) {
        console.log(indent + pending);
        onLine?.(pending);
      }
      resolveRun(code ?? (signal ? 1 : 0));
    });
  });
}

/** The image tag the machine ring builds for a base image: `sheep-ring:node-22-slim`; the dog ring's is `sheep-ring:dog-node-24-slim`. */
const ringTag = (image, prefix = "") => `sheep-ring:${prefix}${image.replace(/[^A-Za-z0-9_.-]+/g, "-")}`;

/**
 * What a container is, checked before the walk: the image's node, npm, and
 * git, and none of what journey 3 step 2 rules out. The dog ring adds its
 * own lines. One shell command; a nonzero exit names the first thing wrong.
 */
function probeScript(extra = []) {
  return [
    `printf 'node %s, npm %s, git %s, %s\\n' "$(node --version)" "$(npm --version)" "$(git --version | cut -d' ' -f3)" "$(uname -m)"`,
    `test ! -e /var/run/docker.sock || { echo 'a Docker socket is in the container'; exit 1; }`,
    `for tool in pnpm wrangler workerd sheep; do ! command -v "$tool" >/dev/null || { echo "$tool is in the image"; exit 1; }; done`,
    `for f in "$HOME/.gitconfig" "$HOME/.npmrc" "$HOME/.sheep" "$HOME/.npm" "$HOME/.wrangler" "$HOME/.config/.wrangler" "$HOME/.claude" "$HOME/.claude.json"; do test ! -e "$f" || { echo "$f is in the image"; exit 1; }; done`,
    // `--init` mounts Docker's own init at /usr/sbin/docker-init: the one process that reaps a detached daemon, which a user's machine has and a container does not.
    `awk '$5 !~ /^\\/(proc|sys|dev|etc\\/(resolv.conf|hostname|hosts)|usr\\/sbin\\/docker-init)(\\/|$)/ && $5 != "/" {print "mounted: " $5; bad=1} END {exit bad}' /proc/self/mountinfo`,
    `echo "no docker socket; no pnpm, wrangler, workerd, or sheep; no git config, npmrc, .sheep, .npm, or .claude; nothing mounted but /, /proc, /sys, /dev, the DNS files, and docker-init"`,
    ...extra,
  ].join(" && ");
}

/** Builds one ring image from the context, streaming nothing; returns the seconds it took, or throws with docker's output. */
async function buildImage(context, image, tag, buildArgs) {
  const started = Date.now();
  const args = ["build", "--build-arg", `NODE_IMAGE=${image}`, ...buildArgs.flatMap((arg) => ["--build-arg", arg]), "--tag", tag, "--file", join(context, "Dockerfile"), context];
  const build = await run("docker", args, { env: { ...process.env, DOCKER_BUILDKIT: "1" } });
  if (build.code !== 0) throw new Error(`docker build failed (exit ${build.code}):\n${build.stdout}${build.stderr}`.trimEnd());
  return ((Date.now() - started) / 1000).toFixed(0);
}

/**
 * The machine ring: the package ring's walk inside a container built from
 * each of the images, with the ref exported into the build context as a
 * bare repository and nothing mounted. One line per image, the package
 * ring's output indented under it; the first image that fails ends the
 * ring. Docker is the one thing it needs; without it, exit 2, loudly.
 */
async function machineRing({ ref, repo, images, keep }) {
  const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"], { encoding: "utf8" });
  if (docker.error || docker.status !== 0) {
    const why = docker.error ? docker.error.message : (docker.stderr || docker.stdout || "").trim();
    console.error(`hermetic: the machine ring needs Docker on this machine, and there is none that answers (docker version: ${why}); nothing was checked`);
    process.exit(2);
  }
  const engine = docker.stdout.trim();
  const git = gitIn(repo);
  let sha;
  try {
    sha = git("rev-parse", "--verify", `${ref}^{commit}`);
  } catch (error) {
    usage(`${ref}: ${error.message}`);
  }
  console.log(`machine ring: ${ref} = ${sha}; docker ${engine}; images ${images.join(", ")}`);

  // The build context: the ref's history as a bare repository, this script, and the Dockerfile. Nothing else of this machine reaches the image.
  const context = mkdtempSync(join(tmpdir(), "sheep-machine-"));
  const bare = join(context, "src.git");
  const failures = [];
  const unchecked = [];
  try {
    gitIn(context)("init", "--quiet", "--bare", "src.git");
    git("push", "--quiet", bare, `${sha}:refs/heads/ring`);
    // A fresh bare repository's HEAD points at a branch that does not exist, so `git ls-remote` lists no HEAD, and npm's git
    // installer (pacote, npm 10 and 11) dies on it: "Cannot read properties of undefined (reading 'sha')". HEAD is the ring's branch.
    gitIn(bare)("symbolic-ref", "HEAD", "refs/heads/ring");
    copyFileSync(fileURLToPath(import.meta.url), join(context, "hermetic.mjs"));
    copyFileSync(join(root, "scripts", "hermetic", "Dockerfile"), join(context, "Dockerfile"));
    const size = spawnSync("du", ["-sh", bare], { encoding: "utf8" }).stdout.split("\t")[0];
    console.log(`context: ${context}: src.git (${size}, the ref as refs/heads/ring), hermetic.mjs, Dockerfile`);

    for (const image of images) {
      const tag = ringTag(image);
      console.log(`\n${image}:`);
      let buildSeconds;
      try {
        buildSeconds = await buildImage(context, image, tag, []);
      } catch (error) {
        console.log(`    ${error.message}`);
        failures.push(`${image}: docker build failed`);
        break;
      }
      const probed = await run("docker", ["run", "--rm", "--init", tag, "sh", "-c", probeScript()]);
      if (probed.code !== 0) {
        console.log(`    the container is not bare (exit ${probed.code}):\n${probed.stdout}${probed.stderr}`.trimEnd());
        failures.push(`${image}: the container is not bare`);
        break;
      }
      for (const line of probed.stdout.trim().split("\n")) console.log(`    ${line}`);
      // --no-eyes (eyes phase 2): the image has none of Chrome's shared libraries, and Chrome for Testing has no linux/arm64 build, which
      // is what a container on an arm64 Mac is; the walk inside prints e1 as one skip line and names it at the end.
      const ringArgs = ["run", "--rm", "--init", tag, "node", "/ring/hermetic.mjs", "--ring", "package", "--repo", "/src.git", sha, "--no-eyes"];
      console.log(`    docker ${ringArgs.join(" ")}`);
      const ringStarted = Date.now();
      const code = await runIndented("docker", ringArgs, {});
      const ringSeconds = ((Date.now() - ringStarted) / 1000).toFixed(0);
      if (code !== 0) {
        console.log(`${image}: FAILED (build ${buildSeconds}s, ring ${ringSeconds}s, exit ${code}); the container's output is above`);
        failures.push(`${image}: the package ring exited ${code}`);
        break;
      }
      console.log(`${image}: ok (build ${buildSeconds}s, ring ${ringSeconds}s)`);
    }
    unchecked.push(
      "that a person was in the loop: the walk was the package ring's, scripted, with the faux provider",
      "that the user's machine has git and ps: the image added git (the README's prerequisite, which npm's git installer needs) and procps (this script's own need, to watch for the token)",
      `that the user's architecture and libc are this image's: docker ${engine}, Debian slim`,
      "that a user without root can do it: the container ran as root, the image's default",
      "that the registry is reachable from a user's network: wrangler came through this machine's network, into the container's own npm cache",
      "that a coding agent would find its way: none was in the container (the dog ring puts Claude Code in it and gives it the sentence)",
      "station journey 6: the local home with a container: the container has no Docker, so its homes ran with --no-container (`pnpm hermetic --ring package --docker` on a machine with Docker walks it)",
    );
  } finally {
    if (keep) console.log(`\nkept: ${context}`);
    else rmSync(context, { recursive: true, force: true });
  }
  console.log("\nnot checked by the machine ring (the package ring's own list is above, per image):");
  for (const item of unchecked) console.log(`  - ${item}`);
  // `map(ringTag)` would hand the index in as the tag's prefix, and name two images that do not exist.
  console.log(`images kept: ${images.map((image) => ringTag(image)).join(", ")} (docker image rm to drop them)`);
  if (failures.length > 0) {
    console.log(`\nmachine ring: FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`\nmachine ring: ok (${images.length} image${images.length === 1 ? "" : "s"} held)`);
}

/** An argument as a person would paste it into a shell. */
const quote = (arg) => (/^[A-Za-z0-9_/.,:=+@%#-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`);

/** One line from the terminal. */
function ask(question) {
  return new Promise((resolveAsk) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolveAsk(answer.trim());
    });
  });
}

/**
 * The dog ring, outside: the key and the yes, then the build context, the
 * image with Claude Code in it, the probe, and one container running this
 * script's other half with the key as an environment variable. The
 * container's output is the report; the ring ends by naming what it did
 * not check.
 */
async function dogRing({ ref, repo, spec, commit, images, keep, yes, dryRun, budget, timeout }) {
  const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"], { encoding: "utf8" });
  if (docker.error || docker.status !== 0) {
    const why = docker.error ? docker.error.message : (docker.stderr || docker.stdout || "").trim();
    console.error(`hermetic: the dog ring needs Docker on this machine, and there is none that answers (docker version: ${why}); nothing was checked`);
    process.exit(2);
  }
  const engine = docker.stdout.trim();
  const image = images[0];
  let sha;
  let stamp;
  if (spec === undefined) {
    const git = gitIn(repo);
    try {
      sha = git("rev-parse", "--verify", `${ref}^{commit}`);
    } catch (error) {
      usage(`${ref}: ${error.message}`);
    }
    stamp = JSON.parse(git("show", `${sha}:package.json`)).sheep;
    if (typeof stamp?.commit !== "string") usage(`${ref} carries no build stamp in its package.json; a release does`);
  }
  const expect = spec === undefined ? stamp.commit : commit;
  const source = spec === undefined ? `${ref} = ${sha} (a build of ${stamp.commit}), reached inside as ${INSTALL_SPEC} through /src.git` : `${spec} from GitHub${commit ? `, expected to be a build of ${commit}` : ""}`;
  console.log(`dog ring: ${source}; docker ${engine}; image ${image}; dog ${AGENT_PACKAGE} at its current version${dryRun ? "; dry run: stops before the prompt" : ""}`);

  // The key and the yes, before anything is built or pulled.
  if (!dryRun) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("hermetic: the dog ring needs ANTHROPIC_API_KEY in its environment: Claude Code's key, and the one the dog's home will hold; export it and run again, or --dry-run, which needs none");
      process.exit(2);
    }
    console.log(
      [
        "",
        "the dog ring spends the shepherd's tokens.",
        `  one Claude Code session in print mode on its default model with ${DOG_TOOLS}, walking journey 1 in a dozen or two turns: on the order of a dollar or two,`,
        `  and never more than $${budget} (--max-budget-usd; --budget changes it). The key goes to the container as an environment variable and to nothing else of this ring;`,
        `  ${image} is pulled if it is not here, and the container reaches npm, GitHub, and Anthropic over this machine's network.`,
      ].join("\n"),
    );
    if (yes) console.log("  --yes: not asking");
    else {
      if (!process.stdin.isTTY) {
        console.error("hermetic: the dog ring asks before it spends, and stdin is not a terminal; pass --yes to answer ahead. Nothing was built or spent");
        process.exit(2);
      }
      const answer = await ask("run it? [y/N] ");
      if (!/^y(es)?$/i.test(answer)) {
        console.error("hermetic: not run; nothing was built or spent");
        process.exit(2);
      }
    }
  }

  // The build context: the ref as refs/heads/release of a bare repository (an empty directory for the spec, which needs none), this script, and the Dockerfile.
  const context = mkdtempSync(join(tmpdir(), "sheep-dog-"));
  const bare = join(context, "src.git");
  const tag = ringTag(image, "dog-");
  const unchecked = [];
  let failure;
  let claudeVersion = "?";
  try {
    if (spec === undefined) {
      gitIn(context)("init", "--quiet", "--bare", "src.git");
      gitIn(repo)("push", "--quiet", bare, `${sha}:refs/heads/release`);
      gitIn(bare)("symbolic-ref", "HEAD", "refs/heads/release");
    } else mkdirSync(bare);
    copyFileSync(fileURLToPath(import.meta.url), join(context, "hermetic.mjs"));
    copyFileSync(join(root, "scripts", "hermetic", "Dockerfile"), join(context, "Dockerfile"));
    console.log(`context: ${context}: src.git (${spec === undefined ? `${spawnSync("du", ["-sh", bare], { encoding: "utf8" }).stdout.split("\t")[0]}, the ref as refs/heads/release` : "empty; the spec needs no repository"}), hermetic.mjs, Dockerfile`);

    console.log(`\n${image} + ${AGENT_PACKAGE}:`);
    const buildSeconds = await buildImage(context, image, tag, [`AGENT=${AGENT_PACKAGE}`]);
    console.log(`  built ${tag} in ${buildSeconds}s`);
    const probed = await run("docker", ["run", "--rm", "--init", tag, "sh", "-c", probeScript([`printf 'claude %s at %s, run as %s\\n' "$(claude --version | cut -d' ' -f1)" "$(command -v claude)" "$(id -un)"`])]);
    if (probed.code !== 0) throw new Error(`the container is not bare (exit ${probed.code}):\n${probed.stdout}${probed.stderr}`.trimEnd());
    for (const line of probed.stdout.trim().split("\n")) console.log(`  ${line}`);
    claudeVersion = /^claude (\S+)/m.exec(probed.stdout)?.[1] ?? "?";

    // The container: this script's other half, the key as a variable docker reads from this process's environment, never an argument.
    const name = `sheep-dog-${process.pid}`;
    const inside = ["node", "/ring/hermetic.mjs", "--ring", "dog", "--inside", "--budget", String(budget), ...(spec === undefined ? ["--redirect"] : []), ...(expect ? ["--expect", expect] : []), ...(dryRun ? ["--dry-run"] : [])];
    const runArgs = ["run", "--rm", "--init", "--name", name, ...(dryRun ? [] : ["-e", "ANTHROPIC_API_KEY"]), tag, ...inside];
    console.log(`\n  docker ${runArgs.join(" ")}`);
    let killed;
    const kill = (why) => {
      killed = why;
      spawnSync("docker", ["kill", name], { stdio: "ignore" });
    };
    const onSignal = () => kill("interrupted");
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    const timer = setTimeout(() => kill(`${timeout} minutes passed (--timeout)`), timeout * 60_000);
    const started = Date.now();
    let code;
    try {
      code = await runIndented("docker", runArgs, {}, "  ");
    } finally {
      clearTimeout(timer);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    if (killed) throw new Error(`the container was killed after ${seconds}s: ${killed}`);
    if (code !== 0) throw new Error(`the container exited ${code} after ${seconds}s; its output is above`);
    console.log(`\n${image}: ok (build ${buildSeconds}s, container ${seconds}s)`);
  } catch (error) {
    failure = error;
  } finally {
    if (keep) console.log(`\nkept: ${context}`);
    else rmSync(context, { recursive: true, force: true });
  }
  unchecked.push(
    `that any dog but Claude Code ${claudeVersion} would find its way: --agent ${DOG_AGENT} is the only value (pi is the second dog, deliberately open)`,
    `that a second image holds: ${image} alone (the machine ring walks node:22-slim and node:24-slim)`,
    `that a person typed the sentence and answered the dog: the prompt went in print mode with --allowedTools ${DOG_TOOLS} and --permission-prompts none, so nothing could ask and anything that would was denied and reported`,
    "that the dog asked for the key: ANTHROPIC_API_KEY was in the container's environment from the start, so journey 1 step 2's ask was met ahead",
    "that a user without root can do it: the container ran as root, the image's default; Claude Code refuses --dangerously-skip-permissions as root, so the dog's tools came by --allowedTools",
    "that the skill the dog read is the ref's: npx skills add clones main of github.com/dglazkov/sheep, as it does for a user; --skill sheep names the one the root SKILL.md is, which a bare `skills add` finds and stops at (the repository's .claude/skills are its own workflow, and never offered)",
    spec === undefined
      ? `that github.com serves ${INSTALL_SPEC}: the container's git was told github.com/dglazkov/sheep is /src.git, the ref exported as refs/heads/release (the ring given the spec installs from GitHub)`
      : `that the release commit has ${expect ?? "a known commit"} as a parent: no repository to read; \`git log release\` answers it${expect ? "" : "; with no --commit the stamp was printed, not checked"}`,
    "that the dog's network is a user's: Claude Code, npm, GitHub, and the registry were reached over this machine's network",
  );
  if (dryRun) unchecked.push("everything from the prompt on: --dry-run stopped before it, and no key was in the container");
  console.log("\nnot checked by the dog ring:");
  for (const item of unchecked) console.log(`  - ${item}`);
  console.log(`image kept: ${tag} (docker image rm to drop it)`);
  if (failure) {
    console.log(`\ndog ring: FAILED: ${failure.message}`);
    process.exit(1);
  }
  console.log(`\ndog ring: ${dryRun ? "dry run ok (stopped before the prompt)" : "ok"}`);
}

/** The transcript, rendered from Claude Code's stream-json as it arrives: what the dog said, each tool call, the first lines of each result, and the result event kept. */
class Transcript {
  constructor(print) {
    this.print = print;
    this.result = undefined;
    this.tools = 0;
  }

  line(text) {
    if (!text.trim()) return;
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      this.print(`  ? ${text.slice(0, 200)}`);
      return;
    }
    this.event(event);
  }

  event(event) {
    const type = event.type;
    if (type === "system" && event.subtype === "init") {
      const skills = [...(event.skills ?? []), ...(event.slash_commands ?? [])].map(String);
      this.print(`  init: claude ${event.claude_code_version ?? "?"}, model ${event.model}, ${(event.tools ?? []).length} tools, permission mode ${event.permissionMode}, the sheep skill ${skills.some((skill) => skill.includes("sheep")) ? "listed" : "not listed"}`);
    } else if (type === "assistant") {
      for (const block of event.message?.content ?? []) {
        if (block.type === "text" && block.text.trim()) this.print(`  dog: ${block.text.trim().split("\n").join("\n       ")}`);
        else if (block.type === "tool_use") {
          this.tools++;
          this.print(`  ${block.name}: ${Transcript.call(block)}`);
        }
      }
    } else if (type === "user") {
      for (const block of event.message?.content ?? []) {
        if (block.type !== "tool_result") continue;
        const text = typeof block.content === "string" ? block.content : (block.content ?? []).map((part) => part.text ?? "").join("\n");
        const lines = text.trimEnd().split("\n");
        const shown = lines.slice(0, 12).map((line) => (line.length > 200 ? `${line.slice(0, 200)}…` : line));
        this.print(`    ${block.is_error ? "error" : "→"} ${shown.join("\n    | ")}${lines.length > 12 ? `\n    … ${lines.length - 12} more lines` : ""}`);
      }
    } else if (type === "result") this.result = event;
  }

  static call(block) {
    const input = block.input ?? {};
    if (block.name === "Bash") return `$ ${input.command}${input.description ? `  # ${input.description}` : ""}`;
    if (typeof input.file_path === "string") return input.file_path;
    return JSON.stringify(input).slice(0, 300);
  }
}

/**
 * The dog ring, inside the container: the skill, the redirect, the exact
 * command, the run rendered as a transcript, and the assertions after it,
 * all in one HOME. Prints nothing that holds the key.
 */
async function dogInside({ dryRun, redirect, expect, budget }) {
  if (root !== "/" || !existsSync("/ring/hermetic.mjs") || !existsSync("/.dockerenv")) {
    console.error("hermetic: --inside is the container's half of the dog ring; run pnpm hermetic --ring dog");
    process.exit(2);
  }
  const env = process.env;
  const key = env.ANTHROPIC_API_KEY;
  const print = (text) => console.log(key ? text.split(key).join("<ANTHROPIC_API_KEY>") : text);
  const home = homedir();
  const work = join(home, "work");
  const tilde = (path) => path.replace(home, "~");
  const ok = (step, command, note) => print(`ok    ${step.padEnd(8)} ${command}${note ? `  → ${note}` : ""}`);
  const fail = (step, command, result) => {
    print(`\nFAIL  ${step}: ${command} (exit ${result.code})`);
    if (result.stdout?.trim()) print(`--- stdout ---\n${result.stdout.trimEnd()}`);
    if (result.stderr?.trim()) print(`--- stderr ---\n${result.stderr.trimEnd()}`);
    process.exit(1);
  };

  // Before the dog: no sheep, no ~/.sheep, no working directory.
  const before = spawnSync("sh", ["-c", "command -v sheep"], { encoding: "utf8" }).stdout.trim();
  if (before || existsSync(join(home, ".sheep")) || existsSync(work)) fail("before", `command -v sheep; ls ${tilde(join(home, ".sheep"))} ${tilde(work)}`, { stdout: before, stderr: "sheep is in the container before the dog", code: 1 });
  mkdirSync(work);
  ok("before", `command -v sheep; ls ${tilde(join(home, ".sheep"))}`, `nothing; ${tilde(work)} made, empty`);

  // The skill, from main on GitHub, as a user's would come; before the redirect, which is npm's.
  const skillStarted = Date.now();
  const added = await run(SKILLS_ADD[0], SKILLS_ADD.slice(1), { cwd: work, env });
  const skillSeconds = ((Date.now() - skillStarted) / 1000).toFixed(0);
  const skillDir = join(work, ".claude", "skills", "sheep");
  const skillFile = join(skillDir, "SKILL.md");
  if (added.code !== 0 || !existsSync(skillFile)) fail("skill", SKILLS_ADD.join(" "), { ...added, stderr: `${added.stderr}\nexpected ${skillFile}` });
  const skillText = readFileSync(skillFile, "utf8");
  let versus = "";
  if (redirect) {
    const refs = spawnSync("git", ["--git-dir", "/src.git", "show", "release:SKILL.md"], { encoding: "utf8" }).stdout;
    versus = skillText.trim() === refs.trim() ? "; the same text as the ref's SKILL.md" : "; not the ref's text (main's, from GitHub)";
  }
  ok("skill", SKILLS_ADD.join(" "), `${skillSeconds}s; ${tilde(skillFile)} (${lstatSync(skillDir).isSymbolicLink() ? "a link" : "a real directory, copied"}, ${skillText.length} bytes)${versus}; in ${tilde(work)}: ${readdirSync(work).sort().join(", ")}`);

  // The redirect: the string the dog types reaches /src.git, where the ref is refs/heads/release.
  if (redirect) {
    GITHUB_URLS.forEach((url, index) => gitIn(home)("config", "--global", ...(index === 0 ? [] : ["--add"]), "url.file:///src.git.insteadOf", url));
    const listed = spawnSync("git", ["ls-remote", GITHUB_URLS[0], "refs/heads/release"], { encoding: "utf8" });
    const sha = (listed.stdout || "").split("\t")[0];
    if (listed.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) fail("redirect", `git ls-remote ${GITHUB_URLS[0]} refs/heads/release`, { stdout: listed.stdout, stderr: listed.stderr, code: listed.status ?? 1 });
    ok("redirect", `git config --global url.file:///src.git.insteadOf ${GITHUB_URLS[0]} (and ${GITHUB_URLS.length - 1} more forms)`, `git ls-remote ${GITHUB_URLS[0]} refs/heads/release → ${sha.slice(0, 7)}`);
  }

  // The command, exactly; the sentence is journey 1's and nothing else is said.
  const claudeArgs = ["-p", SENTENCE, "--allowedTools", DOG_TOOLS, "--permission-prompts", "none", "--max-budget-usd", String(budget), "--output-format", "stream-json", "--verbose"];
  print(`\ndog: cd ${work} && claude ${claudeArgs.map(quote).join(" ")}`);
  print(`     stdin /dev/null; ANTHROPIC_API_KEY ${key ? "in" : "not in"} the environment; the skill at ${tilde(skillDir)}`);
  if (dryRun) {
    print("dry run: stopping before the prompt");
    return;
  }
  if (!key) fail("dog", "claude -p …", { stdout: "", stderr: "ANTHROPIC_API_KEY is not in the container's environment", code: 2 });

  const transcript = new Transcript(print);
  const started = Date.now();
  print("");
  const dog = await new Promise((resolveRun, reject) => {
    const child = spawn("claude", claudeArgs, { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] });
    let pending = "";
    const err = [];
    child.stdout.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) transcript.line(line);
    });
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (pending) transcript.line(pending);
      resolveRun({ code: code ?? (signal ? 1 : 0), stderr: Buffer.concat(err).toString("utf8") });
    });
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const result = transcript.result;
  if (dog.stderr.trim()) print(`  stderr: ${dog.stderr.trim().split("\n").slice(0, 20).join("\n  stderr: ")}`);
  const denials = result?.permission_denials ?? [];
  const summary = result
    ? `${result.subtype}${result.is_error ? " (error)" : ""}, ${result.num_turns} turns, $${Number(result.total_cost_usd ?? 0).toFixed(2)}, ${transcript.tools} tool calls, ${denials.length} denials, model ${Object.keys(result.modelUsage ?? {}).join("+") || "?"}`
    : "no result event";
  print(`\ndog: exit ${dog.code} after ${seconds}s; ${summary}`);
  for (const denial of denials) print(`  denied: ${denial.tool_name} ${JSON.stringify(denial.tool_input ?? {}).slice(0, 200)}`);
  if (result?.result) print(`\nthe dog's report:\n  ${String(result.result).trim().split("\n").join("\n  ")}\n`);
  const dogFailed = dog.code !== 0 || result === undefined || result.is_error === true;

  // Afterwards, in the same HOME: the ref's build on PATH, a sheep, the local home answering with the key held, and a stop that ends.
  const sheep = (args) => run("sheep", args, { cwd: work, env });
  const version = await sheep(["--version"]);
  const stampCommit = /^sheep ([0-9a-f]+) \(/.exec(version.stdout)?.[1];
  if (version.code !== 0 || !stampCommit || version.stderr !== "") fail("after", "sheep --version", version);
  if (expect && !expect.startsWith(stampCommit)) fail("after", "sheep --version", { ...version, stderr: `expected a build of ${expect}` });
  ok("after", "sheep --version", `${version.stdout.trim()}${expect ? `, a build of ${expect}` : ""}; at ${spawnSync("sh", ["-c", "command -v sheep"], { encoding: "utf8" }).stdout.trim()}`);
  const listed = await sheep(["ls", "--json"]);
  let sessions;
  try {
    sessions = JSON.parse(listed.stdout);
  } catch {
    fail("after", "sheep ls --json", listed);
  }
  if (listed.code !== 0 || !Array.isArray(sessions) || sessions.length === 0) fail("after", "sheep ls --json", { ...listed, stderr: `${listed.stderr}\nexpected at least one sheep` });
  ok("after", "sheep ls --json", `${sessions.length} sheep: ${sessions.map((session) => `${session.id} (${session.state ?? "?"}${session.name ? `, ${session.name}` : ""})`).join("; ")}${listed.stderr.trim() ? `; stderr: ${listed.stderr.trim()}` : ""}`);
  const homed = await sheep(["home", "--json"]);
  let report;
  try {
    report = JSON.parse(homed.stdout);
  } catch {
    fail("after", "sheep home --json", homed);
  }
  if (homed.code !== 0 || report.local !== true || report.running !== true || !/^http:\/\/127\.0\.0\.1:\d+$/.test(report.home) || typeof report.pid !== "number") fail("after", "sheep home --json", { ...homed, stderr: `${homed.stderr}\nexpected the local home running` });
  if (expect && !expect.startsWith(report.stamp?.commit ?? "")) fail("after", "sheep home --json", { ...homed, stderr: `the home's stamp is ${report.stamp?.commit}; expected a build of ${expect}` });
  // The secrets are the kennel's, wherever the dog made one: the report names it, so nothing here guesses at ~/.sheep.
  const kennel = typeof report.kennel === "string" ? report.kennel : join(home, ".sheep");
  const devVars = join(kennel, "local", ".dev.vars");
  const names = existsSync(devVars) ? readFileSync(devVars, "utf8").split("\n").map((line) => line.split("=")[0].trim()).filter(Boolean) : [];
  const mode = existsSync(devVars) ? statSync(devVars).mode & 0o777 : undefined;
  if (!names.includes("SHEEP_ANTHROPIC_API_KEY") || names.includes("SHEEP_PROVIDER") || mode !== 0o600) fail("after", `stat ${tilde(devVars)}`, { stdout: `${names.join(", ")}; mode ${mode?.toString(8)}`, stderr: "expected SHEEP_ANTHROPIC_API_KEY held, no SHEEP_PROVIDER, mode 600: the key from the environment, a real model", code: 1 });
  ok("after", "sheep home --json", `${report.home} running, pid ${report.pid}, stamp ${report.stamp?.commit}; kennel ${tilde(kennel)}; ${tilde(devVars)} mode ${mode.toString(8)} holds ${names.join(", ")}`);
  const stopStarted = Date.now();
  const stopped = await sheep(["home", "stop"]);
  const stopSeconds = ((Date.now() - stopStarted) / 1000).toFixed(1);
  if (stopped.code !== 0 || stopped.stdout !== `stopped the local home at ${report.home}\n`) fail("after", "sheep home stop", stopped);
  ok("after", "sheep home stop", `${stopped.stdout.trim()} in ${stopSeconds}s${stopped.stderr.trim() ? `; stderr: ${stopped.stderr.trim()}` : ""}`);
  const machineSheep = existsSync(join(home, ".sheep")) ? readdirSync(join(home, ".sheep")).sort().join(", ") : "(none)";
  print(`after: ${tilde(work)}: ${readdirSync(work).sort().join(", ")}; ${tilde(join(home, ".sheep"))}: ${machineSheep}; the kennel ${tilde(kennel)}: ${existsSync(kennel) ? readdirSync(kennel).sort().join(", ") : "(none)"}`);
  if (dogFailed) {
    print(`\nFAIL  dog: claude exited ${dog.code}${result ? `, ${result.subtype}${result.is_error ? ", is_error" : ""}` : ", no result event"}; the assertions after it held`);
    process.exit(1);
  }
  print("\ninside: ok");
}

/* The account ring (station phase 1). */

const PLAN_PRICE = "5 USD a month";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

/** The account API, for the ring's own reading: the token in a header, never an argument; every answer's errors quoted. */
function accountApi(token) {
  const call = async (method, path, body) => {
    const response = await fetch(`${CLOUDFLARE_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const envelope = await response.json();
    if (!envelope.success) throw new Error(`${method} ${path}: ${(envelope.errors ?? []).map((error) => `${error.message} (code ${error.code})`).join("; ") || `${response.status}`}`);
    return envelope;
  };
  return {
    async account() {
      const accounts = (await call("GET", "/accounts?per_page=50")).result.map((account) => ({ id: account.id, name: account.name }));
      if (accounts.length === 0) throw new Error("CLOUDFLARE_API_TOKEN reaches no account");
      const wanted = process.env.CLOUDFLARE_ACCOUNT_ID;
      const chosen = accounts.length === 1 ? accounts[0] : accounts.find((account) => account.id === wanted);
      if (chosen === undefined) throw new Error(`CLOUDFLARE_API_TOKEN reaches ${accounts.length} accounts; export CLOUDFLARE_ACCOUNT_ID to say which`);
      const verify = (await call("GET", `/accounts/${chosen.id}/tokens/verify`)).result;
      if (verify?.status !== "active") throw new Error(`the token is ${verify?.status ?? "not verifiable"} on ${chosen.name}`);
      return chosen;
    },
    async plan(accountId) {
      const paid = (await call("GET", `/accounts/${accountId}/subscriptions`)).result.find((subscription) => subscription.rate_plan?.id === "workers_paid");
      return paid === undefined ? undefined : { id: "workers_paid", state: paid.state, price: paid.price, currency: paid.currency, frequency: paid.frequency };
    },
    async subdomain(accountId) {
      const result = (await call("GET", `/accounts/${accountId}/workers/subdomain`)).result;
      return typeof result?.subdomain === "string" && result.subdomain !== "" ? result.subdomain : undefined;
    },
    /** Every Worker's name and every container application's name and id, sorted, so two listings compare as strings. */
    async listing(accountId) {
      const workers = [];
      for (let page = 1; ; page++) {
        const envelope = await call("GET", `/accounts/${accountId}/workers/scripts?page=${page}&per_page=100`);
        workers.push(...envelope.result.map((script) => script.id));
        if (page >= (envelope.result_info?.total_pages ?? 1) || envelope.result.length === 0) break;
      }
      const applications = (await call("GET", `/accounts/${accountId}/containers/applications`)).result.map((application) => ({ id: application.id, name: application.name }));
      workers.sort();
      applications.sort((a, b) => a.name.localeCompare(b.name));
      return { workers, applications };
    },
    async deleteApplication(accountId, applicationId) {
      await call("DELETE", `/accounts/${accountId}/containers/applications/${applicationId}`);
    },
    /** The container application of that name, with the image its configuration names: what the deployed station's container runs. */
    async application(accountId, name) {
      const found = (await call("GET", `/accounts/${accountId}/containers/applications`)).result.find((application) => application.name === name);
      return found === undefined ? undefined : { id: found.id, name: found.name, image: found.configuration?.image };
    },
    /**
     * The application's rollouts, read as `deploy` reads them (`AccountApi.rollouts`
     * in `packages/cli/src/deploy.ts`): each one's status and the image it targets.
     * The list may come bare or under `rollouts`, so both shapes are taken.
     */
    async rollouts(accountId, applicationId) {
      const result = (await call("GET", `/accounts/${accountId}/containers/applications/${applicationId}/rollouts`)).result;
      const rows = Array.isArray(result) ? result : Array.isArray(result?.rollouts) ? result.rollouts : [];
      return rows.map((row) => ({
        id: typeof row.id === "string" ? row.id : null,
        status: typeof row.status === "string" ? row.status : "unknown",
        targetImage: typeof row.target_configuration?.image === "string" ? row.target_configuration.image : null,
        steps: (Array.isArray(row.steps) ? row.steps : []).map((step) => ({ status: typeof step.status === "string" ? step.status : "unknown", percentage: step.step_size?.percentage ?? null })),
      }));
    },
  };
}

/** The config's text as one object: `//` and block comments stripped outside strings, trailing commas dropped (the release's is plain JSON under a comment header). */
function parseJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") out += text[++i] ?? "";
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** The image a config's `pen` environment names, whatever the namespace: the ring hardcodes none. */
const imageOf = (config) => config?.env?.pen?.containers?.[0]?.image;

/** A docker.io reference taken apart: the repository, and the tag or the digest it names the image by. */
function parseImage(image) {
  const match = /^docker\.io\/([^:@]+)(?::([^:/@]+)|@(sha256:[0-9a-f]{64}))$/.exec(typeof image === "string" ? image : "");
  if (!match) return undefined;
  return { repository: match[1], tag: match[2], digest: match[3] };
}

/**
 * Whether Docker Hub has the image, asked the way a pull begins: an
 * anonymous pull token for the repository, then a `HEAD` of the manifest,
 * by tag or by digest. Returns the digest the registry names for it, or
 * the registry's answer.
 */
async function registryDigest(image) {
  const parsed = parseImage(image);
  if (parsed === undefined) return { error: `${image} is not a docker.io reference with a tag or a digest` };
  const { repository } = parsed;
  const tag = parsed.tag ?? parsed.digest;
  try {
    const auth = await fetch(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`, { signal: AbortSignal.timeout(20_000) });
    const { token } = await auth.json();
    const head = await fetch(`https://registry-1.docker.io/v2/${repository}/manifests/${tag}`, {
      method: "HEAD",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!head.ok) return { error: `${head.status} ${head.statusText} from registry-1.docker.io for ${repository}:${tag}` };
    return { digest: head.headers.get("docker-content-digest") ?? "(no digest header)" };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * The account ring, outside the walk: the token, the account's answers,
 * the image, the price and the yes; then the package ring's world and
 * install, the station's walk, and the deletion, whatever happened. The
 * ring never reads `~/.sheep`, `~/.wrangler`, or this checkout's
 * `node_modules`: the fresh `HOME` and the stripped PATH are the package
 * ring's, and `env()` drops every `CLOUDFLARE_*` and `SHEEP_TEST_*`
 * variable, so the token reaches one command's environment by name.
 */
async function accountRing({ ref, repo, spec, commit, keep, yes, dryRun, name: wantedName, older: olderRef }) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.error("hermetic: the account ring needs CLOUDFLARE_API_TOKEN in its environment: the shepherd's token for the account the station goes on, which sheep home deploy takes the same way; nothing was done");
    process.exit(2);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  // The faux provider uses no key, so a missing one becomes a placeholder secret; the ring says so, and never asks for one.
  const keyForDeploy = key || `not-a-key-the-faux-provider-answers-${randomBytes(8).toString("hex")}`;
  let ring;
  try {
    ring = new Ring({ ref, repo, spec, commit, keep });
  } catch (error) {
    usage(`${ref}: ${error.message}`);
  }
  // The older release (station phase 3): named by --older, or the ref's first parent when the ref is a release commit; never guessed.
  let older;
  try {
    older = olderRelease({ ring, repo, ref, spec, olderRef });
  } catch (error) {
    usage(error.message);
  }
  const api = accountApi(token);
  // The second machine is a container (station phase 2): Docker is needed for the walk, and its absence is known before anything is made.
  const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"], { encoding: "utf8" });
  const engine = docker.error || docker.status !== 0 ? undefined : docker.stdout.trim();
  let failure;
  const station = { deployed: false, name: undefined, home: undefined, account: undefined, subdomain: undefined, image: undefined, digest: undefined, tagDigest: undefined, engine, older, minted: [], ended: [], pastures: [] };
  try {
    // Preflight: the account, the plan, the subdomain, the listing, and the images both configs name, on the registry.
    if (spec === undefined) console.log(`account ring: ${ref} = ${ring.sha}${repo === root ? "" : ` in ${repo}`}; sheep ${ring.stamp.commit} (${ring.stamp.builtAt}), the newer`);
    else console.log(`account ring: ${spec}${commit ? `, expected to be a build of ${commit}` : ""}, the newer`);
    console.log(`older: ${older.ref} = ${older.sha}${repo === root ? "" : ` in ${repo}`}; sheep ${older.stamp.commit} (${older.stamp.builtAt}), deployed first and upgraded from`);
    station.account = await api.account();
    const plan = await api.plan(station.account.id);
    if (plan === undefined) throw new Error(`the account ${station.account.name} (${station.account.id}) is not on the Workers Paid plan, which containers need; deploy would refuse it, and the ring stops here`);
    station.subdomain = await api.subdomain(station.account.id);
    if (station.subdomain === undefined) throw new Error(`the account ${station.account.name} has no workers.dev subdomain; deploy takes --subdomain, and the ring does not choose one for the shepherd`);
    const before = await api.listing(station.account.id);
    console.log(`account: ${station.account.name} (${station.account.id}); plan ${plan.id} ${plan.state}, ${plan.price} ${plan.currency} ${plan.frequency}; subdomain ${station.subdomain}.workers.dev`);
    console.log(`  Workers: ${before.workers.join(", ") || "(none)"}`);
    console.log(`  container applications: ${before.applications.map((application) => `${application.name} (${application.id})`).join(", ") || "(none)"}`);
    // The older's image, from its tree; then the newer's, from its tree or, for a spec, from the install after the upgrade.
    older.image = imageOf(parseJsonc(older.git("show", `${older.sha}:home/wrangler.jsonc`)));
    if (typeof older.image !== "string") throw new Error(`${older.ref}'s home/wrangler.jsonc names no image in its pen container; a release does`);
    await checkImage(older, older.stamp, "older image");
    if (ring.sha !== undefined) {
      station.image = imageOf(parseJsonc(ring.git("show", `${ring.sha}:home/wrangler.jsonc`)));
      if (typeof station.image !== "string") throw new Error(`${ref}'s home/wrangler.jsonc names no image in its pen container; a release does`);
      await checkImage(station, ring.stamp, "image");
    } else console.log("image: read from the install's home/wrangler.jsonc after the upgrade (a spec has no tree to read before)");
    console.log(engine === undefined ? "docker: none answers; the second machine (a7) is a container, so the walk needs it" : `docker: ${engine}; the second machine (a7) is a container from node:24-slim`);
    if (engine === undefined && !dryRun) throw new Error(`the account ring's second machine is a container, and no Docker answers here (docker version: ${docker.error ? docker.error.message : (docker.stderr || docker.stdout || "").trim()}); nothing was deployed`);
    // The name: the newer's sha (a spec has none until the upgrade, so --commit names it, else the older's sha and a note).
    station.name = wantedName ?? `sheep-hermetic-${(ring.sha ?? commit ?? older.sha).slice(0, 7)}`;
    if (station.name !== undefined && (before.workers.includes(station.name) || before.applications.some((application) => application.name === station.name))) {
      throw new Error(`the account already holds ${station.name}; a ring that left it behind failed, and deploy would refuse the name: delete it first (sheep home delete --name ${station.name}, or wrangler delete and wrangler containers delete)`);
    }
    console.log(`station: ${station.name} at https://${station.name}.${station.subdomain}.workers.dev, deleted at the end whatever happens`);

    // The price and the yes, before anything is made.
    console.log(
      [
        "",
        "the account ring spends on the shepherd's account.",
        `  the Workers Paid plan is already paid, ${PLAN_PRICE}; the walk deploys one Worker with a container application from the older release, runs containers for a`,
        "  few commands (minutes at Cloudflare's per-minute container rate: cents), redeploys it from the newer release and once more, and deletes both at the end, or on failure.",
        `  the key is used for nothing: the station runs the faux provider (ANTHROPIC_API_KEY ${key ? "is in the environment and becomes the secret" : "is not set; a placeholder string becomes the secret"}).`,
        "  the token and the key go to sheep home deploy's environment, and to nothing else of this ring.",
      ].join("\n"),
    );
    if (dryRun) console.log("\ndry run: stopping before the world is made; nothing deployed");
    else {
      if (yes) console.log("  --yes: not asking");
      else {
        if (!process.stdin.isTTY) {
          console.error("hermetic: the account ring asks before it spends, and stdin is not a terminal; pass --yes to answer ahead. Nothing was deployed");
          process.exit(2);
        }
        const answer = await ask("run it? [y/N] ");
        if (!/^y(es)?$/i.test(answer)) {
          console.error("hermetic: not run; nothing was deployed");
          process.exit(2);
        }
      }
      console.log("");

      // The world and the install: the package ring's, of the older release; the newer is what the upgrade step installs over it.
      const newer = ring.use(older);
      ring.assertFresh();
      await ring.install();
      console.log(`installed: sheep ${ring.stamp.commit} (${ring.stamp.builtAt}), wrangler ${ring.stamp.wrangler}; the older, upgraded in the walk`);
      station.home = `https://${station.name}.${station.subdomain}.workers.dev`;
      await accountWalk(ring, api, station, { token, key: keyForDeploy, placeholder: key === undefined || key === "", before, spec, commit, newer });
    }
  } catch (error) {
    failure = error;
  } finally {
    if (failure && station.deployed) {
      console.log(`\nhermetic: the walk failed after the deploy; deleting ${station.name} first`);
      await deleteStation(ring, api, station, token);
    }
    if (failure && keep) console.error("hermetic: the walk failed; the local home is stopped even with --keep");
    if (failure) ring.keep = false;
    await ring.stopLocalHome();
    ring.keep = keep;
  }
  if (dryRun) {
    ring.cleanup();
    if (failure) {
      console.log(`\naccount ring: dry run FAILED at preflight: ${failure.message}`);
      process.exit(1);
    }
    console.log("\naccount ring: dry run ok (the preflight held; nothing deployed)");
    return;
  }
  ring.unchecked.push(
    "journey 1 step 2: a real key from ANTHROPIC_API_KEY and a real model at the station; the ring set the faux provider as a var, and the key it put is unused",
    "journey 2 step 2: pi's interactive terminal on the second machine, which needs a TTY; the container attached with none and pi's client said so",
    "journey 3 step 2: that a sheep ran the repository's tests; the faux program edited, committed, and pushed, and ran no tests",
    "journey 5 step 2: the image digest read from the container itself: the platform gives a container ids, not a digest, so the ring read the reference the Worker carries beside its stamp and the application's configured image, and asked the registry what the tag is",
    `journey 4 step 1: the user's string, npm install -g ${INSTALL_SPEC}; the ring upgraded with ${spec ?? `git+file://${repo}#<the ref's sha>`} into the same prefix`,
    `journey 4 step 1: a month or a year of releases between the two; the upgrade was from ${older.stamp.commit} to the ring's ref, one release apart unless --older said otherwise`,
    "journey 4 step 2: the name typed at a terminal, and the refusal with none: the ring piped the name on stdin, and packages/cli/test/deploy.test.ts drives the refusal",
  );
  ring.report(failure, "account");
  ring.cleanup();
  if (failure) {
    console.log(`\naccount ring: FAILED at ${failure.ring?.step ?? "preflight"}`);
    process.exit(1);
  }
  console.log(`\naccount ring: ok (${ring.lines.filter((line) => line.startsWith("ok")).length} lines held)`);
}

/** `sheep home delete` with the name on stdin, from blog, with the token; then the listing, and what is left named loudly. */
async function deleteStation(ring, api, station, token) {
  const env = { ...ring.env(), CLOUDFLARE_API_TOKEN: token };
  const deleted = await ring.sheep(["home", "delete", "--name", station.name], { env, input: `${station.name}\n` });
  console.log(`  sheep home delete (exit ${deleted.code}): ${deleted.stdout.trim().split("\n").join("; ")}${deleted.stderr.trim() ? `; stderr: ${deleted.stderr.trim()}` : ""}`);
  station.deployed = false;
  const after = await api.listing(station.account.id);
  const left = [...after.workers.filter((worker) => worker === station.name).map((worker) => `Worker ${worker}`), ...after.applications.filter((application) => application.name === station.name).map((application) => `container application ${application.name} (${application.id})`)];
  if (left.length > 0) console.log(`  STILL ON THE ACCOUNT: ${left.join(", ")}; delete by hand: wrangler delete ${station.name}; wrangler containers delete <id>`);
  else console.log(`  the account holds no Worker and no container application named ${station.name}`);
  return { deleted, after, left };
}

/**
 * The older release (station phase 3): `--older <ref>` in the repository,
 * or the ring ref's first parent when that ref is a release commit with
 * two parents (a release's first parent is the release before it; a
 * candidate's is `origin/release`). Never guessed: a spec with no
 * `--older`, a ref with one parent, or a parent with no stamp is a usage
 * error naming the flag. The older must be a different build, built
 * before the newer, or the upgrade would be a facade.
 */
function olderRelease({ ring, repo, ref, spec, olderRef }) {
  const git = gitIn(repo);
  let sha;
  let named;
  if (olderRef !== undefined) {
    named = olderRef;
    try {
      sha = git("rev-parse", "--verify", `${olderRef}^{commit}`);
    } catch (error) {
      throw new Error(`--older ${olderRef}: ${error.message}`);
    }
  } else {
    if (spec !== undefined) throw new Error(`the account ring upgrades from an older release, and a spec has no history to take one from: pass --older <ref>, a release commit in ${repo}`);
    const parents = git("log", "-1", "--format=%P", ring.sha).split(" ").filter(Boolean);
    if (parents.length !== 2) throw new Error(`${ref} (${ring.sha}) has ${parents.length} parent${parents.length === 1 ? "" : "s"}, so it is not a release commit with a release before it; pass --older <ref>`);
    sha = parents[0];
    named = `${ref}^1`;
  }
  let stamp;
  try {
    stamp = JSON.parse(git("show", `${sha}:package.json`)).sheep;
  } catch {
    stamp = undefined;
  }
  if (typeof stamp?.commit !== "string" || typeof stamp?.builtAt !== "string" || typeof stamp?.wrangler !== "string") {
    throw new Error(`${named} (${sha}) carries no build stamp in its package.json; the older must be a release commit: pass --older <ref>`);
  }
  if (ring.stamp !== undefined) {
    if (sha === ring.sha || stamp.commit === ring.stamp.commit) throw new Error(`the older release ${named} (${sha}) is the ring's own build, ${stamp.commit}; an upgrade from a release to itself proves nothing: pass --older <ref>`);
    if (!(stamp.builtAt < ring.stamp.builtAt)) throw new Error(`${named} was built ${stamp.builtAt}, not before the ring's ref (${ring.stamp.builtAt}); the older must be older`);
  }
  return { git, ref: named, sha, spec: `git+file://${repo}#${sha}`, stamp, image: undefined, digest: undefined, tagDigest: undefined };
}

/**
 * What a config names and what the registry holds (station phase 2): a
 * digest-named image is asked for by digest, and the tag at the stamp's
 * commit is asked for too and must be that digest; a tag-named image (a
 * release built by hand) is asked for by tag, and the digest the registry
 * answers is printed, not asserted against anything. Sets
 * `target.digest` (what the config's reference resolves to on the
 * registry) and `target.tagDigest`; `target` is the station (the newer)
 * or the older release (station phase 3), and `label` heads the line.
 */
async function checkImage(target, stamp, label = "image") {
  const parsed = parseImage(target.image);
  if (parsed === undefined) throw new Error(`the config's image ${target.image} is not a docker.io reference by tag or by digest`);
  const registry = await registryDigest(target.image);
  if (registry.error !== undefined) throw new Error(`the image ${target.image} is not on the registry: ${registry.error}; the deploy would fail on the pull`);
  target.digest = registry.digest;
  if (parsed.digest !== undefined) {
    if (target.digest !== parsed.digest) throw new Error(`the registry answered ${target.digest} for ${target.image}, not the digest the reference names`);
    const tag = `docker.io/${parsed.repository}:${stamp.commit}`;
    const byTag = await registryDigest(tag);
    if (byTag.error !== undefined) throw new Error(`the tag ${tag}, the release's commit, is not on the registry: ${byTag.error}`);
    target.tagDigest = byTag.digest;
    if (target.tagDigest !== parsed.digest) throw new Error(`the config names ${target.image}, but the registry's digest for the tag ${tag} is ${target.tagDigest}; the release named a digest that is not its commit's push`);
    console.log(`${label}: ${target.image} (by digest; the tag ${tag} on Docker Hub is that digest)`);
  } else {
    target.tagDigest = target.digest;
    console.log(`${label}: ${target.image} (by tag; a release built by hand names the tag; the registry's digest for it is ${target.digest})`);
  }
  if (typeof stamp?.image === "string" && stamp.image !== target.image) throw new Error(`the manifest's sheep.image is ${stamp.image}; the config names ${target.image}`);
}

/** The settle wait's budget and cadence: the rollout's own (`ROLLOUT_WAIT_MS` in `deploy.ts`), polled every five seconds with a line every thirty. */
const SETTLE_WAIT_MS = 300_000;
const SETTLE_POLL_MS = 5_000;
const SETTLE_SAY_MS = 30_000;
/** A rollout's statuses that mean it will not complete; `deploy.ts`'s `ROLLOUT_FAILED`. */
const SETTLE_FAILED = new Set(["failed", "reverted", "rolled_back"]);

/**
 * Serve phase 2, s2: the station settled after the redeploy, before a
 * served look is taken on it.
 *
 * The platform runs a rollout after `wrangler deploy` returns, and
 * `sheep home deploy` comes back as soon as its last step is under way
 * with a healthy instance — `rollout: at step 2 of 2 …; the platform
 * finishes it`. Until that step finishes the platform is still replacing
 * instances, and a container it starts meanwhile is one it may replace;
 * replacing one is a SIGTERM to the container's PID 1: the pen agent
 * closes the socket (`1000: SIGTERM`,
 * `packages/pen/src/node.ts`) and any run open on it ends as "the
 * container went away during the run". An ordinary tier-2 line is
 * milliseconds wide and rarely meets that; a served look holds its
 * container open across a browser render, seconds wide, and meets it
 * often. That is what failed `s2` on 10 Sep 2026, and what failed the
 * first two served looks on `sheep-2` minutes after its upgrade while
 * three taken later on the same station passed.
 *
 * So this is not a retry of the look, and nothing here reads the look's
 * outcome: a served look that fails after this wait fails the ring, for
 * whatever reason it gives. It is the ring waiting on the one thing it
 * already knows is in flight, asked of the platform rather than guessed
 * from a clock — the rollout whose target is the image the station now
 * runs, completed, and the application configured with that image. Once
 * both hold there is no replacement left to come, and a container
 * started after them starts on the final image.
 *
 * A rollout that fails, or a budget that runs out with one still going,
 * fails the step: taking the look anyway would be taking it into the
 * very window this exists to leave.
 *
 * The three durations are arguments so that `test/settle.test.ts` can
 * run the whole wait in milliseconds; the ring passes none of them.
 */
export async function settleStation(ring, api, station, { step, pollMs = SETTLE_POLL_MS, budgetMs = SETTLE_WAIT_MS, sayMs = SETTLE_SAY_MS, say = (line) => console.log(line) }) {
  const { account, name, image } = station;
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  const where = `GET /accounts/${account.id.slice(0, 6)}…/containers/applications[/<id>/rollouts]`;
  let lastSaid = started;
  let rounds = 0;
  let last = "the account holds no container application of that name";
  for (;;) {
    let application;
    let rollout;
    try {
      application = await api.application(account.id, name);
      if (application !== undefined) {
        const rollouts = await api.rollouts(account.id, application.id);
        rollout = rollouts.find((candidate) => candidate.targetImage === image);
      }
    } catch (error) {
      // A bad answer from the account API is another round, as `deploy`'s own reads make it; the budget below is what ends the wait.
      last = `the account API did not answer: ${error instanceof Error ? error.message : String(error)}`;
      application = undefined;
    }
    if (application !== undefined) {
      if (rollout !== undefined && SETTLE_FAILED.has(rollout.status)) {
        ring.fail(step, where, { stdout: JSON.stringify(rollout), stderr: `the rollout of ${image} to ${name} ${rollout.status}; the station never took the image this ring deployed, so a served look on it would be looking at the older one`, code: 1 });
      }
      // Settled: the rollout to this image is done — or the platform made none — and the application is configured with it.
      if ((rollout === undefined || rollout.status === "completed") && application.image === image) {
        const how = rollout === undefined ? "no rollout to wait for" : `the rollout ${rollout.id ?? "?"} to ${image} completed`;
        const line = rounds === 0 ? `the station was settled before this step: ${how}, and the application is configured with ${image}` : `the station settled after ${seconds()}s: ${how}, and the application is configured with ${image}`;
        if (rounds > 0) say(`  ${line}`);
        return { seconds: seconds(), waited: rounds > 0, rounds, line };
      }
      last = `the rollout to ${image} is ${rollout === undefined ? "not listed" : `${rollout.status} (steps ${rollout.steps.map((one) => one.status).join(", ") || "none listed"})`}, and the application is configured with ${application.image ?? "nothing"}`;
    }
    if (Date.now() - started >= budgetMs) {
      ring.fail(step, where, { stdout: last, stderr: `the station ${name} had not settled after ${seconds()}s; a served look taken while the platform is still replacing container instances is taken into the window that stops one (1000: SIGTERM)`, code: 1 });
    }
    if (Date.now() - lastSaid >= sayMs) {
      lastSaid = Date.now();
      say(`  waiting for the station to settle (${seconds()}s): ${last}`);
    }
    rounds++;
    await new Promise((resolveSleep) => setTimeout(resolveSleep, pollMs));
  }
}

/**
 * The station's walk: the steps a1 to a8, one line each, from blog;
 * `station.deployed` is set the moment the deploy is attempted. The ring
 * runs the older release through a2b, then the upgrade step ("up")
 * installs the newer over it and every step after asserts the newer.
 */
async function accountWalk(ring, api, station, { token, key, placeholder, before, spec, commit, newer }) {
  const { name, home, account, older } = station;
  const withToken = { ...ring.env(), CLOUDFLARE_API_TOKEN: token, ANTHROPIC_API_KEY: key };
  const needles = [token, key];
  const watch = watchPs(needles, 25);
  // The older's stamp through a2b; the upgrade step reassigns both to the newer's.
  let stamp = ring.stamp;
  let build = { commit: stamp.commit, builtAt: stamp.builtAt };
  const parse = (step, command, result) => {
    try {
      return JSON.parse(result.stdout);
    } catch {
      ring.fail(step, command, result);
    }
  };
  try {
    // Step 1: with the token removed, the deploy refuses, makes nothing, and the account's listing is what it was.
    const refused = await ring.sheep(["home", "deploy"]);
    if (refused.code !== 2 || refused.stdout !== "" || !refused.stderr.includes("CLOUDFLARE_API_TOKEN is not set") || !refused.stderr.includes("Workers Paid plan")) {
      ring.fail("a1", "sheep home deploy (no token in the environment)", { ...refused, stderr: `${refused.stderr}\nexpected exit 2, nothing on stdout, and the refusal naming CLOUDFLARE_API_TOKEN and the plan` });
    }
    if (existsSync(ring.configOf(ring.blog)) || existsSync(join(ring.kennel(ring.blog), "deploy"))) ring.fail("a1", `ls -a ${ring.kennel(ring.blog)}`, { stdout: readdirSync(ring.kennel(ring.blog)).join("\n"), stderr: "the refused deploy wrote into the kennel", code: 1 });
    const afterRefusal = await api.listing(account.id);
    if (JSON.stringify(afterRefusal) !== JSON.stringify(before)) ring.fail("a1", "the account's listing after the refused deploy", { stdout: JSON.stringify(afterRefusal), stderr: `expected ${JSON.stringify(before)}`, code: 1 });
    ring.ok("a1", "sheep home deploy (no token)", `exit 2: "${refused.stderr.split("\n")[0].replace(/^sheep: /, "")}"; nothing in the kennel; the account's listing identical before and after (${before.workers.length} Workers, ${before.applications.length} applications)`);

    // Step 2: the deploy of the older release, timed; the address answers; the two stamps are equal; the config names the station with no local marker.
    station.deployed = true;
    const startedAt = Date.now();
    const deployed = await ring.sheep(["home", "deploy", "--faux", "--name", name, "--json"], { env: withToken });
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
    const report = parse("a2", `sheep home deploy --faux --name ${name} --json`, deployed);
    if (deployed.code !== 0 || report.name !== name || report.home !== home || report.state !== "deployed" || report.answers !== true) {
      ring.fail("a2", `sheep home deploy --faux --name ${name} --json`, { ...deployed, stderr: `${deployed.stderr}\nexpected exit 0, name ${name}, home ${home}, state deployed, answers true` });
    }
    if (report.image !== older.image) ring.fail("a2", `sheep home deploy --faux --name ${name} --json`, { ...deployed, stderr: `the report's image is ${report.image}; the older release's config names ${older.image}` });
    if (Number(seconds) >= 180) ring.fail("a2", `sheep home deploy --faux --name ${name} --json`, { ...deployed, stderr: `${seconds}s; the deploy must finish under three minutes` });
    if (!(report.containers?.healthy >= 1)) ring.fail("a2", `sheep home deploy --faux --name ${name} --json`, { ...deployed, stderr: `${deployed.stderr}\nexpected a healthy container instance; got ${JSON.stringify(report.containers)}` });
    if (!(await answers(home))) ring.fail("a2", `curl ${home}/`, { stdout: "", stderr: `${home} does not answer sheep`, code: 1 });
    const config = JSON.parse(readFileSync(ring.configOf(ring.blog), "utf8"));
    if (config.home !== home || config.name !== name || typeof config.token !== "string" || config.token.length < 32 || config.local !== undefined) {
      ring.fail("a2", `cat ${ring.configOf(ring.blog)}`, { stdout: JSON.stringify({ ...config, token: "…" }), stderr: `expected {home: ${home}, token, name: ${name}} and no local marker`, code: 1 });
    }
    needles.push(config.token);
    station.token = config.token;
    const homed = await ring.sheep(["home", "--json"]);
    const homeReport = parse("a2", "sheep home --json", homed);
    if (homed.code !== 0 || homeReport.home !== home || homeReport.name !== name || homeReport.local !== false || homeReport.answers !== true || JSON.stringify(homeReport.build?.home) !== JSON.stringify(build) || JSON.stringify(homeReport.build?.cli) !== JSON.stringify(build) || homed.stderr !== "") {
      ring.fail("a2", "sheep home --json", { ...homed, stderr: `${homed.stderr}\nexpected home ${home}, name ${name}, local false, answers true, build.home = build.cli = ${JSON.stringify(build)}, nothing on stderr` });
    }
    // The image (station phase 2): what the Worker reports beside its stamp is the older config's line, and what the account says the application runs.
    if (homeReport.image !== older.image) ring.fail("a2", "sheep home --json", { ...homed, stderr: `${homed.stderr}\nGET /home reports the image ${homeReport.image}; the older release's config names ${older.image}` });
    const application = await api.application(account.id, name);
    if (application === undefined) ring.fail("a2", `GET /accounts/${account.id}/containers/applications`, { stdout: "", stderr: `no container application named ${name}`, code: 1 });
    if (application.image !== older.image) ring.fail("a2", `GET /accounts/${account.id}/containers/applications`, { stdout: JSON.stringify(application), stderr: `the application's configuration.image is ${application.image}; the older release's config names ${older.image}`, code: 1 });
    station.applicationId = application.id;
    // wrangler came once, into the ring's ~/.sheep/tools, and nothing else is under HOME/.sheep.
    const tools = join(ring.home, ".sheep", "tools");
    const wranglerPkg = join(tools, "node_modules", "wrangler", "package.json");
    const wranglerVersion = existsSync(wranglerPkg) ? JSON.parse(readFileSync(wranglerPkg, "utf8")).version : undefined;
    if (wranglerVersion !== stamp.wrangler) ring.fail("a2", `cat ${wranglerPkg}`, { stdout: String(wranglerVersion), stderr: `expected wrangler ${stamp.wrangler} in ${tools}`, code: 1 });
    const dotSheep = readdirSync(join(ring.home, ".sheep")).sort();
    if (JSON.stringify(dotSheep) !== JSON.stringify(["tools"])) ring.fail("a2", `ls ${join(ring.home, ".sheep")}`, { stdout: dotSheep.join("\n"), stderr: "expected tools alone under HOME/.sheep", code: 1 });
    const derived = JSON.parse(readFileSync(join(ring.kennel(ring.blog), "deploy", "wrangler.jsonc"), "utf8"));
    if (derived.name !== name || derived.env?.pen?.name !== name || derived.env?.pen?.containers?.[0]?.name !== name || imageOf(derived) !== older.image) {
      ring.fail("a2", `cat ${join(ring.kennel(ring.blog), "deploy", "wrangler.jsonc")}`, { stdout: JSON.stringify(derived), stderr: `expected every name ${name} and the image ${older.image}`, code: 1 });
    }
    ring.ok("a2", `sheep home deploy --faux --name ${name} --json (in blog, the older release)`, `${seconds}s; ${home} answers sheep; containers ${report.containers.healthy} healthy after ${report.containers.seconds}s; account ${report.account.name}, ${report.plan.id} ${report.plan.state}; wrangler ${stamp.wrangler} fetched into ~/.sheep/tools; <blog>/.sheep/config names the station, no local marker; deploy/wrangler.jsonc names ${name} three times; the key secret is ${placeholder ? "a placeholder (no ANTHROPIC_API_KEY here; the faux provider uses none)" : "the environment's ANTHROPIC_API_KEY"}`);
    ring.ok("a2", "sheep home --json (in blog)", `home ${home}, name ${name}, answers; build.home = build.cli = ${build.commit} (${build.builtAt}), the older; nothing on stderr`);
    ring.ok("a2", `GET /home; GET /accounts/${account.id.slice(0, 6)}…/containers/applications`, `image ${older.image}: the Worker reports it, the application ${application.id} is configured with it${older.tagDigest !== undefined && older.image.includes("@sha256:") ? `, and the registry's digest for the tag at ${stamp.commit} is it` : " (by tag; a release built by hand)"}`);

    // Step 2b (station phase 3): on the older release, one sheep with a turn, and one pasture with no repository; both must survive the upgrade.
    const olderCreated = await ring.sheep(["new", "--name", "older-sheep", "--", "hello"]);
    const olderSheep = /^session ([0-9a-f-]{36})\n/.exec(olderCreated.stderr)?.[1];
    if (olderCreated.code !== 0 || olderCreated.stdout !== `${FAUX_REPLY}\n` || !olderSheep) ring.fail("a2b", 'sheep new --name older-sheep -- "hello"', olderCreated);
    station.minted.push(olderSheep);
    const olderPasture = await ring.sheep(["pasture", "new", "older"]);
    if (olderPasture.code !== 0 || !olderPasture.stdout.startsWith("older\t\t")) ring.fail("a2b", "sheep pasture new older", { ...olderPasture, stderr: `${olderPasture.stderr}\nexpected "older\\t\\t<branch>": a pasture with no repository` });
    station.pastures.push("older");
    const olderRows = parse("a2b", "sheep ls --json (in blog)", await ring.sheep(["ls", "--json"]));
    const olderRow = olderRows.find((row) => row.id === olderSheep);
    if (olderRow === undefined || olderRow.name !== "older-sheep") ring.fail("a2b", "sheep ls --json (in blog)", { stdout: JSON.stringify(olderRows), stderr: `expected ${olderSheep} named older-sheep`, code: 1 });
    const olderPastures = await ring.sheep(["pasture", "ls"]);
    if (olderPastures.code !== 0 || !olderPastures.stdout.split("\n").some((line) => line.startsWith("older\t"))) ring.fail("a2b", "sheep pasture ls (in blog)", olderPastures);
    ring.ok("a2b", 'sheep new --name older-sheep -- "hello"; sheep pasture new older; sheep ls; sheep pasture ls (on the older release)', `${FAUX_REPLY}; ${olderSheep} (older-sheep) listed; the pasture older listed, ${olderPasture.stdout.trim().split("\t")[2]} branch, no repository`);

    // The upgrade (journey 4 step 1): the newer package into the same prefix; the command names it; sheep home warns; the redeploy moves the stamp and keeps every row.
    const upStarted = Date.now();
    const upgraded = await run("npm", ["install", "-g", newer.spec], { env: ring.env(), cwd: ring.blog });
    const upSeconds = ((Date.now() - upStarted) / 1000).toFixed(0);
    if (upgraded.code !== 0) ring.fail("up", `npm install -g ${newer.spec}`, upgraded);
    // The newer's stamp, from the install: a ref's must be the ref's own; a spec's must be a build of --commit when given, and not the older's.
    const installedStamp = JSON.parse(readFileSync(join(ring.pkg, "package.json"), "utf8")).sheep;
    if (typeof installedStamp?.commit !== "string" || typeof installedStamp?.builtAt !== "string" || typeof installedStamp?.wrangler !== "string") ring.fail("up", `cat ${join(ring.pkg, "package.json")}`, { stdout: JSON.stringify(installedStamp), stderr: "expected a build stamp after the upgrade", code: 1 });
    if (newer.stamp !== undefined && JSON.stringify({ commit: installedStamp.commit, builtAt: installedStamp.builtAt }) !== JSON.stringify({ commit: newer.stamp.commit, builtAt: newer.stamp.builtAt })) {
      ring.fail("up", `npm install -g ${newer.spec}; cat ${join(ring.pkg, "package.json")}`, { stdout: JSON.stringify(installedStamp), stderr: `expected the ref's stamp ${JSON.stringify(newer.stamp)}`, code: 1 });
    }
    if (commit !== undefined && !commit.startsWith(installedStamp.commit)) ring.fail("up", `npm install -g ${newer.spec}`, { stdout: JSON.stringify(installedStamp), stderr: `expected a build of ${commit}`, code: 1 });
    if (installedStamp.commit === older.stamp.commit || !(older.stamp.builtAt < installedStamp.builtAt)) ring.fail("up", `npm install -g ${newer.spec}`, { stdout: JSON.stringify(installedStamp), stderr: `the upgrade installed ${installedStamp.commit} (${installedStamp.builtAt}), not a build newer than the older's ${older.stamp.commit} (${older.stamp.builtAt})`, code: 1 });
    ring.use({ ...newer, stamp: newer.stamp ?? installedStamp });
    stamp = ring.stamp;
    build = { commit: stamp.commit, builtAt: stamp.builtAt };
    if (station.image === undefined) {
      // A spec: the install's config is the first tree there is to read the newer's image from.
      station.image = imageOf(parseJsonc(readFileSync(join(ring.pkg, "home", "wrangler.jsonc"), "utf8")));
      if (typeof station.image !== "string") ring.fail("up", `cat ${join(ring.pkg, "home", "wrangler.jsonc")}`, { stdout: "", stderr: "the install's home/wrangler.jsonc names no image in its pen container; a release does", code: 1 });
      await checkImage(station, stamp, "image");
    }
    console.log(`installed: sheep ${stamp.commit} (${stamp.builtAt}), wrangler ${stamp.wrangler}; the newer, over the older in ${upSeconds}s`);
    const version = await ring.sheep(["--version"]);
    const expectedVersion = `sheep ${stamp.commit} (${stamp.builtAt})\n`;
    if (version.code !== 0 || version.stdout !== expectedVersion || version.stderr !== "") ring.fail("up", "sheep --version", { ...version, stderr: `${version.stderr}\nexpected ${JSON.stringify(expectedVersion)} and an empty stderr` });
    // The skew line: the home is the older build, this command the newer, and the fix named is the deploy.
    const skewed = await ring.sheep(["home"]);
    const skewLine = `sheep: the home's build ${older.stamp.commit} (${older.stamp.builtAt}) is older than this command's ${stamp.commit} (${stamp.builtAt}); \`sheep home deploy\` from this package updates it\n`;
    if (skewed.code !== 0 || skewed.stderr !== skewLine || !skewed.stdout.includes(`home build: ${older.stamp.commit} (${older.stamp.builtAt})\ncli build: ${stamp.commit} (${stamp.builtAt})\n`)) {
      ring.fail("up", "sheep home (in blog, the newer command against the older home)", { ...skewed, stderr: `${skewed.stderr}\nexpected exactly the skew line on stderr: ${JSON.stringify(skewLine)}` });
    }
    // The redeploy from the newer package: the same Worker, the stamp moved, the newer image, a container healthy.
    const upDeployStarted = Date.now();
    const upDeployed = await ring.sheep(["home", "deploy", "--faux", "--json"], { env: withToken });
    const upDeploySeconds = ((Date.now() - upDeployStarted) / 1000).toFixed(0);
    const upReport = parse("up", "sheep home deploy --faux --json (the newer package)", upDeployed);
    if (upDeployed.code !== 0 || upReport.name !== name || upReport.home !== home || upReport.state !== "redeployed" || upReport.answers !== true || JSON.stringify(upReport.build?.home) !== JSON.stringify(build) || JSON.stringify(upReport.build?.cli) !== JSON.stringify(build) || upReport.image !== station.image || !(upReport.containers?.healthy >= 1)) {
      ring.fail("up", "sheep home deploy --faux --json (the newer package)", { ...upDeployed, stderr: `${upDeployed.stderr}\nexpected the same name and home, state redeployed, answers true, build.home = build.cli = ${JSON.stringify(build)}, image ${station.image}, a healthy container instance` });
    }
    // The rollout (station phase 3): a new image is a rollout the platform runs after wrangler returns; deploy waits until it completed, or until
    // its last step is under way with a healthy instance (`rolling`), which the platform finishes on its own. Anything else fails the step.
    const rolloutOk = upReport.rollout?.status === "completed" || upReport.rollout?.status === "rolling";
    if (!rolloutOk || upReport.rollout.from !== older.image) {
      ring.fail("up", "sheep home deploy --faux --json (the newer package)", { ...upDeployed, stderr: `${upDeployed.stderr}\nexpected rollout.status completed or rolling, from ${older.image}; got ${JSON.stringify(upReport.rollout)}` });
    }
    const rolloutNote = upReport.rollout.status === "completed" ? `the rollout from the older image completed in ${upReport.rollout.seconds}s` : `the rollout from the older image was at step ${upReport.rollout.step} with ${upReport.rollout.healthy} healthy after ${upReport.rollout.seconds}s, left to the platform`;
    // The stamp moved (station phase 3): read after the waits and polled, since a deployment takes seconds to propagate.
    if (upReport.stamp?.moved !== true) ring.fail("up", "sheep home deploy --faux --json (the newer package)", { ...upDeployed, stderr: `${upDeployed.stderr}\nexpected stamp.moved true; got ${JSON.stringify(upReport.stamp)}` });
    const upConfig = JSON.parse(readFileSync(ring.configOf(ring.blog), "utf8"));
    if (upConfig.token !== config.token || upConfig.name !== name || upConfig.home !== home) ring.fail("up", `cat ${ring.configOf(ring.blog)}`, { stdout: JSON.stringify({ ...upConfig, token: "…" }), stderr: "expected the same token, name, and home after the upgrade", code: 1 });
    const upHomed = await ring.sheep(["home", "--json"]);
    const upHome = parse("up", "sheep home --json (after the upgrade)", upHomed);
    if (upHomed.code !== 0 || JSON.stringify(upHome.build?.home) !== JSON.stringify(build) || JSON.stringify(upHome.build?.cli) !== JSON.stringify(build) || upHome.image !== station.image || upHomed.stderr !== "") {
      ring.fail("up", "sheep home --json (after the upgrade)", { ...upHomed, stderr: `${upHomed.stderr}\nexpected build.home = build.cli = ${JSON.stringify(build)}, image ${station.image}, and nothing on stderr: the warning stops` });
    }
    // The application: the same one; its image is the newer's when the rollout completed, and printed, not asserted, while it is still rolling.
    const upApplication = await api.application(account.id, name);
    if (upApplication === undefined || upApplication.id !== application.id || (upReport.rollout.status === "completed" && upApplication.image !== station.image)) {
      ring.fail("up", `GET /accounts/${account.id}/containers/applications`, { stdout: JSON.stringify(upApplication), stderr: `expected the same application ${application.id}${upReport.rollout.status === "completed" ? ` configured with ${station.image}` : ""}`, code: 1 });
    }
    station.applicationImage = upApplication.image;
    if (upReport.rollout.status === "rolling") console.log(`  the application ${application.id} is configured with ${upApplication.image} while the rollout runs`);
    // Every row survived: the sheep and its turn, and the pasture.
    const upRows = parse("up", "sheep ls --json (after the upgrade)", await ring.sheep(["ls", "--json"]));
    const upRow = upRows.find((row) => row.id === olderSheep);
    if (upRow === undefined || upRow.name !== "older-sheep") ring.fail("up", "sheep ls --json (after the upgrade)", { stdout: JSON.stringify(upRows), stderr: `expected ${olderSheep} (older-sheep), minted on the older release, still listed`, code: 1 });
    const upPastures = await ring.sheep(["pasture", "ls"]);
    if (upPastures.code !== 0 || !upPastures.stdout.split("\n").some((line) => line.startsWith("older\t"))) ring.fail("up", "sheep pasture ls (after the upgrade)", { ...upPastures, stderr: `${upPastures.stderr}\nexpected the pasture older, made on the older release, still listed` });
    const upLog = await ring.sheep(["log", olderSheep]);
    if (upLog.code !== 0 || !upLog.stdout.includes("hello") || !upLog.stdout.includes(FAUX_REPLY)) ring.fail("up", `sheep log ${olderSheep} (after the upgrade)`, { ...upLog, stderr: `${upLog.stderr}\nexpected the turn from the older release: "hello" and "${FAUX_REPLY}"` });
    ring.ok("up", `npm install -g <newer spec>; sheep --version; sheep home; sheep home deploy --faux --json (in blog)`, `${upSeconds}s to install ${stamp.commit} over ${older.stamp.commit}; sheep home warned on stderr that the home ${older.stamp.commit} is older and named \`sheep home deploy\`; redeployed ${name} in ${upDeploySeconds}s, stamp ${older.stamp.commit} → ${build.commit} (${build.builtAt}), image ${station.image}, containers ${upReport.containers.healthy} healthy after ${upReport.containers.seconds}s, ${rolloutNote}, the stamp moved in ${upReport.stamp.seconds}s; the warning stopped`);
    ring.ok("up", `sheep ls --json; sheep pasture ls; sheep log ${olderSheep} (after the upgrade)`, `${olderSheep} (older-sheep) and the pasture older still listed; the log still holds "hello" → "${FAUX_REPLY}": a redeploy of the same tags over the same names kept the rows`);

    // Step 3: the faux program through the address, then a sheep whose shell names git, node, and pnpm from the container.
    const program = { steps: [{ tool: { name: "bash", args: { command: "git --version && node --version && pnpm --version" } } }, { text: "git, node, pnpm" }] };
    const posted = await fetch(`${home}/faux`, { method: "POST", headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" }, body: JSON.stringify(program), signal: AbortSignal.timeout(30_000) });
    const postedBody = await posted.text();
    if (posted.status !== 200) ring.fail("a3", `POST ${home}/faux`, { stdout: postedBody, stderr: `status ${posted.status}; expected 200 from the faux provider's route`, code: 1 });
    const sentence = "Clone nothing; what tools do you have?";
    const newStarted = Date.now();
    const created = await ring.sheep(["new", "--", sentence]);
    const newSeconds = ((Date.now() - newStarted) / 1000).toFixed(0);
    const id = /^session ([0-9a-f-]{36})\n/.exec(created.stderr)?.[1];
    if (created.code !== 0 || created.stdout !== "git, node, pnpm\n" || !id) ring.fail("a3", `sheep new -- "${sentence}"`, { ...created, stderr: `${created.stderr}\nexpected "git, node, pnpm" on stdout and the session id on stderr` });
    const logged = await ring.sheep(["log", id]);
    if (logged.code !== 0 || !logged.stdout.includes("git version")) ring.fail("a3", `sheep log ${id}`, { ...logged, stderr: `${logged.stderr}\nexpected the tool result naming git version` });
    const versions = { git: /git version (\S+)/.exec(logged.stdout)?.[1], node: /\n(v\d+\.\d+\.\d+)\n/.exec(logged.stdout)?.[1], pnpm: /\n(\d+\.\d+\.\d+)\n/.exec(logged.stdout)?.[1] };
    station.sheep = id;
    station.minted.push(id);
    ring.ok("a3", `POST /faux; sheep new -- "${sentence}"; sheep log ${id}`, `${newSeconds}s; "git, node, pnpm"; the shell in the container: git version ${versions.git ?? "?"}, node ${versions.node ?? "?"}, pnpm ${versions.pnpm ?? "?"}`);
    console.log(`image: ${station.image}${station.image.includes("@sha256:") ? " (by digest)" : ` (by tag; ${station.digest} on the registry)`}`);

    // Mint phase 1, m1 (mint's journey 3 step 3): a sheep named before it has anything to say. `sheep new --detach` with no prompt
    // prints the id alone and returns at once, nothing on stderr; `sheep ls --json` lists it idle with `task: null`; then its first
    // prompt through `attach --detach`, the id printed after the send, and its reply through `wait`. The program is one text step,
    // posted to the home before the mint, so the turn rents no container and the reply is the faux one; e2 posts its own after.
    // The sheep joins the minted for n1 to end, one more for a6's count. No step of the walk sends a prompt to get an id.
    const mintProgram = { steps: [{ text: FAUX_REPLY }] };
    const mintPosted = await fetch(`${home}/faux`, { method: "POST", headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" }, body: JSON.stringify(mintProgram), signal: AbortSignal.timeout(30_000) });
    if (mintPosted.status !== 200) ring.fail("m1", `POST ${home}/faux`, { stdout: await mintPosted.text(), stderr: `status ${mintPosted.status}; expected 200 from the faux provider's route`, code: 1 });
    const mintStarted = Date.now();
    const minted = await ring.sheep(["new", "--detach"]);
    const mintSeconds = ((Date.now() - mintStarted) / 1000).toFixed(1);
    const mintedId = /^([0-9a-f-]{36})\n$/.exec(minted.stdout)?.[1];
    if (minted.code !== 0 || !mintedId || minted.stderr !== "") ring.fail("m1", "sheep new --detach (no prompt)", { ...minted, stderr: `${minted.stderr}\nexpected exit 0, exactly the id on stdout, nothing on stderr` });
    station.minted.push(mintedId);
    const mintedRows = parse("m1", "sheep ls --json (after the mint)", await ring.sheep(["ls", "--json"]));
    const mintedRow = mintedRows.find((row) => row.id === mintedId);
    if (mintedRow === undefined || mintedRow.state !== "idle" || mintedRow.task !== null) ring.fail("m1", "sheep ls --json (after the mint)", { stdout: JSON.stringify(mintedRows), stderr: `expected ${mintedId} listed idle with task null`, code: 1 });
    const firstPrompt = await ring.sheep(["attach", mintedId, "--detach", "--", "hello"]);
    if (firstPrompt.code !== 0 || firstPrompt.stdout !== `${mintedId}\n` || firstPrompt.stderr !== "") ring.fail("m1", `sheep attach ${mintedId} --detach -- hello`, { ...firstPrompt, stderr: `${firstPrompt.stderr}\nexpected exit 0, the id alone on stdout after the send, nothing on stderr` });
    const firstWaited = await ring.sheep(["wait", "--timeout", "120", mintedId]);
    if (firstWaited.code !== 0 || firstWaited.stdout !== `${mintedId}\t${FAUX_REPLY}\n`) ring.fail("m1", `sheep wait ${mintedId}`, { ...firstWaited, stderr: `${firstWaited.stderr}\nexpected exit 0 and exactly "${mintedId}\\t${FAUX_REPLY}"` });
    const promptedRows = parse("m1", "sheep ls --json (after the first prompt)", await ring.sheep(["ls", "--json"]));
    const promptedRow = promptedRows.find((row) => row.id === mintedId);
    if (promptedRow === undefined || promptedRow.state !== "idle" || promptedRow.task !== "hello") ring.fail("m1", "sheep ls --json (after the first prompt)", { stdout: JSON.stringify(promptedRows), stderr: `expected ${mintedId} listed idle with the task "hello"`, code: 1 });
    ring.ok("m1", `POST /faux; sheep new --detach; sheep ls --json; sheep attach ${mintedId} --detach -- hello; sheep wait ${mintedId}; sheep ls --json`, `${mintSeconds}s to the id alone, nothing on stderr; listed idle, task null; the first prompt sent, the id after it; wait: "${FAUX_REPLY}"; listed idle, task "hello"`);

    // Eyes phase 2, e2: journey 1 of the eyes on the station, the first look paying the platform's launch and the second
    // connecting to the browser it left warm; one more sheep for a6's count. The program is a3's no longer, and a7 sets its own per cell.
    const looked = await ring.lookWalk({ step: "e2", home, token: config.token, where: `the station ${name}` });
    station.minted.push(looked.id);
    await ring.eyesReported("e2", `the station ${name}`);

    // Serve phase 2, s2: the same served look on the station, where the container is the platform's and the browser is warm from e2;
    // one more sheep for a6's count. Journey 3's third criterion is the package ring's line; this one is journey 3 on the account.
    // The station is settled first: the redeploy above left a rollout the platform was still finishing, and a served look holds a
    // container open long enough to be replaced by it (`settleStation`). Usually a1 to e2 have outlasted it and this returns at once.
    const settled = await settleStation(ring, api, station, { step: "s2" });
    const served = await ring.servedWalk({ step: "s2", home, token: config.token, where: `the station ${name}`, settled: settled.line });
    station.minted.push(served.id);

    // Step 4: pi becomes a kennel first (the package ring's k2.2; without it `sheep home local` falls back to ~/.sheep), then
    // the local home in pi, reached from blog with --home for one command; blog's config keeps naming the station.
    const piSetup = await ring.sheep(["setup", "--json"], { cwd: ring.pi });
    const piReport = parse("a4", "sheep setup --json (in pi)", piSetup);
    if (piSetup.code !== 0 || piReport.kennel?.state !== "made" || !ring.samePath(piReport.kennel?.path, ring.kennel(ring.pi)) || piReport.home?.state !== "none") {
      ring.fail("a4", "sheep setup --json (in pi)", { ...piSetup, stderr: `${piSetup.stderr}\nexpected the kennel ${ring.kennel(ring.pi)} made and no home` });
    }
    const pi = await ring.startHome(ring.pi, "a4", "started");
    if (pi.report.wrangler?.installed !== false || pi.report.wrangler?.version !== stamp.wrangler) {
      ring.fail("a4", "sheep home local --faux --json (in pi)", { stdout: JSON.stringify(pi.report.wrangler), stderr: `expected wrangler ${stamp.wrangler} already fetched by the deploy, installed false`, code: 1 });
    }
    needles.push(pi.token);
    const viaFlag = await ring.sheep(["--home", pi.url, "ls", "--json"], { env: { ...ring.env(), SHEEP_TOKEN: pi.token } });
    const rows = parse("a4", `sheep --home ${pi.url} ls --json (in blog)`, viaFlag);
    if (viaFlag.code !== 0 || !Array.isArray(rows) || rows.length !== 0) ring.fail("a4", `sheep --home ${pi.url} ls --json (in blog)`, { ...viaFlag, stderr: `${viaFlag.stderr}\nexpected no rows: pi's home has no sheep, and the station's ${id} is not its` });
    const stationRows = parse("a4", "sheep ls --json (in blog)", await ring.sheep(["ls", "--json"]));
    if (!stationRows.some((row) => row.id === id)) ring.fail("a4", "sheep ls --json (in blog)", { stdout: JSON.stringify(stationRows), stderr: `expected ${id} at the station`, code: 1 });
    const configAfter = JSON.parse(readFileSync(ring.configOf(ring.blog), "utf8"));
    if (configAfter.home !== home || configAfter.name !== name || configAfter.token !== config.token || configAfter.local !== undefined) {
      ring.fail("a4", `cat ${ring.configOf(ring.blog)}`, { stdout: JSON.stringify({ ...configAfter, token: "…" }), stderr: "expected blog's config still naming the station", code: 1 });
    }
    const piStopped = await ring.sheep(["home", "stop"], { cwd: ring.pi });
    if (piStopped.code !== 0 || piStopped.stdout !== `stopped the local home at ${pi.url}\n`) ring.fail("a4", "sheep home stop (in pi)", piStopped);
    ring.homes.delete(ring.pi);
    ring.ok("a4", `sheep setup (in pi); sheep home local --faux (in pi); sheep --home ${pi.url} ls (in blog); sheep home stop (in pi)`, `<pi>/.sheep made; pi's home at ${pi.url} with wrangler already there; --home lists pi's none while blog's config names ${home} and ${id} stays at the station; pi's home stopped`);

    // Step 5: the redeploy: the same Worker, the same token, the same stamp, the sheep still there.
    const againStarted = Date.now();
    const again = await ring.sheep(["home", "deploy", "--faux", "--json"], { env: withToken });
    const againSeconds = ((Date.now() - againStarted) / 1000).toFixed(0);
    const second = parse("a5", "sheep home deploy --faux --json (again, no --name)", again);
    if (again.code !== 0 || second.name !== name || second.home !== home || second.state !== "redeployed" || second.answers !== true || JSON.stringify(second.build?.home) !== JSON.stringify(build) || !(second.containers?.healthy >= 1)) {
      ring.fail("a5", "sheep home deploy --faux --json (again)", { ...again, stderr: `${again.stderr}\nexpected the same name and home, state redeployed, answers true, build.home ${JSON.stringify(build)}, a healthy container instance` });
    }
    const configAgain = JSON.parse(readFileSync(ring.configOf(ring.blog), "utf8"));
    if (configAgain.token !== config.token || configAgain.name !== name || configAgain.home !== home) ring.fail("a5", `cat ${ring.configOf(ring.blog)}`, { stdout: JSON.stringify({ ...configAgain, token: "…" }), stderr: "expected the same token, name, and home", code: 1 });
    const stillThere = parse("a5", "sheep ls --json (in blog)", await ring.sheep(["ls", "--json"]));
    if (!stillThere.some((row) => row.id === id)) ring.fail("a5", "sheep ls --json (after the redeploy)", { stdout: JSON.stringify(stillThere), stderr: `expected ${id} still listed`, code: 1 });
    ring.ok("a5", "sheep home deploy --faux --json (again, no --name)", `${againSeconds}s; redeployed ${name} at ${home}, the same token, stamp ${second.build.home.commit} (${second.build.home.builtAt}); containers ${second.containers.healthy} healthy after ${second.containers.seconds}s; ${id} still listed`);

    // Step 7 (station phase 2): the second machine, a container, joins the station and watches a turn the first machine left running.
    await secondMachine(ring, station, { sheepId: id, spec, commit });

    // Step 8 (station phase 2): journey 3 against the scratch repository, when its token is here; one skip line otherwise.
    await journeyThree(ring, station, { needles });

    // Earmark phase 1, s1 (earmark's journey 2 steps 1 and 2): beside a8, the same scratch repository and the same token, which is
    // this time one sheep's own `GIT_TOKEN`, given at its mint on stdin, and on no pasture; a sibling with none is refused the push.
    await journeyEarmark(ring, station, { needles });

    // End phase 1, n1 (end's journey 3 step 3): every sheep the walk minted is ended before the station goes, `sheep rm <id>`
    // printing exactly `<id>\tended` for each, the older release's sheep included; after, `sheep ls` lists none of them, and a verb
    // on an ended id, over HTTP or through a socket, is the one sentence on stderr, exit 2, nothing on stdout. So the delete below
    // lists `sessions: 0`, and its `sessions deleted:` is 0 too: the end released each sheep's rows, container, and browser first.
    const rmStarted = Date.now();
    for (const endedId of station.minted) {
      const removed = await ring.sheep(["rm", endedId]);
      if (removed.code !== 0 || removed.stdout !== `${endedId}\tended\n` || removed.stderr !== "") ring.fail("n1", `sheep rm ${endedId}`, { ...removed, stderr: `${removed.stderr}\nexpected exit 0, exactly "${endedId}\\tended" on stdout, nothing on stderr` });
      station.ended.push(endedId);
    }
    const rmSeconds = ((Date.now() - rmStarted) / 1000).toFixed(0);
    const afterRm = parse("n1", "sheep ls --json (after rm)", await ring.sheep(["ls", "--json"]));
    const stillListed = afterRm.filter((row) => station.ended.includes(row.id)).map((row) => row.id);
    if (stillListed.length > 0) ring.fail("n1", "sheep ls --json (after rm)", { stdout: JSON.stringify(afterRm), stderr: `expected none of the ended sheep listed; still there: ${stillListed.join(", ")}`, code: 1 });
    const endedSentence = `sheep: no session ${station.sheep} at this home; \`sheep ls\` lists the ones there are\n`;
    for (const verb of [["status", station.sheep], ["log", station.sheep], ["rm", station.sheep]]) {
      const refused = await ring.sheep(verb);
      if (refused.code !== 2 || refused.stdout !== "" || refused.stderr !== endedSentence) ring.fail("n1", `sheep ${verb.join(" ")} (on an ended id)`, { ...refused, stderr: `${refused.stderr}\nexpected exit 2, nothing on stdout, and the one sentence on stderr: ${endedSentence.trim()}` });
    }
    ring.ok("n1", `sheep rm <id> (${station.ended.length} times); sheep ls --json; sheep status|log|rm ${station.sheep} (ended)`, `${rmSeconds}s; ${station.ended.join(", ")} each ended with its one line; none listed after; every verb on the ended id is the sentence, exit 2, nothing on stdout`);

    // Step 6: the delete, the name on stdin: the listing first (station phase 3), counted against what the walk minted and did not
    // end (end phase 1: none); then the account listed, the last lines.
    const { deleted, after, left } = await deleteStation(ring, api, station, token);
    const remaining = station.minted.length - station.ended.length;
    const lines = deleted.stdout.trim().split("\n");
    const configLine = join(realpathSync(ring.kennel(ring.blog)), "config");
    const expectedListing = [
      `deleting ${name}: the Worker at ${home}, its Durable Objects, and its container application ${name}`,
      `sessions: ${remaining}`,
      `pastures: ${station.pastures.length}`,
      `container application: ${station.applicationId}`,
      `config: ${configLine}`,
    ];
    const wrongListing = expectedListing.findIndex((line, index) => lines[index] !== line);
    if (deleted.code !== 0 || wrongListing !== -1) {
      ring.fail("a6", `sheep home delete --name ${name} (the name on stdin)`, { ...deleted, stderr: `${deleted.stderr}\nexpected the listing before the prompt, line ${wrongListing + 1} being ${JSON.stringify(expectedListing[wrongListing])}: ${remaining} sessions (${station.minted.length} minted: ${station.minted.join(", ")}; ${station.ended.length} ended), ${station.pastures.length} pastures (${station.pastures.join(", ")}), the application ${station.applicationId}` });
    }
    const report6 = lines.slice(expectedListing.length);
    if (report6[0] !== `deleted the Worker ${name} and its objects` || report6[1] !== `deleted the container application ${name} (${station.applicationId})` || report6[2] !== `config: ${configLine} removed` || report6[3] !== `sessions deleted: ${remaining}` || report6.length !== 4) {
      ring.fail("a6", `sheep home delete --name ${name} (the name on stdin)`, { ...deleted, stderr: `${deleted.stderr}\nexpected, after the listing, the three lines: the Worker, the application ${station.applicationId}, the config removed; then sessions deleted: ${remaining}` });
    }
    if (existsSync(ring.configOf(ring.blog)) || existsSync(join(ring.kennel(ring.blog), "deploy"))) ring.fail("a6", `ls -a ${ring.kennel(ring.blog)}`, { stdout: readdirSync(ring.kennel(ring.blog)).join("\n"), stderr: "expected the config and deploy/ gone", code: 1 });
    if (left.length > 0) ring.fail("a6", "the account's listing after the delete", { stdout: left.join("\n"), stderr: `expected no Worker and no container application named ${name}`, code: 1 });
    ring.ok("a6", `sheep home delete --name ${name} (the name on stdin)`, `listed ${remaining} sessions (${station.minted.length} minted, ${station.ended.length} ended) and ${station.pastures.length} pastures (${station.pastures.join(", ")}), the application ${station.applicationId}; then ${report6.join("; ").replace(ring.dir, "<ring>")}; the account holds neither`);
    console.log(`  Workers: ${after.workers.join(", ") || "(none)"}`);
    console.log(`  container applications: ${after.applications.map((application) => `${application.name} (${application.id})`).join(", ") || "(none)"}`);
    if (JSON.stringify(after) !== JSON.stringify(before)) ring.fail("a6", "the account's listing after the walk", { stdout: JSON.stringify(after), stderr: `expected the listing from before the walk: ${JSON.stringify(before)}`, code: 1 });

    // The whole walk: the token, the key, the station's token, and pi's were in no process's arguments in any sample.
    watch.stop();
    const leak = watch.line();
    if (leak) ring.fail("walk", "ps -Ao pid=,args= (polled)", { stdout: leak.replace(token, "<CLOUDFLARE_API_TOKEN>").replace(key, "<ANTHROPIC_API_KEY>"), stderr: "a secret was seen in a process's arguments during the walk", code: 1 });
    ring.ok("walk", "ps (polled every 25 ms from a1)", `${watch.samples()} samples; the token, the key, the station's SHEEP_TOKEN, pi's, and the repository's token in no process's arguments`);
  } finally {
    watch.stop();
  }
}

/* The second machine (station phase 2, journey 2). */

/** The image the second machine is: the machine ring's, from node:24-slim, so "two machines" is a container with nothing but Node, git, and ps. */
const SECOND_IMAGE = "node:24-slim";

/** The turn the first machine leaves running: one text step after a delay, so the terminal that started it is gone long before it ends. */
const SECOND_TURN = { text: "the turn outlived the terminal that started it", delayMs: 20_000 };
const SECOND_PROMPT = "Finish this after I am gone.";
/**
 * How long the first machine waits for its prompt to be durable before its
 * terminal is killed: `sheep ls --json` polled every 250 ms until the sheep
 * is `running`, then SIGKILL (lamb's journey 2, the first terminal closed
 * mid-turn). A fixed two seconds was the ring's own failure twice: the
 * prompt had not reached the cell, or the turn ended with the terminal.
 */
const KILL_WAIT_MS = 20_000;
const KILL_POLL_MS = 250;

/**
 * The outer half of step a7, from this machine: the context, the image,
 * the probe, and one container running `--second` with the token on its
 * stdin and nothing else of this ring. The container's lines stream
 * indented; the line that says it attached is the cue to start the turn
 * from `blog` and kill that process two seconds in. The container's exit
 * code is the inner half's verdict; the outer half then reads the
 * transcript from this side too. Every failure inside this step, the
 * container's line handler and the first machine's turn included, ends as
 * a rejection of this function (a `ring.fail` error with its `ring`
 * field), so `accountWalk`'s try/finally sees it and deletes the station
 * first; nothing here throws from a callback into the void.
 */
async function secondMachine(ring, station, { sheepId, spec, commit }) {
  const { home, token: stationToken } = station;
  const context = mkdtempSync(join(tmpdir(), "sheep-second-"));
  const bare = join(context, "src.git");
  const tag = ringTag(SECOND_IMAGE);
  const name = `sheep-second-${process.pid}`;
  try {
    // The build context: the ref as a bare repository (an empty directory for a spec), this script, and the Dockerfile: the machine ring's shape.
    if (ring.sha !== undefined) {
      gitIn(context)("init", "--quiet", "--bare", "src.git");
      ring.git("push", "--quiet", bare, `${ring.sha}:refs/heads/ring`);
      gitIn(bare)("symbolic-ref", "HEAD", "refs/heads/ring");
    } else mkdirSync(bare);
    copyFileSync(fileURLToPath(import.meta.url), join(context, "hermetic.mjs"));
    copyFileSync(join(root, "scripts", "hermetic", "Dockerfile"), join(context, "Dockerfile"));
    console.log(`  second machine: ${SECOND_IMAGE} + git + procps, the ref as /src.git; context ${context}`);
    let buildSeconds;
    try {
      buildSeconds = await buildImage(context, SECOND_IMAGE, tag, []);
    } catch (error) {
      ring.fail("a7", `docker build (${SECOND_IMAGE})`, { stdout: "", stderr: error.message, code: 1 });
    }
    const probed = await run("docker", ["run", "--rm", "--init", tag, "sh", "-c", probeScript()]);
    if (probed.code !== 0) ring.fail("a7", "docker run … sh -c <probe>", probed);
    for (const line of probed.stdout.trim().split("\n")) console.log(`  ${line}`);

    // The container: the token on stdin, the address, the sheep, and the image it must see as arguments; nothing mounted.
    const inside = ["node", "/ring/hermetic.mjs", "--ring", "account", "--second", "--address", home, "--sheep", sheepId, "--expect-image", station.image, ...(ring.sha !== undefined ? ["--repo", "/src.git", ring.sha] : ["--spec", spec, ...(commit ? ["--commit", commit] : [])])];
    const runArgs = ["run", "--rm", "--init", "-i", "--name", name, tag, ...inside];
    console.log(`  docker ${runArgs.join(" ")}  (stdin: the station's token, one line)`);
    let turn;
    let killedAfter;
    let started = false;
    // The first failure inside the turn, kept for after the container ends: a `ring.fail` error with its `ring` field, or a plain one.
    let turnFailure;
    const state = async () => {
      const listed = await ring.sheep(["ls", "--json"]);
      let rows;
      try {
        rows = JSON.parse(listed.stdout);
      } catch {
        ring.fail("a7", "sheep ls --json (in blog)", listed);
      }
      return rows.find((candidate) => candidate.id === sheepId)?.state ?? "not listed";
    };
    const startTurn = async () => {
      // The cue came: the second machine attached and is waiting. The first machine starts a turn and closes its terminal mid-turn.
      const attachedAt = Date.now();
      const posted = await fetch(`${home}/s/${encodeURIComponent(sheepId)}/faux`, { method: "POST", headers: { authorization: `Bearer ${stationToken}`, "content-type": "application/json" }, body: JSON.stringify({ steps: [SECOND_TURN] }), signal: AbortSignal.timeout(30_000) });
      if (posted.status !== 200) ring.fail("a7", `POST /s/${sheepId}/faux`, { stdout: await posted.text(), stderr: `status ${posted.status}`, code: 1 });
      // The attach, and the terminal killed only once the prompt is durable: the sheep listed running, polled up to KILL_WAIT_MS.
      let child;
      const attach = ring.sheep(["attach", sheepId, "--", SECOND_PROMPT], { onSpawn: (spawned) => (child = spawned) });
      const deadline = Date.now() + KILL_WAIT_MS;
      let running = false;
      while (Date.now() < deadline) {
        if ((await state()) === "running") {
          running = true;
          break;
        }
        await new Promise((resolveSleep) => setTimeout(resolveSleep, KILL_POLL_MS));
      }
      killedAfter = ((Date.now() - attachedAt) / 1000).toFixed(1);
      child?.kill("SIGKILL");
      const result = await attach;
      if (!running) ring.fail("a7", `sheep attach ${sheepId} -- "${SECOND_PROMPT}"; sheep ls --json (polled ${KILL_WAIT_MS / 1000}s)`, { ...result, stderr: `${result.stderr}\n${sheepId} never went running within ${KILL_WAIT_MS / 1000}s of the attach; the terminal was killed at ${killedAfter}s regardless` });
      console.log(`  first machine: sheep attach ${sheepId} -- "${SECOND_PROMPT}" started the turn; killed with SIGKILL at ${killedAfter}s, once the turn was running (exit ${result.code}; stdout ${JSON.stringify(result.stdout.slice(0, 80))})`);
      const after = await state();
      if (after !== "running") ring.fail("a7", "sheep ls --json (after the kill)", { stdout: after, stderr: `after the kill, ${sheepId} is ${after}, not running: the turn ended with the terminal`, code: 1 });
      console.log(`  first machine: sheep ls --json says ${sheepId} is running with its terminal gone`);
    };
    const containerStarted = Date.now();
    const code = await runIndented("docker", runArgs, { input: `${stationToken}\n` }, "    ", (line) => {
      if (!started && /^second: attached to /.test(line)) {
        started = true;
        // Never a rejection out of a line handler: the failure is kept, the container killed, and the error rethrown below.
        turn = startTurn().catch((error) => {
          turnFailure = error;
          console.log(`  first machine: ${error.ring ? `${error.ring.command}: ${(error.ring.result.stderr ?? "").trim().split("\n").at(-1)}` : error.message}`);
          spawnSync("docker", ["kill", name], { stdio: "ignore" });
        });
      }
    });
    const containerSeconds = ((Date.now() - containerStarted) / 1000).toFixed(0);
    if (turn !== undefined) await turn;
    if (turnFailure !== undefined) {
      if (turnFailure.ring) throw turnFailure;
      ring.fail("a7", `the first machine's turn on ${sheepId}`, { stdout: "", stderr: turnFailure.stack ?? turnFailure.message, code: 1 });
    }
    if (!started) ring.fail("a7", `docker ${runArgs.join(" ")}`, { stdout: "", stderr: `the container exited ${code} after ${containerSeconds}s without attaching; its output is above`, code });
    if (code !== 0) ring.fail("a7", `docker ${runArgs.join(" ")}`, { stdout: "", stderr: `the container exited ${code} after ${containerSeconds}s; its output is above`, code });

    // From this side too: the turn ended, and the transcript shows the prompt and the text.
    const logged = await ring.sheep(["log", sheepId]);
    if (logged.code !== 0 || !logged.stdout.includes(SECOND_PROMPT) || !logged.stdout.includes(SECOND_TURN.text)) ring.fail("a7", `sheep log ${sheepId} (in blog)`, { ...logged, stderr: `${logged.stderr}\nexpected the prompt and "${SECOND_TURN.text}"` });
    const rows = JSON.parse((await ring.sheep(["ls", "--json"])).stdout);
    if (rows.find((row) => row.id === sheepId)?.state !== "idle") ring.fail("a7", "sheep ls --json (in blog)", { stdout: JSON.stringify(rows), stderr: `expected ${sheepId} idle after the turn`, code: 1 });
    ring.ok("a7", `docker run --rm --init -i ${tag} … --second (the token on stdin); sheep attach ${sheepId} -- … killed at ${killedAfter}s, once the turn was running (in blog)`, `build ${buildSeconds}s, container ${containerSeconds}s; the second machine installed the release, joined ${home}, listed ${sheepId}, attached, and saw the turn end ${SECOND_TURN.delayMs / 1000}s after the first terminal was killed; sheep log here shows "${SECOND_TURN.text}"`);
  } catch (error) {
    // Whatever failed, the container does not outlive the step; the error goes on to accountWalk, whose failure path deletes the station.
    spawnSync("docker", ["kill", name], { stdio: "ignore" });
    throw error;
  } finally {
    rmSync(context, { recursive: true, force: true });
  }
}

/**
 * The inner half of step a7, in the container: the token from stdin,
 * the package ring's world and install from `/src.git` under the
 * container's HOME, `sheep home join`, `sheep home`, `sheep ls`, a
 * promptless `sheep attach`, the cue, then `sheep wait` and `sheep log`
 * on the turn the first machine left running. `ps` is read while join
 * runs: the token is in no process's arguments here either. Prints
 * nothing that holds the token.
 */
async function secondInside({ ref, repo, spec, commit, address, sheep: sheepId, expectImage }) {
  if (root !== "/" || !existsSync("/ring/hermetic.mjs") || !existsSync("/.dockerenv")) {
    console.error("hermetic: --second is the container's half of the account ring's second machine; run pnpm hermetic --ring account");
    process.exit(2);
  }
  const token = await new Promise((resolveToken) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolveToken(text.split("\n")[0].trim()));
    process.stdin.on("error", () => resolveToken(""));
    process.stdin.resume();
  });
  const redact = (text) => (token ? String(text).split(token).join("<SHEEP_TOKEN>") : String(text));
  const print = (text) => console.log(redact(text));
  const ok = (step, command, note) => print(`ok    ${step.padEnd(8)} ${command}${note ? `  → ${note}` : ""}`);
  const fail = (step, command, result) => {
    print(`\nFAIL  ${step}: ${command} (exit ${result.code})`);
    if (result.stdout?.trim()) print(`--- stdout ---\n${result.stdout.trimEnd()}`);
    if (result.stderr?.trim()) print(`--- stderr ---\n${result.stderr.trimEnd()}`);
    process.exit(1);
  };
  if (token === "") fail("second", "read stdin", { stdout: "", stderr: "no token on stdin; the outer half pipes one line", code: 2 });
  print(`second: token read from stdin (${token.length} characters); station ${address}; sheep ${sheepId}`);

  // The world: the package ring's, under this container's HOME, with the release installed from /src.git (or the spec).
  const world = join(homedir(), "second");
  mkdirSync(world);
  let ring;
  try {
    ring = new Ring({ ref, repo, spec, commit, keep: false, dir: world });
    ring.assertFresh();
    await ring.install();
  } catch (error) {
    if (error.ring) fail(error.ring.step, error.ring.command, error.ring.result);
    fail("second", "the world and the install", { stdout: "", stderr: error.stack ?? error.message, code: 1 });
  }
  const stamp = ring.stamp;
  const build = { commit: stamp.commit, builtAt: stamp.builtAt };
  const parse = (step, command, result) => {
    try {
      return JSON.parse(result.stdout);
    } catch {
      fail(step, command, result);
    }
  };
  const tokenWatch = watchPs([token], 15);
  try {
    // Journey 2 step 1: join, the token on stdin; the config names the station with no local marker and no name.
    const joined = await ring.sheep(["home", "join", address, "--json"], { input: `${token}\n` });
    const report = parse("second", `sheep home join ${address} --json (in blog)`, joined);
    if (joined.code !== 0 || report.home !== address || report.image !== expectImage || JSON.stringify(report.build?.home) !== JSON.stringify(build) || JSON.stringify(report.build?.cli) !== JSON.stringify(build) || report.skew !== null) {
      fail("second", `sheep home join ${address} --json`, { ...joined, stdout: redact(joined.stdout), stderr: `${redact(joined.stderr)}\nexpected home ${address}, image ${expectImage}, build.home = build.cli = ${JSON.stringify(build)}, no skew` });
    }
    const config = JSON.parse(readFileSync(ring.configOf(ring.blog), "utf8"));
    if (JSON.stringify(Object.keys(config).sort()) !== JSON.stringify(["home", "token"]) || config.home !== address || config.token !== token) {
      fail("second", `cat ${ring.configOf(ring.blog)}`, { stdout: JSON.stringify({ ...config, token: "…" }), stderr: `expected exactly {home: ${address}, token}: no local marker, no name (the station is the other kennel's)`, code: 1 });
    }
    ok("second", `sheep home join ${address} --json (the token on stdin)`, `joined; image ${report.image}; build.home = build.cli = ${build.commit} (${build.builtAt}); <blog>/.sheep/config is {home, token}, no name, no local marker`);
    print(`second: image ${report.image}`);

    // `sheep home`: the station named, not local, answering, the stamps equal, the image reported.
    const homed = await ring.sheep(["home", "--json"]);
    const homeReport = parse("second", "sheep home --json", homed);
    if (homed.code !== 0 || homeReport.home !== address || homeReport.name !== null || homeReport.local !== false || homeReport.answers !== true || JSON.stringify(homeReport.build?.home) !== JSON.stringify(build) || JSON.stringify(homeReport.build?.cli) !== JSON.stringify(build) || homeReport.image !== expectImage || homed.stderr !== "") {
      fail("second", "sheep home --json", { ...homed, stderr: `${homed.stderr}\nexpected home ${address}, name null, local false, answers true, build.home = build.cli = ${JSON.stringify(build)}, image ${expectImage}, nothing on stderr` });
    }
    ok("second", "sheep home --json (in blog)", `home ${address}, name null, local false, answers; build.home = build.cli = ${build.commit} (${build.builtAt}); image ${homeReport.image}`);

    // `sheep ls`: the sheep the first machine minted, idle.
    const listed = await ring.sheep(["ls", "--json"]);
    const rows = parse("second", "sheep ls --json", listed);
    const row = Array.isArray(rows) ? rows.find((candidate) => candidate.id === sheepId) : undefined;
    if (listed.code !== 0 || row === undefined) fail("second", "sheep ls --json", { ...listed, stderr: `${listed.stderr}\nexpected ${sheepId}, the sheep the first machine minted` });
    if (row.state !== "idle") fail("second", "sheep ls --json", { ...listed, stderr: `${listed.stderr}\nexpected ${sheepId} idle before the first machine's turn; it is ${row.state}` });
    ok("second", "sheep ls --json (in blog)", `${rows.length} sheep at the station; ${sheepId} (${row.name ?? "unnamed"}) listed, idle: minted from the first machine, seen from the second`);

    // Journey 2 step 2, without a terminal: pi's client attaches, says so, and exits.
    const attached = await ring.sheep(["attach", sheepId]);
    if (attached.code !== 0 || !attached.stdout.includes(`\t${sheepId}\tattached`)) fail("second", `sheep attach ${sheepId}`, { ...attached, stderr: `${attached.stderr}\nexpected pi's client to attach and say so` });
    ok("second", `sheep attach ${sheepId} (no prompt, no terminal)`, "attached through pi's client, and exited");
    // The cue the outer half waits for, then the first machine starts a turn and closes its terminal.
    print(`second: attached to ${sheepId}; waiting for the first machine's turn`);
    const deadline = Date.now() + 90_000;
    let running;
    for (;;) {
      const again = parse("second", "sheep ls --json (polling)", await ring.sheep(["ls", "--json"]));
      running = again.find((candidate) => candidate.id === sheepId);
      if (running?.state === "running") break;
      if (Date.now() >= deadline) fail("second", "sheep ls --json (polled 90s)", { stdout: JSON.stringify(running), stderr: `${sheepId} never went running: the first machine did not start a turn`, code: 1 });
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
    }
    const runningAt = Date.now();
    print(`second: ${sheepId} is running`);

    // Journey 2 step 3: the first terminal is gone; the turn finishes; this machine's wait and log show the end of it.
    const waited = await ring.sheep(["wait", "--timeout", "120", sheepId]);
    const waitSeconds = ((Date.now() - runningAt) / 1000).toFixed(0);
    if (waited.code !== 0 || !waited.stdout.startsWith(`${sheepId}\t`) || !waited.stdout.includes(SECOND_TURN.text)) fail("second", `sheep wait ${sheepId}`, { ...waited, stderr: `${waited.stderr}\nexpected exit 0 and the turn's last message "${SECOND_TURN.text}"` });
    const logged = await ring.sheep(["log", sheepId]);
    if (logged.code !== 0 || !logged.stdout.includes(SECOND_PROMPT) || !logged.stdout.includes(SECOND_TURN.text)) fail("second", `sheep log ${sheepId}`, { ...logged, stderr: `${logged.stderr}\nexpected the first machine's prompt and the turn's end` });
    const tail = logged.stdout.trimEnd().split("\n").slice(-3).join(" | ");
    ok("second", `sheep wait ${sheepId}; sheep log ${sheepId}`, `the turn ended ${waitSeconds}s after it was seen running, its terminal long gone; the log ends: ${tail}`);
  } finally {
    tokenWatch.stop();
  }
  const leak = tokenWatch.line();
  if (leak) fail("second", "ps -Ao pid=,args= (polled)", { stdout: redact(leak), stderr: "the token was in a process's arguments inside the container", code: 1 });
  ok("second", "ps (polled every 15 ms from join)", `${tokenWatch.samples()} samples; the token in no process's arguments in the container`);
  print(`second: HOME holds ${readdirSync(homedir()).sort().join(", ")}; the world ${world.replace(homedir(), "~")} holds ${readdirSync(world).sort().join(", ")}`);
  print("\ninside: ok");
}

/* Journey 3 (station phase 2): a repository, on the station. */

const PLAYGROUND = "https://github.com/dglazkov/lamb-playground.git";
const PLAYGROUND_VAR = "LAMB_PLAYGROUND_TOKEN";

/**
 * Pasture's journey 1 on the station, with the faux provider: the sheep's
 * steps are a program, and the clone at birth is the cell's. Two sheep,
 * two branches on GitHub, the token nowhere the criterion names; then the
 * branches deleted with the token through a `GIT_ASKPASS` helper that
 * reads the environment, so the scratch repository is left as found.
 * Runs only with `LAMB_PLAYGROUND_TOKEN` in the ring's environment; one
 * `skip` line otherwise.
 */
async function journeyThree(ring, station, { needles, step = "a8", prefix = "ring", journey = "journey 3" }) {
  const playground = process.env[PLAYGROUND_VAR];
  if (!playground) {
    ring.skip(step, `${PLAYGROUND_VAR} is not in the environment, so ${journey === "journey 3" ? "journey 3" : "pasture's journey 1"} against ${PLAYGROUND} was not walked: two sheep, two branches, the token nowhere`, journey);
    return;
  }
  needles.push(playground);
  const { home, token: stationToken } = station;
  const pasture = `${prefix}-${ring.stamp.commit.slice(0, 7)}`;
  const branch = (name) => `sheep/${pasture}-${name}`;
  const names = ["typo", "links"];
  const tasks = { typo: "Fix the typo in README.md on a branch, commit, push.", links: "Fix the dead links in docs/ on a branch, commit, push." };
  const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const lsRemote = () => {
    const done = spawnSync("git", ["ls-remote", PLAYGROUND, `refs/heads/${branch("*")}`], { encoding: "utf8", env: gitEnv, cwd: ring.blog });
    if (done.status !== 0) throw new Error(`git ls-remote ${PLAYGROUND} failed: ${(done.stderr || "").trim()}`);
    return (done.stdout || "").trim().split("\n").filter(Boolean).map((line) => line.split("\t")[1].replace(/^refs\/heads\//, ""));
  };
  // The helper: git asks it for the username and the password; it answers from the environment the delete runs with, and never from a URL.
  const askpass = join(ring.dir, "askpass.sh");
  writeFileSync(askpass, `#!/bin/sh\ncase "$1" in\n  Username*) printf '%s\\n' x-access-token ;;\n  *) printf '%s\\n' "$${PLAYGROUND_VAR}" ;;\nesac\n`, { mode: 0o700 });
  const deleteBranches = () => {
    const results = [];
    for (const name of names) {
      const done = spawnSync("git", ["push", "--delete", PLAYGROUND, branch(name)], { encoding: "utf8", cwd: ring.blog, env: { ...gitEnv, GIT_ASKPASS: askpass, [PLAYGROUND_VAR]: playground } });
      results.push(`${branch(name)}: ${done.status === 0 ? "deleted" : `not deleted (exit ${done.status}: ${(done.stderr || "").trim().split("\n").at(-1) ?? ""})`}`);
    }
    return results;
  };
  const started = Date.now();
  const ids = {};
  let pushed = false;
  try {
    // Step 1: the pasture on the scratch repository, the token into its secret on stdin, the brief put.
    const before = lsRemote();
    if (before.length > 0) ring.fail(step, `git ls-remote ${PLAYGROUND} refs/heads/${branch("*")}`, { stdout: before.join("\n"), stderr: `branches of this ring's name are already on the repository; a ring that left them behind failed: git push --delete ${PLAYGROUND} ${before.join(" ")}`, code: 1 });
    const made = await ring.sheep(["pasture", "new", pasture, "--repo", PLAYGROUND]);
    if (made.code !== 0 || !made.stdout.startsWith(`${pasture}\t${PLAYGROUND}\t`)) ring.fail(step, `sheep pasture new ${pasture} --repo ${PLAYGROUND}`, made);
    station.pastures.push(pasture);
    const secret = await ring.sheep(["pasture", "secret", "set", pasture, "GIT_TOKEN"], { input: `${playground}\n` });
    if (secret.code !== 0 || secret.stdout !== `${pasture}\tGIT_TOKEN\n`) ring.fail(step, `sheep pasture secret set ${pasture} GIT_TOKEN (the token on stdin)`, { ...secret, stdout: secret.stdout.split(playground).join("<token>"), stderr: secret.stderr.split(playground).join("<token>") });
    const secretNames = await ring.sheep(["pasture", "secret", "ls", pasture]);
    if (secretNames.code !== 0 || secretNames.stdout !== "GIT_TOKEN\n") ring.fail(step, `sheep pasture secret ls ${pasture}`, secretNames);
    const brief = `# ${pasture}\n\nA scratch repository. Make a branch, one small change under notes/, commit, name the branch in /pasture/notes/<your name>.md, push.\n`;
    const put = await ring.sheep(["pasture", "put", pasture, "BRIEF.md"], { input: brief });
    if (put.code !== 0) ring.fail(step, `sheep pasture put ${pasture} BRIEF.md`, put);

    // Step 4: each sheep born detached into the pasture (the cell clones at birth, before any turn), given its program, then its task.
    for (const name of names) {
      const born = await ring.sheep(["new", "--pasture", pasture, "--name", name, "--detach"]);
      const id = born.stdout.trim();
      if (born.code !== 0 || !/^[0-9a-f-]{36}$/.test(id)) ring.fail(step, `sheep new --pasture ${pasture} --name ${name} --detach`, born);
      ids[name] = id;
      station.minted.push(id);
      const program = {
        steps: [
          { tool: { name: "bash", args: { command: `git checkout -b ${branch(name)}` } } },
          { tool: { name: "bash", args: { command: `mkdir -p notes && printf 'The %s sheep of the ${prefix === "ring" ? "account" : "package"} ring at %s was here.\\n' ${name} ${ring.stamp.commit} > notes/${name}.md && git add -A && git commit -q -m "${prefix} ${ring.stamp.commit}: ${name}"` } } },
          { tool: { name: "bash", args: { command: `printf '${branch(name)}\\n' | pasture put notes/${name}.md` } } },
          { tool: { name: "bash", args: { command: `git push -u origin ${branch(name)}` } } },
          { text: `pushed ${branch(name)}` },
        ],
      };
      const posted = await fetch(`${home}/s/${encodeURIComponent(id)}/faux`, { method: "POST", headers: { authorization: `Bearer ${stationToken}`, "content-type": "application/json" }, body: JSON.stringify(program), signal: AbortSignal.timeout(30_000) });
      if (posted.status !== 200) ring.fail(step, `POST /s/${id}/faux`, { stdout: await posted.text(), stderr: `status ${posted.status}`, code: 1 });
      const asked = await ring.sheep(["attach", id, "--detach", "--", tasks[name]]);
      if (asked.code !== 0) ring.fail(step, `sheep attach ${id} --detach -- "${tasks[name]}"`, asked);
    }
    pushed = true;
    // Step 5: both turns end; the last message of each names its branch.
    const waited = await ring.sheep(["wait", "--timeout", "300", ids.typo, ids.links]);
    for (const name of names) {
      if (waited.code !== 0 || !waited.stdout.includes(`${ids[name]}\tpushed ${branch(name)}`)) ring.fail(step, `sheep wait ${ids.typo} ${ids.links}`, { ...waited, stderr: `${waited.stderr}\nexpected ${ids[name]} to end with "pushed ${branch(name)}"` });
    }
    const workSeconds = ((Date.now() - started) / 1000).toFixed(0);

    // Step 6: the herd, and the pasture column.
    const herd = await ring.sheep(["pasture", pasture]);
    if (herd.code !== 0) ring.fail(step, `sheep pasture ${pasture}`, herd);
    const herdRows = herd.stdout.trimEnd().split("\n").slice(4).map((row) => row.split("\t"));
    for (const name of names) {
      const row = herdRows.find((candidate) => candidate[0] === ids[name]);
      if (row === undefined || row[1] !== name || row[2] !== "idle" || row[4] !== tasks[name]) ring.fail(step, `sheep pasture ${pasture}`, { ...herd, stderr: `${herd.stderr}\nexpected ${ids[name]}\t${name}\tidle\t…\t${tasks[name]}` });
    }
    if (!herd.stdout.startsWith(`name: ${pasture}\nrepo: ${PLAYGROUND}\n`)) ring.fail(step, `sheep pasture ${pasture}`, { ...herd, stderr: `${herd.stderr}\nexpected the meta to name ${PLAYGROUND}` });
    const inPasture = JSON.parse((await ring.sheep(["ls", "--pasture", pasture, "--json"])).stdout).map((row) => row.id).sort();
    if (JSON.stringify(inPasture) !== JSON.stringify(Object.values(ids).sort())) ring.fail(step, `sheep ls --pasture ${pasture} --json`, { stdout: inPasture.join("\n"), stderr: `expected exactly ${Object.values(ids).join(", ")}`, code: 1 });

    // Step 8: the note names the branch, and both branches are on GitHub, seen anonymously from this laptop.
    const note = await ring.sheep(["pasture", "cat", pasture, "notes/typo.md"]);
    if (note.code !== 0 || note.stdout !== `${branch("typo")}\n`) ring.fail(step, `sheep pasture cat ${pasture} notes/typo.md`, { ...note, stderr: `${note.stderr}\nexpected "${branch("typo")}"` });
    const onGitHub = lsRemote().sort();
    if (JSON.stringify(onGitHub) !== JSON.stringify(names.map(branch).sort())) ring.fail(step, `git ls-remote ${PLAYGROUND} refs/heads/${branch("*")}`, { stdout: onGitHub.join("\n"), stderr: `expected ${names.map(branch).join(" and ")}`, code: 1 });

    // The criterion: the token is in no transcript, no export, and no process's arguments (the watch runs on).
    const logs = {};
    for (const name of names) {
      const logged = await ring.sheep(["log", ids[name]]);
      if (logged.code !== 0) ring.fail(step, `sheep log ${ids[name]}`, logged);
      if (logged.stdout.includes(playground)) ring.fail(step, `sheep log ${ids[name]}`, { stdout: "(withheld)", stderr: "the repository's token is in the transcript", code: 1 });
      if (!/git clone/.test(logged.stdout) || !logged.stdout.includes(`pushed ${branch(name)}`)) ring.fail(step, `sheep log ${ids[name]}`, { ...logged, stderr: `${logged.stderr}\nexpected the birth's git clone and the push` });
      logs[name] = logged.stdout;
    }
    const file = join(ring.dir, `${ids.typo}.sqlite`);
    const exported = await ring.sheep(["export", ids.typo, file]);
    if (exported.code !== 0 || !existsSync(file)) ring.fail(step, `sheep export ${ids.typo} ${file}`, exported);
    if (readFileSync(file).includes(playground)) ring.fail(step, `grep <token> ${file}`, { stdout: "(withheld)", stderr: "the repository's token is in the export's bytes", code: 1 });
    const clonedIn = /git clone[^\n]*/.exec(logs.typo)?.[0] ?? "git clone";
    ring.ok(step, `sheep pasture new ${pasture} --repo …lamb-playground.git; secret set GIT_TOKEN (stdin); put BRIEF.md; sheep new --pasture ${pasture} --name typo|links --detach; sheep wait`, `${workSeconds}s; born ${ids.typo} (typo) and ${ids.links} (links), each cloning at birth ("${clonedIn.slice(0, 60)}"), each pushing; the herd lists both idle with their tasks; notes/typo.md says ${branch("typo")}`);
    ring.ok(step, `git ls-remote ${PLAYGROUND} 'refs/heads/${branch("*")}' (anonymous, from this laptop)`, `${onGitHub.join(", ")}`);
    ring.ok(step, `sheep log ${ids.typo}; sheep log ${ids.links}; sheep export ${ids.typo}`, `the repository's token in neither transcript, not in the export's bytes (${readFileSync(file).length} bytes), and, by the poll, in no process's arguments`);
    console.log(`  the container the sheep worked in was ${station.image}${station.applicationImage !== undefined ? ` (the application's configured image)` : ""}`);
  } finally {
    if (pushed) {
      const deleted = deleteBranches();
      const left = lsRemote();
      console.log(`  ${PLAYGROUND}: ${deleted.join("; ")}; ${left.length === 0 ? "no branches of this ring's name remain" : `STILL THERE: ${left.join(", ")}`}`);
      if (left.length > 0) ring.unchecked.push(`journey 3: the scratch repository is not as found: ${left.join(", ")} remain; git push --delete ${PLAYGROUND} ${left.join(" ")}`);
    }
    rmSync(askpass, { force: true });
  }
}

/**
 * Earmark's journey 2 steps 1 and 2 on the station (earmark phase 1, s1),
 * with the faux provider: a pasture on the scratch repository with no
 * `GIT_TOKEN`, on a station that has no `PEN_GIT_TOKEN` (the ring's deploy
 * sets none), and two sheep born into it: `own`, minted with `--secret
 * GIT_TOKEN` and the shepherd's playground token on stdin, and `sibling`,
 * with none. Each is scripted to branch, commit, and push. The broker hands
 * `own` its token, so its branch is on GitHub, seen anonymously; it has
 * nothing for `sibling` (not its own, not the pasture's, not the home's),
 * so git's helper gets no answer and git says it could not read a username,
 * and no branch of the sibling's is there. The broker's own sentence for
 * that refusal, and the `from this sheep` of the hand-over, are lines of
 * the station's log, which no verb reads: named among what was not
 * checked. The token is in no transcript, export, row, or output of the
 * step's, and, by the walk's poll, in no process's arguments. Both sheep
 * are among those n1 ends; the branch is deleted after through a8's
 * `GIT_ASKPASS` helper. Runs only with `LAMB_PLAYGROUND_TOKEN`, as a8 does.
 */
async function journeyEarmark(ring, station, { needles, step = "s1" }) {
  const playground = process.env[PLAYGROUND_VAR];
  if (!playground) {
    ring.skip(step, `${PLAYGROUND_VAR} is not in the environment, so earmark's journey 2 against ${PLAYGROUND} was not walked: one sheep pushing with its own token, its sibling refused`, "earmark journey 2");
    return;
  }
  if (!needles.includes(playground)) needles.push(playground);
  const { home, token: stationToken } = station;
  const pasture = `earmark-${ring.stamp.commit.slice(0, 7)}`;
  const branch = (name) => `sheep/${pasture}-${name}`;
  const names = ["own", "sibling"];
  const tasks = { own: "Make a branch, commit a note, push it with your own token.", sibling: "Make a branch, commit a note, push it." };
  const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const lsRemote = () => {
    const done = spawnSync("git", ["ls-remote", PLAYGROUND, `refs/heads/${branch("*")}`], { encoding: "utf8", env: gitEnv, cwd: ring.blog });
    if (done.status !== 0) throw new Error(`git ls-remote ${PLAYGROUND} failed: ${(done.stderr || "").trim()}`);
    return (done.stdout || "").trim().split("\n").filter(Boolean).map((line) => line.split("\t")[1].replace(/^refs\/heads\//, ""));
  };
  const withheld = (result) => ({ ...result, stdout: result.stdout.split(playground).join("<token>"), stderr: result.stderr.split(playground).join("<token>") });
  const askpass = join(ring.dir, "askpass-earmark.sh");
  writeFileSync(askpass, `#!/bin/sh\ncase "$1" in\n  Username*) printf '%s\\n' x-access-token ;;\n  *) printf '%s\\n' "$${PLAYGROUND_VAR}" ;;\nesac\n`, { mode: 0o700 });
  const started = Date.now();
  const ids = {};
  let pushed = false;
  try {
    // The pasture: the scratch repository, and no secret at all, so the only token anywhere is the one sheep's.
    const before = lsRemote();
    if (before.length > 0) ring.fail(step, `git ls-remote ${PLAYGROUND} refs/heads/${branch("*")}`, { stdout: before.join("\n"), stderr: `branches of this step's name are already on the repository; a ring that left them behind failed: git push --delete ${PLAYGROUND} ${before.join(" ")}`, code: 1 });
    const made = await ring.sheep(["pasture", "new", pasture, "--repo", PLAYGROUND]);
    if (made.code !== 0 || !made.stdout.startsWith(`${pasture}\t${PLAYGROUND}\t`)) ring.fail(step, `sheep pasture new ${pasture} --repo ${PLAYGROUND}`, made);
    station.pastures.push(pasture);
    const noSecrets = await ring.sheep(["pasture", "secret", "ls", pasture]);
    if (noSecrets.code !== 0 || noSecrets.stdout !== "") ring.fail(step, `sheep pasture secret ls ${pasture}`, { ...noSecrets, stderr: `${noSecrets.stderr}\nexpected no secrets on the pasture` });

    // Step 1's mint: the token on stdin, never an argument; the id alone on stdout, nothing on stderr. The sibling with no --secret.
    const own = await ring.sheep(["new", "--pasture", pasture, "--name", "own", "--secret", "GIT_TOKEN", "--detach"], { input: `${playground}\n` });
    const ownId = /^([0-9a-f-]{36})\n$/.exec(own.stdout)?.[1];
    if (own.code !== 0 || !ownId || own.stderr !== "") ring.fail(step, `sheep new --pasture ${pasture} --name own --secret GIT_TOKEN --detach (the token on stdin)`, { ...withheld(own), stderr: `${withheld(own).stderr}\nexpected exit 0, the id alone on stdout, nothing on stderr` });
    ids.own = ownId;
    station.minted.push(ownId);
    const sibling = await ring.sheep(["new", "--pasture", pasture, "--name", "sibling", "--detach"]);
    const siblingId = /^([0-9a-f-]{36})\n$/.exec(sibling.stdout)?.[1];
    if (sibling.code !== 0 || !siblingId) ring.fail(step, `sheep new --pasture ${pasture} --name sibling --detach`, sibling);
    ids.sibling = siblingId;
    station.minted.push(siblingId);
    // The names: GIT_TOKEN last in own's row and in its JSON, nothing in the sibling's; never the value.
    const listed = await ring.sheep(["ls"]);
    const listedJson = await ring.sheep(["ls", "--json"]);
    if (listed.stdout.includes(playground) || listedJson.stdout.includes(playground)) ring.fail(step, "sheep ls; sheep ls --json", { stdout: "(withheld)", stderr: "the token is in the rows", code: 1 });
    const rowOf = (id) => listed.stdout.split("\n").find((line) => line.startsWith(`${id}\t`))?.split("\t");
    if (rowOf(ownId)?.[5] !== "GIT_TOKEN" || rowOf(siblingId)?.[5] !== "") ring.fail(step, "sheep ls", { ...listed, stderr: `${listed.stderr}\nexpected ${ownId}'s last column GIT_TOKEN and ${siblingId}'s empty` });
    const rows = JSON.parse(listedJson.stdout);
    if (JSON.stringify(rows.find((row) => row.id === ownId)?.secrets) !== '["GIT_TOKEN"]' || JSON.stringify(rows.find((row) => row.id === siblingId)?.secrets) !== "[]") {
      ring.fail(step, "sheep ls --json", { ...listedJson, stderr: `${listedJson.stderr}\nexpected ${ownId} with "secrets": ["GIT_TOKEN"] and ${siblingId} with []` });
    }

    // Each sheep's program, then its task: branch, commit, push. The sibling's push is expected to be refused; its program goes on.
    for (const name of names) {
      const id = ids[name];
      const program = {
        steps: [
          { tool: { name: "bash", args: { command: `git checkout -b ${branch(name)}` } } },
          { tool: { name: "bash", args: { command: `mkdir -p notes && printf 'The %s sheep of the account ring at %s was here, on a token of its own or none.\\n' ${name} ${ring.stamp.commit} > notes/earmark-${name}.md && git add -A && git commit -q -m "earmark ${ring.stamp.commit}: ${name}"` } } },
          { tool: { name: "bash", args: { command: `git push -u origin ${branch(name)}` } } },
          { text: `tried ${branch(name)}` },
        ],
      };
      const posted = await fetch(`${home}/s/${encodeURIComponent(id)}/faux`, { method: "POST", headers: { authorization: `Bearer ${stationToken}`, "content-type": "application/json" }, body: JSON.stringify(program), signal: AbortSignal.timeout(30_000) });
      if (posted.status !== 200) ring.fail(step, `POST /s/${id}/faux`, { stdout: await posted.text(), stderr: `status ${posted.status}`, code: 1 });
      const asked = await ring.sheep(["attach", id, "--detach", "--", tasks[name]]);
      if (asked.code !== 0 || asked.stdout !== `${id}\n`) ring.fail(step, `sheep attach ${id} --detach -- "${tasks[name]}"`, asked);
    }
    pushed = true;
    const waited = await ring.sheep(["wait", "--timeout", "300", ids.own, ids.sibling]);
    for (const name of names) {
      if (waited.code !== 0 || !waited.stdout.includes(`${ids[name]}\ttried ${branch(name)}`)) ring.fail(step, `sheep wait ${ids.own} ${ids.sibling}`, { ...waited, stderr: `${waited.stderr}\nexpected ${ids[name]} to end with "tried ${branch(name)}"` });
    }
    const workSeconds = ((Date.now() - started) / 1000).toFixed(0);

    // Journey 2 step 1: own's branch is on GitHub, seen anonymously from this laptop. Step 2: the sibling's is not.
    const onGitHub = lsRemote().sort();
    if (JSON.stringify(onGitHub) !== JSON.stringify([branch("own")])) ring.fail(step, `git ls-remote ${PLAYGROUND} refs/heads/${branch("*")}`, { stdout: onGitHub.join("\n"), stderr: `expected ${branch("own")} alone: the earmarked sheep pushed with its own token, and the sibling, with none anywhere, did not push`, code: 1 });

    // The transcripts: own cloned at birth and pushed; the sibling cloned (the repository is public) and its push found no
    // credential: the helper had nothing from the broker, and git, with no terminal to ask, could not read a username.
    const logs = {};
    for (const name of names) {
      const logged = await ring.sheep(["log", ids[name]]);
      if (logged.code !== 0) ring.fail(step, `sheep log ${ids[name]}`, withheld(logged));
      if (logged.stdout.includes(playground)) ring.fail(step, `sheep log ${ids[name]}`, { stdout: "(withheld)", stderr: "the token is in the transcript", code: 1 });
      if (!/git clone/.test(logged.stdout)) ring.fail(step, `sheep log ${ids[name]}`, { ...logged, stderr: `${logged.stderr}\nexpected the birth's git clone` });
      logs[name] = logged.stdout;
    }
    if (!logs.own.includes(`git push -u origin ${branch("own")}`) || /could not read Username/.test(logs.own)) ring.fail(step, `sheep log ${ids.own}`, { stdout: logs.own, stderr: `expected own's push of ${branch("own")}, and no refusal for want of a credential`, code: 1 });
    const refusedLine = /[^\n]*could not read Username[^\n]*/.exec(logs.sibling)?.[0];
    if (refusedLine === undefined) ring.fail(step, `sheep log ${ids.sibling}`, { stdout: logs.sibling, stderr: "expected the sibling's push refused for want of a credential (git: could not read Username …)", code: 1 });
    for (const name of names) {
      const file = join(ring.dir, `${ids[name]}.sqlite`);
      const exported = await ring.sheep(["export", ids[name], file]);
      if (exported.code !== 0 || !existsSync(file)) ring.fail(step, `sheep export ${ids[name]} ${file}`, withheld(exported));
      if (readFileSync(file).includes(playground)) ring.fail(step, `grep <token> ${file}`, { stdout: "(withheld)", stderr: "the token is in the export's bytes", code: 1 });
    }
    ring.unchecked.push(`earmark journey 2 ${step}: the broker's own sentence for the sibling ("this sheep has no GIT_TOKEN, pasture ${pasture} has none, and the home has no PEN_GIT_TOKEN, …") and the hand-over's "from this sheep" are the station's log lines, which no verb reads; the refusal seen is git's, after the helper got nothing`);
    ring.ok(step, `sheep pasture new ${pasture} --repo …lamb-playground.git (no secret); sheep new --pasture ${pasture} --name own --secret GIT_TOKEN --detach (the token on stdin); sheep new … --name sibling --detach; sheep ls`, `own ${ids.own} lists GIT_TOKEN last, the sibling ${ids.sibling} nothing; no value in either form`);
    ring.ok(step, `POST /s/<id>/faux; sheep attach <id> --detach (twice); sheep wait; git ls-remote ${PLAYGROUND} 'refs/heads/${branch("*")}' (anonymous)`, `${workSeconds}s; ${onGitHub.join(", ")} alone on GitHub: own pushed with its own token; the sibling refused: "${refusedLine.trim().slice(0, 100)}"`);
    ring.ok(step, `sheep log ${ids.own}; sheep log ${ids.sibling}; sheep export (both)`, "the token in neither transcript, neither export's bytes, no row, no output of the step's, and, by the poll, in no process's arguments");
  } finally {
    if (pushed) {
      const results = [];
      for (const name of names) {
        const done = spawnSync("git", ["push", "--delete", PLAYGROUND, branch(name)], { encoding: "utf8", cwd: ring.blog, env: { ...gitEnv, GIT_ASKPASS: askpass, [PLAYGROUND_VAR]: playground } });
        results.push(`${branch(name)}: ${done.status === 0 ? "deleted" : "not there to delete"}`);
      }
      const left = lsRemote();
      console.log(`  ${PLAYGROUND}: ${results.join("; ")}; ${left.length === 0 ? "no branches of this step's name remain" : `STILL THERE: ${left.join(", ")}`}`);
      if (left.length > 0) ring.unchecked.push(`earmark journey 2: the scratch repository is not as found: ${left.join(", ")} remain; git push --delete ${PLAYGROUND} ${left.join(" ")}`);
    }
    rmSync(askpass, { force: true });
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { ring: ringName, ref, repo, spec, commit, keep } = parsed;
  if (ringName === "machine") {
    await machineRing(parsed);
    return;
  }
  if (ringName === "dog") {
    if (parsed.inside) await dogInside(parsed);
    else await dogRing(parsed);
    return;
  }
  if (ringName === "account") {
    if (parsed.second) await secondInside(parsed);
    else await accountRing(parsed);
    return;
  }
  // --docker (station phase 4): Docker has to answer before anything runs, or the walk would fail at step 2 with a world half made.
  if (parsed.docker) {
    const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"], { encoding: "utf8" });
    if (docker.error || docker.status !== 0) {
      const why = docker.error ? docker.error.message : (docker.stderr || docker.stdout || "").trim();
      console.error(`hermetic: --docker needs Docker on this machine, and there is none that answers (docker version: ${why}); nothing was checked`);
      process.exit(2);
    }
    console.log(`docker: ${docker.stdout.trim()}; the blog home rents a container`);
  }
  let ring;
  try {
    ring = new Ring({ ref, repo, spec, commit, keep, docker: parsed.docker, noEyes: parsed.noEyes });
  } catch (error) {
    usage(`${ref}: ${error.message}`);
  }
  if (spec === undefined) console.log(`package ring: ${ref} = ${ring.sha}${repo === root ? "" : ` in ${repo}`}`);
  else console.log(`package ring: ${spec}${commit ? `, expected to be a build of ${commit}` : ""}`);
  let failure;
  try {
    ring.assertFresh();
    await ring.install();
    await ring.walk();
  } catch (error) {
    failure = error;
  } finally {
    // A failed walk does not keep a daemon: the home is stopped before anything is reported, kept only with --keep and a walk that held.
    if (failure && keep) console.error("hermetic: the walk failed; the local home is stopped even with --keep");
    if (failure) ring.keep = false;
    await ring.stopLocalHome();
    ring.keep = keep;
  }
  ring.report(failure);
  ring.cleanup();
  if (failure) {
    console.log(`\n${ringName} ring: FAILED at ${failure.ring?.step ?? "setup"}`);
    process.exit(1);
  }
  console.log(`\n${ringName} ring: ok (${ring.lines.filter((line) => line.startsWith("ok")).length} lines held)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`hermetic: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}
