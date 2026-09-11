# The pen image: node, pnpm, python and git, and the agent that speaks the
# protocol. Built by scripts/build-image.sh with packages/pen as the context.
FROM node:24-bookworm-slim

# Corepack keeps the pnpm it prepares under `~/.cache` by default, and `~` starts empty in every container (fold phase 2),
# so the first `pnpm` would be a download. It keeps it in the image instead.
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

# The agent's two runtime dependencies, `ignore` and `ws` (fold phase 2: the socket to the cell, which offers no
# permessage-deflate), pinned exactly in package.json; npm resolves them there, so the image never sees the
# workspace's devDependencies.
COPY package.json /opt/pen/package.json
RUN cd /opt/pen && npm install --omit=dev --no-audit --no-fund --no-package-lock \
  && rm -rf /root/.npm
COPY bin /opt/pen/bin
COPY src /opt/pen/src

# The git credential helper: `credential.helper = pen` in the system config makes git spawn
# `git-credential-pen`, which asks the agent over its Unix socket. No terminal ever answers
# a prompt here, so git is told not to try.
RUN chmod +x /opt/pen/bin/git-credential-pen.mjs \
  && ln -s /opt/pen/bin/git-credential-pen.mjs /usr/local/bin/git-credential-pen \
  && git config --system credential.helper pen
ENV GIT_TERMINAL_PROMPT=0

# Fold phase 2. A sheep's `~` is /home/sheep, kept by the cell as rows beside the workspace, so a tool's own default paths
# land there and outlive the container. The pasture's cache is /cache, npm's global prefix, its `bin` first on PATH, so
# setup's `npm install -g` installs into what the pasture keeps. Both are empty in the image, as /workspace is: a sync-in
# deletes what its manifest does not name, and there is nothing of the image's there to delete.
ENV HOME=/home/sheep \
  NPM_CONFIG_PREFIX=/cache \
  PATH=/cache/bin:$PATH
RUN mkdir -p /workspace /home/sheep /cache
WORKDIR /workspace

# The health port (`ok`), the one thing the platform connects to; the agent connects out to the cell.
EXPOSE 8080
CMD ["node", "/opt/pen/bin/pen-agent.mjs"]
