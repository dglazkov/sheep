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

RUN mkdir -p /workspace
WORKDIR /workspace

CMD ["node", "/opt/pen/bin/pen-agent.mjs"]
