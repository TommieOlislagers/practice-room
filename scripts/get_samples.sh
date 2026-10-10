#!/bin/sh
# Test material only: sampled guitar notes (FluidR3 GM, via gleitz/midi-js-soundfonts) as raw 48 kHz mono float32.
# The tests build "performances" from these. Nothing here ships in the page.
set -e
cd "$(dirname "$0")/.."
for inst in acoustic_guitar_steel electric_guitar_clean; do
  mkdir -p samples/$inst
  for oct in 2 3 4 5; do for n in C Db D Eb E F Gb G Ab A Bb B; do
    f=samples/$inst/$n$oct
    [ -f $f.f32 ] && continue
    curl -sSfL "https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/$inst-mp3/$n$oct.mp3" -o $f.mp3 || continue
    ffmpeg -hide_banner -v error -y -i $f.mp3 -f f32le -ac 1 -ar 48000 $f.f32
  done; done
done
