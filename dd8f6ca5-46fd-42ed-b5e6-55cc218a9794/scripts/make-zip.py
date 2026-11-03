#!/usr/bin/env python3
"""Build a clean distributable ZIP of the project source."""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "atlas-fire-system-src-v14.zip")
TOP = "atlas-fire-system"

INCLUDE_PATHS = [
    "src", "prisma", "public", "electron", "scripts", "docs",
    "package.json", "bun.lock", "tsconfig.json", "vite.config.ts",
    "postcss.config.mjs", "components.json", "index.html", "shogo.config.json",
    "prisma.config.ts", "custom-routes.ts", "server.tsx", "AGENTS.md", ".gitignore",
    "README.md", "LICENSE", "capacitor.config.ts",
    "build-windows.bat", "build-android.sh",
]

SKIP_DIRS = {"node_modules", "dist", ".git", ".shogo", ".cursor", "memory", "__pycache__"}
SKIP_EXT = {".tar.gz", ".zip", ".log"}


def should_skip_dir(name):
    return name in SKIP_DIRS


def iter_files():
    for item in INCLUDE_PATHS:
        full = os.path.join(ROOT, item)
        if not os.path.exists(full):
            continue
        if os.path.isfile(full):
            yield full
            continue
        for dirpath, dirnames, filenames in os.walk(full):
            dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
            for fn in filenames:
                if any(fn.endswith(ext) for ext in SKIP_EXT):
                    continue
                yield os.path.join(dirpath, fn)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in iter_files():
            rel = os.path.relpath(path, ROOT)
            if rel.startswith(".."):
                continue
            zf.write(path, os.path.join(TOP, rel))
            count += 1
    size = os.path.getsize(OUT)
    print(f"ZIP created: {OUT}")
    print(f"files: {count}  size: {size:,} bytes ({size / 1048576:.1f} MB)")


if __name__ == "__main__":
    main()
