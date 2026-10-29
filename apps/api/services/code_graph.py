"""Code graph: a map of a project's repository that every run is grounded in.

Building one has two passes:

  1. Deterministic (analyze): read the repo snapshot, group files into
     modules, resolve imports between them (Python, JavaScript/TypeScript,
     Go), and detect the stack, the build/test commands and the entry
     points. No model involved — cheap and exact.
  2. Optional LLM pass (summarize): with the user's own key, write an
     architecture overview and a one-line purpose per module from the
     structure plus the heads of each module's key files.

The snapshot comes from GitHub's tarball endpoint (the org's GitHub token, or
none for public repos) — no clone, nothing written to disk. Runs receive
CODE_MAP.md: the overview plus the part of the graph relevant to their task
(render_for_task).
"""
import asyncio
import io
import json
import logging
import posixpath
import re
import sys
import tarfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.session import AsyncSessionLocal
from models.code_graph import CodeGraph, CodeGraphStatus
from models.project import Project
from models.user import User
from services import ws_manager
from services.github import GITHUB_API, _parse_repo

logger = logging.getLogger(__name__)

# ── Snapshot ──────────────────────────────────────────────────────────────────

SKIP_DIRS = {
    ".git", "node_modules", ".next", "dist", "build", "out", "target", "vendor", ".venv", "venv",
    "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", "coverage", ".turbo",
    ".gradle", ".idea", ".vscode", "bower_components", ".cache", "site-packages", "Pods",
}

LANGUAGES = {
    ".py": "Python", ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
    ".mjs": "JavaScript", ".cjs": "JavaScript", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin",
    ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".swift": "Swift", ".c": "C", ".h": "C", ".cpp": "C++",
    ".hpp": "C++", ".vue": "Vue", ".svelte": "Svelte", ".scala": "Scala", ".ex": "Elixir", ".exs": "Elixir",
    ".dart": "Dart",
}
JS_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte")

MANIFESTS = {
    "package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Gemfile", "pom.xml",
    "build.gradle", "build.gradle.kts", "composer.json", "Makefile", "tsconfig.json", "jsconfig.json",
    "setup.py", "setup.cfg", "pytest.ini",
}

MAX_FILE_BYTES = 400_000
MAX_FILES = 25_000


@dataclass
class Snapshot:
    commit_sha: str | None
    files: dict[str, str]                       # path → text, code files and manifests only
    paths: list[str] = field(default_factory=list)  # every path, for presence checks (lockfiles…)


def _skipped(path: str) -> bool:
    return any(part in SKIP_DIRS for part in path.split("/")[:-1])


def _wanted(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    if name in MANIFESTS or name.startswith("requirements") and name.endswith(".txt"):
        return True
    if path.count("/") == 0 and name.lower().startswith("readme"):
        return True
    return posixpath.splitext(name)[1] in LANGUAGES


def read_tarball(data: bytes) -> tuple[list[str], dict[str, str]]:
    """(all paths, wanted files) from a GitHub tarball; the top-level <owner>-<repo>-<sha>/ dir is stripped."""
    paths: list[str] = []
    files: dict[str, str] = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar:
            if not member.isfile() or "/" not in member.name:
                continue
            path = member.name.split("/", 1)[1]
            if not path or _skipped(path):
                continue
            paths.append(path)
            if len(files) >= MAX_FILES or member.size > MAX_FILE_BYTES or not _wanted(path):
                continue
            handle = tar.extractfile(member)
            raw = handle.read() if handle else b""
            if b"\x00" in raw[:4096]:
                continue  # binary
            files[path] = raw.decode("utf-8", errors="ignore")
    return paths, files


async def fetch_snapshot(repo_url: str, token: str | None, ref: str | None) -> Snapshot:
    owner, repo = _parse_repo(repo_url)
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"token {token}"
    limit = settings.CODE_GRAPH_MAX_ARCHIVE_MB * 1024 * 1024
    async with httpx.AsyncClient(timeout=60, follow_redirects=True, headers=headers) as client:
        sha = None
        if ref:
            resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}/commits/{ref}")
            if resp.status_code == 200:
                sha = resp.json().get("sha")
            elif resp.status_code not in (404, 422):  # a missing branch falls back to the default
                raise RuntimeError(_github_error(resp, owner, repo))
        if sha is None:
            info = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}")
            if info.status_code != 200:
                raise RuntimeError(_github_error(info, owner, repo))
            default = info.json().get("default_branch") or "main"
            resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}/commits/{default}")
            if resp.status_code != 200:
                raise RuntimeError(_github_error(resp, owner, repo))
            sha = resp.json().get("sha")
        buf = bytearray()
        async with client.stream("GET", f"{GITHUB_API}/repos/{owner}/{repo}/tarball/{sha}") as resp:
            if resp.status_code != 200:
                await resp.aread()
                raise RuntimeError(_github_error(resp, owner, repo))
            async for chunk in resp.aiter_bytes():
                buf.extend(chunk)
                if len(buf) > limit:
                    raise RuntimeError(
                        f"Repository archive is larger than {settings.CODE_GRAPH_MAX_ARCHIVE_MB} MB "
                        "(CODE_GRAPH_MAX_ARCHIVE_MB)"
                    )
    paths, files = await asyncio.to_thread(read_tarball, bytes(buf))
    return Snapshot(commit_sha=sha, files=files, paths=paths)


