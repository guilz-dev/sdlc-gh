"""Harness convention compliance and regression checks."""

from pathlib import Path
import re


ROOT = Path(".")


def read(path: str) -> str:
    return (ROOT / path).read_text()


def parse_frontmatter(path: str) -> tuple[dict[str, str], str]:
    text = read(path)
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    assert match, f"{path} missing YAML frontmatter"
    frontmatter = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            frontmatter[key.strip()] = value.strip().strip('"')
    return frontmatter, match.group(2)


def test_agents_have_frontmatter_and_expected_tools():
    expected = {
        "implementer.agent.md": {"read", "edit", "search", "execute"},
        "reviewer.agent.md": {"read", "search"},
        "triager.agent.md": {"read"},
    }
    for filename, tools in expected.items():
        fm, _ = parse_frontmatter(f".github/agents/{filename}")
        assert fm["name"]
        tool_values = set(re.findall(r'"([^"]+)"', fm["tools"]))
        assert tool_values == tools


def test_issue_template_requires_acceptance_criteria_and_no_fixed_labels():
    text = read(".github/ISSUE_TEMPLATE/task.yml")
    assert "id: acceptance_criteria" in text
    assert "id: goal" in text
    assert "id: rollback_hints" in text
    assert "type: textarea" in text
    assert re.search(r"id: acceptance_criteria.*?required: true", text, re.S)
    assert "labels:" not in text


def test_pr_template_has_harness_context_and_rollback():
    text = read(".github/pull_request_template.md")
    assert "## Harness context" in text
    assert "## Rollback" in text
    assert "## Goal implemented" in text
    assert "Trace link" in text


def test_change_size_limits_align_between_docs_and_gate():
    operations = read("docs/operations.md")
    gate = read("scripts/lib/diff-size.mjs")
    agents = read("AGENTS.md")
    copilot = read(".github/copilot-instructions.md")

    expected = {"L1": ("300", "8"), "L2": ("120", "4"), "L3": ("60", "2")}
    for level, (loc, files) in expected.items():
        assert f"| {level} | {loc} | {files} |" in operations
        assert f"{level}: {{ loc: {loc}, files: {files} }}" in gate
        assert f"- {level}: max {loc} LOC, {files} files" in copilot
    assert "| `docs` | L3 | 60 | 2 |" in agents
    assert "| `test-fix` | L2 | 120 | 4 |" in agents
    assert "| `feature-small` | L1 | 300 | 8 |" in agents


def test_telemetry_required_fields_align_with_validator():
    schema = read("docs/telemetry-schema.md")
    lib = read("scripts/lib/telemetry-artifact.mjs")
    required = re.findall(r"^\| `([^`]+)` \|", schema, re.M)
    match = re.search(r"export const TELEMETRY_REQUIRED_FIELDS = \[([\s\S]*?)\];", lib)
    assert match, "TELEMETRY_REQUIRED_FIELDS not found in telemetry-artifact.mjs"
    validator_fields = re.findall(r'"([^"]+)"', match.group(1))
    assert set(required) == set(validator_fields)


def test_retry_policy_matches_operations_doc():
    operations = read("docs/operations.md")
    orchestrator = read(".github/workflows/agent-retry-orchestrator.yml")
    assert "Max retries `N` | 3" in operations
    assert "const MAX_RETRIES = 3;" in orchestrator
    assert "Same failure signature | Stop after 2 consecutive identical" in operations
    assert "Same failure signature detected twice" in orchestrator


def test_gh_aw_dogfood_label_and_doc():
    labels = read(".github/labels.yml")
    assert "task:gh-aw-dogfood" in labels
    dogfood = read("docs/gh-aw-dogfood.md")
    assert "task:gh-aw-dogfood" in dogfood
    assert "nightly-harness-review.yml" in dogfood


def test_harness_review_classes_align_with_failure_taxonomy():
    taxonomy = read("docs/failure-taxonomy.md")
    lib = read("scripts/lib/harness-review.mjs")
    match = re.search(r"export const FAILURE_CLASSES = \[([\s\S]*?)\];", lib)
    assert match, "FAILURE_CLASSES not found in harness-review.mjs"
    classes = re.findall(r'"([^"]+)"', match.group(1))
    for label in ("FF不足", "壁不足", "モデル限界"):
        assert label in taxonomy
        assert label in classes
    assert "unclassified" in classes


def test_telemetry_fetch_workflows_align_with_emitters():
    fetch = read("scripts/fetch-telemetry-artifacts.mjs")
    docs = read("docs/telemetry-artifacts.md")
    bootstrap = read("scripts/bootstrap-harness.sh")
    workflows = re.findall(r'workflow: "([^"]+\.yml)"', fetch)
    assert workflows, "TELEMETRY_WORKFLOWS missing in fetch-telemetry-artifacts.mjs"
    for wf in workflows:
        assert (ROOT / ".github/workflows" / wf).is_file(), f"missing emitter workflow {wf}"
        assert wf in bootstrap, f"bootstrap-harness.sh does not copy {wf}"
    assert "harness-telemetry-" in fetch
    assert "eval-telemetry-" in fetch
    assert "retry-telemetry-" in fetch
    assert "pr-context-telemetry-" in fetch
    for source in ("harness-ci", "eval-ci", "agent-retry-orchestrator", "pr-context"):
        assert f"`{source}`" in docs


