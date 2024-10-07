for file in *.flac; do
  ffmpeg -i "$file" -c:a flac -sample_fmt s32 -ar 48000 -bits_per_raw_sample 24 "${file%.*}_24bit_48kHz.flac"
done

# 元のファイルを削除
for file in *.flac; do
  if [[ $file != *_24bit_48kHz.flac ]]; then
    rm "$file"
  fi
done

for file in *.flac; do
  # _24bit_48kHzを削除してリネーム
  if [[ $file == *_24bit_48kHz.flac ]]; then
    newname="${file/_24bit_48kHz/}"
    mv "$file" "$newname"
  fi
done