def _github_error(resp: httpx.Response, owner: str, repo: str) -> str:
    if resp.status_code in (401, 403, 404):
        return (f"GitHub returned {resp.status_code} for {owner}/{repo} — for a private repository, "
                "connect a GitHub token with read access under Integrations")
    return f"GitHub returned {resp.status_code} for {owner}/{repo}: {resp.text[:200]}"


# ── Analysis ──────────────────────────────────────────────────────────────────

MAX_MODULES = 60
ROOT = "."


def _code_files(files: dict[str, str]) -> list[str]:
    return sorted(p for p in files if posixpath.splitext(p)[1] in LANGUAGES)


def partition(paths: list[str]) -> dict[str, str]:
    """file → module id. A directory becomes a module unless it is big enough
    to split into its subdirectories; single-child chains (src/main/java/…)
    are walked through. Files directly in a split directory form a module
    named after that directory; root-level files form ROOT."""
    for threshold in (30, 60, 120, 240, 480, 10**9):
        assignment: dict[str, str] = {}
        _split("", paths, threshold, assignment, depth=0)
        if len(set(assignment.values())) <= MAX_MODULES:
            return assignment
    return assignment


def _split(prefix: str, paths: list[str], threshold: int, out: dict[str, str], depth: int) -> None:
    direct, children = [], defaultdict(list)
    for path in paths:
        rest = path[len(prefix):]
        if "/" in rest:
            children[rest.split("/", 1)[0]].append(path)
        else:
            direct.append(path)
    module_id = prefix.rstrip("/") or ROOT
    if prefix and (len(paths) <= threshold or depth >= 5) and not (len(children) == 1 and not direct):
        for path in paths:
            out[path] = module_id
        return
    for path in direct:
        out[path] = module_id
    for name, sub in children.items():
        _split(f"{prefix}{name}/", sub, threshold, out, depth + (0 if len(children) == 1 and not direct else 1))


# Python
_PY_FROM = re.compile(r"^\s*from\s+(\.*[\w.]*)\s+import\s+(\([^)]*\)|[^\n#]+)", re.MULTILINE)
_PY_IMPORT = re.compile(r"^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)", re.MULTILINE)
# JavaScript / TypeScript
_JS_SPEC = re.compile(
    r"""(?:\bimport\s[^'"`;]*?\bfrom\s*|\bexport\s[^'"`;]*?\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"\n]+)['"]"""
)
# Go
_GO_BLOCK = re.compile(r"^import\s*\(([^)]*)\)", re.MULTILINE)
_GO_SINGLE = re.compile(r'^import\s+(?:[\w.]+\s+)?"([^"]+)"', re.MULTILINE)
_GO_PATH = re.compile(r'"([^"]+)"')

_PY_STDLIB = set(getattr(sys, "stdlib_module_names", ())) | {"__future__"}


