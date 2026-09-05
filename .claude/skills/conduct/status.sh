#!/usr/bin/env bash
# conduct/status.sh <project>: where a project stands, mechanically.
# Reads docs/projects/<project>/{phases,journey}.md and docs/projects/README.md.
# Prints the where-we-are paragraph, every phase's status, the next phase and
# what it needs, the Open roster, and lints the docs' own rules. Changes nothing.
set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
P=${1:?usage: status.sh <project>}
D=$ROOT/docs/projects/$P
PH=$D/phases.md; J=$D/journey.md; IDX=$ROOT/docs/projects/README.md
[ -f "$PH" ] || { echo "no such project: $P ($PH)"; exit 2; }

section() { # section <heading-regex>: print from the heading to the next ## heading
  awk -v re="$1" '$0 ~ re {on=1} on && /^## / && !($0 ~ re) {exit} on {print}' "$PH"
}

echo "== $P: where we are"
awk '/^\*\*Where we are/ {on=1} on && /^$/ {exit} on {print}' "$PH"
echo
echo "== phases"
awk '
  /^## Phase / { title=$0; sub(/^## /,"",title) }
  /^\*\*Status: / { s=$0; sub(/^\*\*Status: /,"",s); sub(/[.*].*$/,"",s); printf "  %-12s %s\n", s, title }
' "$PH"
NEXT=$(awk '/^## Phase /{t=$0} /^\*\*Status: NOT STARTED/{print t; exit}' "$PH")
PART=$(awk '/^## Phase /{t=$0} /^\*\*Status: PART-DONE/{sub(/^## /,"",t); printf "%s; ", t}' "$PH")
echo
echo "== next: ${NEXT#\#\# }"; [ -z "$NEXT" ] && echo "   none: every phase is started"
[ -n "$PART" ] && echo "   part-done, walks still owed: $PART"
grep -n -i -E 'waits on|waiting on' "$PH" | sed -n '1,6p' | sed 's/^/   /'
if [ -n "$NEXT" ]; then
  echo
  echo "== the next phase's proof"
  section "^$(printf '%s' "$NEXT" | sed 's/[][\.*^$]/\\&/g')\$" | awk '/^\*\*Proof:/ {on=1} on && /^$/ {exit} on {print "   " $0}'
  echo "== its provision steps (⚑): asked out loud first, with the price"
  prov=$(section "^$(printf '%s' "$NEXT" | sed 's/[][\.*^$]/\\&/g')\$" | grep '⚑' | sed 's/^/   /'); echo "${prov:-   none}"
fi
echo
echo "== front matter and index"
printf '   journey.md: '; grep -E '^status:' "$J" || echo "(no status: line)"
printf '   index row:  '; grep -E "^\| \[$P\]" "$IDX" | awk -F'|' '{print $4}' | sed -E 's/^ *//; s/ *$//' | cut -c1-160
echo
echo "== open roster (debts nothing else records)"
open=$(grep -n -E '^- \*\*20[0-9]{2}-[0-9]{2}-[0-9]{2} — Open' "$PH" | sed 's/^/   /'); echo "${open:-   none}"
echo
echo "== lint"
n=0
# bare phase citations in prose (the rule: "<project> phase N", never "phase N")
hits=$(grep -n -E '(^|[^a-zA-Z] )[Pp]hases? [0-9]' "$D/design.md" "$J" 2>/dev/null | grep -v -E '(lamb|pen|[a-z]+) phases? [0-9]' | grep -v -E '^[^:]+:[0-9]+:note:')
[ -n "$hits" ] && { echo "   bare phase citations outside phases.md (name the project):"; echo "$hits" | sed 's/^/     /'; n=$((n+1)); }
# findings longer than sixty words, and Findings sections over three hundred
fl=$(awk '
  function flush() { if (f) { w=split(buf, a, /[ \t]+/); if (w > 60) printf "   finding of %d words at line %d: %s\n", w, ln, substr(buf,1,70) "…"; f=0; buf="" } }
  /^## Phase / { flush(); if (sec && secw > 300) printf "   Findings of %s run %d words (rule: under three hundred)\n", sec, secw; sec=$0; sub(/^## /,"",sec); secw=0; inF=0 }
  /^\*\*Findings:\*\*/ { inF=1; next }
  /^\*\*Formerly:/ { inF=0 }
  inF && /^- \*\*20[0-9][0-9]-/ { flush(); f=1; ln=NR; buf=$0; secw+=NF; next }
  inF && f && /^  / { buf=buf " " $0; secw+=NF; next }
  inF && f { flush() }
  END { flush(); if (sec && secw > 300) printf "   Findings of %s run %d words (rule: under three hundred)\n", sec, secw }
' "$PH")
[ -n "$fl" ] && { echo "$fl"; n=$((n+1)); }
# the where-we-are line and the Status lines must agree on what is next
if [ -n "$NEXT" ]; then
  num=$(printf '%s' "$NEXT" | sed -E 's/^## Phase ([0-9]+).*/\1/')
  grep -A3 '^\*\*Where we are' "$PH" | grep -q -E "phase $num\b" || { echo "   where-we-are does not name $P phase $num as next, but it is the first NOT STARTED phase"; n=$((n+1)); }
fi
[ "$n" = 0 ] && echo "   clean"
exit $(( n > 0 ))
