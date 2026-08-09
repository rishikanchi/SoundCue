# Vendored librosa runtime stubs

These four `.pyi` files are copied unchanged from `librosa==0.11.0`. Librosa's
runtime lazy loader parses them to expose package functions. Some Vercel Python
bundles omit wheel type-stub files, so SoundCue ships the same stubs alongside
the function and uses them only when the adjacent wheel copy is unavailable.

The files remain under librosa's ISC license, reproduced in `LICENSE.md`.