class _Resolver:
    def __init__(self, files: dict[str, str], code: list[str]):
        self.files = files
        self.code_set = set(code)
        # Python: every dotted suffix of every module path → files
        self.py_index: dict[str, list[str]] = defaultdict(list)
        for path in code:
            if not path.endswith(".py"):
                continue
            parts = path[:-3].split("/")
            if parts[-1] == "__init__":
                parts = parts[:-1]
            for i in range(len(parts)):
                self.py_index[".".join(parts[i:])].append(path)
        # JS: tsconfig/jsconfig path aliases and workspace package names
        self.js_aliases: dict[str, list[tuple[str, list[str], str]]] = {}
        self.js_packages: dict[str, str] = {}
        for path, text in files.items():
            name = path.rsplit("/", 1)[-1]
            base = posixpath.dirname(path)
            if name in ("tsconfig.json", "jsconfig.json"):
                opts = (_loose_json(text) or {}).get("compilerOptions") or {}
                root = posixpath.normpath(posixpath.join(base, opts.get("baseUrl") or "."))
                aliases = []
                for pattern, targets in (opts.get("paths") or {}).items():
                    if isinstance(targets, list):
                        aliases.append((pattern, [str(t) for t in targets], root))
                self.js_aliases[base] = aliases + [("*", ["*"], root)] if opts.get("baseUrl") else aliases
            elif name == "package.json":
                pkg_name = (_loose_json(text) or {}).get("name")
                if isinstance(pkg_name, str) and pkg_name:
                    self.js_packages[pkg_name] = base
        # Go: module path → directory
        self.go_modules: dict[str, str] = {}
        for path, text in files.items():
            if path.rsplit("/", 1)[-1] == "go.mod":
                m = re.search(r"^module\s+(\S+)", text, re.MULTILINE)
                if m:
                    self.go_modules[m.group(1)] = posixpath.dirname(path)
        self.go_dirs: dict[str, list[str]] = defaultdict(list)
        for path in code:
            if path.endswith(".go"):
                self.go_dirs[posixpath.dirname(path)].append(path)

    # → (internal target files, external package names)
    def resolve(self, path: str) -> tuple[list[str], list[str]]:
        text = self.files.get(path, "")
        if path.endswith(".py"):
            return self._python(path, text)
        if path.endswith(JS_EXTS):
            return self._js(path, text)
        if path.endswith(".go"):
            return self._go(text)
        return [], []

    def _closest(self, candidates: list[str], near: str) -> str:
        return max(candidates, key=lambda c: (len(posixpath.commonprefix([c, near])), -len(c)))

    def _py_lookup(self, dotted: str, near: str) -> str | None:
        hits = self.py_index.get(dotted)
        return self._closest(hits, near) if hits else None

    def _python(self, path: str, text: str) -> tuple[list[str], list[str]]:
        internal, external = [], []
        pkg_dir = posixpath.dirname(path)
        for module, names in _PY_FROM.findall(text):
            dots = len(module) - len(module.lstrip("."))
            module = module.lstrip(".")
            imported = [n.split()[0] for n in names.strip("()").replace("\n", ",").split(",")
                        if n.strip() and n.split()[0] not in ("*", "\\")]
            if dots:
                base = pkg_dir
                for _ in range(dots - 1):
                    base = posixpath.dirname(base)
                stem = posixpath.join(base, *module.split(".")) if module else base
                hits = [h for h in (f"{stem}.py", f"{stem}/__init__.py") if h in self.code_set]
                hits += [f"{stem}/{n}.py" for n in imported if f"{stem}/{n}.py" in self.code_set]
                internal.extend(hits)
                continue
            if module.split(".")[0] in _PY_STDLIB:
                continue
            found = [self._py_lookup(f"{module}.{n}", path) for n in imported]
            found = [f for f in found if f] or [self._py_lookup(module, path)]
            if found and found[0]:
                internal.extend(f for f in found if f)
            elif module.split(".")[0] not in _PY_STDLIB:
                external.append(module.split(".")[0])
        for group in _PY_IMPORT.findall(text):
            for module in (m.strip() for m in group.split(",")):
                parts = module.split(".")
                if parts[0] in _PY_STDLIB:
                    continue
                hit = next((self._py_lookup(".".join(parts[:i]), path) for i in range(len(parts), 0, -1)
                            if self._py_lookup(".".join(parts[:i]), path)), None)
                if hit:
                    internal.append(hit)
                elif parts[0] not in _PY_STDLIB:
                    external.append(parts[0])
        return internal, external

    def _js_file(self, stem: str) -> str | None:
        stem = posixpath.normpath(stem)
        if stem in self.code_set:
            return stem
        for ext in JS_EXTS:
            if f"{stem}{ext}" in self.code_set:
                return f"{stem}{ext}"
        for ext in JS_EXTS:
            if f"{stem}/index{ext}" in self.code_set:
                return f"{stem}/index{ext}"
        if stem.endswith(".js"):  # TS ESM imports name the emitted .js file
            return self._js_file(stem[:-3])
        return None

    def _js_aliases_for(self, path: str):
        d = posixpath.dirname(path)
        while True:
            if d in self.js_aliases:
                return self.js_aliases[d]
            if not d:
                return []
            d = posixpath.dirname(d)

    def _js(self, path: str, text: str) -> tuple[list[str], list[str]]:
        internal, external = [], []
        for spec in _JS_SPEC.findall(text):
            if spec.startswith("."):
                hit = self._js_file(posixpath.join(posixpath.dirname(path), spec))
                if hit:
                    internal.append(hit)
                continue
            hit = None
            for pattern, targets, root in self._js_aliases_for(path):
                prefix = pattern[:-1] if pattern.endswith("*") else pattern
                if not (spec.startswith(prefix) if pattern.endswith("*") else spec == pattern):
                    continue
                rest = spec[len(prefix):]
                for target in targets:
                    hit = self._js_file(posixpath.join(root, target.replace("*", rest)))
                    if hit:
                        break
                if hit:
                    break
            if not hit:
                pkg = "/".join(spec.split("/")[:2]) if spec.startswith("@") else spec.split("/")[0]
                if pkg in self.js_packages:
                    sub = spec[len(pkg):].lstrip("/")
                    base = self.js_packages[pkg]
                    hit = self._js_file(posixpath.join(base, sub or "index")) \
                        or self._js_file(posixpath.join(base, "src", sub or "index"))
                if not hit and pkg and not spec.startswith(("node:", "http:", "https:", "@/", "~/", "#")):
                    external.append(pkg)
            if hit:
                internal.append(hit)
        return internal, external

    def _go(self, text: str) -> tuple[list[str], list[str]]:
        specs = _GO_SINGLE.findall(text)
        for block in _GO_BLOCK.findall(text):
            specs += _GO_PATH.findall(block)
        internal, external = [], []
        for spec in specs:
            module = next((m for m in self.go_modules if spec == m or spec.startswith(m + "/")), None)
            if module is None:
                if "." in spec.split("/")[0]:
                    external.append("/".join(spec.split("/")[:3]))
                continue
            d = posixpath.normpath(posixpath.join(self.go_modules[module], spec[len(module):].lstrip("/")))
            internal.extend(self.go_dirs.get("" if d == "." else d, []))
        return internal, external


