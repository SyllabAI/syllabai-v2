#!/usr/bin/env python3
"""G-4 mirror — materialize the 9609 corpus of record into the committed parser's
expected layout, verifying every PDF sha256 against the of-record manifests.

Sources (receipt-pinned):
  main worktree      : 48 held ms.pdf + er.pdf   (syllabai-pastpapers main)
  /tmp/pp6 (PR#6 br) : held dirs + 48 qp.pdf      (head dd8a21b4)
  /tmp/pp8 (PR#8 br) : 105 dirs incl 57 ext ms+qp (head 983a97b8)

Outputs under /home/z/my-project/g3-9609/:
  pp-holdings/<stem>__ms.pdf     (48 held MS — parser glob 1)
  raw-xt/9609_<s><yy>_ms_<v>.pdf (57 ext MS — parser glob 2, XtremePapers naming)
  qp-holdings/<stem>__qp.pdf     (105 QP — QP-grammar stage)
  manifests/{pp6,pp8}/<stem>.yaml
"""
import hashlib
import os
import re
import shutil
import sys

MAIN = "/home/z/my-project/repo-pp-tree/past-papers/cambridge-international/ial/business/9609/past-papers"
PP6 = "/tmp/pp6"
PP8 = "/tmp/pp8"
OUT = "/home/z/my-project/g3-9609"

failures = []


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_materials(mpath):
    """Return {path: {sha256, size_bytes, pages}} from a manifest.yaml."""
    mats = {}
    cur = None
    for ln in open(mpath, encoding="utf-8", errors="replace"):
        m = re.match(r"- type: (.+?)\s*$", ln)
        if m:
            cur = {"type": m.group(1).strip()}
            continue
        if cur is None:
            continue
        m = re.match(r"  path: (.+?)\s*$", ln)
        if m:
            cur["path"] = m.group(1).strip().strip("'\"")
            continue
        m = re.match(r"  sha256: ([0-9a-f]{64})\s*$", ln)
        if m:
            cur["sha256"] = m.group(1)
            continue
        m = re.match(r"  size_bytes: (\d+)\s*$", ln)
        if m:
            cur["size_bytes"] = int(m.group(1))
            continue
        m = re.match(r"  pages: (\d+)\s*$", ln)
        if m:
            cur["pages"] = int(m.group(1))
            continue
        if re.match(r"\S", ln) and ln.strip() and not ln.startswith(("materials", "-")):
            # a new top-level key ends the materials block
            if not ln.startswith(" ") and "type" not in cur:
                cur = None
    if cur and cur.get("path"):
        mats[cur["path"]] = cur
    return mats


def parse_all_materials(mpath):
    """Robust: split on '- type:' blocks (any indent); block i starts at its type line."""
    txt = open(mpath, encoding="utf-8", errors="replace").read()
    blocks = re.split(r"\n(?=\s*- type: )", "\n" + txt)
    mats = {}
    for b in blocks[1:]:
        typ_m = re.match(r"\s*- type: (.+?)\s*$", b, re.M)
        if not typ_m:
            continue
        typ = typ_m.group(1).strip()
        path = re.search(r"\n\s+path: (.+?)\s*$", b, re.M)
        sha = re.search(r"\n\s+sha256: ([0-9a-f]{64})\s*$", b, re.M)
        size = re.search(r"\n\s+size_bytes: (\d+)\s*$", b, re.M)
        pages = re.search(r"\n\s+pages: (\d+)\s*$", b, re.M)
        if path and sha:
            mats[path.group(1).strip().strip("'\"")] = {
                "type": typ, "sha256": sha.group(1),
                "size_bytes": int(size.group(1)) if size else None,
                "pages": int(pages.group(1)) if pages else None,
            }
    return mats


def paper_dirs(root):
    """Yield (paper_dir_name, paper_dir_path) at depth 2: <root>/<session>/<paper>."""
    out = []
    for sess in sorted(os.listdir(root)):
        spath = os.path.join(root, sess)
        if not os.path.isdir(spath):
            continue
        for d in sorted(os.listdir(spath)):
            dpath = os.path.join(spath, d)
            if os.path.isdir(dpath):
                out.append((d, dpath))
    return out


def verify_and_place(src_dir, dest, rename=None, filter_type=None):
    """Verify every pdf under src_dir (depth-2 paper dirs) against the manifest.yaml
    inside each paper dir; copy into dest."""
    n_ok = n_missing_manifest = n_mismatch = 0
    for d, dpath in paper_dirs(src_dir):
        mpath = os.path.join(dpath, "manifest.yaml")
        if not os.path.exists(mpath):
            n_missing_manifest += 1
            failures.append(f"NO MANIFEST: {d}")
            continue
        mats = parse_all_materials(mpath)
        for fn in sorted(os.listdir(dpath)):
            if not fn.endswith(".pdf"):
                continue
            fpath = os.path.join(dpath, fn)
            mat = mats.get(fn)
            relevant = (fn == "ms.pdf" and filter_type == "mark-scheme") or \
                       (fn == "qp.pdf" and filter_type == "question-paper")
            if mat is None:
                if relevant:
                    n_missing_manifest += 1
                    failures.append(f"NO MANIFEST ENTRY: {d}/{fn}")
                continue
            if filter_type and mat["type"] != filter_type:
                continue
            digest = sha256_file(fpath)
            if digest != mat["sha256"]:
                n_mismatch += 1
                failures.append(f"SHA MISMATCH: {d}/{fn} got {digest[:12]} want {mat['sha256'][:12]}")
                continue
            if mat["size_bytes"] is not None and os.path.getsize(fpath) != mat["size_bytes"]:
                n_mismatch += 1
                failures.append(f"SIZE MISMATCH: {d}/{fn}")
                continue
            stem = rename(d, fn) if rename else None
            outname = stem or fn
            os.makedirs(dest, exist_ok=True)
            shutil.copy2(fpath, os.path.join(dest, outname))
            n_ok += 1
    return n_ok, n_missing_manifest, n_mismatch


