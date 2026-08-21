#!/usr/bin/env python3
"""PR check: fail when changed files (re)introduce the license/copyright headers
that were removed when the server was relicensed to proprietary (#663).

Flags, within the first lines of every file added or modified by the PR:
  - any `SPDX-License-Identifier: AGPL-*` line
  - any `Copyright [year] Daytona Platforms Inc.` line, UNLESS the header also
    carries a non-AGPL SPDX identifier (Apache-2.0 / GPL-2.0 / ISC components
    under libs/common-go, libs/runner-proto and libs/netleash keep theirs)

When run in CI (REPO + PR_NUMBER env vars set) it posts a review with GitHub
"suggested change" comments that delete the offending header block, so authors
can fix the PR with one click. It always exits 1 on violations, whether or not
the suggestions could be posted.

Local usage: check_license_headers.py <file> [<file> ...]
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

COPYRIGHT_RE = re.compile(r"Copyright\s+(?:\(c\)\s*)?(?:\d{4}(?:-\d{4})?\s+)?Daytona\s+Platforms\s+Inc", re.I)
AGPL_RE = re.compile(r"SPDX-License-Identifier:\s*.*AGPL", re.I)
SPDX_RE = re.compile(r"SPDX-License-Identifier:\s*(\S+)", re.I)

# Only the top of the file is scanned; license headers always sit there.
HEAD_SCAN_LINES = 30

# This check's own files mention the forbidden patterns and must not flag themselves.
SELF_PATHS = {
    ".github/workflows/license_check.yaml",
    ".github/scripts/check_license_headers.py",
}

MARKER = "<!-- license-header-check -->"


def find_header_block(lines):
    """Return the 0-based inclusive (start, end) range of a forbidden header
    block to delete, or None when the file is clean."""
    head = lines[:HEAD_SCAN_LINES]
    agpl_hits = [i for i, line in enumerate(head) if AGPL_RE.search(line)]
    copyright_hits = [i for i, line in enumerate(head) if COPYRIGHT_RE.search(line)]
    hits = sorted(set(agpl_hits + copyright_hits))
    if not hits:
        return None
    if not agpl_hits:
        # A Daytona copyright line is allowed when the header declares a
        # non-AGPL license (separately licensed components).
        spdx_ids = [m.group(1) for line in head if (m := SPDX_RE.search(line))]
        if spdx_ids and not any("AGPL" in spdx_id.upper() for spdx_id in spdx_ids):
            return None

    start, end = hits[0], hits[-1]
    first_hit = lines[start].lstrip()
    if first_hit.startswith(("/*", "*")):
        # C-style block comment: expand to the enclosing /* ... */ delimiters.
        while start > 0 and not lines[start].lstrip().startswith("/*"):
            start -= 1
        while end < len(lines) - 1 and "*/" not in lines[end]:
            end += 1
    else:
        # Line comments: absorb adjacent header lines, but never a shebang or
        # unrelated doc comments.
        prefix = "#" if first_hit.startswith("#") else "//"

        def is_header_comment(line):
            stripped = line.strip()
            if stripped == prefix:
                return True
            return stripped.startswith(prefix) and bool(COPYRIGHT_RE.search(stripped) or SPDX_RE.search(stripped))

        while start > 0 and is_header_comment(lines[start - 1]) and not lines[start - 1].startswith("#!"):
            start -= 1
        while end < len(lines) - 1 and is_header_comment(lines[end + 1]):
            end += 1

    # The removed headers were followed by a blank separator line; delete it too.
    if end < len(lines) - 1 and lines[end + 1].strip() == "":
        end += 1
    return start, end


def scan_file(path):
    """Return the violating (start, end) range for a file on disk, or None."""
    file = Path(path)
    if not file.is_file():
        return None
    try:
        text = file.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None  # binary or unreadable file
    return find_header_block(text.splitlines())


def gh_api(endpoint, payload=None):
    cmd = ["gh", "api", endpoint]
    if payload is not None:
        cmd += ["--method", "POST", "--input", "-"]
    result = subprocess.run(
        cmd,
        input=json.dumps(payload).encode() if payload is not None else None,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


def gh_api_paginated(endpoint):
    items, page = [], 1
    while True:
        batch = gh_api(f"{endpoint}?per_page=100&page={page}")
        items.extend(batch)
        if len(batch) < 100:
            return items
        page += 1


def diff_right_lines(patch):
    """Set of new-file line numbers present in the diff (commentable lines)."""
    rights, right = set(), 0
    for line in patch.splitlines():
        if line.startswith("@@"):
            right = int(re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)", line).group(1))
        elif line.startswith("-") or line.startswith("\\"):
            continue
        else:  # added ("+") and context lines both exist on the RIGHT side
            rights.add(right)
            right += 1
    return rights


def build_suggestion_comment(path, start, end):
    comment = {
        "path": path,
        "line": end + 1,
        "side": "RIGHT",
        "body": (
            f"{MARKER}\n"
            "License/copyright headers were removed from this repository when the server "
            "was relicensed (#663) and must not be reintroduced. "
            "Apply this suggestion to remove the header:\n"
            "```suggestion\n```\n"
        ),
    }
    if end > start:
        comment["start_line"] = start + 1
        comment["start_side"] = "RIGHT"
    return comment


def run_ci_check(repo, pr_number):
    changed_files = gh_api_paginated(f"repos/{repo}/pulls/{pr_number}/files")

    violations = []
    for changed in changed_files:
        path = changed["filename"]
        if changed["status"] == "removed" or path in SELF_PATHS:
            continue
        block = scan_file(path)
        if block:
            violations.append((changed, block))

    if not violations:
        print("OK — no reintroduced license headers found")
        return 0

    try:
        existing = gh_api_paginated(f"repos/{repo}/pulls/{pr_number}/comments")
        already_commented = {c["path"] for c in existing if MARKER in c.get("body", "")}
    except subprocess.CalledProcessError:
        already_commented = set()

    comments = []
    for changed, (start, end) in violations:
        path = changed["filename"]
        print(
            f"::error file={path},line={start + 1}::License/copyright header detected "
            f"(lines {start + 1}-{end + 1}). These headers were removed in #663 and must "
            "not be reintroduced — please remove the header."
        )
        if path in already_commented:
            continue
        # Suggestions can only anchor on lines that are part of the diff.
        commentable = diff_right_lines(changed.get("patch") or "")
        if all(line in commentable for line in range(start + 1, end + 2)):
            comments.append(build_suggestion_comment(path, start, end))

    if comments:
        review = {
            "event": "COMMENT",
            "body": (
                f"{MARKER}\n**License header check failed.** This PR reintroduces "
                "license/copyright headers that were removed in #663. Apply the suggested "
                "changes below (or remove the headers manually), then the check will pass."
            ),
            "comments": comments,
        }
        try:
            gh_api(f"repos/{repo}/pulls/{pr_number}/reviews", payload=review)
            print(f"Posted {len(comments)} suggested change(s) on the PR")
        except subprocess.CalledProcessError as error:
            print(f"::warning::Could not post suggested changes: {error.stderr.decode(errors='replace').strip()}")

    return 1


def run_local_check(paths):
    exit_code = 0
    for path in paths:
        block = scan_file(path)
        if block:
            print(f"{path}: forbidden license header on lines {block[0] + 1}-{block[1] + 1}")
            exit_code = 1
        else:
            print(f"{path}: OK")
    return exit_code


def main():
    if len(sys.argv) > 1:
        return run_local_check(sys.argv[1:])
    return run_ci_check(os.environ["REPO"], os.environ["PR_NUMBER"])


if __name__ == "__main__":
    sys.exit(main())