def _loose_json(text: str) -> dict | None:
    """JSON with // and /* */ comments and trailing commas (tsconfig style)."""
    for candidate in (text, _strip_jsonc(text)):
        try:
            data = json.loads(candidate)
            return data if isinstance(data, dict) else None
        except (json.JSONDecodeError, ValueError):
            continue
    return None


def _strip_jsonc(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    text = re.sub(r"(^|[\s,{\[])//[^\n]*", r"\1", text)
    return re.sub(r",(\s*[}\]])", r"\1", text)


# Stack detection: dependency name → label
_JS_STACK = {
    "next": "Next.js", "react": "React", "vue": "Vue", "svelte": "Svelte", "@angular/core": "Angular",
    "express": "Express", "fastify": "Fastify", "@nestjs/core": "NestJS", "prisma": "Prisma",
    "@prisma/client": "Prisma", "typeorm": "TypeORM", "drizzle-orm": "Drizzle", "tailwindcss": "Tailwind CSS",
    "vitest": "Vitest", "jest": "Jest", "@playwright/test": "Playwright", "electron": "Electron",
    "react-native": "React Native", "vite": "Vite", "typescript": "TypeScript", "@tanstack/react-query": "TanStack Query",
}
_PY_STACK = {
    "fastapi": "FastAPI", "django": "Django", "flask": "Flask", "sqlalchemy": "SQLAlchemy", "alembic": "Alembic",
    "pydantic": "Pydantic", "celery": "Celery", "pytest": "pytest", "pandas": "pandas", "torch": "PyTorch",
    "anthropic": "Anthropic SDK", "openai": "OpenAI SDK",
}
_OTHER_STACK = {
    "go.mod": "Go", "Cargo.toml": "Rust", "Gemfile": "Ruby", "pom.xml": "Maven", "build.gradle": "Gradle",
    "build.gradle.kts": "Gradle", "composer.json": "PHP Composer",
}
_SCRIPT_NAMES = ("test", "lint", "typecheck", "type-check", "build", "dev", "start")
_MAKE_TARGETS = {"test", "lint", "check", "build", "dev", "run", "up", "fmt", "format"}

_ENTRY_NAMES = {
    "main.py", "app.py", "manage.py", "wsgi.py", "asgi.py", "__main__.py", "server.ts", "server.js",
    "main.ts", "main.go", "main.rs", "layout.tsx", "_app.tsx", "index.html",
}


def _js_runner(dir_: str, paths: set[str]) -> str:
    def has(name: str) -> bool:
        d = dir_
        while True:
            if posixpath.join(d, name) in paths or (not d and name in paths):
                return True
            if not d:
                return False
            d = posixpath.dirname(d)
    if has("pnpm-lock.yaml"):
        return "pnpm"
    if has("yarn.lock"):
        return "yarn"
    if has("bun.lockb") or has("bun.lock"):
        return "bun"
    return "npm"


def _stack_and_commands(files: dict[str, str], all_paths: set[str]) -> tuple[list[str], list[dict]]:
    stack: list[str] = []
    commands: list[dict] = []

    def add(label: str) -> None:
        if label not in stack:
            stack.append(label)

    for path in sorted(files):
        name = path.rsplit("/", 1)[-1]
        cwd = posixpath.dirname(path) or ROOT
        text = files[path]
        if name == "package.json":
            data = _loose_json(text) or {}
            deps = {**(data.get("dependencies") or {}), **(data.get("devDependencies") or {})}
            for dep, label in _JS_STACK.items():
                if dep in deps:
                    add(label)
            runner = _js_runner(posixpath.dirname(path), all_paths)
            for script in _SCRIPT_NAMES:
                if script in (data.get("scripts") or {}):
                    run = f"{runner} test" if script == "test" else f"{runner} run {script}"
                    commands.append({"cwd": cwd, "name": "typecheck" if script == "type-check" else script,
                                     "run": run})
        elif name in ("pyproject.toml", "setup.py", "setup.cfg", "pytest.ini") \
                or name.startswith("requirements") and name.endswith(".txt"):
            lowered = text.lower()
            add("Python")
            for dep, label in _PY_STACK.items():
                if re.search(rf"(^|[\s\"'\[,]){re.escape(dep)}([\s<>=~!\"'\],;\[]|$)", lowered, re.MULTILINE):
                    add(label)
            has_tests = "pytest" in lowered or name == "pytest.ini" \
                or any(p.startswith(f"{posixpath.dirname(path)}/tests/".lstrip("/")) for p in all_paths)
            if has_tests and not any(c["cwd"] == cwd and c["name"] == "test" for c in commands):
                commands.append({"cwd": cwd, "name": "test", "run": "pytest -q"})
            if re.search(r"(^|[\s\"'\[,])ruff([\s<>=~!\"'\],;\[]|$)|\[tool\.ruff", lowered, re.MULTILINE) \
                    and not any(c["cwd"] == cwd and c["name"] == "lint" for c in commands):
                commands.append({"cwd": cwd, "name": "lint", "run": "ruff check ."})
        elif name in _OTHER_STACK:
            add(_OTHER_STACK[name])
            if name == "go.mod":
                commands += [{"cwd": cwd, "name": "test", "run": "go test ./..."},
                             {"cwd": cwd, "name": "build", "run": "go build ./..."}]
            elif name == "Cargo.toml":
                commands += [{"cwd": cwd, "name": "test", "run": "cargo test"},
                             {"cwd": cwd, "name": "build", "run": "cargo build"}]
        elif name == "Makefile":
            for target in re.findall(r"^([A-Za-z][\w-]*)\s*:(?!=)", text, re.MULTILINE):
                if target in _MAKE_TARGETS and not any(c["run"] == f"make {target}" and c["cwd"] == cwd
                                                       for c in commands):
                    commands.append({"cwd": cwd, "name": target, "run": f"make {target}"})
    if any(p.rsplit("/", 1)[-1] == "Dockerfile" for p in all_paths):
        add("Docker")
    if any(re.search(r"(^|/)(docker-)?compose[\w.-]*\.ya?ml$", p) for p in all_paths):
        add("Docker Compose")
    if any(p.startswith(".github/workflows/") for p in all_paths):
        add("GitHub Actions")
    return stack, commands


def analyze(files: dict[str, str], all_paths: list[str] | None = None) -> dict:
    """Deterministic graph of a repository snapshot (see module docstring)."""
    code = _code_files(files)
    paths_set = set(all_paths or files)
    module_of = partition(code)
    resolver = _Resolver(files, code)

    lines = {p: files[p].count("\n") + 1 for p in code}
    edge_weight: Counter = Counter()
    inbound: Counter = Counter()
    externals: dict[str, Counter] = defaultdict(Counter)
    for path in code:
        internal, external = resolver.resolve(path)
        for target in set(internal):
            if target == path or target not in module_of:
                continue
            inbound[target] += 1
            src, dst = module_of[path], module_of[target]
            if src != dst:
                edge_weight[(src, dst)] += 1
        for pkg in set(external):
            externals[module_of[path]][pkg] += 1

    by_module: dict[str, list[str]] = defaultdict(list)
    for path, module in module_of.items():
        by_module[module].append(path)
    entry_points = sorted(p for p in code if p.rsplit("/", 1)[-1] in _ENTRY_NAMES
                          or re.search(r"(^|/)cmd/[^/]+/main\.go$", p))[:20]

    modules = []
    for module_id in sorted(by_module):
        members = by_module[module_id]
        langs = Counter(LANGUAGES[posixpath.splitext(p)[1]] for p in members)
        key_files = sorted(members, key=lambda p: (-(p in entry_points), -inbound[p], -lines[p], p))[:5]
        modules.append({
            "id": module_id,
            "label": "root files" if module_id == ROOT else module_id.rsplit("/", 1)[-1],
            "files": len(members),
            "lines": sum(lines[p] for p in members),
            "languages": [lang for lang, _ in langs.most_common(3)],
            "key_files": key_files,
            "externals": [pkg for pkg, _ in externals[module_id].most_common(8)],
            # Words from every file path in the module, for matching tasks to modules
            "words": sorted(set().union(*(_tokens(posixpath.splitext(p[len(module_id):])[0]) for p in members)))[:300],
            "purpose": "",
        })

    languages = Counter()
    for path in code:
        languages[LANGUAGES[posixpath.splitext(path)[1]]] += lines[path]
    stack, commands = _stack_and_commands(files, paths_set)
    for lang, _ in languages.most_common(4):
        if lang not in stack:
            stack.append(lang)
    return {
        "version": 1,
        "stats": {"files": len(code), "lines": sum(lines.values()), "languages": dict(languages.most_common())},
        "stack": stack,
        "commands": commands,
        "entry_points": entry_points,
        "modules": modules,
        "edges": [{"source": s, "target": t, "weight": w} for (s, t), w in sorted(edge_weight.items())],
    }


def gate_commands(graph: dict | None) -> list[dict]:
    """The commands named 'test', used by the runtime's test gate."""
    return [c for c in (graph or {}).get("commands") or [] if c.get("name") == "test"]


# ── LLM summary ───────────────────────────────────────────────────────────────

SUMMARY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["overview", "modules"],
    "properties": {
        "overview": {"type": "string"},
        "modules": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["id", "purpose"],
            "properties": {"id": {"type": "string"}, "purpose": {"type": "string"}}}},
    },
}

