/**
 * Unified diff 的切分与路径归一（纯函数：零 React、零 IO）。
 *
 * 为什么单独成模块：提交详情要支持「点文件看该文件的 diff」，而一次 `git show` 拿到的是
 * 整包 patch，必须在前端按 `diff --git` 边界切段。切分规则（边界、重命名路径、二进制判定）
 * 是纯逻辑，抽出来才能脱离 DOM 单测；放进组件里就只能靠肉眼看界面。
 *
 * 为什么不改成「点一次查一次 `git show <sha> -- <path>`」：`git show --stat` 把重命名显示成
 * `src/{old => new}.ts`，拿它当 pathspec 必然查不到；带空格/引号的路径同样脆。整包 patch 的
 * `diff --git a/… b/…` 行才是权威来源，按它切分天然免疫这些形态。
 */

export interface PatchSection {
  /** b 侧路径（重命名后的新路径） */
  path: string;
  /** 仅重命名块有值（a 侧旧路径） */
  oldPath?: string;
  /** 该文件的完整补丁块（含 diff --git / index / --- / +++ / hunk 全部行） */
  text: string;
  isBinary: boolean;
  additions: number;
  deletions: number;
}

/**
 * 解析 `diff --git a/<old> b/<new>` 头行。
 *
 * 路径含空格时这行本身是有歧义的（`a/a b.txt b/a b.txt`），所以按**最后一个** ` b/` 切：
 * a 侧取前缀，b 侧取剩余全部——b 侧是我们要的路径，尾部截断不会丢字符。
 */
export function parseDiffGitLine(line: string): { aPath: string; bPath: string } | null {
  if (typeof line !== "string" || line.indexOf("diff --git ") !== 0) return null;
  var rest = line.slice("diff --git ".length);
  var sep = rest.lastIndexOf(" b/");
  if (sep < 0) return null;
  var aPath = rest.slice(0, sep);
  var bPath = rest.slice(sep + 1); // 保留 "b/" 前缀，与 git 输出一致
  if (aPath.indexOf("a/") !== 0) return null;
  return { aPath: aPath.slice(2), bPath: bPath.slice(2) };
}

/** 去掉 git 对特殊路径加的引号（core.quotepath=false 后大多数情况不再出现） */
function unquote(raw: string): string {
  var s = String(raw == null ? "" : raw).trim();
  if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
    return s.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return s;
}

/**
 * 把 `--stat` 里的重命名写法归一成新路径：
 * - `src/{old => new}.ts` → `src/new.ts`
 * - `old/name.ts => new/name.ts` → `new/name.ts`
 * 非重命名原样返回。
 */
export function normalizeRenamePath(raw: string): string {
  var s = unquote(raw);
  if (s.indexOf("=>") < 0) return s;
  var brace = s.match(/^(.*)\{([^{}]*)=>\s*([^{}]*)\}(.*)$/);
  if (brace) {
    var joined = (brace[1] + brace[3] + brace[4]).replace(/\/{2,}/g, "/");
    return joined.replace(/^\s+|\s+$/g, "");
  }
  var parts = s.split("=>");
  return parts[parts.length - 1].replace(/^\s+|\s+$/g, "");
}

/**
 * 按 `diff --git` 边界把整包 patch 切成逐文件块。
 * 首个 `diff --git` 之前的内容（如 `--format=` 漏配时的提交头）直接丢弃：
 * 它们不属于任何文件，混进第一段会污染差异渲染。
 */
export function splitUnifiedPatch(patch: string): PatchSection[] {
  if (typeof patch !== "string" || !patch) return [];
  var lines = patch.split("\n");
  var sections: PatchSection[] = [];
  var buf: string[] = [];
  var current: PatchSection | null = null;

  var flush = function () {
    if (current && buf.length > 0) {
      current.text = buf.join("\n");
      sections.push(current);
    }
    buf = [];
  };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf("diff --git ") === 0) {
      flush();
      var parsed = parseDiffGitLine(line);
      current = {
        path: parsed ? unquote(parsed.bPath) : "",
        oldPath: parsed ? unquote(parsed.aPath) : undefined,
        text: "",
        isBinary: false,
        additions: 0,
        deletions: 0,
      };
      buf.push(line);
      continue;
    }
    if (!current) continue; // 首个 diff --git 之前的头部：丢弃
    buf.push(line);
    if (line.indexOf("rename from ") === 0 && !current.oldPath) {
      current.oldPath = unquote(line.slice("rename from ".length));
    } else if (line.indexOf("rename to ") === 0) {
      current.path = unquote(line.slice("rename to ".length));
    } else if (line.indexOf("+++ b/") === 0 && !current.path) {
      current.path = unquote(line.slice(6));
    } else if (line.indexOf("Binary files ") === 0 || line.indexOf("GIT binary patch") === 0) {
      current.isBinary = true;
    } else if (line.charAt(0) === "+" && line.indexOf("+++") !== 0) {
      current.additions++;
    } else if (line.charAt(0) === "-" && line.indexOf("---") !== 0) {
      current.deletions++;
    }
  }
  flush();
  return sections;
}

/**
 * 在切好的块里找目标文件。
 * 匹配优先级：新路径 → 旧路径 → 归一化后的重命名写法（`--stat` 的原始形态）。
 * 找不到返回 null，由调用方给「该文件在本次提交中无文本差异」的兜底文案。
 */
export function findPatchSection(sections: PatchSection[], targetPath: string): PatchSection | null {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  var target = unquote(targetPath);
  if (!target) return null;
  var want = normalizeRenamePath(target);

  for (var i = 0; i < sections.length; i++) {
    if (sections[i].path === target || sections[i].path === want) return sections[i];
  }
  for (var j = 0; j < sections.length; j++) {
    if (sections[j].oldPath && (sections[j].oldPath === target || sections[j].oldPath === want)) return sections[j];
  }
  return null;
}
