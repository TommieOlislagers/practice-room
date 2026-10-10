#!/bin/sh
# Phone-style recordings for the sound-track reader tests, made from wav/eyes_take.wav (run `node test/mkwav.js` first).
set -e
cd "$(dirname "$0")/../media" 2>/dev/null || { mkdir -p "$(dirname "$0")/../media"; cd "$(dirname "$0")/../media"; }
W=../wav/eyes_take.wav
ff() { ffmpeg -hide_banner -v error -y "$@"; }
ff -f lavfi -i "testsrc2=size=1280x720:rate=30" -i $W -shortest -c:v libx264 -preset ultrafast -pix_fmt yuv420p -b:v 1500k -c:a aac -b:a 128k -ac 2 -ar 48000 a_android.mp4
ff -i a_android.mp4 -c copy -movflags +faststart a_fast.mp4
ff -f lavfi -i "testsrc2=size=1280x720:rate=30" -i $W -shortest -c:v libx265 -preset ultrafast -x265-params log-level=error -tag:v hvc1 -pix_fmt yuv420p -b:v 1200k -c:a aac -b:a 96k -ac 1 -ar 44100 -f mov b_iphone.mov
ff -i $W -c:a aac -b:a 64k -ac 1 -ar 48000 c_memo.m4a
ff -i a_android.mp4 -c copy -movflags frag_keyframe+empty_moov d_frag.mp4
ff -i $W -c:a alac e_alac.m4a
ff -f lavfi -i "testsrc2=size=640x360:rate=30" -i $W -shortest -c:v libx264 -preset ultrafast -pix_fmt yuv420p -b:v 400k -c:a libopus -b:a 96k f_opus.mp4
ff -f lavfi -i "nullsrc=size=1280x720:rate=30,geq=random(1)*255:128:128" -i $W -shortest -c:v libx264 -preset ultrafast -pix_fmt yuv420p -b:v 4500k -maxrate 4500k -bufsize 9000k -c:a aac -b:a 128k -ac 2 -ar 48000 g_big.mp4
for f in a_android.mp4 a_fast.mp4 b_iphone.mov c_memo.m4a g_big.mp4; do ff -i $f -vn -c:a copy -f adts ${f%.*}.ref.aac; done