_SUMMARY_BUDGET = 60_000


def summary_prompt(graph: dict, files: dict[str, str]) -> str:
    readme = next((files[p] for p in sorted(files) if "/" not in p and p.lower().startswith("readme")), "")
    edges = "\n".join(f"- {e['source']} → {e['target']} ({e['weight']} imports)"
                      for e in sorted(graph["edges"], key=lambda e: -e["weight"])[:80])
    parts = [
        "Describe the architecture of this repository for engineers about to work on it.\n\n"
        "Write `overview` as markdown, at most ~250 words: what the system does, its main parts and "
        "how they talk to each other, where requests/data flow, and conventions worth knowing. For each "
        "module id listed below, write `purpose`: one plain sentence on what it is responsible for. "
        "Only state what the material shows; say 'unclear' rather than guess.\n",
        f"## Stack\n{', '.join(graph['stack']) or 'unknown'}",
        "## Commands\n" + ("\n".join(f"- ({c['cwd']}) {c['run']}" for c in graph["commands"]) or "- none found"),
        f"## Module dependencies\n{edges or '- none detected'}",
        f"## README (excerpt)\n{readme[:3000] or 'none'}",
        "## Modules",
    ]
    used = sum(len(p) for p in parts)
    for module in sorted(graph["modules"], key=lambda m: -m["lines"]):
        block = [f"### {module['id']} ({module['files']} files, {', '.join(module['languages'])})"]
        for path in module["key_files"][:2]:
            head = "\n".join(files.get(path, "").splitlines()[:30])
            block.append(f"`{path}`\n```\n{head}\n```")
        text = "\n".join(block)
        if used + len(text) > _SUMMARY_BUDGET:
            text = block[0]
        parts.append(text)
        used += len(text)
    return "\n\n".join(parts)


