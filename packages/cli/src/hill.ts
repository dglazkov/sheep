/**
 * The verb (hill phase 0): `sheep hill`, a pass minted under the home's
 * token and printed as a link, the url on stdout, one line, and nothing
 * else; exit 0. The token stays on this machine: the link carries a pass,
 * worthless after one use or two minutes, which a browser trades for a seat.
 * There is no `--open`: the dog's shell is not the shepherd's browser, and a
 * shepherd at their own terminal can click a printed link. A home too old to
 * have the route answers its router's bare `not found`, which `Home.pass`
 * throws as the floor's sentence, and `main` prints it and exits 2.
 */
import type { Home } from "./home.js";

export async function runHill(home: Home, output: { out: (text: string) => void }): Promise<number> {
  const { url } = await home.pass();
  output.out(`${url}\n`);
  return 0;
}
