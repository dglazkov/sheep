# The machine ring's image (collar phase 3): a user's machine, as close as a
# container comes. `scripts/hermetic.mjs --ring machine` builds it twice,
# with NODE_IMAGE=node:22-slim and NODE_IMAGE=node:24-slim, from a build
# context it makes: the ref as a bare repository (`src.git`), this script
# (`hermetic.mjs`), and this file. Nothing is mounted into the container and
# no socket reaches it; the ring inside installs `git+file:///src.git#<sha>`
# through npm's git installer and fetches wrangler from the registry over the
# container's default network.
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

# The script first, the repository last: the apt layer and the script are cached across runs; the repository changes with the ref.
COPY hermetic.mjs /ring/hermetic.mjs
COPY src.git /src.git
WORKDIR /ring
