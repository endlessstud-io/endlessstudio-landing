#!/usr/bin/env bash
# A project card video from screenshots: each image centre-cropped to 2:1 at 1920×960 and held 3 s, with 1 s
# crossfades, ending on a fade back to the first so the loop has no jump; silent fast-start H.264 at 30 fps, and a WebP
# poster of the first image. Needs ffmpeg with libx264 and libwebp. Sources and commands: media/README.md.
# Usage: scripts/encode-map-loop.sh OUTPUT.mp4 POSTER.webp IMAGE...
set -euo pipefail
[ $# -ge 4 ] || { echo "Usage: $0 OUTPUT.mp4 POSTER.webp IMAGE IMAGE..." >&2; exit 1; }
out=$1 poster=$2; shift 2
hold=3 fade=1
frame="crop='min(iw,ih*2)':'min(iw,ih*2)/2',scale=1920:960,setsar=1,fps=30"

inputs=() filter="" i=0
for image in "$@" "$1"; do
  # each input covers its fade in, its hold and its fade out (the first has no fade in); the final input is the first
  # image again, just long enough for the fade back
  if [ $i -eq 0 ]; then t=$((hold + fade)); elif [ $i -eq $# ]; then t=$fade; else t=$((hold + 2 * fade)); fi
  inputs+=(-loop 1 -t "$t" -i "$image")
  filter+="[$i]$frame[f$i];"
  i=$((i + 1))
done
previous="[f0]" offset=$hold
for k in $(seq 1 $#); do
  filter+="${previous}[f$k]xfade=transition=fade:duration=$fade:offset=$offset[x$k];"
  previous="[x$k]" offset=$((offset + hold + fade))
done

# screenshots saved from Bluesky carry Exif that ffmpeg's WebP decoder complains about on every frame; it's harmless
quiet() { "$@" 2> >(grep -v "invalid TIFF header" >&2); }
quiet ffmpeg -v error -y "${inputs[@]}" -filter_complex "${filter}${previous}format=yuv420p[v]" -map "[v]" \
  -c:v libx264 -preset slow -crf 20 -an -movflags +faststart "$out"
quiet ffmpeg -v error -y -i "$1" -vf "$frame" -frames:v 1 -c:v libwebp -quality 75 "$poster"
echo "$out: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out") s; poster $poster"