def test_nightly_harness_review_bootstrap_and_workflow():
    bootstrap = read("scripts/bootstrap-harness.sh")
    assert "nightly-harness-review.yml" in bootstrap
    assert "fetch-telemetry-artifacts.mjs" in bootstrap
    assert "aggregate-harness-review.mjs" in bootstrap
    assert "harness-review.mjs" in bootstrap
    assert (ROOT / ".github/workflows/nightly-harness-review.yml").is_file()
    nightly = read(".github/workflows/nightly-harness-review.yml")
    assert "fetch-telemetry-artifacts.mjs" in nightly
    assert "aggregate-harness-review.mjs" in nightly


def _parse_ccsd_exports() -> tuple[list[str], list[str], list[str]]:
    """Read canonical CC-SD field names from scripts/lib/ccsd-contract.mjs."""
    contract = read("scripts/lib/ccsd-contract.mjs")
    required = re.findall(
        r'export const CCSD_REQUIRED_FIELDS = \[\s*([\s\S]*?)\s*\];',
        contract,
    )[0]
    optional = re.findall(
        r'export const CCSD_OPTIONAL_FIELDS = \[\s*([\s\S]*?)\s*\];',
        contract,
    )[0]
    pr_fields = re.findall(
        r'export const CCSD_PR_SUMMARY_FIELDS = \[\s*([\s\S]*?)\s*\];',
        contract,
    )[0]

    def names(block: str) -> list[str]:
        return re.findall(r'"([^"]+)"', block)

    return names(required), names(optional), names(pr_fields)


def test_task_template_contains_canonical_ccsd_fields():
    required, optional, _ = _parse_ccsd_exports()
    text = read(".github/ISSUE_TEMPLATE/task.yml")

    for field in required:
        assert f"label: {field}" in text, f"task.yml missing required field {field}"

    for field in optional:
        assert f"label: {field}" in text, f"task.yml missing optional field {field}"

    assert "labels:" not in text


def test_task_template_placeholders_are_detected_by_validator():
    contract = read("scripts/lib/ccsd-contract.mjs")
    template = read(".github/ISSUE_TEMPLATE/task.yml")
    snippets = re.findall(r'"([^"]+)"', contract.split("CCSD_PLACEHOLDER_SNIPPETS", 1)[1].split("];", 1)[0])
    for snippet in snippets:
        assert snippet in template or snippet in contract


def test_agents_and_quality_loop_reference_canonical_ccsd_fields():
    required, _, _ = _parse_ccsd_exports()
    paths = [
        ".github/agents/triager.agent.md",
        ".github/agents/implementer.agent.md",
        ".github/agents/reviewer.agent.md",
        ".github/skills/quality-loop/SKILL.md",
        "AGENTS.md",
        ".github/copilot-instructions.md",
    ]
    for path in paths:
        text = read(path)
        for field in required:
            assert field in text, f"{path} missing canonical field {field}"


def test_pr_template_contains_ccsd_summary_fields():
    _, _, pr_fields = _parse_ccsd_exports()
    text = read(".github/pull_request_template.md")
    for field in pr_fields:
        assert f"## {field}" in text, f"PR template missing section {field}"


def test_coding_agent_l1_requires_ccsd_for_l1_docs_test_fix():
    text = read("docs/coding-agent-l1.md")
    assert "CC-SD" in text
    assert "`task:docs`" in text
    assert "`task:test-fix`" in text
    assert "`autonomy:L1`" in text
    assert "issue-spec-check" in text


def test_arch_documents_ccsd_contract():
    text = read("docs/arch.md")
    assert "CC-SD" in text
    assert "ccsd-contract.mjs" in text
    assert "issue-spec-check" in text


def test_adoption_describes_ccsd_as_l1_only_v1():
    text = read("docs/adoption.md")
    assert "CC-SD" in text
    assert "v1" in text
    assert "`task:docs`" in text
    assert "`task:test-fix`" in text
    assert "feature-small" in text


def test_validation_script_field_list_matches_template():
    required, optional, _ = _parse_ccsd_exports()
    template = read(".github/ISSUE_TEMPLATE/task.yml")
    for field in required + optional:
        assert f"label: {field}" in template
    assert "CCSD_REQUIRED_FIELDS" in read("scripts/lib/ccsd-contract.mjs")
    assert "check-issue-spec.mjs" in read(".github/workflows/harness-ci.yml")
