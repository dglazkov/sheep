# The machine ring's image (collar phase 3): a user's machine, as close as a
# container comes. `scripts/hermetic.mjs --ring machine` builds it twice,
# with NODE_IMAGE=node:22-slim and NODE_IMAGE=node:24-slim, from a build
# context it makes: the ref as a bare repository (`src.git`), this script
# (`hermetic.mjs`), and this file. The dog ring (collar phase 4) builds it
# once more from node:24-slim with AGENT set, and Claude Code is in it.
# Nothing is mounted into the container and no socket reaches it; the ring
# inside installs `git+file:///src.git#<sha>` through npm's git installer
# and fetches wrangler from the registry over the container's default
# network.
#
# Two packages beyond the image: git, which the README names as a
# prerequisite and npm's git installer needs (there is none in node:*-slim),
# and procps, for the `ps` the ring reads to see that no process's arguments
# carry the token (the ring's own need, not sheep's). ca-certificates is
# already in the image; named so a slimmer base would still reach npm.
ARG NODE_IMAGE=node:22-slim
FROM ${NODE_IMAGE}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git procps \
  && rm -rf /var/lib/apt/lists/*

# The dog ring's agent (collar phase 4): `--build-arg AGENT=@anthropic-ai/claude-code`
# installs Claude Code at its current version with the image's npm, as a
# user would, and the ring reads `claude --version` in its probe. The
# machine ring leaves AGENT empty, and this layer does nothing. The cache
# the install leaves in HOME goes, so the dog's HOME is as fresh as the
# machine ring's and the probe can say so.
ARG AGENT=
RUN if [ -n "$AGENT" ]; then npm install -g "$AGENT" && claude --version && rm -rf "$HOME/.npm"; fi

# The script first, the repository last: the apt layer, the agent, and the script are cached across runs; the repository changes with the ref.
COPY hermetic.mjs /ring/hermetic.mjs
COPY src.git /src.git
WORKDIR /ring
