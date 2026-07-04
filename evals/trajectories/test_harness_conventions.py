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
    assert "type: textarea" in text
    assert re.search(r"id: acceptance_criteria.*?required: true", text, re.S)
    assert "labels:" not in text


def test_pr_template_has_harness_context_and_rollback():
    text = read(".github/pull_request_template.md")
    assert "## Harness context" in text
    assert "## Rollback" in text
    assert "Trace link" in text


def test_change_size_limits_align_between_docs_and_gate():
    operations = read("docs/operations.md")
    gate = read("scripts/check-diff-size.mjs")
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
    validator = read("scripts/validate-telemetry.mjs")
    required = re.findall(r"^\| `([^`]+)` \|", schema, re.M)
    validator_fields = re.findall(r'"([^"]+)"', validator.split("const REQUIRED = [", 1)[1].split("];", 1)[0])
    assert set(required) == set(validator_fields)


def test_retry_policy_matches_operations_doc():
    operations = read("docs/operations.md")
    orchestrator = read(".github/workflows/agent-retry-orchestrator.yml")
    assert "Max retries `N` | 3" in operations
    assert "const MAX_RETRIES = 3;" in orchestrator
    assert "Same failure signature | Stop after 2 consecutive identical" in operations
    assert "Same failure signature detected twice" in orchestrator