def fallback_overview(graph: dict) -> str:
    """A plain description from the structure alone, when no LLM key is set."""
    stats = graph["stats"]
    total = sum(stats["languages"].values()) or 1
    langs = ", ".join(f"{lang} {round(n * 100 / total)}%" for lang, n in list(stats["languages"].items())[:4])
    used_by = Counter()
    for edge in graph["edges"]:
        used_by[edge["target"]] += edge["weight"]
    core = ", ".join(f"`{m}`" for m, _ in used_by.most_common(4)) or "none detected"
    largest = ", ".join(f"`{m['id']}`" for m in sorted(graph["modules"], key=lambda m: -m["lines"])[:4])
    return (
        f"{stats['files']} source files, {stats['lines']:,} lines ({langs or 'no recognised languages'}), "
        f"in {len(graph['modules'])} modules.\n\n"
        f"- **Stack:** {', '.join(graph['stack']) or 'not detected'}\n"
        f"- **Most depended-on modules:** {core}\n"
        f"- **Largest modules:** {largest or 'none'}\n"
        f"- **Entry points:** {', '.join(f'`{p}`' for p in graph['entry_points'][:6]) or 'none detected'}\n\n"
        "_Structure only — add an API key in Settings and rebuild for an architecture overview._"
    )


async def summarize(graph: dict, files: dict[str, str], keys: dict, model: str):
    """(overview markdown, LLMResult | None). Fills module purposes in place."""
    from services.agent import _parse_json_object
    from services.llm import call_llm, pick_provider

    provider = pick_provider(keys, model)
    if provider is None:
        return fallback_overview(graph), None
    try:
        result = await call_llm(provider, model, keys, summary_prompt(graph, files), max_tokens=8000,
                                json_schema=SUMMARY_SCHEMA, effort="low",
                                system="You are a staff engineer documenting an unfamiliar codebase.")
    except Exception as exc:
        logger.warning("Code graph summary failed: %s", exc)
        return fallback_overview(graph), None
    data = _parse_json_object(result.text) or {}
    purposes = {m.get("id"): str(m.get("purpose") or "").strip()
                for m in data.get("modules") or [] if isinstance(m, dict)}
    for module in graph["modules"]:
        module["purpose"] = purposes.get(module["id"], "")[:300]
    overview = str(data.get("overview") or "").strip()
    return (overview or fallback_overview(graph)), result


