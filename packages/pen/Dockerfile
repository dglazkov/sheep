# The pen image: node, pnpm, python and git, and the agent that speaks the
# protocol. Built by scripts/build-image.sh with packages/pen as the context.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

# The agent's one runtime dependency, `ignore`, pinned exactly in package.json;
# npm resolves it there, so the image never sees the workspace's devDependencies.
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

RUN mkdir -p /workspace
WORKDIR /workspace

# The health port (`ok`), the one thing the platform connects to; the agent connects out to the cell.
EXPOSE 8080
CMD ["node", "/opt/pen/bin/pen-agent.mjs"]