def verify_and_place_one(dir_path, manifest_dir_path, dest, rename=None, filter_type=None):
    """Same as verify_and_place but for a single paper dir (no depth-2 walk)."""
    d = os.path.basename(dir_path.rstrip('/'))
    mpath = os.path.join(manifest_dir_path, "manifest.yaml")
    if not os.path.exists(mpath):
        failures.append(f"NO MANIFEST: {d}")
        return 0, 1, 0
    mats = parse_all_materials(mpath)
    n_ok = n_missing_manifest = n_mismatch = 0
    for fn in sorted(os.listdir(dir_path)):
        if not fn.endswith(".pdf"):
            continue
        fpath = os.path.join(dir_path, fn)
        mat = mats.get(fn)
        relevant = (fn == "ms.pdf" and filter_type == "mark-scheme") or \
                   (fn == "qp.pdf" and filter_type == "question-paper")
        if mat is None:
            if relevant:
                n_missing_manifest += 1
                failures.append(f"NO MANIFEST ENTRY: {d}/{fn}")
            continue
        if filter_type and mat["type"] != filter_type:
            continue
        digest = sha256_file(fpath)
        if digest != mat["sha256"]:
            n_mismatch += 1
            failures.append(f"SHA MISMATCH: {d}/{fn} got {digest[:12]} want {mat['sha256'][:12]}")
            continue
        if mat["size_bytes"] is not None and os.path.getsize(fpath) != mat["size_bytes"]:
            n_mismatch += 1
            failures.append(f"SIZE MISMATCH: {d}/{fn}")
            continue
        outname = rename(d, fn) if rename else fn
        os.makedirs(dest, exist_ok=True)
        shutil.copy2(fpath, os.path.join(dest, outname))
        n_ok += 1
    return n_ok, n_missing_manifest, n_mismatch


def ms_rename(dirname, fn):
    """9609-S20-QP-11/ms.pdf -> 9609-S20-QP-11__ms.pdf (parser glob 1)."""
    return f"{dirname}__{fn}"


def ext_ms_rename(dirname, fn):
    """9609-W23-QP-21/ms.pdf -> 9609_w23_ms_21.pdf (parser glob 2)."""
    m = re.match(r"9609-([SMW])(\d{2})-QP-(\d{2})$", dirname)
    if not m:
        raise SystemExit(f"FAIL: extension dir name unexpected: {dirname}")
    return f"9609_{m.group(1).lower()}{m.group(2)}_ms_{m.group(3)}.pdf"


def qp_rename(dirname, fn):
    return f"{dirname}__{fn}"


def main():
    main_dirs = set(d for d, _ in paper_dirs(MAIN))
    pp8_dirs = set(d for d, _ in paper_dirs(PP8))
    ext_dirs = pp8_dirs - main_dirs
    print(f"main paper dirs: {len(main_dirs)} | pp8 paper dirs: {len(pp8_dirs)} | extension: {len(ext_dirs)}")

    # 1) held MS from main worktree, verified against in-dir manifests (same blobs as pp8)
    n, nm, nx = verify_and_place(MAIN, f"{OUT}/pp-holdings", rename=ms_rename,
                                 filter_type="mark-scheme")
    print(f"held ms.pdf: ok={n} no_manifest={nm} mismatch={nx}")

    # 2) held QP from /tmp/pp6 (PR6 branch), verified against in-dir manifests
    n, nm, nx = verify_and_place(PP6, f"{OUT}/qp-holdings", rename=qp_rename,
                                 filter_type="question-paper")
    print(f"held qp.pdf (pp6): ok={n} no_manifest={nm} mismatch={nx}")

    # 3) extension MS+QP from /tmp/pp8, verified against in-dir manifests
    ext_paper_dirs = [(d, p) for d, p in paper_dirs(PP8) if d in ext_dirs]
    n = nm = nx = 0
    for d, p in ext_paper_dirs:
        n2, nm2, nx2 = verify_and_place_one(p, p,
                                            f"{OUT}/raw-xt", rename=ext_ms_rename,
                                            filter_type="mark-scheme")
        n += n2; nm += nm2; nx += nx2
    print(f"extension ms.pdf: ok={n} no_manifest={nm} mismatch={nx}")
    n = nm = nx = 0
    for d, p in ext_paper_dirs:
        n2, nm2, nx2 = verify_and_place_one(p, p,
                                            f"{OUT}/qp-holdings", rename=qp_rename,
                                            filter_type="question-paper")
        n += n2; nm += nm2; nx += nx2
    print(f"extension qp.pdf: ok={n} no_manifest={nm} mismatch={nx}")

    # 4) manifests of record alongside
    for tag, src in (("pp6", PP6), ("pp8", PP8)):
        dst = f"{OUT}/manifests/{tag}"
        os.makedirs(dst, exist_ok=True)
        for _, pd in paper_dirs(src):
            mp = os.path.join(pd, "manifest.yaml")
            if os.path.exists(mp):
                shutil.copy2(mp, os.path.join(dst, f"{os.path.basename(pd)}.yaml"))

    print(f"\npp-holdings: {len(os.listdir(f'{OUT}/pp-holdings'))} files")
    print(f"raw-xt: {len(os.listdir(f'{OUT}/raw-xt'))} files")
    print(f"qp-holdings: {len(os.listdir(f'{OUT}/qp-holdings'))} files")
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("\nALL SHA256 VERIFIED against of-record manifests")


if __name__ == "__main__":
    main()