# ── Build ─────────────────────────────────────────────────────────────────────

_building: set[str] = set()


async def get_for_project(db: AsyncSession, project_id: str) -> CodeGraph | None:
    return (await db.execute(select(CodeGraph).where(CodeGraph.project_id == project_id))).scalar_one_or_none()


async def mark_pending(db: AsyncSession, project: Project) -> CodeGraph:
    row = await get_for_project(db, project.id)
    if row is None:
        row = CodeGraph(project_id=project.id)
        db.add(row)
    row.status = CodeGraphStatus.pending
    row.error = None
    row.repo_url = project.repo_url
    await db.flush()
    return row


async def build(project_id: str, user_id: str) -> None:
    """Background job: snapshot → analyze → summarize → store. Never raises."""
    if project_id in _building:
        return
    _building.add(project_id)
    try:
        await _build(project_id, user_id)
    except Exception as exc:  # keep the background task quiet; the row carries the error
        logger.exception("Code graph build failed for project %s", project_id)
        async with AsyncSessionLocal() as db:
            row = await get_for_project(db, project_id)
            if row:
                row.status = CodeGraphStatus.failed
                row.error = str(exc)[:2000]
                await db.commit()
        await ws_manager.broadcast(project_id, {"type": "code_graph.updated", "status": "failed"})
    finally:
        _building.discard(project_id)


async def _build(project_id: str, user_id: str) -> None:
    from services.issues import github_token
    from services.llm import resolve_model
    from services.token_usage import record_usage
    from services.users import get_plain_keys

    async with AsyncSessionLocal() as db:
        project = await db.get(Project, project_id)
        if project is None or not project.repo_url:
            return
        row = await get_for_project(db, project_id) or await mark_pending(db, project)
        row.status = CodeGraphStatus.building
        row.error = None
        await db.commit()
        repo_url, ref, org_id = project.repo_url, project.default_branch, project.organization_id
        model = resolve_model(project=project)
        token = await github_token(db, org_id)
        user = await db.get(User, user_id)
        keys = get_plain_keys(user) if user else {}
    await ws_manager.broadcast(project_id, {"type": "code_graph.updated", "status": "building"})

    snapshot = await fetch_snapshot(repo_url, token, ref)
    graph = await asyncio.to_thread(analyze, snapshot.files, snapshot.paths)
    overview, usage = await summarize(graph, snapshot.files, keys, model)

    async with AsyncSessionLocal() as db:
        row = await get_for_project(db, project_id)
        if row is None:
            return  # project deleted meanwhile
        row.status = CodeGraphStatus.ready
        row.repo_url, row.ref, row.commit_sha = repo_url, ref, snapshot.commit_sha
        row.graph = graph
        row.summary_markdown = overview
        row.error = None
        row.built_at = datetime.now(timezone.utc)
        if usage:
            await record_usage(db, model=usage.model, tokens_in=usage.tokens_in, tokens_out=usage.tokens_out,
                               user_id=user_id, organization_id=org_id)
        await db.commit()
    await ws_manager.broadcast(project_id, {"type": "code_graph.updated", "status": "ready"})


def schedule_build(project_id: str, user_id: str) -> None:
    asyncio.get_running_loop().create_task(build(project_id, user_id))


# ── Per-task context ──────────────────────────────────────────────────────────

_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "when", "then", "into", "should", "must", "will",
    "have", "has", "are", "was", "not", "but", "can", "add", "use", "new", "all", "any", "each", "user",
    "users", "given", "page", "make", "able", "show", "shows", "via", "src", "app", "apps", "lib", "index",
    "main", "test", "tests", "file", "files", "code",
}
_MAP_BUDGET = 12_000


