#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export GIT_AUTHOR_NAME="tzlwn1"
export GIT_AUTHOR_EMAIL="tzlwn1@users.noreply.github.com"
export GIT_COMMITTER_NAME="tzlwn1"
export GIT_COMMITTER_EMAIL="tzlwn1@users.noreply.github.com"
git config user.name "${GIT_AUTHOR_NAME}"
git config user.email "${GIT_AUTHOR_EMAIL}"

ADVANCE_YEARS=10

while IFS=$'\t' read -r branch seed; do
  echo "==> 时间线 branch=${branch} seed=${seed}"

  if git show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git fetch origin "${branch}"
    git checkout -B "${branch}" "origin/${branch}"
  elif git show-ref --verify --quiet "refs/heads/${branch}"; then
    git checkout "${branch}"
  else
    git checkout -B "${branch}"
  fi

  for ((i = 1; i <= ADVANCE_YEARS; i += 1)); do
    line="$(npx tsx engine/advance-cli.ts --years=1 --seed="${seed}" --json-lines | grep '^{' | tail -n 1)"
    if [[ -z "${line}" ]]; then
      echo "第 ${i} 年推进无 JSON 输出，中止"
      exit 1
    fi
    headline="$(node -p "JSON.parse(process.argv[1]).headline" "${line}")"
    git add -A
    if git diff --staged --quiet; then
      echo "第 ${i} 年无变更，跳过提交"
      continue
    fi
    git -c trailer.ifexists=doNothing commit -m "${headline}"

    tag_name="$(node -p "const j=JSON.parse(process.argv[1]); j.tag?j.tag.name:''" "${line}")"
    if [[ -n "${tag_name}" ]]; then
      tag_msg="$(node -p "JSON.parse(process.argv[1]).tag.message" "${line}")"
      if ! git rev-parse "${tag_name}" >/dev/null 2>&1; then
        git tag -a "${tag_name}" -m "${tag_msg}"
      fi
    fi
  done

  git push origin "${branch}"
  git push origin --tags
done < <(node --import tsx -e "
import { loadTimelines } from './engine/timelines.ts';
for (const t of loadTimelines(process.cwd()).filter((x) => x.active)) {
  process.stdout.write(t.branch + '\t' + t.seed + '\n');
}
")
