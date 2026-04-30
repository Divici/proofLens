#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [ -z "$COMMAND" ]; then exit 0; fi
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(-f|--force)'; then
  echo "BLOCKED: Force push not allowed." >&2; exit 2
fi
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  echo "BLOCKED: git reset --hard not allowed." >&2; exit 2
fi
if echo "$COMMAND" | grep -qE 'git\s+clean\s+-[a-zA-Z]*f'; then
  echo "BLOCKED: git clean -f not allowed." >&2; exit 2
fi
if echo "$COMMAND" | grep -qE 'git\s+branch\s+-D\s+(main|master)'; then
  echo "BLOCKED: Cannot delete main/master." >&2; exit 2
fi
exit 0