def _tokens(text: str) -> set[str]:
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text or "")
    return {w for w in re.split(r"[^a-z0-9]+", text.lower()) if len(w) >= 3 and w not in _STOPWORDS}


def relevant_modules(graph: dict, text: str, limit: int = 5) -> list[str]:
    """Modules a task most likely touches: matching words and named paths, plus neighbours."""
    words = _tokens(text)
    lowered = (text or "").lower()
    scores: Counter = Counter()
    for module in graph.get("modules") or []:
        id_words = _tokens(module["id"].replace("/", " "))
        other_words = set(module.get("words") or []) | _tokens(module.get("purpose", ""))
        score = 3 * len(words & id_words) + len(words & other_words)
        if module["id"] != ROOT and module["id"].lower() in lowered:
            score += 10
        if score:
            scores[module["id"]] = score
    picked = [m for m, _ in scores.most_common(limit)]
    if not picked:
        used_by = Counter()
        for edge in graph.get("edges") or []:
            used_by[edge["target"]] += edge["weight"]
        return [m for m, _ in used_by.most_common(limit)]
    neighbours = []
    for edge in sorted(graph.get("edges") or [], key=lambda e: -e["weight"]):
        for a, b in ((edge["source"], edge["target"]), (edge["target"], edge["source"])):
            if a in picked and b not in picked and b not in neighbours:
                neighbours.append(b)
    return picked + neighbours[:3]


def render_for_task(row: CodeGraph, task_text: str, knowledge: list | None = None) -> str:
    """CODE_MAP.md for one run: overview, stack, commands, the relevant subgraph,
    decisions that mention it, and a compact index of every module."""
    graph = row.graph or {}
    modules = {m["id"]: m for m in graph.get("modules") or []}
    depends: dict[str, list[str]] = defaultdict(list)
    used_by: dict[str, list[str]] = defaultdict(list)
    for edge in sorted(graph.get("edges") or [], key=lambda e: -e["weight"]):
        depends[edge["source"]].append(edge["target"])
        used_by[edge["target"]].append(edge["source"])

    built = row.built_at.strftime("%Y-%m-%d") if row.built_at else "unknown date"
    out = [
        f"# Code map\n\nRepository {row.repo_url or ''} at `{(row.commit_sha or '')[:7]}` (mapped {built}). "
        "Generated from the repository structure; verify against the code before relying on a detail.",
        f"## Overview\n\n{row.summary_markdown or 'No overview.'}",
        f"## Stack\n\n{', '.join(graph.get('stack') or []) or 'Not detected.'}",
        "## Commands\n\n" + ("\n".join(f"- `{c['run']}` in `{c['cwd']}` ({c['name']})"
                                     for c in graph.get("commands") or []) or "None detected."),
    ]
    relevant = [m for m in relevant_modules(graph, task_text) if m in modules]
    if relevant:
        section = ["## Modules this task likely touches"]
        for module_id in relevant:
            m = modules[module_id]
            section.append(
                f"### `{module_id}`{' — ' + m['purpose'] if m.get('purpose') else ''}\n"
                f"- {m['files']} files, {', '.join(m.get('languages') or [])}\n"
                f"- Key files: {', '.join(f'`{p}`' for p in m.get('key_files') or []) or 'none'}\n"
                f"- Depends on: {', '.join(f'`{d}`' for d in depends[module_id][:6]) or 'nothing internal'}\n"
                f"- Used by: {', '.join(f'`{u}`' for u in used_by[module_id][:6]) or 'nothing internal'}"
                + (f"\n- External packages: {', '.join(m['externals'][:6])}" if m.get("externals") else "")
            )
        out.append("\n\n".join(section))
        related = [e for e in knowledge or []
                   if any(module_id != ROOT and module_id in f"{e.title}\n{e.body_markdown}" for module_id in relevant)]
        if related:
            from services.sdlc import knowledge_label
            out.append("## Decisions and patterns that mention these modules\n\n"
                       + "\n".join(f"- {knowledge_label(e)}: {e.title}" for e in related[:10]))
    index = ["## All modules\n\n| Module | Files | Purpose |\n|---|---|---|"]
    for module_id, m in modules.items():
        index.append(f"| `{module_id}` | {m['files']} | {(m.get('purpose') or '').replace('|', '/')} |")
    out.append("\n".join(index))
    text = "\n\n".join(out) + "\n"
    if len(text) > _MAP_BUDGET:
        text = text[:_MAP_BUDGET].rsplit("\n", 1)[0] + "\n\n_(truncated)_\n"
    return text
